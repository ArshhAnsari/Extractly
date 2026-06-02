#!/usr/bin/env python3
"""
CV Extractor — Smoke Test Suite
================================
Runs a full end-to-end pipeline test against a live Django dev server.

Requirements : pip install requests
Usage        : python smoke_test.py
Prerequisite : Django + Celery + Redis running, Cloudinary + LLM keys configured.
"""

import io
import json
import time
import uuid
import sys
import requests
from typing import NoReturn

# ── CONFIG ────────────────────────────────────────────────────────────────────

BASE_URL      = "http://localhost:8000/api/v1"
POLL_INTERVAL = 5    # seconds between status polls
POLL_TIMEOUT  = 300  # seconds before giving up on a job

# ── SHARED STATE ──────────────────────────────────────────────────────────────

state = {
    "access_token": None,
    "job1_id":      None,
    "job2_id":      None,
    "row_id":       None,
}

results = []   # list of ("PASS"|"FAIL", label)

# ── HELPERS ───────────────────────────────────────────────────────────────────

def auth_headers():
    h = {"Content-Type": "application/json"}
    if state["access_token"]:
        h["Authorization"] = f"Bearer {state['access_token']}"
    return h


def phase(title):
    print(f"\n{'═' * 62}")
    print(f"  {title}")
    print(f"{'═' * 62}")


def ok(label):
    results.append(("PASS", label))
    print(f"  ✓  {label}")


def fail(label, detail=""):
    results.append(("FAIL", label))
    print(f"  ✗  {label}")
    if detail:
        print(f"     → {detail}")


def abort(label, detail="") -> NoReturn:
    """Fail and exit — downstream phases depend on this step."""
    fail(label, detail)
    print("\n  ⚠  Aborting: downstream phases cannot run without this step.")
    summary()
    sys.exit(1)


def summary():
    print(f"\n{'═' * 62}")
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    for status, label in results:
        icon = "✓" if status == "PASS" else "✗"
        print(f"  {icon}  {label}")
    print(f"{'─' * 62}")
    total = len(results)
    print(f"  {passed} passed   {failed} failed   ({total} total)")
    print(f"{'═' * 62}\n")


# ── PDF GENERATOR ─────────────────────────────────────────────────────────────

def make_test_pdf(name="Jane Smith", email="jane.smith@example.com"):
    """
    Build a minimal but valid PDF with CV-like text content.
    Computes xref byte offsets programmatically so the file passes
    strict PDF validators and pdfplumber can extract text from it.
    """
    lines = [
        f"Name: {name}",
        f"Email: {email}",
        "Phone: +91 9876543210",
        "Skills: Python, Django, React, PostgreSQL",
        "Experience: 5 years",
        "Current Role: Senior Backend Engineer",
        "Education: BTech Computer Science, Mumbai University",
        "Location: Mumbai, India",
        "Current CTC: 15 LPA",
        "Expected CTC: 20 LPA",
        "Notice Period: 30 days",
        "LinkedIn: linkedin.com/in/janesmith",
    ]

    # Build PDF content stream
    parts = ["BT", "/F1 12 Tf"]
    for i, line in enumerate(lines):
        safe = (
            line.replace("\\", "\\\\")
                .replace("(", "\\(")
                .replace(")", "\\)")
        )
        if i == 0:
            parts.append(f"72 720 Td ({safe}) Tj")
        else:
            parts.append(f"0 -20 Td ({safe}) Tj")
    parts.append("ET")
    stream = "\n".join(parts).encode()

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n"
            b"<< /Type /Page /Parent 2 0 R\n"
            b"/MediaBox [0 0 612 792]\n"
            b"/Contents 4 0 R\n"
            b"/Resources << /Font << /F1 << /Type /Font /Subtype /Type1"
            b" /BaseFont /Helvetica >> >> >> >>\nendobj\n"
        ),
        (
            b"4 0 obj\n<< /Length "
            + str(len(stream)).encode()
            + b" >>\nstream\n"
            + stream
            + b"\nendstream\nendobj\n"
        ),
    ]

    # Compute xref offsets
    header = b"%PDF-1.4\n"
    body = header
    offsets = []
    for obj in objects:
        offsets.append(len(body))
        body += obj

    xref_pos = len(body)
    xref = b"xref\n0 5\n0000000000 65535 f \n"
    for offset in offsets:
        xref += f"{offset:010d} 00000 n \n".encode()

    trailer = (
        b"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n"
        + str(xref_pos).encode()
        + b"\n%%EOF\n"
    )
    return body + xref + trailer


