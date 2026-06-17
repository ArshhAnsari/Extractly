"""
Root URL configuration.
All API routes are under /api/v1/.
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health_check(request):
    """Render health check endpoint — must return 200 for the service to go live."""
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("api/health/", health_check),
    path("admin/", admin.site.urls),

    # API v1 routes
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/", include("apps.jobs.urls")),
    path("api/v1/", include("apps.files.urls")),
    path("api/v1/", include("apps.extraction.urls")),
    path("api/v1/", include("apps.exports.urls")),
    path("api/v1/", include("apps.integrations.urls", namespace="integrations")),
]
