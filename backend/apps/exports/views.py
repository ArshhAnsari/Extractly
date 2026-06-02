"""
Export views.

GET  /api/v1/jobs/{job_id}/export/ — Download Job data as CSV or Excel or export to Sheets.
POST /api/v1/exports/merge/        — Download merged data from multiple jobs or export to Sheets.
"""

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import status as http_status

from core.response import success, error
from core.exceptions import ConflictError, NotFoundError, ValidationError
from core.permissions import IsOwner
from apps.jobs.models import Job, JobStatus
from apps.integrations.services import write_to_sheets, GoogleNotConnectedError
from .exporters import (
    generate_csv,
    generate_excel,
    generate_merged_csv,
    generate_merged_excel,
    get_headers_and_rows,
    get_merged_headers_and_rows,
)
from typing import Any

class JobExportView(APIView):
    """
    GET /api/v1/jobs/{job_id}/export/

    Query parameters:
    - export_format: 'csv' | 'xlsx' | 'sheets'
    """
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request, job_id):
        try:
            job = Job.objects.get(pk=job_id)
        except (Job.DoesNotExist, ValueError):
            raise NotFoundError("Resource not found.")

        self.check_object_permissions(request, job)

        if job.status not in [JobStatus.COMPLETE, JobStatus.PARTIAL]:
            raise ConflictError("Job must be COMPLETE or PARTIAL to export data.")

        export_format = request.query_params.get("export_format", "").lower()
        if export_format not in ["csv", "xlsx", "sheets"]:
            raise ValidationError(
                "Query parameter 'export_format' must be 'csv', 'xlsx', or 'sheets'."
            )

        if export_format == "sheets":
            headers, rows = get_headers_and_rows(job)
            result = write_to_sheets(
                user=request.user,
                headers=headers,
                rows=rows,
                sheet_title=f"CV Extractor: {job.name}",
            )
            return success(result)

        if export_format == "csv":
            content = generate_csv(job)
            response = HttpResponse(content, content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="job_{job.id}.csv"'
            return response

        content = generate_excel(job)
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="job_{job.id}.xlsx"'
        return response

def _compare_snapshots(jobs):
    """Returns (match: bool, diff: dict)"""
    key_sets = [
        {f["key"] for f in job.fields_snapshot}
        for job in jobs
    ]
    common = set.intersection(*key_sets)
    all_keys = set.union(*key_sets)

    if common == all_keys:
        return True, {}

    diff: dict[str, Any] = {"common_fields": sorted(common)}
    for job in jobs:
        job_keys = {f["key"] for f in job.fields_snapshot}
        exclusive = job_keys - common
        if exclusive:
            diff[f"job_{job.id}_only"] = sorted(exclusive)
    diff["resolution"] = "Mismatched columns will be empty for affected rows"
    return False, diff

class MergeExportView(APIView):
    """
    POST /api/v1/exports/merge/

    Body:
    {
        "job_ids": ["uuid1", "uuid2", ...],
        "format": "csv" | "xlsx" | "sheets",
        "force": true   (optional, required on mismatch confirmation)
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ── Validate input ───────────────────────────────────
        job_ids = request.data.get("job_ids")
        if not isinstance(job_ids, list) or len(job_ids) < 2:
            raise ValidationError("'job_ids' must be a list of at least 2 job UUIDs.")

        if len(job_ids) > 20:
            raise ValidationError("Cannot merge more than 20 jobs at once.")

        export_format = str(request.data.get("format", "")).lower()
        if export_format not in ["csv", "xlsx", "sheets"]:
            raise ValidationError("'format' must be 'csv', 'xlsx', or 'sheets'.")

        # ── Fetch & authorize ────────────────────────────────
        jobs = list(Job.objects.filter(pk__in=job_ids, user=request.user))

        if len(jobs) != len(set(job_ids)):
            raise NotFoundError("One or more jobs were not found or do not belong to you.")

        # ── Validate statuses ────────────────────────────────
        non_exportable = [
            str(j.id) for j in jobs
            if j.status not in [JobStatus.COMPLETE, JobStatus.PARTIAL]
        ]
        if non_exportable:
            raise ConflictError(
                f"The following jobs are not COMPLETE or PARTIAL: {', '.join(non_exportable)}"
            )

        # ── Preserve the order the caller requested ──────────
        job_map = {str(j.id): j for j in jobs}
        ordered_jobs = [job_map[str(jid)] for jid in job_ids if str(jid) in job_map]

        # ── Check snapshot mismatch ──────────────────────────
        force = request.data.get("force", False)
        match, diff = _compare_snapshots(ordered_jobs)

        if not match and not force:
            return error(
                code="SNAPSHOT_MISMATCH",
                message="Selected jobs have different field configurations",
                status=http_status.HTTP_409_CONFLICT,
                extra_data=diff,
            )

        # ── Generate ─────────────────────────────────────────
        if export_format == "sheets":
            headers, rows = get_merged_headers_and_rows(ordered_jobs)
            result = write_to_sheets(
                user=request.user,
                headers=headers,
                rows=rows,
                sheet_title=f"CV Extractor: Merged Export ({len(ordered_jobs)} jobs)",
            )
            return success(result)

        if export_format == "csv":
            content = generate_merged_csv(ordered_jobs)
            response = HttpResponse(content, content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="merged_export.csv"'
            return response

        content = generate_merged_excel(ordered_jobs)
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="merged_export.xlsx"'
        return response