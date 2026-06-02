"""
Jobs URL patterns.
Included in config/urls.py under /api/v1/.
"""

from django.urls import path

from . import views
from apps.exports.views import JobExportView

app_name = "jobs"

urlpatterns = [
    # Phase 5: Fields
    path("fields/", views.FieldsListView.as_view(), name="fields-list"),

    # Phase 6: Jobs
    path("jobs/", views.JobListCreateView.as_view(), name="job-list-create"),
    path("jobs/<uuid:job_id>/", views.JobDetailView.as_view(), name="job-detail"),
    path("jobs/<uuid:job_id>/status/", views.JobStatusView.as_view(), name="job-status"),
    path("jobs/<uuid:job_id>/last-fields/", views.JobLastFieldsView.as_view(), name="job-last-fields"),

    # Phase 10: Rows (Sheet feature)
    path("jobs/<uuid:job_id>/rows/", views.JobRowsView.as_view(), name="job-rows"),
    path("jobs/<uuid:job_id>/rows/<uuid:row_id>/", views.JobRowUpdateView.as_view(), name="job-row-update"),

    # Phase 11: Export (view lives in apps.exports but URL must be here
    # to avoid Django's URL resolver failing to fall through from jobs/ patterns)
    path("jobs/<uuid:job_id>/export/", JobExportView.as_view(), name="job-export"),
]
