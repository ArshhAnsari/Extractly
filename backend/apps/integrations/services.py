import requests
from django.conf import settings
from django.utils import timezone
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from datetime import timedelta
from django.utils import timezone
from core.exceptions import ForbiddenError
from core.sanitize import sanitize_cell_value
from .models import GoogleOAuthToken
from .encryption import decrypt_token, encrypt_token

class GoogleNotConnectedError(ForbiddenError):
    error_code = "GOOGLE_NOT_CONNECTED"
    default_detail = "Google account is not connected."

def get_valid_credentials(user):
    """
    Retrieve GoogleOAuthToken for user, refresh access token if expired/near expiration,
    and return a google.oauth2.credentials.Credentials object.
    """
    try:
        token = GoogleOAuthToken.objects.get(user=user)
    except GoogleOAuthToken.DoesNotExist:
        raise GoogleNotConnectedError()

    now = timezone.now()
    # Check if access token is expired or expires in under 60 seconds
    if token.token_expiry <= now + timedelta(seconds=60):
        # Refresh access token
        refresh_token = decrypt_token(token.refresh_token)
        if not refresh_token:
            raise GoogleNotConnectedError("Refresh token is missing. Please reconnect Google account.")

        token_url = "https://oauth2.googleapis.com/token"
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        try:
            res = requests.post(token_url, data=token_data, timeout=10)
        except requests.RequestException as exc:
            raise GoogleNotConnectedError(
                "Could not reach Google to refresh the connection. Try again shortly."
            ) from exc

        if res.status_code == 400:
            # invalid_grant: refresh token itself is revoked/expired
            token.delete()
            raise GoogleNotConnectedError("Google connection expired. Please reconnect.")

        if res.status_code != 200:
            # Transient (5xx/429/etc.) — do not disconnect, let the user retry
            raise GoogleNotConnectedError("Google is temporarily unavailable. Try again shortly.")

        res_data = res.json()
        new_access = res_data.get("access_token")
        expires_in = res_data.get("expires_in", 3600)
        
        token.access_token = encrypt_token(new_access)
        token.token_expiry = timezone.now() + timedelta(seconds=expires_in)
        token.save()

    decrypted_access = decrypt_token(token.access_token)
    decrypted_refresh = decrypt_token(token.refresh_token)

    return Credentials(
        token=decrypted_access,
        refresh_token=decrypted_refresh,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
    )

def write_to_sheets(user, headers, rows, sheet_title) -> dict:
    """
    Creates a new Google Spreadsheet, populates it with headers and rows,
    and returns its spreadsheet_id and spreadsheet_url.
    """
    creds = get_valid_credentials(user)
    service = build("sheets", "v4", credentials=creds)

    # 1. Create spreadsheet
    spreadsheet = {
        "properties": {
            "title": sheet_title
        }
    }
    spreadsheet_obj = service.spreadsheets().create(
        body=spreadsheet,
        fields="spreadsheetId,spreadsheetUrl"
    ).execute()

    spreadsheet_id = spreadsheet_obj.get("spreadsheetId")
    spreadsheet_url = spreadsheet_obj.get("spreadsheetUrl")

    # 2. Prepare value write
    def _sanitize(row: list) -> list:
        cleaned = [
            "" if v is None
            else ", ".join(str(x) for x in v if x is not None) if isinstance(v, list)
            else v
            for v in row
        ]
        return [sanitize_cell_value(v) for v in cleaned]

    values = [[sanitize_cell_value(h) for h in headers]] + [_sanitize(row) for row in rows]
    body = {"values": values}
    
    # Write to Sheet1!A1
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range="Sheet1!A1",
        valueInputOption="RAW",
        body=body
    ).execute()

    return {
        "spreadsheet_id": spreadsheet_id,
        "spreadsheet_url": spreadsheet_url
    }
