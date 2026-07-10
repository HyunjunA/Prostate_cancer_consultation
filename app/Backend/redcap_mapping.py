"""Resolve a study SID to its REDCap record_id.

Single scheme: the REDCap ``record_id`` **is** the study SID. A coordinator names
each REDCap record after the SID (e.g. ``SID_22``), and a submission is attributed
straight to that record — there is no separate mapping or lookup.

``resolve_record_id`` therefore just returns the SID it is given. It exists as a
named function (rather than an inline ``record_id = sid``) so the sync callers in
``routes_surveys.py`` / ``routes_patient.py`` and their tests share one seam.
"""
from __future__ import annotations

from typing import Optional


async def resolve_record_id(sid: Optional[str]) -> Optional[str]:
    """Return the REDCap record_id for a study SID.

    Because ``record_id == SID``, this returns the SID unchanged. Returns ``None``
    only when ``sid`` is falsy (the speaker had no parseable SID), in which case the
    caller records the submission as pending instead of pushing it.
    """
    return sid or None
