"""
Custom exception classes and DRF exception handler.

All error codes from the API doc are mapped to dedicated exception classes.
The custom_exception_handler ensures every error — including DRF's built-in
validation errors, auth failures, and throttling — passes through the
standardized error response shape.

Never raise raw DRF exceptions in views. Use these instead.
"""

import logging

from rest_framework import status as http_status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied,
    Throttled,
    ValidationError as DRFValidationError,
)
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Custom Exception Classes
# ──────────────────────────────────────────────


class BaseAppException(APIException):
    """Base for all application-specific exceptions."""

    error_code = "INTERNAL_ERROR"
    status_code = http_status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "An unexpected error occurred."

    def __init__(self, message=None, extra_data=None):
        self.message = message or self.default_detail
        self.extra_data = extra_data
        super().__init__(detail=self.message)


class ValidationError(BaseAppException):
    """Request body failed validation."""

    error_code = "VALIDATION_ERROR"
    status_code = http_status.HTTP_400_BAD_REQUEST
    default_detail = "Request validation failed."


class NotFoundError(BaseAppException):
    """Resource does not exist or does not belong to this user."""

    error_code = "NOT_FOUND"
    status_code = http_status.HTTP_404_NOT_FOUND
    default_detail = "Resource not found."


class UnauthorizedError(BaseAppException):
    """Missing or invalid JWT token."""

    error_code = "UNAUTHORIZED"
    status_code = http_status.HTTP_401_UNAUTHORIZED
    default_detail = "Authentication credentials were not provided or are invalid."


class ForbiddenError(BaseAppException):
    """Authenticated but not allowed to perform this action."""

    error_code = "FORBIDDEN"
    status_code = http_status.HTTP_403_FORBIDDEN
    default_detail = "You do not have permission to perform this action."


class ConflictError(BaseAppException):
    """State conflict (e.g. triggering a job already in PROCESSING)."""

    error_code = "CONFLICT"
    status_code = http_status.HTTP_409_CONFLICT
    default_detail = "Request conflicts with the current state of the resource."


class RateLimitedError(BaseAppException):
    """Too many requests."""

    error_code = "RATE_LIMITED"
    status_code = http_status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = "Too many requests. Please try again later."


class InternalError(BaseAppException):
    """Something went wrong server-side."""

    error_code = "INTERNAL_ERROR"
    status_code = http_status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "An unexpected error occurred."


# ──────────────────────────────────────────────
# DRF Exception Handler
# ──────────────────────────────────────────────


def _build_error_body(code, message, extra_data=None):
    """Build the standardized error response dict."""
    error_obj = {
        "code": code,
        "message": message,
    }
    if extra_data is not None:
        error_obj["data"] = extra_data
    return {"success": False, "error": error_obj}


def _flatten_validation_errors(detail):
    """
    Flatten DRF's nested validation error detail into a single
    human-readable string. Never expose raw field names in the
    response — aggregate them into one message.
    """
    messages = []

    def collect(value):
        if isinstance(value, dict):
            for nested in value.values():
                collect(nested)
            return

        if isinstance(value, list):
            for item in value:
                collect(item)
            return

        text = str(value).strip()
        if text:
            messages.append(text)

    collect(detail)

    if not messages:
        return "Request validation failed."

    unique_messages = list(dict.fromkeys(messages))
    return "; ".join(unique_messages)


def custom_exception_handler(exc, context):
    """
    Global DRF exception handler.

    Routes all exceptions through the standardized error shape:
    {"success": false, "error": {"code": "...", "message": "..."}}

    Mapping:
      - Our custom BaseAppException subclasses → use their error_code
      - DRF ValidationError          → VALIDATION_ERROR  (400)
      - DRF AuthenticationFailed     → UNAUTHORIZED      (401)
      - DRF NotAuthenticated         → UNAUTHORIZED      (401)
      - DRF PermissionDenied         → FORBIDDEN         (403)
      - DRF Throttled                → RATE_LIMITED      (429)
      - DRF Http404                  → NOT_FOUND         (404)
      - Everything else              → INTERNAL_ERROR    (500)
    """

    # Let DRF handle the exception first to get a Response object
    response = drf_exception_handler(exc, context)

    # ── Our custom exceptions ────────────────────────────────
    if isinstance(exc, BaseAppException):
        if response is None:
            from rest_framework.response import Response

            response = Response(status=exc.status_code)

        response.data = _build_error_body(
            code=exc.error_code,
            message=exc.message,
            extra_data=exc.extra_data,
        )
        response.status_code = exc.status_code
        return response

    # ── DRF's built-in exceptions ────────────────────────────
    if response is not None:
        if isinstance(exc, DRFValidationError):
            message = _flatten_validation_errors(exc.detail)
            response.data = _build_error_body("VALIDATION_ERROR", message)

        elif isinstance(exc, (AuthenticationFailed, NotAuthenticated)):
            response.data = _build_error_body(
                "UNAUTHORIZED",
                "Authentication credentials were not provided or are invalid.",
            )

        elif isinstance(exc, PermissionDenied):
            response.data = _build_error_body(
                "FORBIDDEN",
                "You do not have permission to perform this action.",
            )

        elif isinstance(exc, Throttled):
            wait = getattr(exc, 'wait', None)
            msg = f"Too many requests. Retry after {int(wait)} seconds." if wait else "Too many requests."
            response.data = _build_error_body("RATE_LIMITED", msg)

        else:
            # Catch-all for other DRF exceptions (404, 405, etc.)
            status = response.status_code
            if status == 404:
                response.data = _build_error_body("NOT_FOUND", "Resource not found.")
            elif status == 405:
                response.data = _build_error_body("VALIDATION_ERROR", "Method not allowed.")
            else:
                response.data = _build_error_body(
                    "INTERNAL_ERROR",
                    "An unexpected error occurred.",
                )

        return response

    # ── Unhandled exceptions (no DRF Response) ───────────────
    # Log the real error but never expose it to the client
    logger.exception("Unhandled exception in view: %s", exc)

    from rest_framework.response import Response

    return Response(
        _build_error_body("INTERNAL_ERROR", "An unexpected error occurred."),
        status=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
