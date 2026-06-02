"""
Standardized API response helpers.

Every view MUST use these instead of returning raw DRF Response objects.
This guarantees the global response shapes from the API doc:

Success:  {"success": true,  "data": {...}}
Error:    {"success": false, "error": {"code": "...", "message": "..."}}
"""

from rest_framework.response import Response
from rest_framework import status as http_status


def success(data=None, status=http_status.HTTP_200_OK):
    """
    Build a standardized success response.

    Args:
        data: Dict payload to include under the "data" key.
              Defaults to empty dict if None.
        status: HTTP status code (default 200).

    Returns:
        DRF Response with shape {"success": true, "data": {...}}
    """
    if data is None:
        data = {}

    return Response(
        {"success": True, "data": data},
        status=status,
    )


def error(code, message, status=http_status.HTTP_400_BAD_REQUEST, extra_data=None):
    """
    Build a standardized error response.

    Args:
        code: Error code string (e.g. "VALIDATION_ERROR", "NOT_FOUND").
        message: Human-readable error message.
        status: HTTP status code (default 400).
        extra_data: Optional dict merged into the error object
                    (used for SNAPSHOT_MISMATCH diff payload).

    Returns:
        DRF Response with shape {"success": false, "error": {"code": "...", "message": "..."}}
    """
    error_body = {
        "code": code,
        "message": message,
    }

    # Merge extra data into the error object (e.g. snapshot mismatch diff)
    if extra_data is not None:
        error_body["data"] = extra_data

    return Response(
        {"success": False, "error": error_body},
        status=status,
    )
