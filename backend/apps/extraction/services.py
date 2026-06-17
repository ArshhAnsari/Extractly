"""
Shared orchestration helpers for the extraction pipeline.
"""
import logging
import threading
import urllib.request

from celery import chord
from kombu.exceptions import OperationalError as KombuOperationalError
from redis.exceptions import RedisError
from django.conf import settings
from django.db import transaction

from apps.files.models import FileStatus
from apps.jobs.models import Job, JobStatus

from .tasks import on_chord_complete, process_batch

logger = logging.getLogger(__name__)


class ProcessingDispatchError(Exception):
    """Raised when a job cannot be dispatched for extraction."""


def _ping_worker():
    """Silently ping the worker's HTTP port to wake it up from Render sleep."""
    worker_url = getattr(settings, "WORKER_URL", "https://cvextractor-worker.onrender.com/")
    try:
        urllib.request.urlopen(worker_url, timeout=5)
    except Exception as e:
        logger.debug("Worker ping background task finished (or timed out, which is expected during wake): %s", e)


def _dispatch_chord(job_id: str, file_id_batches: list[list[str]]) -> None:
    # Fire and forget an HTTP request to wake up the worker instantly
    threading.Thread(target=_ping_worker, daemon=True).start()
    
    tasks = [process_batch.s(job_id, batch) for batch in file_id_batches]  # type: ignore[attr-defined]
    chord(tasks)(on_chord_complete.s(job_id))  # type: ignore[attr-defined]


def start_job_processing(job_id, *, allow_existing: bool = True) -> tuple[Job, bool]:
    """
    Move a queued job to PROCESSING and dispatch its Celery chord once.

    Returns (job, started), where started is False when the job was already
    processing or terminal and allow_existing=True.
    """
    with transaction.atomic():
        try:
            job = Job.objects.select_for_update().get(pk=job_id)
        except (Job.DoesNotExist, ValueError) as exc:
            raise ProcessingDispatchError("Resource not found.") from exc

        if job.status == JobStatus.PROCESSING:
            if allow_existing:
                return job, False
            raise ProcessingDispatchError("Job is already processing.")

        if job.status in [JobStatus.COMPLETE, JobStatus.PARTIAL, JobStatus.FAILED]:
            if allow_existing:
                return job, False
            raise ProcessingDispatchError("Job has already finished processing.")

        if job.status != JobStatus.QUEUED:
            raise ProcessingDispatchError("Job must be QUEUED to trigger processing.")

        if job.total_files == 0:
            raise ProcessingDispatchError("No files registered for this job.")

        pending_count = job.files.filter(status=FileStatus.PENDING).count()  # type: ignore[attr-defined]
        if pending_count:
            raise ProcessingDispatchError("Not all files have been VERIFIED by Cloudinary yet.")

        file_ids = list(
            job.files.filter(status=FileStatus.VERIFIED).values_list("id", flat=True)  # type: ignore[attr-defined]
        )
        if not file_ids:
            raise ProcessingDispatchError("No verified files are available for processing.")

        batch_size = getattr(settings, "BATCH_SIZE", 10)
        batches = [file_ids[i:i + batch_size] for i in range(0, len(file_ids), batch_size)]
        file_id_batches = [[str(fid) for fid in batch] for batch in batches]

        job_id_str = str(job.id)
        job.status = JobStatus.PROCESSING
        job.save(update_fields=["status"])

        try:
            _dispatch_chord(job_id_str, file_id_batches)
        except (KombuOperationalError, RedisError, OSError) as exc:
            logger.warning("Could not dispatch extraction for job %s: %s", job_id, exc)
            raise ProcessingDispatchError(
                "Extraction service is unavailable. Please start Redis and the Celery worker, then try again."
            ) from exc

    logger.info("Dispatched extraction for job %s in %s batch(es)", job_id, len(file_id_batches))
    return job, True
