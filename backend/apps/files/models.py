"""
File and ExtractedRow models.

File: tracks a CV uploaded to Cloudinary (metadata only — bytes never
pass through Django).

ExtractedRow: one-to-one with File, holds the LLM-extracted data as
a JSON dict of {field_key: value}.
"""

import uuid

from django.db import models

from apps.jobs.models import Job


class FileType(models.TextChoices):
    PDF = "PDF", "PDF"
    DOCX = "DOCX", "DOCX"
    IMAGE = "IMAGE", "Image"


class FileStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    VERIFIED = "VERIFIED", "Verified"
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"


class File(models.Model):
    """
    Represents a single CV file uploaded to Cloudinary.

    Django never stores the file bytes — only the Cloudinary reference
    and metadata. The raw_text field is populated during extraction
    (V2 delta extraction hook — non-negotiable).
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    job = models.ForeignKey(
        Job,
        on_delete=models.CASCADE,
        related_name="files",
    )
    cloudinary_public_id = models.CharField(
        max_length=512,
        unique=True,
    )
    storage_url = models.URLField(
        max_length=1024,
        null=True,
        blank=True,
        help_text="Set after Cloudinary webhook confirms upload.",
    )
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(
        max_length=10,
        choices=FileType.choices,
    )
    raw_text = models.TextField(
        null=True,
        blank=True,
        help_text="Extracted raw text. V2 delta extraction hook — do not remove.",
    )
    status = models.CharField(
        max_length=20,
        choices=FileStatus.choices,
        default=FileStatus.PENDING,
    )
    bytes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="File size in bytes, set from Cloudinary webhook.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.original_filename} ({self.status})"


class ExtractionStatus(models.TextChoices):
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"


class ExtractedRow(models.Model):
    """
    One extracted data row per file.

    data is a JSON dict mapping field keys to extracted values.
    Null values mean the field was not found or extraction failed
    for that field.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    file = models.OneToOneField(
        File,
        on_delete=models.CASCADE,
        related_name="extracted_row",
    )
    job = models.ForeignKey(
        Job,
        on_delete=models.CASCADE,
        related_name="extracted_rows",
    )
    data = models.JSONField(
        null=True,
        blank=True,
        help_text="Field key → extracted value. Null for failed extractions.",
    )
    extraction_status = models.CharField(
        max_length=10,
        choices=ExtractionStatus.choices,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Row for {self.file.original_filename} ({self.extraction_status})"
