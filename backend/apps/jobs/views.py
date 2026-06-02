"""
Jobs views.

GET  /api/v1/fields/              — master field list (Phase 5)
POST /api/v1/jobs/                — create new job
GET  /api/v1/jobs/                — list all jobs for user
GET  /api/v1/jobs/{job_id}/       — full job detail
GET  /api/v1/jobs/{job_id}/status/      — lightweight polling
GET  /api/v1/jobs/{job_id}/last-fields/ — last job's fields_snapshot
GET  /api/v1/jobs/{job_id}/rows/        — paginated extracted rows
PATCH /api/v1/jobs/{job_id}/rows/{row_id}/ — update extracted row data
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import status as http_status

from core.exceptions import ConflictError, NotFoundError, ValidationError
from core.permissions import IsOwner
from core.response import success

from .constants import MASTER_FIELDS
from .models import Job, JobStatus
from .serializers import JobCreateSerializer
from apps.files.models import ExtractedRow


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _job_list_payload(job):
    """Build the lean list-view payload (no fields_snapshot)."""
    return {
        "id": str(job.id),
        "name": job.name,
        "status": job.status,
        "total_files": job.total_files,
        "done_files": job.done_files,
        "failed_files": job.failed_files,
        "created_at": job.created_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


def _job_detail_payload(job):
    """Build the full detail payload (includes fields_snapshot)."""
    payload = _job_list_payload(job)
    payload["fields_snapshot"] = job.fields_snapshot
    return payload


def _get_job_for_user(job_id, user):
    """
    Fetch a job by ID, enforcing ownership.
    Returns 404 if not found or not owned by user (never 403).
    """
    try:
        job = Job.objects.get(pk=job_id, user=user)
    except (Job.DoesNotExist, ValueError):
        raise NotFoundError("Resource not found.")
    return job


# ──────────────────────────────────────────────
# Phase 5: Fields
# ──────────────────────────────────────────────

class FieldsListView(APIView):
    """
    GET /api/v1/fields/

    Returns the master list of available standard fields.
    JWT auth required.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        fields = [{**field, "is_custom": False} for field in MASTER_FIELDS]
        return success(data={"fields": fields})


# ──────────────────────────────────────────────
# Phase 6: Jobs CRUD
# ──────────────────────────────────────────────

class JobListCreateView(APIView):
    """
    POST /api/v1/jobs/  — create new job with frozen field config
    GET  /api/v1/jobs/  — list all jobs for user (no fields_snapshot)
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = JobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated = serializer.validated_data

        # Build fields_snapshot from validated fields
        fields_snapshot = []
        for field in validated["fields"]:
            entry = {
                "key": field["key"],
                "label": field["label"],
                "type": field["type"],
                "is_custom": field["is_custom"],
            }
            if field.get("hint"):
                entry["hint"] = field["hint"]
            fields_snapshot.append(entry)

        job = Job.objects.create(
            user=request.user,
            name=validated["name"],
            fields_snapshot=fields_snapshot,
            status="DRAFT",
        )

        return success(
            data={
                "job": _job_detail_payload(job)
            },
            status=http_status.HTTP_201_CREATED,
        )

    def get(self, request):
        jobs = Job.objects.filter(user=request.user).order_by("-created_at")
        return success(data={"jobs": [_job_list_payload(j) for j in jobs]})


class JobDetailView(APIView):
    """
    GET    /api/v1/jobs/{job_id}/
    DELETE /api/v1/jobs/{job_id}/

    Returns full job detail including fields_snapshot.
    Deletes the job and all associated files/rows.
    404 if job doesn't belong to request.user.
    """

    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, job_id):
        job = _get_job_for_user(job_id, request.user)
        return success(data={"job": _job_detail_payload(job)})

    def delete(self, request, job_id):
        job = _get_job_for_user(job_id, request.user)
        job.delete()  # Django handles cascade deletion of files and rows automatically
        return success(
            data={"message": "Job deleted successfully."},
            status=http_status.HTTP_200_OK
        )


class JobStatusView(APIView):
    """
    GET /api/v1/jobs/{job_id}/status/

    Lightweight polling endpoint for the progress UI.
    Returns only job_id, status, and file counts.
    """

    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, job_id):
        job = _get_job_for_user(job_id, request.user)
        return success(data={
            "job_id": str(job.id),
            "status": job.status,
            "total_files": job.total_files,
            "done_files": job.done_files,
            "failed_files": job.failed_files,
        })


class JobLastFieldsView(APIView):
    """
    GET /api/v1/jobs/{job_id}/last-fields/

    Returns fields_snapshot of the user's most recently created job
    (excluding the current job). Powers "Use same fields as last job".
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        # Verify the current job belongs to this user
        _get_job_for_user(job_id, request.user)

        # Find the most recent OTHER job by this user
        last_job = (
            Job.objects
            .filter(user=request.user)
            .exclude(pk=job_id)
            .order_by("-created_at")
            .first()
        )

        if not last_job:
            return success(data={"fields": []})

        return success(data={"fields": last_job.fields_snapshot})