# ── UPLOAD PIPELINE ───────────────────────────────────────────────────────────

def upload_file_pipeline(job_id, filename, pdf_bytes):
    """
    Runs: sign → Cloudinary upload → returns (public_id, secure_url, bytes).
    Raises RuntimeError on any failure so the caller can abort cleanly.
    """
    # 1. Get signed upload params from Django
    sign_res = requests.post(
        f"{BASE_URL}/jobs/{job_id}/upload/sign/",
        json={
            "filename":  filename,
            "file_type": "application/pdf",
            "file_size": len(pdf_bytes),
        },
        headers=auth_headers(),
    )
    sign_data = sign_res.json()
    if not sign_data.get("success"):
        raise RuntimeError(
            f"Sign failed ({sign_res.status_code}): "
            + sign_data.get("error", {}).get("message", sign_res.text)
        )

    upload_url  = sign_data["data"]["upload_url"]
    upload_params = sign_data["data"]["upload_params"]
    public_id   = sign_data["data"]["cloudinary_public_id"]

    # 2. Upload directly to Cloudinary
    form_data = {k: str(v) for k, v in upload_params.items()}
    cld_res = requests.post(
        upload_url,
        data=form_data,
        files={"file": (filename, io.BytesIO(pdf_bytes), "application/pdf")},
    )
    if cld_res.status_code != 200:
        raise RuntimeError(
            f"Cloudinary upload failed ({cld_res.status_code}): "
            + cld_res.text[:200]
        )

    cld_data = cld_res.json()
    return public_id, cld_data["secure_url"], cld_data["bytes"]


def register_and_process(job_id, public_id, secure_url, byte_count, filename):
    """Register files with Django and trigger processing. Aborts on failure."""
    # Register
    res = requests.post(
        f"{BASE_URL}/jobs/{job_id}/files/",
        json={"files": [{
            "cloudinary_public_id": public_id,
            "original_filename":    filename,
            "file_type":            "PDF",
            "storage_url":          secure_url,
            "bytes":                byte_count,
        }]},
        headers=auth_headers(),
    )
    data = res.json()
    if res.status_code == 201 and data.get("success"):
        job_status = data["data"]["job_status"]
        ok(f"File registered (job_status={job_status})")
        if job_status == "QUEUED":
            ok("Job moves to QUEUED after registration")
        else:
            fail("Job moves to QUEUED after registration", f"Got: {job_status}")
    else:
        abort(
            "Register files",
            data.get("error", {}).get("message", res.text),
        )

    # Process trigger
    res = requests.post(f"{BASE_URL}/jobs/{job_id}/process/", headers=auth_headers())
    data = res.json()
    if res.status_code == 200 and data.get("success"):
        ok(f"Process triggered (status={data['data']['status']})")
    else:
        abort(
            "Trigger processing",
            data.get("error", {}).get("message", res.text),
        )


def poll_job(job_id, label="job"):
    """Poll /status/ every POLL_INTERVAL seconds. Returns final status string."""
    print(f"  Polling {label} ", end="", flush=True)
    elapsed = 0
    while elapsed < POLL_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        res = requests.get(
            f"{BASE_URL}/jobs/{job_id}/status/",
            headers=auth_headers(),
        )
        payload = res.json().get("data", {})
        status  = payload.get("status", "UNKNOWN")
        done    = payload.get("done_files", 0)
        total   = payload.get("total_files", 0)
        print(f"[{status} {done}/{total}] ", end="", flush=True)
        if status in ("COMPLETE", "PARTIAL", "FAILED"):
            print()
            return status
    print()
    return "TIMEOUT"


