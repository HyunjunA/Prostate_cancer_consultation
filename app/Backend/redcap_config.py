"""REDCap API configuration — single source for REDCAP env vars.

Centralizes REDCAP_API_URL / REDCAP_API_TOKEN / REDCAP_ENABLED so they
are read from the environment exactly once and shared by routes_surveys.py
and routes_patient.py. Replaces the duplicate `os.getenv("REDCAP_*")` blocks
that previously lived in both modules (CR #7 — Config-Driven).
"""

import os
from typing import Optional

REDCAP_API_URL: Optional[str] = os.getenv("REDCAP_API_URL")
REDCAP_API_TOKEN: Optional[str] = os.getenv("REDCAP_API_TOKEN")
REDCAP_ENABLED: bool = bool(REDCAP_API_URL and REDCAP_API_TOKEN)
