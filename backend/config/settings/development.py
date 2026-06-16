"""
Development-specific Django settings.
"""

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", ".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io"]

# OR, the easiest way for local dev:
# ALLOWED_HOSTS = ["*"]
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]
CORS_ALLOW_CREDENTIALS = True

# ──────────────────────────────────────────────
# Refresh token cookie — not secure in dev (no HTTPS)
# ──────────────────────────────────────────────
REFRESH_TOKEN_COOKIE_SECURE = False