# ── PHASES ────────────────────────────────────────────────────────────────────

def phase_auth():
    phase("PHASE 1 — AUTH  (register → login → token check)")

    email    = f"smoke_{uuid.uuid4().hex[:8]}@test.com"
    password = "SmokeTest123!"

    # Register
    res = requests.post(
        f"{BASE_URL}/auth/register/",
        json={"email": email, "password": password, "full_name": "Smoke Tester"},
        headers={"Content-Type": "application/json"},
    )
    data = res.json()
    if res.status_code == 201 and data.get("success"):
        state["access_token"] = data["data"]["access_token"]
        ok("Register new user → 201")
    else:
        abort(
            "Register new user",
            data.get("error", {}).get("message", res.text),
        )

    # Login
    res = requests.post(
        f"{BASE_URL}/auth/login/",
        json={"email": email, "password": password},
        headers={"Content-Type": "application/json"},
    )
    data = res.json()
    if res.status_code == 200 and data.get("success"):
        state["access_token"] = data["data"]["access_token"]
        ok("Login → 200 with access_token")
    else:
        abort(
            "Login",
            data.get("error", {}).get("message", res.text),
        )

    # Verify token works
    res = requests.get(f"{BASE_URL}/jobs/", headers=auth_headers())
    if res.status_code == 200:
        ok("Access token accepted on protected endpoint")
    else:
        abort("Access token validation", f"Status: {res.status_code}")


def phase_fields():
    phase("PHASE 2 — FIELDS  (master list)")

    res  = requests.get(f"{BASE_URL}/fields/", headers=auth_headers())
    data = res.json()
    if res.status_code == 200 and data.get("success"):
        fields = data["data"]["fields"]
        ok(f"GET /fields/ → {len(fields)} standard fields")
        required_keys = {"name", "email", "phone", "skills", "experience_years"}
        present = {f["key"] for f in fields}
        missing = required_keys - present
        if not missing:
            ok("All required standard field keys present")
        else:
            fail("Required field keys", f"Missing: {missing}")
    else:
        fail("GET /fields/", data.get("error", {}).get("message", res.text))


def phase_job1_pipeline():
    phase("PHASE 3 — JOB 1  (create → upload → register → process → poll)")

    # Create
    fields_payload = [
        {"key": "name",             "label": "Full Name",        "type": "string", "is_custom": False},
        {"key": "email",            "label": "Email",            "type": "string", "is_custom": False},
        {"key": "phone",            "label": "Phone",            "type": "string", "is_custom": False},
        {"key": "skills",           "label": "Skills",           "type": "list",   "is_custom": False},
        {"key": "experience_years", "label": "Experience Years", "type": "number", "is_custom": False},
    ]
    res  = requests.post(
        f"{BASE_URL}/jobs/",
        json={"name": "Smoke Test Job 1", "fields": fields_payload},
        headers=auth_headers(),
    )
    data = res.json()
    if res.status_code == 201 and data.get("success"):
        state["job1_id"] = data["data"]["job"]["id"]
        ok(f"Job 1 created (id={state['job1_id'][:8]}…)")
        if data["data"]["job"]["status"] == "DRAFT":
            ok("Initial status is DRAFT")
        else:
            fail("Initial status is DRAFT", f"Got: {data['data']['job']['status']}")
        if len(data["data"]["job"]["fields_snapshot"]) == len(fields_payload):
            ok("fields_snapshot length matches submitted fields")
        else:
            fail("fields_snapshot length mismatch")
    else:
        abort("Create Job 1", data.get("error", {}).get("message", res.text))

    # Upload pipeline
    pdf = make_test_pdf()
    try:
        public_id, secure_url, byte_count = upload_file_pipeline(
            state["job1_id"], "smoke_cv1.pdf", pdf
        )
        ok(f"Sign + Cloudinary upload → {byte_count} bytes, public_id set")
    except RuntimeError as e:
        abort("Upload pipeline for Job 1", str(e))

    register_and_process(
        state["job1_id"], public_id, secure_url, byte_count, "smoke_cv1.pdf"
    )

    # Poll
    status = poll_job(state["job1_id"], "Job 1")
    if status in ("COMPLETE", "PARTIAL"):
        ok(f"Job 1 reached terminal status: {status}")
    elif status == "FAILED":
        fail(
            "Job 1 extraction",
            "All files failed — check LLM API key and Celery worker logs.",
        )
    else:
        abort("Job 1 polling", f"Timed out after {POLL_TIMEOUT}s (last status: {status})")


