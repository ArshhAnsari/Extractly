import uuid
from django.conf import settings
from django.db import models

class GoogleOAuthToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="google_token",
    )
    google_email = models.EmailField(null=True, blank=True)
    access_token = models.TextField()  # Fernet encrypted
    refresh_token = models.TextField() # Fernet encrypted
    token_expiry = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "integrations_google_oauth_token"

    def __str__(self):
        return f"Google token for {self.user.email} ({self.google_email})"