# ──────────────────────────────────────────────
# Phase 10: Rows (Sheet Feature)
# ──────────────────────────────────────────────

def _row_payload(row):
    """Build the row payload for the sheet UI."""
    return {
        "id": str(row.id),
        "file_id": str(row.file_id),
        "original_filename": row.file.original_filename,
        "extraction_status": row.extraction_status,
        "data": row.data,
        "created_at": row.created_at.isoformat(),
    }


class JobRowsView(APIView):
    """
    GET /api/v1/jobs/{job_id}/rows/

    Returns all extracted rows for the sheet UI.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        job = _get_job_for_user(job_id, request.user)

        if job.status not in [JobStatus.COMPLETE, JobStatus.PARTIAL]:
            raise ConflictError("Rows are only available for COMPLETE or PARTIAL jobs.")

        qs = (
            ExtractedRow.objects
            .filter(job=job)
            .select_related("file")
            .order_by("created_at")
        )

        return success(data={
            "job_id": str(job.id),
            "fields_snapshot": job.fields_snapshot,
            "rows": [_row_payload(r) for r in qs],
        })


class JobRowUpdateView(APIView):
    """
    PATCH /api/v1/jobs/{job_id}/rows/{row_id}/

    Allows inline cell edits in the sheet UI.
    Body: {"data": {"field_key": "new_value", ...}}
    Only the provided keys are merged; unmentioned keys are preserved.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, job_id, row_id):
        job = _get_job_for_user(job_id, request.user)

        if job.status not in [JobStatus.COMPLETE, JobStatus.PARTIAL]:
            raise ConflictError(
                "Row edits are only allowed for COMPLETE or PARTIAL jobs."
            )

        try:
            row = ExtractedRow.objects.select_related("file").get(
                pk=row_id, job=job
            )
        except (ExtractedRow.DoesNotExist, ValueError):
            raise NotFoundError("Resource not found.")

        incoming_data = request.data.get("data")
        if not isinstance(incoming_data, dict) or not incoming_data:
            raise ValidationError(
                "Request body must contain a non-empty 'data' dict."
            )

        # Validate keys against the frozen fields_snapshot
        valid_keys = {f["key"] for f in job.fields_snapshot}
        invalid_keys = set(incoming_data.keys()) - valid_keys
        if invalid_keys:
            raise ValidationError(
                f"Unknown field keys: {', '.join(sorted(invalid_keys))}. "
                f"Valid keys: {', '.join(sorted(valid_keys))}"
            )

        # Merge: preserve existing data, overwrite only the provided keys
        merged = dict(row.data or {})
        merged.update(incoming_data)
        row.data = merged
        row.save(update_fields=["data"])

        return success(data={"row": _row_payload(row)})
