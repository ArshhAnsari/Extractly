"""
Shared sanitization helpers for data leaving the system via exports
(CSV, XLSX, Google Sheets).
"""

_FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell_value(value):
    """
    Neutralize CSV/Excel/Sheets formula injection in untrusted string values.

    Any string whose first character could be interpreted as a formula
    trigger gets a leading single-quote, forcing the cell to render as
    plain text. Non-string values (numbers, None) pass through unchanged.
    """
    if not isinstance(value, str):
        return value
    if value and value[0] in _FORMULA_TRIGGER_CHARS:
        return "'" + value
    return value