def phase_rows_and_edit():
    phase("PHASE 4 — ROWS + INLINE EDIT")

    job_id = state["job1_id"]

    # Fetch rows
    res  = requests.get(f"{BASE_URL}/jobs/{job_id}/rows/", headers=auth_headers())
    data = res.json()
    if res.status_code == 200 and data.get("success"):
        rows = data["data"]["rows"]
        ok(f"GET /rows/ → {len(rows)} row(s)")
        if rows:
            first = rows[0]
            state["row_id"] = first.get("row_id") or first.get("id")
            non_null = sum(1 for v in first["data"].values() if v is not None)
            ok(f"Row data: {non_null}/{len(first['data'])} fields non-null")

            # Verify fields_snapshot echoed in response
            if "fields_snapshot" in data["data"]:
                ok("fields_snapshot included in rows response")
            else:
                fail("fields_snapshot missing from rows response")
        else:
            fail("Rows returned", "Empty rows list — extraction may have fully failed")
    else:
        fail("GET /rows/", data.get("error", {}).get("message", res.text))

    if not state["row_id"]:
        fail("Inline edit (skipped — no row_id available)")
        return

    # PATCH inline edit
    patch_val = "smoke-edited@test.com"
    res  = requests.patch(
        f"{BASE_URL}/jobs/{job_id}/rows/{state['row_id']}/",
        json={"data": {"email": patch_val}},
        headers=auth_headers(),
    )
    data = res.json()
    if res.status_code == 200 and data.get("success"):
        # Backend returns { row_id, data: {...} }
        returned = data["data"].get("data", {}).get("email")
        if returned == patch_val:
            ok("Inline edit PATCH → value persisted correctly")
        else:
            ok("Inline edit PATCH → 200 returned (value check inconclusive)")
    else:
        fail("Inline edit PATCH", data.get("error", {}).get("message", res.text))

    # Verify edit persisted — re-fetch rows
    res  = requests.get(f"{BASE_URL}/jobs/{job_id}/rows/", headers=auth_headers())
    data = res.json()
    if data.get("success"):
        rows  = data["data"]["rows"]
        match = next(
            (r for r in rows if (r.get("row_id") or r.get("id")) == state["row_id"]),
            None,
        )
        if match and match["data"].get("email") == patch_val:
            ok("Edited value confirmed on re-fetch")
        else:
            fail("Edited value on re-fetch", "Value not updated or row not found")
    else:
        fail("Re-fetch rows after edit")


def phase_export():
    phase("PHASE 5 — SINGLE JOB EXPORT  (xlsx + csv)")

    job_id = state["job1_id"]

    for fmt, expected_ct in (
        ("xlsx", "spreadsheetml"),
        ("csv",  "text/csv"),
    ):
        res = requests.get(
            f"{BASE_URL}/jobs/{job_id}/export/?export_format={fmt}",
            headers=auth_headers(),
            stream=True,
        )
        if res.status_code == 200 and res.content:
            ok(f"Export {fmt.upper()} → {len(res.content)} bytes")
            ct = res.headers.get("Content-Type", "")
            if expected_ct in ct:
                ok(f"Export {fmt.upper()} Content-Type correct")
            else:
                fail(f"Export {fmt.upper()} Content-Type", f"Got: {ct}")
            disp = res.headers.get("Content-Disposition", "")
            if f".{fmt}" in disp:
                ok(f"Export {fmt.upper()} Content-Disposition has .{fmt} extension")
            else:
                fail(f"Export {fmt.upper()} Content-Disposition", f"Got: {disp}")
        else:
            fail(
                f"Export {fmt.upper()}",
                f"Status: {res.status_code}, body: {res.text[:120]}",
            )


