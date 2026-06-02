"""
Exports URL patterns.
Included in config/urls.py under /api/v1/.
"""

from django.urls import path

from . import views

app_name = "exports"

urlpatterns = [
    # job-export is now in apps.jobs.urls to avoid Django URL resolver issues
    path("exports/merge/", views.MergeExportView.as_view(), name="export-merge"),
]
