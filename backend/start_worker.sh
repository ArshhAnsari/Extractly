#!/bin/bash
# ──────────────────────────────────────────────────────────────────
# Celery Worker startup script for Render free web service.
#
# Render requires a web service to bind a port and respond to HTTP.
# We start a tiny Python HTTP health server in the background,
# then launch the real Celery worker in the foreground.
# ──────────────────────────────────────────────────────────────────

# Start a minimal HTTP server in the background so Render's
# health check gets a 200 OK response and the service stays alive.
python -c "
import http.server
import os
import threading

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'worker ok')

    def log_message(self, *args):
        pass  # suppress access logs

port = int(os.environ.get('PORT', 8001))
server = http.server.HTTPServer(('0.0.0.0', port), HealthHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
print(f'Health server listening on port {port}', flush=True)
" &

# Start the Celery worker in the foreground.
# Render keeps the service alive as long as this process runs.
exec celery -A config worker --loglevel=info --concurrency=2
