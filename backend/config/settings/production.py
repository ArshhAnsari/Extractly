"""
Production-specific Django settings.
"""

import base64
import os
import tempfile

from .base import *  # noqa: F401, F403

DEBUG = False

_allowed_hosts = os.environ.get("ALLOWED_HOSTS", "")
ALLOWED_HOSTS = [h for h in _allowed_hosts.split(",") if h.strip()]

# ──────────────────────────────────────────────
# CORS — restricted in production
# ──────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = False
_cors_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "")
CORS_ALLOWED_ORIGINS = [o for o in _cors_origins.split(",") if o.strip()]
CORS_ALLOW_CREDENTIALS = True

# ──────────────────────────────────────────────
# Security
# ──────────────────────────────────────────────
SECURE_SSL_REDIRECT = False  # Render terminates SSL at load balancer, not Django
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# ──────────────────────────────────────────────
# Refresh token cookie — secure in production
# ──────────────────────────────────────────────
REFRESH_TOKEN_COOKIE_SECURE = True
REFRESH_TOKEN_COOKIE_SAMESITE = "None"  # cross-origin: Vercel + Render are different domains

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# ──────────────────────────────────────────────
# Google Vision — decode service account from env
# ──────────────────────────────────────────────
_gcp_creds_b64 = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
if _gcp_creds_b64:
    _gcp_creds_b64 = _gcp_creds_b64.strip()
    _gcp_creds_b64 += "=" * (4 - len(_gcp_creds_b64) % 4)
    _creds_json = base64.b64decode(_gcp_creds_b64).decode("utf-8")
    _tmpfile = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    _tmpfile.write(_creds_json)
    _tmpfile.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = _tmpfile.name