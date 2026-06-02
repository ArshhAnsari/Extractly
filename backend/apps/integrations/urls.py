from django.urls import path
from . import views

app_name = "integrations"

urlpatterns = [
    path("integrations/google/connect/", views.GoogleConnectView.as_view(), name="google-connect"),
    path("integrations/google/callback/", views.GoogleCallbackView.as_view(), name="google-callback"),
    path("integrations/google/status/", views.GoogleStatusView.as_view(), name="google-status"),
    path("integrations/google/disconnect/", views.GoogleDisconnectView.as_view(), name="google-disconnect"),
]
