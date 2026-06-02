import time
import uuid
import json
import hashlib
import hmac
from django.conf import settings
from django.db import transaction
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

import cloudinary.utils

from core.exceptions import ConflictError, NotFoundError, ValidationError, InternalError
from core.permissions import IsOwner
from core.response import success
from apps.jobs.models import Job, JobStatus
from .models import File, FileStatus
from .serializers import BatchFileRegistrationSerializer, UploadSignRequestSerializer


class UploadSignView(APIView):
    """
    POST /api/v1/jobs/{job_id}/upload/sign/
    """
    permission_classes = [IsAuthenticated, IsOwner]

    def post(self, request, job_id):
        try:
            job = Job.objects.get(pk=job_id)
        except (Job.DoesNotExist, ValueError):
            raise NotFoundError("Resource not found.")
            
        # Check object-level ownership
        self.check_object_permissions(request, job)

        if job.status != JobStatus.DRAFT:
            raise ConflictError(
                "This job is already queued for extraction. Create a new job to upload more files."
            )

        if File.objects.filter(job=job).count() >= settings.MAX_FILES_PER_JOB:
            raise ConflictError(f"Maximum of {settings.MAX_FILES_PER_JOB} files exceeded for this job.")

        serializer = UploadSignRequestSerializer(data=request.data)
        if not serializer.is_valid():
            errors = [str(err) for err_list in serializer.errors.values() for err in err_list]
            raise ValidationError("; ".join(errors))

        timestamp = int(time.time())
        public_id = f"cvextractor/{request.user.id}/{job.id}/{uuid.uuid4()}"
        folder = f"cvextractor/{request.user.id}/{job.id}"

        api_secret = settings.CLOUDINARY_API_SECRET
        if not api_secret:
            raise InternalError("Cloudinary is not configured.")

        params_to_sign = {
            "timestamp": timestamp,
            "public_id": public_id,
            "allowed_formats": "pdf,docx,jpg,png",
        }

        signature = cloudinary.utils.api_sign_request(params_to_sign, api_secret)

        upload_params = {
            "api_key": settings.CLOUDINARY_API_KEY,
            "timestamp": timestamp,
            "signature": signature,
            "public_id": public_id,
            "allowed_formats": "pdf,docx,jpg,png",
        }

        upload_url = f"https://api.cloudinary.com/v1_1/{settings.CLOUDINARY_CLOUD_NAME}/auto/upload"

        return success(data={
            "upload_url": upload_url,
            "upload_params": upload_params,
            "cloudinary_public_id": public_id
        })


class BatchFileRegisterView(APIView):
    """
    POST /api/v1/jobs/{job_id}/files/
    """
    permission_classes = [IsAuthenticated, IsOwner]

    def post(self, request, job_id):
        try:
            job = Job.objects.get(pk=job_id)
        except (Job.DoesNotExist, ValueError):
            raise NotFoundError("Resource not found.")
            
        self.check_object_permissions(request, job)

        serializer = BatchFileRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            errors = [str(err) for err_list in serializer.errors.values() for err in err_list]
            raise ValidationError("; ".join(errors))

        files_data = serializer.validated_data["files"]
        public_ids = [fdata["cloudinary_public_id"] for fdata in files_data]

        if job.status != JobStatus.DRAFT:
            existing_count = File.objects.filter(
                job=job, cloudinary_public_id__in=public_ids
            ).count()
            if existing_count == len(public_ids):
                return success(
                    data={
                        "registered": job.total_files,
                        "job_status": job.status,
                    },
                    status=http_status.HTTP_200_OK,
                )
            raise ConflictError("Files can only be registered for DRAFT jobs.")

        max_size = getattr(settings, "MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024)
        oversized = [
            fdata["original_filename"]
            for fdata in files_data
            if fdata.get("bytes") and fdata["bytes"] > max_size
        ]
        if oversized:
            raise ValidationError(
                f"Files exceed the maximum size of {max_size} bytes: {', '.join(oversized)}"
            )

        with transaction.atomic():
            job = Job.objects.select_for_update().get(pk=job.pk)
            files_to_create = [
                File(
                    job=job,
                    cloudinary_public_id=fdata["cloudinary_public_id"],
                    original_filename=fdata["original_filename"],
                    file_type=fdata["file_type"],
                    storage_url=fdata.get("storage_url") or None,
                    bytes=fdata.get("bytes"),
                    status=FileStatus.VERIFIED if fdata.get("storage_url") else FileStatus.PENDING,
                )
                for fdata in files_data
            ]
            File.objects.bulk_create(files_to_create)
            
            job.total_files = len(files_to_create)
            job.status = JobStatus.QUEUED
            job.save(update_fields=["total_files", "status"])

        return success(
            data={
                "registered": job.total_files,
                "job_status": job.status
            },
            status=http_status.HTTP_201_CREATED
        )


class CloudinaryWebhookView(APIView):
    """
    POST /api/v1/webhooks/cloudinary/
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        body_bytes = request.body
        signature = request.headers.get("X-Cld-Signature", "")
        timestamp = request.headers.get("X-Cld-Timestamp", "")
        secret = settings.CLOUDINARY_WEBHOOK_SECRET
        
        if not signature or not timestamp or not secret:
            return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)

        # 1. Replay protection (7200 seconds / 2 hours)
        try:
            if int(time.time()) - int(timestamp) > 7200:
                import logging
                logging.getLogger(__name__).warning("Webhook timestamp expired.")
                return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)
        except ValueError:
            return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)

        # 2. Verify Signature
        body_str = body_bytes.decode("utf-8")
        params_str = f"notification_body={body_str}&timestamp={timestamp}"
        to_sign = params_str + secret
        expected_sig = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

        if not hmac.compare_digest(expected_sig, signature):
            import logging
            logging.getLogger(__name__).error("Webhook signature mismatch.")
            return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)

        # 3. Process Payload
        public_id: str | None = None  
        try:
            payload_data = json.loads(body_bytes)
            public_id = payload_data.get("public_id")
            
            if not public_id:
                return Response({"received": True}, status=http_status.HTTP_200_OK)

            with transaction.atomic():
                file_record = (
                    File.objects
                    .select_for_update()
                    .get(cloudinary_public_id=public_id)
                )

                if file_record.status == FileStatus.VERIFIED:
                    return Response({"received": True}, status=http_status.HTTP_200_OK)

                file_record.status = FileStatus.VERIFIED
                file_record.storage_url = payload_data.get("secure_url")
                file_record.bytes = payload_data.get("bytes")
                file_record.save(update_fields=["status", "storage_url", "bytes"])

        except json.JSONDecodeError:
            pass
        except File.DoesNotExist:
            import logging
            logging.getLogger(__name__).warning(
                "Webhook received for unknown public_id: %s", public_id
            )

        return Response({"received": True}, status=http_status.HTTP_200_OK)