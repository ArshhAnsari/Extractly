"""
Signal receivers for file lifecycle events.
"""
import logging

from django.dispatch import receiver

from apps.extraction.services import ProcessingDispatchError, start_job_processing
from apps.jobs.models import Job

from .signals import all_files_verified

logger = logging.getLogger(__name__)


@receiver(all_files_verified, sender=Job)
def handle_all_files_verified(sender, job=None, job_id=None, **kwargs):
    target_job_id = job_id or getattr(job, "id", None)
    if not target_job_id:
        logger.warning("all_files_verified received without a job id")
        return

    try:
        start_job_processing(target_job_id, allow_existing=True)
    except ProcessingDispatchError as exc:
        logger.warning("Could not auto-dispatch job %s: %s", target_job_id, exc)
