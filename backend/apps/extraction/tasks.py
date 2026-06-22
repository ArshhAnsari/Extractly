"""
Celery asynchronous tasks for the extraction pipeline.
"""
from __future__ import annotations

import logging
import random
import time
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.files.models import ExtractedRow, ExtractionStatus, File, FileStatus
from apps.jobs.models import Job, JobStatus

from .llm import build_schema, extract
from .parsers import extract_text_from_url

if TYPE_CHECKING:
    from tenacity import retry, retry_if_exception, stop_after_attempt, wait_random_exponential

_has_tenacity = False
try:
    from tenacity import retry, retry_if_exception, stop_after_attempt, wait_random_exponential  # type: ignore[no-redef]
    _has_tenacity = True
except ImportError:  # pragma: no cover
    # Provide dummy callables so the module still loads without tenacity.
    # At runtime, _has_tenacity=False routes to the manual retry path.
    retry: Any = lambda *a, **kw: (lambda f: f)
    retry_if_exception: Any = lambda *a, **kw: None
    stop_after_attempt: Any = lambda *a, **kw: None
    wait_random_exponential: Any = lambda *a, **kw: None

_base_logger = logging.getLogger(__name__)


def _log(job_id: str, file_id: str | None = None, task_id: str | None = None) -> logging.LoggerAdapter:
    """Return a LoggerAdapter that stamps every record with correlation ids."""
    extra = {
        "job_id": str(job_id),
        "file_id": str(file_id) if file_id else "-",
        "task_id": str(task_id) if task_id else "-",
    }
    return logging.LoggerAdapter(_base_logger, extra)


