from rest_framework import serializers
from django.conf import settings

from .models import FileType

class UploadSignRequestSerializer(serializers.Serializer):
    """Validates parameters for generating a Cloudinary signed url."""
    filename = serializers.CharField(max_length=255)
    file_type = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1)

    # Allowed mime types map
    ALLOWED_MIME_TYPES = {
        "application/pdf": FileType.PDF,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": FileType.DOCX,
        "image/jpeg": FileType.IMAGE,
        "image/png": FileType.IMAGE,
    }

    def validate_file_type(self, value):
        if value not in self.ALLOWED_MIME_TYPES:
            raise serializers.ValidationError(
                "Unsupported file type. Allowed: PDF, DOCX, JPG, PNG."
            )
        return value

    def validate_file_size(self, value):
        max_size = getattr(settings, "MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024)
        if value > max_size:
            raise serializers.ValidationError(
                f"File exceeds the maximum size of {max_size} bytes."
            )
        return value


class FileRegistrationItemSerializer(serializers.Serializer):
    cloudinary_public_id = serializers.CharField(max_length=512)
    original_filename = serializers.CharField(max_length=255)
    file_type = serializers.ChoiceField(choices=FileType.choices)

class BatchFileRegistrationSerializer(serializers.Serializer):
    files = FileRegistrationItemSerializer(many=True, allow_empty=False)

    def validate_files(self, value):
        if len(value) > 100:
            raise serializers.ValidationError("Cannot register more than 100 files at once.")
        return value
