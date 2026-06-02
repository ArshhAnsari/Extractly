"""
Files URL patterns.
Included in config/urls.py under /api/v1/.
"""

from django.urls import path

from . import views

app_name = "files"

urlpatterns = [
    path("jobs/<uuid:job_id>/upload/sign/", views.UploadSignView.as_view(), name="upload-sign"),
    path("jobs/<uuid:job_id>/files/", views.BatchFileRegisterView.as_view(), name="file-register"),
    path("webhooks/cloudinary/", views.CloudinaryWebhookView.as_view(), name="webhook-cloudinary"),
]
