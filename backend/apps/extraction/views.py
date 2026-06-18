"""
Extraction views.

POST /api/v1/jobs/{job_id}/process/ — Trigger Celery extraction chord
"""

from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.exceptions import ConflictError, NotFoundError
from core.permissions import IsOwner
from core.response import success

from apps.jobs.models import Job, JobStatus
from .services import ProcessingDispatchError, start_job_processing


class JobProcessView(APIView):
    """
    POST /api/v1/jobs/{job_id}/process/
    
    Trigger point for the job's extraction pipeline.
    """
    permission_classes = [IsAuthenticated, IsOwner]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "process"

    def post(self, request, job_id):
        try:
            job = Job.objects.get(pk=job_id)
        except (Job.DoesNotExist, ValueError):
            raise NotFoundError("Resource not found.")
            
        self.check_object_permissions(request, job)

        try:
            job, started = start_job_processing(job.id, allow_existing=True)
        except ProcessingDispatchError as exc:
            raise ConflictError(str(exc))

        return success(
            data={
                "job_id": str(job.id),
                "status": job.status,
                "total_files": job.total_files,
                "message": "Processing started" if started else "Processing already handled",
            },
            status=http_status.HTTP_200_OK
        )
