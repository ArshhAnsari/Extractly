import time
import uuid
import json
import hashlib
import hmac
import os
import re
from django.conf import settings
from django.db import transaction
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
import logging
logger = logging.getLogger(__name__)

import cloudinary.utils
from rest_framework.throttling import ScopedRateThrottle
from core.exceptions import ConflictError, NotFoundError, ValidationError, InternalError
from core.permissions import IsOwner
from core.response import success
from apps.jobs.models import Job, JobStatus
from .models import File, FileStatus
from .serializers import BatchFileRegistrationSerializer, UploadSignRequestSerializer


def normalize_filename(filename: str) -> str:
    """
    Strips OS-generated duplicate suffixes from a filename so that
    'arsh.pdf', 'arsh(1).pdf', and 'arsh (2).pdf' all resolve to 'arsh.pdf'.
    """
    stem, ext = os.path.splitext(filename)
    cleaned_stem = re.sub(r'\s*\(\d+\)$', '', stem)
    return cleaned_stem + ext



class UploadSignView(APIView):
    """
    POST /api/v1/jobs/{job_id}/upload/sign/
    """
    permission_classes = [IsAuthenticated, IsOwner]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "upload_sign"

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

        filename = serializer.validated_data["filename"]
        normalized_name = normalize_filename(filename)

        existing_names = {
            normalize_filename(n)
            for n in File.objects.filter(job=job).values_list('original_filename', flat=True)
        }
        if normalized_name in existing_names:
            raise ConflictError(f"A file equivalent to '{filename}' already exists in this job.")

        timestamp = int(time.time())

        public_id = f"cvextractor/{request.user.id}/{job.id}/{uuid.uuid4()}"

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

        with transaction.atomic():
            job = Job.objects.select_for_update().get(pk=job.pk)

            # Intra-batch deduplication
            seen_keys = set()
            unique_files_data = []
            for fdata in files_data:
                norm_name = normalize_filename(fdata["original_filename"])
                file_bytes = fdata.get("bytes")
                key = (norm_name, file_bytes)
                if key not in seen_keys:
                    unique_files_data.append(fdata)
                    seen_keys.add(key)

            # Cross-DB deduplication
            existing_files_qs = File.objects.filter(job=job).values_list('original_filename', 'bytes')
            existing_keys = {
                (normalize_filename(name), size)
                for name, size in existing_files_qs
            }
            filtered_files_data = [
                fdata for fdata in unique_files_data
                if (normalize_filename(fdata["original_filename"]), fdata.get("bytes")) not in existing_keys
            ]

            if not filtered_files_data:
                existing_count = File.objects.filter(job=job).count()
                if existing_count == 0:
                    raise ValidationError("All files in the batch are duplicates, and no files are registered for this job.")
                job.total_files = existing_count
                job.status = JobStatus.QUEUED
                job.save(update_fields=["total_files", "status"])
                return success(
                    data={
                        "registered": job.total_files,
                        "job_status": job.status
                    },
                    status=http_status.HTTP_200_OK
                )

            files_to_create = [
                File(
                    job=job,
                    cloudinary_public_id=fdata["cloudinary_public_id"],
                    original_filename=fdata["original_filename"],
                    file_type=fdata["file_type"],
                    storage_url=fdata.get("storage_url", ""),
                    bytes=fdata.get("bytes"),
                    status=FileStatus.VERIFIED if fdata.get("storage_url") else FileStatus.PENDING,
                )
                for fdata in filtered_files_data
            ]
            File.objects.bulk_create(files_to_create)

            job.total_files = File.objects.filter(job=job).count()
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
    throttle_classes = []  # signature-verified callback, exempt from global anon throttle

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
                logger.warning("Webhook timestamp expired.")
                return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)
        except ValueError:
            return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)

        # 2. Verify Signature
        try:
            body_str = body_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return Response({"received": False}, status=http_status.HTTP_400_BAD_REQUEST)
        
        payload_str = body_str + timestamp + secret
        
        # Cloudinary can send either SHA1 or SHA256 depending on account settings
        expected_sig_sha1 = hashlib.sha1(payload_str.encode("utf-8")).hexdigest()
        expected_sig_sha256 = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        if not hmac.compare_digest(expected_sig_sha1, signature) and not hmac.compare_digest(expected_sig_sha256, signature):
            logger.error("Webhook signature mismatch.")
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
            logger.warning("Webhook received for unknown public_id: %s", public_id)

        return Response({"received": True}, status=http_status.HTTP_200_OK)