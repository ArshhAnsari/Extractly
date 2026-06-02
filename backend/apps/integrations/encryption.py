from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

def _get_fernet():
    key = getattr(settings, "GOOGLE_TOKEN_ENCRYPTION_KEY", None)
    if not key:
        raise ImproperlyConfigured("GOOGLE_TOKEN_ENCRYPTION_KEY setting is missing or empty.")
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt_token(val: str) -> str:
    if not val:
        return ""
    f = _get_fernet()
    return f.encrypt(val.encode("utf-8")).decode("utf-8")

def decrypt_token(val: str) -> str:
    if not val:
        return ""
    f = _get_fernet()
    return f.decrypt(val.encode("utf-8")).decode("utf-8")
