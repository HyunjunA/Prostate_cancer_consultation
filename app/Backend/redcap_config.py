"""REDCap API configuration — single source for REDCAP env vars.

Centralizes REDCAP_API_URL / REDCAP_API_TOKEN / REDCAP_ENABLED so they
are read from the environment exactly once and shared by routes_surveys.py
and routes_patient.py. Replaces the duplicate `os.getenv("REDCAP_*")` blocks
that previously lived in both modules (CR #7 — Config-Driven).

Why a separate module instead of folding these into config.py?
    config.py wraps a YAML file. REDCap credentials are sensitive and
    must never live in yaml — they belong in environment variables
    loaded from .env (which is gitignored). Keeping them in their own
    tiny module makes the import path explicit and prevents anyone from
    accidentally promoting them to YAML.

Usage:
    from redcap_config import REDCAP_API_URL, REDCAP_API_TOKEN, REDCAP_ENABLED

    if not REDCAP_ENABLED:
        raise HTTPException(status_code=503, detail="REDCap not configured")
    response = await client.post(
        REDCAP_API_URL,
        data={"token": REDCAP_API_TOKEN, "content": "record", ...},
    )
"""

import os
from typing import Optional

# ──────────────────────────────────────────────────────────────────────────────
# Environment-driven constants
# ──────────────────────────────────────────────────────────────────────────────
# These are read at module import time, NOT on every request, so changing
# the .env file requires a backend restart for the new values to take effect.
# This matches the previous behaviour of the routes that read os.getenv()
# at module load themselves.

# REDCap project's API endpoint. Example for the CSMC instance:
#   https://iredcap.csmc.edu/api/
# Returns None when REDCap integration is intentionally disabled (e.g. local
# dev without REDCap credentials in .env).
REDCAP_API_URL: Optional[str] = os.getenv("REDCAP_API_URL")

# 32-character token issued per REDCap project + per user. Treat as a secret
# — it grants the same data-export / data-import rights as the user it was
# minted for. NEVER log this value, return it to the client, or check it
# into version control.
REDCAP_API_TOKEN: Optional[str] = os.getenv("REDCAP_API_TOKEN")

# True only when BOTH the URL and the token are present. Routes use this as
# a feature gate so the dashboard can degrade gracefully when REDCap is not
# configured (e.g. local development): the UI hides REDCap-related buttons
# instead of showing 500-errors.
REDCAP_ENABLED: bool = bool(REDCAP_API_URL and REDCAP_API_TOKEN)
