"""
Security headers middleware.

Applied on every response as required by the API doc:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Referrer-Policy: no-referrer

Stripped on every response:
  - Server header (leaks Django version)
  - X-Powered-By header
"""


class SecurityHeadersMiddleware:
    """Inject security headers and strip implementation-leaking headers."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # ── Required security headers ────────────────────────
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Referrer-Policy"] = "no-referrer"

        # ── Strip headers that leak implementation details ───
        # Django's SecurityMiddleware and some WSGI servers set these
        response.headers.pop("Server", None)
        response.headers.pop("X-Powered-By", None)

        return response
