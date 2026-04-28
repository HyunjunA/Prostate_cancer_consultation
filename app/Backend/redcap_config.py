"""REDCap API configuration — single source for REDCAP env vars.

Thin re-export module that mirrors the REDCAP_* fields from
core.settings as module-level constants. Exists only for backwards
compatibility with the existing `from redcap_config import REDCAP_API_URL`
imports in routes_surveys.py and routes_patient.py — new code should
just call `get_settings()` directly.

Why we keep this shim instead of deleting it now:
    Replacing the imports in routes_surveys (1700+ lines) and
    routes_patient is a separate cleanup PR. This shim keeps the
    diff for P1.S5b minimal: ZERO behaviour change, callers untouched.

Security note (still applies):
    REDCAP_API_TOKEN must NEVER be logged, returned to clients, or
    checked into version control. core.settings only reads it from the
    env var; .env is gitignored.
"""

from typing import Optional

from core.settings import get_settings

_settings = get_settings()

REDCAP_API_URL: Optional[str] = _settings.redcap_api_url
REDCAP_API_TOKEN: Optional[str] = _settings.redcap_api_token
REDCAP_ENABLED: bool = _settings.redcap_enabled
