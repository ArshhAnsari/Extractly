"""
Master field list — hardcoded constant.

This is the single source of truth for standard CV fields.
Custom fields are defined per job and are NOT part of this list.
"""

MASTER_FIELDS = [
    {"key": "name",             "label": "Full Name",        "type": "string"},
    {"key": "email",            "label": "Email",            "type": "string"},
    {"key": "phone",            "label": "Phone",            "type": "string"},
    {"key": "skills",           "label": "Skills",           "type": "list"},
    {"key": "experience_years", "label": "Experience Years", "type": "number"},
    {"key": "current_role",     "label": "Current Role",     "type": "string"},
    {"key": "education",        "label": "Education",        "type": "string"},
    {"key": "location",         "label": "Location",         "type": "string"},
    {"key": "current_ctc",      "label": "Current CTC",      "type": "string"},
    {"key": "expected_ctc",     "label": "Expected CTC",     "type": "string"},
    {"key": "notice_period",    "label": "Notice Period",    "type": "string"},
    {"key": "linkedin",         "label": "LinkedIn",         "type": "string"},
    {"key": "summary",          "label": "Summary",          "type": "string"},
]

# Set of valid standard field keys for fast lookup during job creation
MASTER_FIELD_KEYS = {f["key"] for f in MASTER_FIELDS}
