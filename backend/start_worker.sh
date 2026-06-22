#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# Celery Worker startup script for Render free web service.
#
# Render requires a web service to bind a port and respond to HTTP.
# We start a tiny Python HTTP health server in the background,
# then launch the real Celery worker in the foreground.
# ──────────────────────────────────────────────────────────────────

echo "[worker] Container starting at $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >&2

# Start a minimal HTTP server in the background so Render's
# health check gets a 200 OK response and the service stays alive.
# The health endpoint also reports whether the Celery worker process
# is running — useful for debugging cold-start issues.
python -c "
import http.server
import os
import subprocess
import sys

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        # Check if the Celery worker process is actually running
        try:
            result = subprocess.run(
                ['pgrep', '-f', 'celery.*worker'],
                capture_output=True, timeout=3,
            )
            if result.returncode == 0:
                self.wfile.write(b'worker ok - celery running')
            else:
                self.wfile.write(b'worker ok - celery starting')
        except Exception:
            self.wfile.write(b'worker ok - status unknown')

    def log_message(self, *args):
        pass  # suppress access logs

port = int(os.environ.get('PORT', 8001))
server = http.server.HTTPServer(('0.0.0.0', port), HealthHandler)
print(f'[worker] Health server listening on port {port}', file=sys.stderr, flush=True)
server.serve_forever()
" &

# Give the health server a moment to bind the port
sleep 1

# Start Celery Beat in the background for periodic tasks
# (e.g. recover_stale_jobs every 10 minutes).
echo "[worker] Starting Celery Beat …" >&2
celery -A config beat --loglevel=info &

# Start the Celery worker in the foreground.
# Render keeps the service alive as long as this process runs.
echo "[worker] Starting Celery Worker …" >&2
exec celery -A config worker --loglevel=info --concurrency=2
