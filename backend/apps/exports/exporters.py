"""
Data exporters formatting ExtractedRows into binary responses.
Supports CSV via Python's native `csv` and Excel via `openpyxl`.
"""

import csv
import io
import openpyxl
from apps.files.models import ExtractedRow
from core.sanitize import sanitize_cell_value


def _get_headers_and_rows(job):
    fields = job.fields_snapshot

    headers = ["Original Filename", "Extraction Status"]
    for f in fields:
        headers.append(sanitize_cell_value(f.get("label", f.get("key"))))

    extracted_rows = ExtractedRow.objects.filter(job=job).select_related('file').order_by('created_at')

    data_matrix = []
    for row in extracted_rows:
        line = [
            sanitize_cell_value(row.file.original_filename),
            row.extraction_status,
        ]

        row_data = row.data or {}
        for f in fields:
            val = row_data.get(f["key"])
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val if v is not None)
            elif val is not None and f.get("type") == "string":
                val = str(val)  # prevents Excel scientific notation for phone/numeric strings
            if val is None:
                val = ""
            line.append(sanitize_cell_value(val))

        data_matrix.append(line)

    return headers, data_matrix

def generate_csv(job) -> bytes:
    """Generates proper UTF-8 encoded CSV byte payload."""
    headers, rows = _get_headers_and_rows(job)
    
    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(headers)
    cw.writerows(rows)
    
    return si.getvalue().encode("utf-8")


def generate_excel(job) -> bytes:
    """Generates an .xlsx byte payload representing the extraction matrix."""
    headers, rows = _get_headers_and_rows(job)
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Extracted CVs" #type: ignore
    
    ws.append(headers) #type: ignore
    for row in rows:
        ws.append(row) #type: ignore
        
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


# ──────────────────────────────────────────────
# Merge Export helpers (multi-job)
# ──────────────────────────────────────────────

def _get_merged_headers_and_rows(jobs):
    seen_keys = {}
    ordered_keys = []

    for job in jobs:
        for f in job.fields_snapshot:
            key = f["key"]
            if key not in seen_keys:
                seen_keys[key] = f.get("label", key)
                ordered_keys.append(key)

    headers = ["Job Name", "Original Filename", "Extraction Status"]
    headers += [sanitize_cell_value(seen_keys[k]) for k in ordered_keys]

    data_matrix = []
    for job in jobs:
        rows = (
            ExtractedRow.objects
            .filter(job=job)
            .select_related("file")
            .order_by("created_at")
        )
        for row in rows:
            line = [
                sanitize_cell_value(job.name),
                sanitize_cell_value(row.file.original_filename),
                row.extraction_status,
            ]
            row_data = row.data or {}
            for key in ordered_keys:
                val = row_data.get(key)
                if isinstance(val, list):
                    val = ", ".join(str(v) for v in val if v is not None)
                if val is None:
                    val = ""
                line.append(sanitize_cell_value(val))
            data_matrix.append(line)

    return headers, data_matrix

def generate_merged_csv(jobs) -> bytes:
    """Generates a merged UTF-8 CSV across multiple jobs."""
    headers, rows = _get_merged_headers_and_rows(jobs)

    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(headers)
    cw.writerows(rows)

    return si.getvalue().encode("utf-8")


def generate_merged_excel(jobs) -> bytes:
    """Generates a merged .xlsx across multiple jobs."""
    headers, rows = _get_merged_headers_and_rows(jobs)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Merged CVs" #type: ignore

    ws.append(headers) #type: ignore
    for row in rows:
        ws.append(row) #type: ignore

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()

def get_headers_and_rows(job) -> tuple[list, list]:
    """
    Returns (headers, rows) for a single job.
    headers: list of label strings, in fields_snapshot order.
    rows:    list of lists, one per extracted row, values in same order.
             None for missing fields, list fields kept as Python list
             (sanitized downstream in write_to_sheets).
    """
    snapshot = job.fields_snapshot  # list of {key, label, ...}
    headers = [field["label"] for field in snapshot]
    keys = [field["key"] for field in snapshot]

    rows = []
    for extracted_row in job.extracted_rows.select_related("file").order_by("created_at"):
        row_data = extracted_row.data or {}
        rows.append([row_data.get(key) for key in keys])

    return headers, rows


def get_merged_headers_and_rows(jobs) -> tuple[list, list]:
    """
    Returns (headers, rows) for a merge across multiple jobs.
    Column order: 'Job Name' first, then union of all fields_snapshots
    in the order they first appear across jobs.
    Rows from jobs with fewer fields get None for missing columns.
    """
    # Build ordered union of (key, label) pairs
    seen: set[str] = set()
    ordered_fields: list[tuple[str, str]] = []
    for job in jobs:
        for field in job.fields_snapshot:
            if field["key"] not in seen:
                ordered_fields.append((field["key"], field["label"]))
                seen.add(field["key"])

    headers = ["Job Name"] + [label for _, label in ordered_fields]
    keys = [key for key, _ in ordered_fields]

    rows = []
    for job in jobs:
        for extracted_row in job.extracted_rows.select_related("file").order_by("created_at"):
            row_data = extracted_row.data or {}
            rows.append([job.name] + [row_data.get(key) for key in keys])

    return headers, rows