def _is_retryable_llm_error(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    if status_code in {429, 500, 502, 503, 504} or response_status in {429, 500, 502, 503, 504}:
        return True

    name = exc.__class__.__name__.lower()
    retryable_names = (
        "ratelimit",
        "timeout",
        "connection",
        "serviceunavailable",
        "toomanyrequests",
        "resourceexhausted",
    )
    return any(token in name for token in retryable_names)


def _manual_retry_extract(raw_text: str, fields_snapshot: list) -> dict:
    max_attempts = getattr(settings, "LLM_RETRY_MAX_ATTEMPTS", 4)
    min_wait = getattr(settings, "LLM_RETRY_MIN_SECONDS", 1)
    max_wait = getattr(settings, "LLM_RETRY_MAX_SECONDS", 20)

    for attempt in range(1, max_attempts + 1):
        try:
            return extract(raw_text, fields_snapshot)
        except Exception as exc:
            if attempt == max_attempts or not _is_retryable_llm_error(exc):
                raise
            sleep_for = min(max_wait, min_wait * (2 ** (attempt - 1)))
            time.sleep(sleep_for + random.uniform(0, min_wait))

    return {}


def _extract_with_retry(raw_text: str, fields_snapshot: list) -> dict:
    """Route to tenacity-backed retry or manual fallback."""
    if _has_tenacity:
        @retry(
            retry=retry_if_exception(_is_retryable_llm_error),
            wait=wait_random_exponential(
                min=getattr(settings, "LLM_RETRY_MIN_SECONDS", 1),
                max=getattr(settings, "LLM_RETRY_MAX_SECONDS", 20),
            ),
            stop=stop_after_attempt(getattr(settings, "LLM_RETRY_MAX_ATTEMPTS", 4)),
            reraise=True,
        )
        def _call() -> dict:
            return extract(raw_text, fields_snapshot)

        return _call()

    return _manual_retry_extract(raw_text, fields_snapshot)


@shared_task(bind=True, max_retries=1)
def process_batch(self, job_id, file_ids):
    """
    Process a batch of files: download -> parse -> LLM -> Pydantic validator -> save.
    """
    task_id = self.request.id
    log = _log(job_id, task_id=task_id)
    log.info(
        "process_batch started",
        extra={"job_id": str(job_id), "file_count": len(file_ids), "task_id": str(task_id)},
    )

    try:
        job = Job.objects.get(pk=job_id)
    except Job.DoesNotExist:
        log.error("Job.DoesNotExist in worker! Received job_id=%r, file_ids=%r", job_id, file_ids)
        raise

    files = list(File.objects.filter(id__in=file_ids))
    Schema = build_schema(job.fields_snapshot)

    results = []

    for f in files:
        flog = _log(job_id, file_id=f.id, task_id=task_id)
        raw_text = None
        extracted_data = None

        if f.status != FileStatus.VERIFIED:
            flog.warning(
                "File has unexpected status — marking as FAILED",
                extra={"job_id": str(job_id), "file_id": str(f.id), "status": f.status, "task_id": str(task_id)},
            )
            f.status = FileStatus.FAILED
            f.save(update_fields=["status"])
            null_data = {kf["key"]: None for kf in job.fields_snapshot}
            ExtractedRow.objects.update_or_create(
                file=f,
                defaults={
                    "job": job,
                    "data": null_data,
                    "extraction_status": ExtractionStatus.FAILED,
                },
            )
            results.append({"file_id": str(f.id), "status": "FAILED"})
            continue

        try:
            flog.info("Downloading and parsing file", extra={"job_id": str(job_id), "file_id": str(f.id), "task_id": str(task_id)})
            raw_text = extract_text_from_url(f.storage_url, f.file_type)
            f.raw_text = raw_text
            f.save(update_fields=["raw_text"])

            flog.info("Running LLM extraction", extra={"job_id": str(job_id), "file_id": str(f.id), "task_id": str(task_id)})
            # _extract_with_retry already handles all retry attempts internally
            # (via tenacity or the manual fallback). Do not wrap in a second loop.
            raw_dict = _extract_with_retry(raw_text, job.fields_snapshot)
            extracted_data = Schema.model_validate(raw_dict).model_dump()

            ExtractedRow.objects.update_or_create(
                file=f,
                defaults={
                    "job": job,
                    "data": extracted_data,
                    "extraction_status": ExtractionStatus.DONE,
                },
            )
            f.status = FileStatus.DONE
            f.save(update_fields=["status"])
            results.append({"file_id": str(f.id), "status": "DONE"})
            flog.info("File extraction succeeded", extra={"job_id": str(job_id), "file_id": str(f.id), "task_id": str(task_id)})

        except Exception as exc:
            flog.exception(
                "File extraction failed",
                extra={"job_id": str(job_id), "file_id": str(f.id), "task_id": str(task_id), "error": str(exc)},
            )
            f.status = FileStatus.FAILED
            f.save(update_fields=["status"])

            null_data = {kf["key"]: None for kf in job.fields_snapshot}
            ExtractedRow.objects.update_or_create(
                file=f,
                defaults={
                    "job": job,
                    "data": null_data,
                    "extraction_status": ExtractionStatus.FAILED,
                },
            )
            results.append({"file_id": str(f.id), "status": "FAILED"})
        finally:
            raw_text = None
            extracted_data = None

    log.info(
        "process_batch complete",
        extra={"job_id": str(job_id), "task_id": str(task_id), "results": results},
    )
    return results


@shared_task
def on_chord_complete(results, job_id):
    """
    Callback fired after all `process_batch` tasks in the chord complete.
    Aggregates file execution statuses into the Job status.
    """
    log = _log(job_id)
    try:
        job = Job.objects.get(pk=job_id)
    except Job.DoesNotExist:
        log.error("on_chord_complete: job not found", extra={"job_id": str(job_id), "file_id": "-", "task_id": "-"})
        return

    done_count = job.files.filter(status=FileStatus.DONE).count()  # type: ignore[attr-defined]
    failed_count = job.files.filter(status=FileStatus.FAILED).count()  # type: ignore[attr-defined]
    # Files still stuck in VERIFIED/PENDING were never processed — count as failures
    unprocessed_count = job.files.exclude(  # type: ignore[attr-defined]
        status__in=[FileStatus.DONE, FileStatus.FAILED]
    ).count()
    failed_count += unprocessed_count

    if failed_count == 0 and done_count > 0:
        job.status = JobStatus.COMPLETE
    elif done_count > 0 and failed_count > 0:
        job.status = JobStatus.PARTIAL
    else:
        job.status = JobStatus.FAILED

    job.done_files = done_count
    job.failed_files = failed_count
    job.completed_at = timezone.now()
    job.save(update_fields=["status", "done_files", "failed_files", "completed_at"])
    log.info(
        "Job finalised",
        extra={
            "job_id": str(job_id),
            "file_id": "-",
            "task_id": "-",
            "final_status": job.status,
            "done": done_count,
            "failed": failed_count,
        },
    )


@shared_task
def recover_stale_jobs():
    """
    Periodic safety net: find jobs stuck in PROCESSING for too long.

    - If NO files were processed → chord was lost → reset to QUEUED
      and attempt to re-dispatch.
    - If SOME files were processed → mark as PARTIAL / FAILED.

    Scheduled via Celery Beat (see config/celery.py).

    NOTE: This only runs when the worker is alive (Beat runs on the
    worker).  For recovery when the worker is sleeping, see
    try_redispatch_stale_job() in services.py (triggered by
    the status-polling endpoint on the API service).
    """
    log = _log("recovery")
    stale_threshold = timezone.now() - timedelta(
        minutes=getattr(settings, "STALE_JOB_TIMEOUT_MINUTES", 5)
    )

    stale_jobs = Job.objects.filter(
        status=JobStatus.PROCESSING,
        created_at__lte=stale_threshold,
    )

    recovered = 0
    for job in stale_jobs:
        done_count = job.files.filter(status=FileStatus.DONE).count()  # type: ignore[attr-defined]
        failed_count = job.files.filter(status=FileStatus.FAILED).count()  # type: ignore[attr-defined]
        unprocessed_count = job.files.exclude(  # type: ignore[attr-defined]
            status__in=[FileStatus.DONE, FileStatus.FAILED]
        ).count()

        if done_count == 0 and failed_count == 0:
            # ── Chord was lost — no files were touched at all ──
            # Reset to QUEUED so start_job_processing can re-dispatch.
            log.info(
                "Job %s: 0 files processed — chord was lost. Resetting to QUEUED.",
                extra={"job_id": str(job.id), "file_id": "-", "task_id": "-"},
            )
            job.status = JobStatus.QUEUED
            job.save(update_fields=["status"])
            try:
                from apps.extraction.services import start_job_processing
                start_job_processing(job.id, allow_existing=False)
                log.info(
                    "Re-dispatched lost job",
                    extra={"job_id": str(job.id), "file_id": "-", "task_id": "-"},
                )
            except Exception as exc:
                log.warning(
                    "Could not re-dispatch job %s, marking FAILED: %s",
                    job.id,
                    exc,
                    extra={"job_id": str(job.id), "file_id": "-", "task_id": "-"},
                )
                job.status = JobStatus.FAILED
                job.failed_files = job.total_files
                job.completed_at = timezone.now()
                job.save(update_fields=["status", "failed_files", "completed_at"])
            recovered += 1
            continue

        # ── Some files were processed — finalise the job ──
        failed_count += unprocessed_count

        if done_count > 0 and failed_count > 0:
            job.status = JobStatus.PARTIAL
        elif done_count > 0 and failed_count == 0:
            job.status = JobStatus.COMPLETE
        else:
            job.status = JobStatus.FAILED

        job.done_files = done_count
        job.failed_files = failed_count
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "done_files", "failed_files", "completed_at"])
        recovered += 1
        log.info(
            "Recovered stale job",
            extra={
                "job_id": str(job.id),
                "file_id": "-",
                "task_id": "-",
                "final_status": job.status,
                "done": done_count,
                "failed": failed_count,
            },
        )

    if recovered:
        log.info(
            "Stale job recovery complete",
            extra={"job_id": "recovery", "file_id": "-", "task_id": "-", "recovered_count": recovered},
        )

