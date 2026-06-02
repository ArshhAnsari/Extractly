import time
import requests
import ssl
from urllib.parse import urlencode
from django.conf import settings
from django.shortcuts import redirect
from django.utils import timezone
from django.core.signing import Signer, BadSignature
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
import redis
from datetime import timedelta
from typing import Any
from core.response import success
from .models import GoogleOAuthToken
from .encryption import encrypt_token

signer = Signer()

def get_redis_client() -> redis.Redis:
    """
    Safely construct a Redis client.
    Explicitly typed, handles Upstash SSL, and includes defensive timeouts.
    """
    url = str(settings.CELERY_BROKER_URL)
    
    # Safely strip query params (like ?ssl_cert_reqs=CERT_NONE)
    clean_url = url.split("?")[0]
    
    # decode_responses=True converts returned bytes to strings automatically
    # socket timeouts prevent hanging threads if Redis is temporarily unreachable
    kwargs: dict[str, Any] = {
        "decode_responses": True,
        "socket_connect_timeout": 5,
        "socket_timeout": 5,
    }
    
    if clean_url.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        
    return redis.Redis.from_url(clean_url, **kwargs)

class GoogleConnectView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        state_payload = f"{request.user.id}:{int(time.time())}"
        state_token = signer.sign(state_payload)
        
        r = get_redis_client()
        r.setex(f"google_oauth_state:{state_token}", 600, str(request.user.id))
        
        params = urlencode({
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email openid",
            "state": state_token,           
            "access_type": "offline",
            "prompt": "consent",
        })
        auth_url = f"https://accounts.google.com/o/oauth2/auth?{params}"
        return success({"auth_url": auth_url})


class GoogleCallbackView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        
        frontend_base = settings.FRONTEND_URL

        if not code or not state:
            return redirect(f"{frontend_base}/settings?google=failed")

        # Validate state signature and existence in Redis
        try:
            signer.unsign(state)
        except BadSignature:
            return redirect(f"{frontend_base}/settings?google=failed")

        r = get_redis_client()
        user_id_raw = r.get(f"google_oauth_state:{state}")
        
        if not user_id_raw:
            return redirect(f"{frontend_base}/settings?google=failed")
        
        # Because we used decode_responses=True, this is already a string
        user_id = str(user_id_raw)
        r.delete(f"google_oauth_state:{state}")

        # Exchange code for tokens
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
        res = requests.post(token_url, data=token_data)
        if res.status_code != 200:
            return redirect(f"{frontend_base}/settings?google=failed")

        res_data = res.json()
        access_token = res_data.get("access_token")
        refresh_token = res_data.get("refresh_token")
        expires_in = res_data.get("expires_in", 3600)
        
        # Calculate expiry
        expiry = timezone.now() + timedelta(seconds=expires_in)

        # Get Google email address using openid userinfo
        email = None
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        userinfo_res = requests.get(
            userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if userinfo_res.status_code == 200:
            email = userinfo_res.json().get("email")

        # Fetch existing token or create new one
        token_obj, created = GoogleOAuthToken.objects.get_or_create(user_id=user_id, defaults={
            "google_email": email,
            "access_token": encrypt_token(access_token),
            "refresh_token": encrypt_token(refresh_token) if refresh_token else "",
            "token_expiry": expiry
        })

        if not created:
            token_obj.google_email = email
            token_obj.access_token = encrypt_token(access_token)
            if refresh_token:
                token_obj.refresh_token = encrypt_token(refresh_token)
            token_obj.token_expiry = expiry
            token_obj.save()

        return redirect(f"{frontend_base}/settings?google=connected")


class GoogleStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            token = GoogleOAuthToken.objects.get(user=request.user)
            return success({
                "connected": True,
                "email": token.google_email
            })
        except GoogleOAuthToken.DoesNotExist:
            return success({
                "connected": False,
                "email": None
            })


class GoogleDisconnectView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        GoogleOAuthToken.objects.filter(user=request.user).delete()
        return success({"message": "Successfully disconnected Google account."})