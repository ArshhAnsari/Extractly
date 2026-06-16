"""
Auth views.

POST /api/v1/auth/register/       — create account, return access token + refresh cookie
POST /api/v1/auth/login/          — authenticate, return access token + refresh cookie
POST /api/v1/auth/token/refresh/  — read refresh from cookie, return new access token
POST /api/v1/auth/logout/         — blacklist refresh token, clear cookie

All responses use core/response.py helpers.
Refresh token is NEVER returned in the response body — only as HttpOnly cookie.
"""

from django.conf import settings
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from core.exceptions import UnauthorizedError, ValidationError
from core.response import error, success

from .serializers import LoginSerializer, RegisterSerializer


def _build_user_payload(user):
    """Build the user dict matching the API doc shape."""
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
    }


def _set_refresh_cookie(response, refresh_token):
    """Set the refresh token as an HttpOnly cookie on the response."""
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=str(refresh_token),
        max_age=settings.REFRESH_TOKEN_COOKIE_MAX_AGE,
        httponly=settings.REFRESH_TOKEN_COOKIE_HTTPONLY,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )
    return response


def _clear_refresh_cookie(response):
    """Delete the refresh token cookie."""
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
    )
    return response


class RegisterView(APIView):
    """
    POST /api/v1/auth/register/

    Creates a new user account.
    Returns access token in body, refresh token as HttpOnly cookie.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            raise ValidationError(
                "; ".join(
                    f"{field}: {', '.join(errs)}"
                    for field, errs in serializer.errors.items()
                )
            )

        user = serializer.save()
        refresh = RefreshToken.for_user(user)

        response = success(
            data={
                "user": _build_user_payload(user),
                "access_token": str(refresh.access_token),
            },
            status=http_status.HTTP_201_CREATED,
        )

        return _set_refresh_cookie(response, refresh)


class LoginView(APIView):
    """
    POST /api/v1/auth/login/

    Authenticates user with email + password.
    Returns access token in body, refresh token as HttpOnly cookie.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            raise ValidationError("Invalid email or password.")

        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)

        response = success(
            data={
                "user": _build_user_payload(user),
                "access_token": str(refresh.access_token),
            },
            status=http_status.HTTP_200_OK,
        )

        return _set_refresh_cookie(response, refresh)


class TokenRefreshView(APIView):
    """
    POST /api/v1/auth/token/refresh/

    Reads refresh token from HttpOnly cookie.
    Returns new access token in body only.
    No request body needed.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        raw_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)

        if not raw_token:
            raise UnauthorizedError("Refresh token not found.")

        try:
            refresh = RefreshToken(raw_token)
            new_access = str(refresh.access_token)
        except (TokenError, InvalidToken):
            raise UnauthorizedError("Refresh token is invalid or expired.")

        response = success(
            data={"access_token": new_access},
            status=http_status.HTTP_200_OK,
        )

        # Rotate refresh token: blacklist old, issue new, set new cookie
        if settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS", False):
            try:
                refresh.blacklist()
            except AttributeError:
                pass  # blacklist app may not be installed

            # We can't call for_user with a raw ID — rebuild from the token's user
            from django.contrib.auth import get_user_model

            User = get_user_model()
            try:
                user = User.objects.get(id=refresh.payload.get("user_id"))
                new_refresh = RefreshToken.for_user(user)
                response = _set_refresh_cookie(response, new_refresh)
            except User.DoesNotExist:
                raise UnauthorizedError("User not found.")
        else:
            response = _set_refresh_cookie(response, refresh)

        return response


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/

    Blacklists the refresh token and clears the cookie.
    Requires JWT authentication.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)

        if raw_token:
            try:
                refresh = RefreshToken(raw_token)
                refresh.blacklist()
            except (TokenError, InvalidToken):
                pass  # Token already expired or blacklisted — still clear cookie

        response = success(
            data={"message": "Logged out successfully"},
            status=http_status.HTTP_200_OK,
        )

        return _clear_refresh_cookie(response)
