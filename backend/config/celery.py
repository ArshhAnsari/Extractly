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
# Beat schedule — periodic maintenance tasks
# ──────────────────────────────────────────────
app.conf.beat_schedule = {
    "recover-stale-jobs": {
        "task": "apps.extraction.tasks.recover_stale_jobs",
        "schedule": 600.0,  # every 10 minutes
    },
}
