"""
Root URL configuration.
All API routes are under /api/v1/.
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    # API v1 routes
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/", include("apps.jobs.urls")),
    path("api/v1/", include("apps.files.urls")),
    path("api/v1/", include("apps.extraction.urls")),
    path("api/v1/", include("apps.exports.urls")),
    path("api/v1/", include("apps.integrations.urls", namespace="integrations")),
]
