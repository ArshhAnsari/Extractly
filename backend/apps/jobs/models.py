"""
Job model.

Core unit of work in CV Extractor. Owns a frozen fields_snapshot,
references uploaded files, and tracks processing status.

State machine:
  DRAFT → QUEUED → PROCESSING → COMPLETE / PARTIAL / FAILED
"""

import uuid

from django.conf import settings
from django.db import models

from core.exceptions import ForbiddenError


class JobStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    QUEUED = "QUEUED", "Queued"
    PROCESSING = "PROCESSING", "Processing"
    COMPLETE = "COMPLETE", "Complete"
    PARTIAL = "PARTIAL", "Partial"
    FAILED = "FAILED", "Failed"


class Job(models.Model):
    """
    A job is a batch extraction request.

    fields_snapshot is IMMUTABLE after creation. Any attempt to modify
    it after the first save raises ForbiddenError. This is enforced
    in the save() override below.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="jobs",
    )
    name = models.CharField(max_length=255)
    fields_snapshot = models.JSONField(
        help_text="Frozen field configuration. Immutable after creation.",
    )
    status = models.CharField(
        max_length=20,
        choices=JobStatus.choices,
        default=JobStatus.DRAFT,
    )
    total_files = models.PositiveIntegerField(default=0)
    done_files = models.PositiveIntegerField(default=0)
    failed_files = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"

    def save(self, *args, **kwargs):
        """
        Override save to enforce fields_snapshot immutability.

        On update (pk already exists in DB), if fields_snapshot has
        changed from the stored value, raise ForbiddenError.
        """
        if not self._state.adding:
            # This is an update — check if snapshot is being mutated
            try:
                existing = Job.objects.only("fields_snapshot").get(pk=self.pk)
                if existing.fields_snapshot != self.fields_snapshot:
                    raise ForbiddenError(
                        "fields_snapshot is immutable and cannot be modified after job creation."
                    )
            except Job.DoesNotExist:
                pass  # New record, allow save

        super().save(*args, **kwargs)