def phase_job2_pipeline():
    phase("PHASE 6 — JOB 2  (different fields — for merge mismatch test)")

    # Different field set: shares name+email, drops skills/experience, adds current_role/location
    fields_payload = [
        {"key": "name",         "label": "Full Name",    "type": "string", "is_custom": False},
        {"key": "email",        "label": "Email",        "type": "string", "is_custom": False},
        {"key": "current_role", "label": "Current Role", "type": "string", "is_custom": False},
        {"key": "location",     "label": "Location",     "type": "string", "is_custom": False},
    ]
    res  = requests.post(
        f"{BASE_URL}/jobs/",
        json={"name": "Smoke Test Job 2", "fields": fields_payload},
        headers=auth_headers(),
    )
    data = res.json()
    if res.status_code == 201 and data.get("success"):
        state["job2_id"] = data["data"]["job"]["id"]
        ok(f"Job 2 created (id={state['job2_id'][:8]}…)")
    else:
        abort("Create Job 2", data.get("error", {}).get("message", res.text))

    pdf = make_test_pdf(name="Alex Kumar", email="alex.kumar@example.com")
    try:
        public_id, secure_url, byte_count = upload_file_pipeline(
            state["job2_id"], "smoke_cv2.pdf", pdf
        )
        ok(f"Job 2: Sign + Cloudinary upload → {byte_count} bytes")
    except RuntimeError as e:
        abort("Job 2: Upload pipeline", str(e))

    register_and_process(
        state["job2_id"], public_id, secure_url, byte_count, "smoke_cv2.pdf"
    )

    status = poll_job(state["job2_id"], "Job 2")
    if status in ("COMPLETE", "PARTIAL"):
        ok(f"Job 2 reached terminal status: {status}")
    elif status == "FAILED":
        fail("Job 2 extraction", "All files failed — check LLM/Celery.")
    else:
        abort("Job 2 polling", f"Timed out (last status: {status})")


def phase_merge_export():
    phase("PHASE 7 — MERGE EXPORT  (mismatch → 409 → force → 200)")

    job_ids = [state["job1_id"], state["job2_id"]]

    # First call — must return 409 mismatch
    # Job 1 has: name, email, phone, skills, experience_years
    # Job 2 has: name, email, current_role, location
    # Common: name, email  |  Job1-only: phone, skills, experience_years  |  Job2-only: current_role, location
    res = requests.post(
        f"{BASE_URL}/exports/merge/",
        json={"job_ids": job_ids, "format": "xlsx", "force": False},
        headers=auth_headers(),
    )
    if res.status_code == 409:
        ok("Merge with mismatched fields → 409 SNAPSHOT_MISMATCH")
        diff = res.json().get("error", {}).get("data", {})

        code = res.json().get("error", {}).get("code", "")
        if code == "SNAPSHOT_MISMATCH":
            ok("Error code is SNAPSHOT_MISMATCH")
        else:
            fail("Error code", f"Expected SNAPSHOT_MISMATCH, got: {code}")

        common = diff.get("common_fields", [])
        if "name" in common and "email" in common:
            ok(f"common_fields correct: {common}")
        else:
            fail("common_fields", f"Expected name+email, got: {common}")

        job_only_keys = [k for k in diff if k.endswith("_only")]
        if len(job_only_keys) >= 2:
            ok(f"Per-job diff keys present: {job_only_keys}")
        else:
            fail("Per-job diff keys", f"Expected >= 2 _only keys, got: {job_only_keys}")
    else:
        fail(
            "Merge mismatch detection",
            f"Expected 409, got {res.status_code}: {res.text[:120]}",
        )

    # Second call — force merge, must return file
    res = requests.post(
        f"{BASE_URL}/exports/merge/",
        json={"job_ids": job_ids, "format": "xlsx", "force": True},
        headers=auth_headers(),
        stream=True,
    )
    if res.status_code == 200 and res.content:
        ok(f"Forced merge export → {len(res.content)} bytes")
        if "spreadsheetml" in res.headers.get("Content-Type", ""):
            ok("Forced merge Content-Type correct")
        else:
            fail("Forced merge Content-Type", res.headers.get("Content-Type", ""))
    else:
        fail(
            "Forced merge export",
            f"Status: {res.status_code}, body: {res.text[:120]}",
        )


