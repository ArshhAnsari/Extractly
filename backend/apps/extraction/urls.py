"""
Extraction URL patterns.
Included in config/urls.py under /api/v1/.
"""

from django.urls import path

from . import views

app_name = "extraction"

urlpatterns = [
    path("jobs/<uuid:job_id>/process/", views.JobProcessView.as_view(), name="job-process"),
]
