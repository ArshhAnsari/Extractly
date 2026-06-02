"""
Job serializers.

Controls the exact response shapes from the API doc.
No Django model field names leak — output is explicitly defined.
"""

from rest_framework import serializers

from .constants import MASTER_FIELD_KEYS


class FieldItemSerializer(serializers.Serializer):
    """Validates a single field in the incoming fields array."""

    key = serializers.CharField(max_length=100)
    label = serializers.CharField(max_length=255)
    type = serializers.ChoiceField(choices=["string", "number", "list"])
    is_custom = serializers.BooleanField(required=False, default=False)
    hint = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate(self, attrs):
        """
        For non-custom fields, validate key exists in the master list.
        Custom fields can have any key.
        """
        if not attrs.get("is_custom") and attrs["key"] not in MASTER_FIELD_KEYS:
            raise serializers.ValidationError(
                f"Field key '{attrs['key']}' is not in the master field list. "
                f"Set is_custom=true for user-defined fields."
            )
        return attrs


class JobCreateSerializer(serializers.Serializer):
    """Validates job creation input."""

    name = serializers.CharField(max_length=255)
    fields = FieldItemSerializer(many=True, min_length=1)

    def validate_fields(self, value):
        """Ensure no duplicate keys."""
        keys = [f["key"] for f in value]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Duplicate field keys are not allowed.")
        return value
