# <img src="frontend/public/Extractly_logo.png" alt="Logo" width="300" style="display:block;margin:0 auto;" />

**Turn a folder of messy CVs into a clean, structured spreadsheet — in seconds.**

Extractly is a multi-tenant SaaS platform for HR teams and recruiters. Upload up to 100 CV files (PDF, DOCX, JPG, PNG) per job, define exactly which fields to extract, and get a clean tabular export (Excel, CSV, or Google Sheets) without touching a single document manually.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Django](https://img.shields.io/badge/Django-5.1-092E20?logo=django)](https://djangoproject.com)
[![Celery](https://img.shields.io/badge/Celery-async-37814A?logo=celery)](https://docs.celeryq.dev)
[![Groq](https://img.shields.io/badge/LLM-Groq%20llama--3.3--70b-orange)](https://groq.com)
[![Deployed on Vercel](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://vercel.com)
[![Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render)](https://render.com)

> **Live demo:** [cvsystem.vercel.app](https://cvsystem.vercel.app)  
> **API base:** [cvextractor-api.onrender.com/api/v1](https://cvextractor-api.onrender.com/api/v1)

## Demo

[![Extractly Demo](docs/0622-Cover.jpg)](docs/demo-gif.gif)

> Full pipeline: upload → webhook verification → Celery Chord extraction
> → OCR + LLM → sheet view → merge export.
> Watch the Render worker logs process a scanned image CV in real time.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture](#architecture)
3. [The Full Pipeline — Step by Step](#the-full-pipeline--step-by-step)
   - [Step 1: Secure File Upload](#step-1-secure-file-upload-browser--cloudinary)
   - [Step 2: Webhook Verification](#step-2-webhook-verification-cloudinary--django)
   - [Step 3: Async Extraction](#step-3-async-extraction-celery-chord)
   - [Step 4: LLM + OCR](#step-4-llm--ocr-the-extraction-core)
   - [Step 5: Export](#step-5-export--merge)
4. [Duplicate CV Detection](#duplicate-cv-detection)
5. [Data Model](#data-model)
6. [API Reference](#api-reference)
7. [Tech Stack](#tech-stack)
8. [Project Structure](#project-structure)
9. [Three Things I Had to Figure Out](#three-things-i-had-to-figure-out)
10. [Environment Variables](#environment-variables)
11. [Local Setup](#local-setup)
12. [Deployment](#deployment)

---

## What It Does

Most hiring teams get CVs as a wall of PDFs and spend hours copy-pasting candidate data into spreadsheets. Extractly automates that entirely.

**The workflow:**

1. HR creates a **job** (e.g. "React Devs — March 2026") and selects which fields to extract: Name, Email, Skills, Experience Years, Current CTC, Notice Period, and any custom fields with hints.
2. HR uploads up to **100 CV files** — PDFs, Word documents, or scanned images.
3. Files go **directly to Cloudinary** (Django never touches the bytes). Cloudinary confirms each upload via a signed webhook.
4. A **Celery Chord** splits the job into batches of 10 and extracts all files concurrently using OCR + an LLM.
5. HR gets a **live sheet view** with inline editing, filterable columns, and one-click export to Excel, CSV, or Google Sheets.
6. For large hiring drives (500+ CVs), HR creates multiple 100-file jobs and uses the **merge export** to flatten them into one file.

**Key design decisions:**

- `fields_snapshot` is frozen at job creation — the column structure never drifts mid-extraction.
- Failed files set `PARTIAL` status. The sheet unlocks anyway. Null cells are the only signal — no warning banners.
- `raw_text` is cached per file as a V2 hook for delta re-extraction without re-uploading.
- File bytes never pass through Django. Zero egress cost on the API server.
- Duplicate CVs are blocked at three layers: the frontend store (pre-upload), the sign endpoint (pre-Cloudinary), and batch registration (pre-DB). OS-generated suffixes like `arsh (1).pdf` are normalized before comparison so they are never treated as new files.

---

## Architecture

![Extractly System Architecture](docs/architecture.png)

The system has three independent runtime components deployed on two platforms:

| Component | Platform | Role |
|---|---|---|
| Next.js Frontend | Vercel | UI, auth state, file upload orchestration |
| Django REST API | Render (Web Service) | Auth, job management, signing, export |
| Celery Worker | Render (Worker Service) | Background extraction, OCR, LLM calls |

All three share a **PostgreSQL** database (Neon) and a **Redis** instance (Upstash) for the Celery broker and result backend.

---

## The Full Pipeline — Step by Step

### Step 1: Secure File Upload (Browser → Cloudinary)

Files never pass through the Django server. Here is exactly how a secure direct upload works:

```
Frontend                    Django API                  Cloudinary
   │                            │                            │
   │── POST /upload/sign/ ──────▶                            │
   │   {filename, file_type,    │                            │
   │    file_size}              │                            │
   │                            │ validate:                  │
   │                            │  · job owns to user        │
   │                            │  · job.status == DRAFT     │
   │                            │  · file_type in allowlist  │
   │                            │  · file_size ≤ 10 MB       │
   │                            │  · file count < 100        │
   │                            │ api_sign_request()         │
   │◀──── signed params ────────│                            │
   │  {signature, timestamp,    │                            │
   │   public_id, max_bytes}    │                            │
   │                            │                            │
   │── POST file bytes ─────────────────────────────────────▶
   │   (directly to Cloudinary) │                            │
   │                            │                            │
   │── POST /jobs/{id}/files/ ──▶                            │
   │   {cloudinary_public_id,   │                            │
   │    filename, file_type}    │ bulk create File records   │
   │                            │ File.status = PENDING      │
   │◀── {registered: N,         │ Job.status  = QUEUED       │
   │     job_status: QUEUED}    │                            │
```

One `POST /upload/sign/` call per file. Each file gets a unique `public_id` with the job and tenant in the path: `cvextractor/{tenant_id}/{job_id}/{uuid}`.

---

### Step 2: Webhook Verification (Cloudinary → Django)

```
Cloudinary                  Django API
    │                           │
    │── POST /webhooks/          │
    │   cloudinary/ ────────────▶
    │   {public_id,             │ verify HMAC-SHA1:
    │    secure_url,            │  SHA1(raw_body + timestamp
    │    bytes, format}         │       + api_secret)
    │                           │
    │                           │ if signature mismatch → 400
    │                           │ if already VERIFIED  → 200 (idempotent)
    │                           │
    │                           │ File.status     = VERIFIED
    │◀── {received: true} ──────│ File.storage_url = secure_url
    │                           │
```

This endpoint is public but cryptographically verified on every request. Cloudinary retries on non-200 responses so idempotency is enforced — a file already `VERIFIED` is silently skipped.

When **all** files for a job reach `VERIFIED`, the frontend can call `POST /jobs/{id}/process/` to start extraction.

---

### Step 3: Async Extraction (Celery Chord)

The process trigger dispatches a [Celery Chord](https://docs.celeryq.dev/en/stable/userguide/canvas.html#chords) — not individual tasks — so the job completion callback fires exactly once, after every batch has resolved.

```
Django API                    Redis (Upstash)              Celery Worker
    │                              │                            │
    │── POST /jobs/{id}/process/ ──│                            │
    │                              │                            │
    │ validate:                    │                            │
    │  · job.status == QUEUED      │                            │
    │  · ALL files == VERIFIED     │                            │
    │                              │                            │
    │ _dispatch_chord()            │                            │
    │ · split 100 files            │                            │
    │   into batches of 10        │                            │
    │ · one process_batch          │                            │
    │   task per batch             │                            │
    │                              │                            │
    │──── publish chord ──────────▶│                            │
    │     (10 tasks +              │                            │
    │      on_chord_complete)      │──── dequeue tasks ────────▶
    │                              │                            │
    │ Job.status = PROCESSING      │                 process_batch() × 10
    │                              │                 [runs in parallel]
    │                              │                            │
    │                              │◀─── chord results ─────────│
    │                              │     (when all 10 done)     │
    │                              │                            │
    │◀─── on_chord_complete ───────│                            │
    │     fires once               │                            │
```

The frontend polls `GET /jobs/{id}/status/` every 3-5 seconds during processing. The status response is intentionally lightweight — only `status`, `done_files`, and `failed_files` — to keep polling cheap.

---

### Step 4: LLM + OCR (The Extraction Core)

Inside each `process_batch()` task, every file goes through this pipeline:

```
File record (VERIFIED)
    │
    ▼
extract_text_from_url(file)
    │
    ├── PDF   ──▶ pdfplumber         ──▶ raw_text
    ├── DOCX  ──▶ python-docx        ──▶ raw_text
    └── Image ──▶ _ocr_ocrspace_url()──▶ raw_text
                  (OCR.space Engine 2,
                   remote Cloudinary URL as input)
    │
    ▼
raw_text saved to File.raw_text
(V2 delta re-extraction hook — never skip this)
    │
    ▼
build_prompt(job.fields_snapshot)
  Injects: field names + types + custom hints
  Instructs LLM to return null for missing fields
    │
    ▼
_extract_with_retry()  [tenacity: 4 attempts, 1-20s backoff]
    │
    ▼
groq_extract()
  Model:  llama-3.3-70b-versatile
  Mode:   JSON  |  temp=0  |  60s timeout
    │
    ▼
Pydantic v2 validates response against fields_snapshot schema
  Pass  ──▶ ExtractedRow.save()   File.status = DONE
  Fail  ──▶ ExtractedRow(null)    File.status = FAILED
    │
    ▼ (after all batches complete)
on_chord_complete()
  done == total    ──▶ Job.status = COMPLETE
  done > 0, mixed  ──▶ Job.status = PARTIAL
  done == 0        ──▶ Job.status = FAILED
  Job.completed_at = now()
```

**Why `PARTIAL` instead of failing the whole job?** A scanned CV with a smudged corner should not block the 87 clean extractions that succeeded alongside it. `PARTIAL` unlocks the sheet view; failed rows appear as all-null cells with a per-cell highlight. No warning banner. The HR can still export everything and manually fill the gaps.

---

### Step 5: Export + Merge

**Single job export** (`GET /jobs/{id}/export/?export_format=xlsx`):

- `_get_headers_and_rows()` fetches all `ExtractedRow` records and maps values against `fields_snapshot`.
- Column order matches `fields_snapshot` exactly — the order the HR defined at job creation.
- `sanitize_cell_value()` guards against Excel formula injection (prefix `'` on cells starting with `=`, `+`, `-`, `@`, `\t`, `\r`).
- `generate_excel()` via `openpyxl` or `generate_csv()` via Python's `csv` module.
- Returns a binary `Content-Disposition: attachment` response.

**Merge export** (`POST /exports/merge/`) for large hiring drives:

```python
# Request
{
  "job_ids": ["job_abc", "job_def", "job_xyz"],
  "format": "xlsx"
}

# If fields_snapshot differs across jobs → 409 SNAPSHOT_MISMATCH
{
  "error": {
    "code": "SNAPSHOT_MISMATCH",
    "data": {
      "common_fields":    ["name", "email", "skills"],
      "job_abc_only":     ["experience_years"],
      "job_def_only":     ["notice_period"]
    }
  }
}

# HR confirms → re-POST with force=true
# Mismatched columns present as empty cells for affected rows
```

Pure DB read — no re-extraction, no LLM calls. Just flatten and export.

**Google Sheets export** (optional): Uses OAuth 2.0 tokens stored Fernet-encrypted in `GoogleOAuthToken`. Calls Google Sheets API v4 via `write_to_sheets()`. Returns a spreadsheet URL instead of a binary download.

---

## Duplicate CV Detection

When a user downloads a file that already exists in their downloads folder, the OS renames the duplicate automatically:

```
arsh.pdf        ← original
arsh (1).pdf    ← second download
arsh(2).pdf     ← third download (no space variant)
```

Because these are different strings, a naive exact-string check treats all three as separate files — wasting LLM credits and polluting the sheet. Extractly blocks duplicates at **three independent layers**:

### Layer 1 — Frontend Store (pre-upload)

`uploadStore.ts` normalizes every filename before adding it to the queue. `arsh (1).pdf` and `arsh.pdf` resolve to the same key and the duplicate is dropped silently with a toast warning.

```ts
// Strips OS-generated copy suffixes before comparison
const normalizeFilename = (filename: string): string => {
  const match = filename.match(/^(.*?)(\.[^.]*)?$/);
  const stem = (match?.[1] ?? filename).replace(/\s*\(\d+\)$/, '');
  const ext = match?.[2] ?? '';
  return stem + ext;
};
```

### Layer 2 — Sign Endpoint (pre-Cloudinary)

`POST /jobs/{id}/upload/sign/` normalizes the incoming filename and checks it against all files already registered for the job. If the normalized name already exists, the request is rejected with `409 CONFLICT` before a Cloudinary signature is issued — the file is never uploaded.

```python
def normalize_filename(filename: str) -> str:
    stem, ext = os.path.splitext(filename)
    return re.sub(r'\s*\(\d+\)$', '', stem) + ext

# In UploadSignView.post():
normalized_name = normalize_filename(filename)
existing_names = {
    normalize_filename(n)
    for n in File.objects.filter(job=job).values_list('original_filename', flat=True)
}
if normalized_name in existing_names:
    raise ConflictError(f"A file equivalent to '{filename}' already exists in this job.")
```

### Layer 3 — Batch Registration (pre-DB)

`POST /jobs/{id}/files/` runs two deduplication passes inside a `SELECT FOR UPDATE` transaction:

1. **Intra-batch:** removes duplicates within the same request payload.
2. **Cross-DB:** compares against every file already in the database for that job.

Only genuinely new files are inserted via `bulk_create`. If the entire batch is duplicate, registration succeeds silently (idempotent) — the job moves to `QUEUED` using the existing file count.

### Sheet-Level Deletion

From the sheet view, users can select one or more rows and delete them permanently. Each deletion:

1. Deletes the `File` record (cascades to `ExtractedRow` via `OneToOneField`).
2. Recalculates `Job.total_files`, `done_files`, `failed_files`, and `status` atomically in the same transaction — the job counter never drifts.

| Endpoint | Notes |
|---|---|
| `DELETE /jobs/{id}/rows/{row_id}/` | Deletes a single row + its file, recalculates job stats |
| `DELETE /jobs/{id}/rows/` | Bulk delete — body: `{"row_ids": [...]}` |

---

## Data Model

```
User
 └── 1:N ── Job
              │  fields_snapshot: JSON (frozen at creation, drives column order
              │                        for extraction prompts and all exports)
              │  status: DRAFT → QUEUED → PROCESSING → COMPLETE | PARTIAL | FAILED
              │
              └── 1:N ── File
                           │  status: PENDING → VERIFIED → DONE | FAILED
                           │  raw_text: TEXT (V2 re-extraction hook, never remove)
                           │
                           └── 1:1 ── ExtractedRow
                                        data: JSON  ← {field_key: value | null}
                                        null cell = extraction miss for that field

User
 └── 0:1 ── GoogleOAuthToken
               access_token / refresh_token (Fernet encrypted at rest)
```

**Non-negotiable fields:**

| Field | Why it must never be removed |
|---|---|
| `File.raw_text` | V2 hook: cached text enables delta re-extraction without re-uploading |
| `Job.fields_snapshot` | Immutable after creation; drives prompt generation, column order, and every export for the job's entire lifetime |
| `ExtractedRow.data` | Single source of truth for sheet view and all exports |

---

## API Reference

All endpoints are under `/api/v1/`. JWT access token required as `Authorization: Bearer <token>` except where noted.

### Auth
| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/auth/register/` | Creates user, returns access token + HttpOnly refresh cookie |
| `POST` | `/auth/login/` | Returns access token + HttpOnly refresh cookie |
| `POST` | `/auth/token/refresh/` | Reads refresh token from cookie, returns new access token |
| `POST` | `/auth/logout/` | Blacklists refresh token, clears cookie |

### Jobs
| Method | Endpoint | Notes |
|---|---|---|
| `GET/POST` | `/jobs/` | List all jobs or create a new one with `fields_snapshot` |
| `GET/DELETE` | `/jobs/{id}/` | Get full job detail or delete (cascade) |
| `GET` | `/jobs/{id}/status/` | Lightweight poll endpoint — only returns `status`, `done_files`, `failed_files` |
| `GET` | `/jobs/{id}/last-fields/` | Returns `fields_snapshot` of last job (powers "use same fields" UX shortcut) |
| `GET` | `/fields/` | Master list of standard CV extraction fields |

### Upload
| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/jobs/{id}/upload/sign/` | Returns Cloudinary signed upload params for one file |
| `POST` | `/jobs/{id}/files/` | Batch registers all uploaded file references, moves job to `QUEUED` |
| `POST` | `/webhooks/cloudinary/` | **Public** — HMAC-SHA1 signature verified on every call |

### Extraction + Sheet
| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/jobs/{id}/process/` | Dispatches Celery Chord, moves job to `PROCESSING` |
| `GET` | `/jobs/{id}/rows/` | Returns all extracted rows (accessible only when `COMPLETE` or `PARTIAL`) |
| `PATCH` | `/jobs/{id}/rows/{row_id}/` | Inline cell edit — partial update on `ExtractedRow.data` |
| `DELETE` | `/jobs/{id}/rows/{row_id}/` | Deletes a single row + its `File`; recalculates job stats atomically |
| `DELETE` | `/jobs/{id}/rows/` | Bulk delete — body: `{"row_ids": [...]}` |

### Export
| Method | Endpoint | Notes |
|---|---|---|
| `GET` | `/jobs/{id}/export/` | Query param: `export_format=xlsx\|csv\|sheets` |
| `POST` | `/exports/merge/` | Merges 2+ jobs; returns `409 SNAPSHOT_MISMATCH` if field configs differ, pass `force=true` to override |

### Google Integration
| Method | Endpoint | Notes |
|---|---|---|
| `GET` | `/integrations/google/connect/` | Generates OAuth state token, returns Google auth URL |
| `GET` | `/integrations/google/callback/` | Exchanges auth code, encrypts and stores tokens |
| `GET` | `/integrations/google/status/` | Returns connection status and connected email |
| `DELETE` | `/integrations/google/disconnect/` | Deletes `GoogleOAuthToken` record |

**All error responses follow a consistent shape:**
```json
{
  "success": false,
  "error": {
    "code": "SNAPSHOT_MISMATCH",
    "message": "Human readable message"
  }
}
```

Error codes: `VALIDATION_ERROR` · `NOT_FOUND` · `UNAUTHORIZED` · `FORBIDDEN` · `CONFLICT` · `RATE_LIMITED` · `INTERNAL_ERROR` · `SNAPSHOT_MISMATCH`

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js 14 App Router | SSR, file-based routing, edge middleware for route protection |
| **Styling** | Tailwind CSS + shadcn/ui | Design tokens + accessible component primitives |
| **State** | Zustand + React Query | Zustand for auth/upload state, React Query for server state caching |
| **Backend** | Django 5.1 + DRF | Battle-tested ORM, built-in admin, DRF serializers and throttling |
| **Task Queue** | Celery + Chord pattern | Parallel batch processing with a single completion callback |
| **Database** | PostgreSQL (Neon) | Relational integrity between jobs, files, and extracted rows |
| **Cache/Broker** | Redis (Upstash) | Celery broker + result backend + OAuth state storage |
| **File Storage** | Cloudinary | Signed direct uploads — file bytes never touch the Django server |
| **LLM** | Groq (`llama-3.3-70b`) | Sub-second inference, JSON mode, reliable structured output |
| **OCR** | OCR.space Engine 2 | Handles rotated text and complex layouts; accepts remote URLs |
| **Schema Validation** | Pydantic v2 | Enforces field types on LLM output; drives retry on invalid JSON |
| **Retries** | tenacity | 4 attempts, 1–20s exponential backoff on LLM/OCR failures |
| **Export** | openpyxl + csv | Server-side Excel and CSV generation, no third-party service |
| **Auth** | SimpleJWT | Short-lived access tokens in memory, long-lived refresh in HttpOnly cookie |
| **Encryption** | Fernet (cryptography) | Symmetric encryption for stored Google OAuth tokens |
| **Frontend Deploy** | Vercel | Zero-config Next.js deployment |
| **Backend Deploy** | Render | Web Service (Django) + Worker Service (Celery) as separate processes |

---

## Project Structure

```
cvsystem/
├── backend/
│   ├── apps/
│   │   ├── users/          # Custom User model, JWT auth endpoints
│   │   ├── jobs/           # Job + FieldsList + Rows views, status polling
│   │   ├── files/          # Upload signing, batch registration, Cloudinary webhook
│   │   ├── extraction/     # Process trigger, start_job_processing(), _dispatch_chord()
│   │   ├── exports/        # JobExportView, MergeExportView, generate_excel/csv
│   │   └── integrations/   # Google OAuth flow, write_to_sheets(), token management
│   ├── core/
│   │   ├── exceptions.py   # Custom exception classes and DRF exception handler
│   │   ├── sanitize.py     # Formula injection guard for cell values
│   │   └── permissions.py  # Object-level permissions
│   └── config/
│       ├── settings/       # base.py, development.py, production.py
│       └── urls.py         # Root URL configuration
│
└── frontend/
    ├── src/
    │   ├── app/            # Next.js App Router pages
    │   │   ├── dashboard/  # Job list with status cards and polling
    │   │   └── jobs/       # Sheet view, export modal, merge UI
    │   ├── lib/
    │   │   ├── api/        # auth.ts, jobs.ts, settings.ts — all API calls
    │   │   └── stores/     # authStore, uploadStore, uiStore (Zustand)
    │   └── middleware.ts   # Edge route guard — redirects unauthenticated users
```

**Django app responsibilities:**

- `files` owns the upload lifecycle: signing, batch registration, webhook verification, and the `PENDING → VERIFIED` transition.
- `extraction` owns only the dispatch trigger — it calls `start_job_processing()` which calls `_dispatch_chord()`. The actual work lives in Celery tasks.
- `exports` owns both single-job and merge exports. It imports `JobExportView` into `jobs/urls.py` to keep all `/jobs/*` URL patterns in one file (avoiding cross-app URL namespace ambiguity).
- `integrations` is fully optional. If a user has not connected Google, the Sheets export path is unavailable without affecting any other flow.

---

## Things I Had to Figure Out

### 1. The DRF `?format=` Content Negotiation Bug

After successfully getting the full CV extraction pipeline working, Phase 9 (Export) kept returning `404 Not Found`. Phase 8 (Rows) worked perfectly with the same `job_id` and token. `resolve()` confirmed the URL was registered. The view logic looked correct on paper.

The culprit: DRF's content negotiation pipeline.

DRF reserves `?format=` as a system-level parameter. When a request arrives, DRF calls `perform_content_negotiation()` inside `APIView.dispatch()` — **before authentication, before permissions, before your view code runs**. It looks through `DEFAULT_RENDERER_CLASSES` for a renderer matching the requested format. Our project only configured `JSONRenderer` (which handles `?format=json`). When the client sent `?format=xlsx`, DRF found no matching renderer and raised a `404` before we ever got control.

The fix was renaming the query parameter from `format` to `export_format` everywhere — view, serializer, frontend API call, and integration test.

**Lesson:** Never use `format` as a query parameter name in a DRF view. It is consumed by the framework before your code runs. The debugging methodology that found it: test the endpoint *without* the query parameter first. If you get a `400` (view reached, validation failed) but a `404` *with* the parameter, something between URL resolution and your view is intercepting it.

---

### 2. The Webhook Race Condition (`PENDING → VERIFIED` before dispatch)

When the frontend finishes uploading all files to Cloudinary, it calls `POST /jobs/{id}/files/` to register them. Django creates the `File` records and marks the job `QUEUED` in a single database transaction.

Cloudinary fires webhooks almost immediately. In testing, some webhook requests were arriving while Django's database transaction was still committing — meaning the webhook handler tried to look up a `File` by `cloudinary_public_id` and found nothing, then silently dropped the verification.

The fix was wrapping the Celery dispatch in `transaction.on_commit()`:

```python
def register_files(job, file_data_list):
    File.objects.bulk_create([...])
    job.status = JobStatus.QUEUED
    job.save()
    # Only notify after the transaction is fully committed to disk
    transaction.on_commit(lambda: notify_upload_complete(job.id))
```

This guarantees that any subsequent webhook lookup for those files always finds a committed record. The idempotency guard on the webhook handler (skip if already `VERIFIED`) handles the rare case of duplicate webhook delivery.

**Lesson:** Any time you create a record and immediately publish a message or fire an external notification based on it, wrap the publish in `transaction.on_commit()`. The commit is not guaranteed to be visible to other processes until that callback fires.

---

### 3. Duplicate CV Detection Across Three Layers

Duplicate CVs were silently passing through the original upload pipeline. When a user re-downloads a file on Windows or macOS, the OS renames it: `arsh.pdf` becomes `arsh (1).pdf`. Because the strings differ, the original exact-match check treated them as different files — resulting in the same CV being processed twice, costing two LLM calls, and appearing as two rows in the sheet.

The fix required three coordinated changes:

**Frontend (`uploadStore.ts`):** Added `normalizeFilename()` which strips OS copy suffixes before checking against queued files. The user never sees the duplicate reach the upload queue.

**Sign endpoint (`UploadSignView`):** Even if the frontend check is bypassed (direct API call, race condition), the sign endpoint normalizes the incoming filename and compares against existing files for that job. A `409 CONFLICT` is returned before a Cloudinary signature is issued — the file is never uploaded and no Cloudinary credit is used.

**Batch registration (`BatchFileRegisterView`):** As the final guard, registration normalizes all filenames in both the incoming payload and the database, deduplicates across both, and only `bulk_create`s genuinely new files. A `SELECT FOR UPDATE` lock prevents race conditions from concurrent registration calls on the same job.

A critical typo was also caught during this work: `update_fields=["total_fields", "status"]` → `update_fields=["total_files", "status"]`. Without this fix, the all-duplicate-batch path would have raised a `django.core.exceptions.FieldError` 500 in production.

**Lesson:** Defense in depth for input validation. Each layer (client, API gateway, DB transaction) should independently enforce the invariant. Never rely solely on the client to filter bad input — but also don't rely solely on the DB constraint to catch it, because by the time a DB error fires, a Cloudinary upload may already have been charged.

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Django
SECRET_KEY=your-django-secret-key
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,.onrender.com,.ngrok-free.app

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Redis
REDIS_URL=rediss://your-upstash-redis-url

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# LLM
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile

# OCR
IMAGE_OCR_PROVIDER=ocrspace
OCRSPACE_API_KEY=your-ocrspace-key

# Google OAuth (optional — only needed for Sheets export)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-api-domain/api/v1/integrations/google/callback/
FERNET_KEY=your-fernet-key

# Frontend origin (for CORS)
FRONTEND_URL=https://your-vercel-app.vercel.app

# SimpleJWT
ACCESS_TOKEN_LIFETIME_MINUTES=15
REFRESH_TOKEN_LIFETIME_DAYS=7
```

---

## Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL running locally
- Redis running locally (`redis-server`)
- API keys for Cloudinary and Groq (both have free tiers)

### 1. Clone

```bash
git clone https://github.com/ArshhAnsari/Extractly.git
cd Extractly
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Fill in your database URL, Redis URL, Cloudinary keys, Groq API key

python manage.py migrate
python manage.py createsuperuser  # optional

# Terminal 1 — Django API
python manage.py runserver

# Terminal 2 — Celery worker
celery -A config worker --loglevel=info
```

### 3. Frontend

```bash
cd frontend
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1" > .env.local

npm run dev
```

Frontend: `http://localhost:3000`  
Backend API: `http://127.0.0.1:8000/api/v1`

### 4. Cloudinary Webhooks (local testing)

Cloudinary webhooks need a public URL to reach your local server. Use ngrok:

```bash
ngrok http 8000
```

Set the webhook URL in your Cloudinary dashboard to:
```
https://<your-ngrok-subdomain>.ngrok-free.app/api/v1/webhooks/cloudinary/
```

Add the ngrok domain to `ALLOWED_HOSTS` in your `.env`.

---

## Deployment

| Service | Platform | Config |
|---|---|---|
| Next.js frontend | Vercel | Auto-deploy from `main` branch. Set `NEXT_PUBLIC_API_URL` in Vercel environment variables. |
| Django API | Render Web Service | Build: `pip install -r requirements.txt && python manage.py migrate`. Start: `gunicorn config.wsgi:application`. |
| Celery Worker | Render Worker Service | Start: `celery -A config worker --loglevel=info`. Same env vars as Django. |
| PostgreSQL | Neon | Connection string goes to `DATABASE_URL`. |
| Redis | Upstash | TLS URL goes to `REDIS_URL`. |
| File Storage | Cloudinary | Signed upload params generated per file on the Django side. |

Both Render services (Web + Worker) share identical environment variables and pull from the same Git repo. The `render.yaml` in the project root declares both services.

**Production cookie settings** required for cross-origin JWT cookies (Vercel ↔ Render):

```python
SESSION_COOKIE_SAMESITE = "None"
SESSION_COOKIE_SECURE   = True
CSRF_COOKIE_SAMESITE    = "None"
CSRF_COOKIE_SECURE      = True
```

---

## What's Not In V1 (Roadmap)

| Feature | Notes |
|---|---|
| Delta re-extraction | `File.raw_text` is already cached — infrastructure exists, needs activation |
| WebSocket job progress | Currently polling every 3-5s; WebSocket replaces polling |
| Template presets | "Use same fields as last job" shortcut covers V1 UX needs |
| Per-field confidence scores | Null vs value is enough signal for V1 |
| Bulk job operations | Batch delete, batch export from dashboard |
| CI/CD pipeline | ngrok permanent tunnel for webhook testing |

---

*Built by [Mohd Arsh](https://github.com/ArshhAnsari/)*