"""
Shared orchestration helpers for the extraction pipeline.
"""
import logging
import time
import urllib.request
from datetime import timedelta

from celery import chord
from kombu.exceptions import OperationalError as KombuOperationalError
from redis.exceptions import RedisError
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.files.models import FileStatus
from apps.jobs.models import Job, JobStatus

from .tasks import on_chord_complete, process_batch

logger = logging.getLogger(__name__)


class ProcessingDispatchError(Exception):
    """Raised when a job cannot be dispatched for extraction."""


# ──────────────────────────────────────────────
# Worker wake-up helpers
# ──────────────────────────────────────────────

def _ping_worker() -> bool:
    """
    Send a single HTTP request to the worker's health endpoint to
    trigger Render's cold-start mechanism.

    This does NOT mean the Celery process is ready — only that the
    container is booting.  Use _verify_worker_ready() afterwards.
    """
    worker_url = getattr(settings, "WORKER_URL", "https://cvextractor-worker.onrender.com/")
    logger.info("Pinging worker at %s to trigger cold-start …", worker_url)

    try:
        urllib.request.urlopen(worker_url, timeout=10)
        logger.info("Worker ping got an immediate response — container is awake.")
        return True
    except Exception as exc:
        # Timeout / connection error is expected if the service was asleep.
        # The request itself already told Render to spin it up.
        logger.info(
            "Worker ping did not get an immediate response (expected during "
            "cold-start): %s — Render should be booting the container now.",
            exc,
        )
        return False


def _verify_worker_ready(max_wait: int = 90, poll_interval: int = 5) -> bool:
    """
    Poll the Celery control plane until at least one worker responds,
    or until *max_wait* seconds elapse.

    This confirms that the Celery process inside the container has
    connected to Redis and is actively consuming tasks — a much
    stronger guarantee than a health-server HTTP 200.
    """
    from config.celery import app as celery_app

    waited = 0
    while waited < max_wait:
        try:
            response = celery_app.control.ping(timeout=3)
            if response:
                logger.info(
                    "Celery worker is READY (waited %d s, workers: %s)",
                    waited,
                    [list(r.keys())[0] for r in response],
                )
                return True
        except Exception as exc:
            logger.debug("Celery control.ping attempt failed (waited %d s): %s", waited, exc)

        time.sleep(poll_interval)
        waited += poll_interval

    logger.warning(
        "No Celery worker responded after %d s — dispatching chord anyway; "
        "tasks will queue in Redis until the worker connects.",
        max_wait,
    )
    return False


# ──────────────────────────────────────────────
# Chord dispatch
# ──────────────────────────────────────────────

def _dispatch_chord(job_id: str, file_id_batches: list[list[str]]) -> None:
    """Wake the worker, verify readiness, then dispatch the chord after commit."""
    _ping_worker()
    _verify_worker_ready()

    def dispatch():
        tasks = [process_batch.s(job_id, batch) for batch in file_id_batches]  # type: ignore[attr-defined]
        chord(tasks)(on_chord_complete.s(job_id))  # type: ignore[attr-defined]
        logger.info("Chord dispatched for job %s (%d batches)", job_id, len(file_id_batches))

    transaction.on_commit(dispatch)


# ──────────────────────────────────────────────
# Primary entry point
# ──────────────────────────────────────────────

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


# ──────────────────────────────────────────────
# API-side stale-job recovery
# ──────────────────────────────────────────────

def try_redispatch_stale_job(job: Job) -> bool:
    """
    Called from the status-polling endpoint when a job appears stuck.

    If the job has been in PROCESSING for longer than
    STALE_JOB_TIMEOUT_MINUTES and NO files have been touched,
    it means the chord was lost (worker never picked it up).

    We reset it to QUEUED and re-dispatch.  Returns True if a
    re-dispatch was attempted.
    """
    timeout_minutes = getattr(settings, "STALE_JOB_TIMEOUT_MINUTES", 5)
    stale_cutoff = timezone.now() - timedelta(minutes=timeout_minutes)

    if job.status != JobStatus.PROCESSING:
        return False

    if job.created_at > stale_cutoff:
        return False  # Not stale yet — still within the grace period

    done_count = job.files.filter(status=FileStatus.DONE).count()  # type: ignore[attr-defined]
    failed_count = job.files.filter(status=FileStatus.FAILED).count()  # type: ignore[attr-defined]

    if done_count > 0 or failed_count > 0:
        return False  # Worker DID process some files — not a lost chord

    logger.warning(
        "Job %s stuck in PROCESSING with 0 files processed for >%d min — "
        "resetting to QUEUED and re-dispatching.",
        job.id,
        timeout_minutes,
    )

    try:
        with transaction.atomic():
            j = Job.objects.select_for_update().get(pk=job.id)
            if j.status != JobStatus.PROCESSING:
                return False  # Changed since we checked
            j.status = JobStatus.QUEUED
            j.save(update_fields=["status"])

        # Re-dispatch (this calls _ping_worker + _verify_worker_ready again)
        start_job_processing(job.id, allow_existing=False)
        logger.info("Successfully re-dispatched stale job %s", job.id)
        return True

    except Exception as exc:
        logger.exception("Failed to re-dispatch stale job %s: %s", job.id, exc)
        return False