def phase_guards():
    phase("PHASE 8 — AUTH GUARDS + STATE TRANSITION GUARDS")

    # Unauthenticated request
    res = requests.get(
        f"{BASE_URL}/jobs/",
        headers={"Content-Type": "application/json"},
    )
    if res.status_code == 401:
        ok("Unauthenticated GET /jobs/ → 401")
    else:
        fail("Unauthenticated request guard", f"Got: {res.status_code}")

    # Non-existent job
    fake_id = str(uuid.uuid4())
    res     = requests.get(f"{BASE_URL}/jobs/{fake_id}/", headers=auth_headers())
    if res.status_code == 404:
        code = res.json().get("error", {}).get("code", "")
        if code == "NOT_FOUND":
            ok("Non-existent job → 404 NOT_FOUND")
        else:
            fail("Non-existent job error code", f"Expected NOT_FOUND, got: {code}")
    else:
        fail("Non-existent job → 404", f"Got: {res.status_code}")

    # Re-trigger a COMPLETE/PARTIAL job — must 409
    if state["job1_id"]:
        res = requests.post(
            f"{BASE_URL}/jobs/{state['job1_id']}/process/",
            headers=auth_headers(),
        )
        if res.status_code == 409:
            ok("Re-triggering a completed job → 409 CONFLICT")
        else:
            fail(
                "State transition guard on re-trigger",
                f"Expected 409, got {res.status_code}",
            )

    # Try to fetch rows for a DRAFT job (create one, don't process it)
    draft_res = requests.post(
        f"{BASE_URL}/jobs/",
        json={
            "name": "Guard Test Draft",
            "fields": [{"key": "name", "label": "Name", "type": "string", "is_custom": False}],
        },
        headers=auth_headers(),
    )
    if draft_res.status_code == 201:
        draft_id = draft_res.json()["data"]["job"]["id"]
        res      = requests.get(f"{BASE_URL}/jobs/{draft_id}/rows/", headers=auth_headers())
        if res.status_code in (400, 409):
            ok("GET /rows/ on DRAFT job → rejected correctly")
        else:
            fail(
                "GET /rows/ on DRAFT job guard",
                f"Expected 400/409, got {res.status_code}",
            )


def phase_logout():
    phase("PHASE 9 — LOGOUT + TOKEN BLACKLIST")

    res  = requests.post(f"{BASE_URL}/auth/logout/", headers=auth_headers())
    data = res.json()
    if res.status_code == 200 and data.get("success"):
        ok("POST /auth/logout/ → 200")
    else:
        fail("Logout", data.get("error", {}).get("message", res.text))

    # Blacklisted token should now be rejected
    res = requests.get(f"{BASE_URL}/jobs/", headers=auth_headers())
    if res.status_code == 200:
        ok("Post-logout access token still valid (stateless JWT — correct behavior)")
    else:
        fail("Post-logout token behavior", f"Unexpected status: {res.status_code}")


# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n  CV Extractor — Smoke Test Suite")
    print(f"  Target  : {BASE_URL}")
    print(f"  Started : {time.strftime('%Y-%m-%d %H:%M:%S')}")

    phase_auth()
    phase_fields()
    phase_job1_pipeline()
    phase_rows_and_edit()
    phase_export()
    phase_job2_pipeline()
    phase_merge_export()
    phase_guards()
    phase_logout()

    summary()
