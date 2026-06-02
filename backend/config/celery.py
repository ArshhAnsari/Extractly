"""
Celery application configuration for CV Extractor.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("cvextractor")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# ──────────────────────────────────────────────
# Beat schedule placeholder (V2: scheduled cleanup, etc.)
# ──────────────────────────────────────────────
app.conf.beat_schedule = {}
