"""Resolve a study SID to its REDCap record_id, and confirm that record exists.

Scheme: REDCap records are keyed by the **numeric part** of the study SID. The
coordinator creates record ``22`` in REDCap; the dashboard holds the subject as
``SID_22``. ``to_record_id`` strips the prefix so a submission lands on the
matching numeric record.

Attribution never invents a record. ``record_exists`` asks REDCap whether the
resolved id is actually there, so a submission for an unknown subject is
reported as "no matching record_id" instead of silently creating a shadow
record: REDCap's import API with ``forceAutoNumber=false`` happily creates a
record for any id it has not seen, which is how ``SID_*`` shadow records ended
up alongside the real numeric ones.

The sync callers in ``routes_surveys.py`` / ``routes_patient.py`` and their
tests share these functions as one seam.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

import httpx

from redcap_config import REDCAP_API_TOKEN, REDCAP_API_URL, REDCAP_ENABLED

logger = logging.getLogger(__name__)

# First run of digits anywhere in the id: "SID_22" / "sid 22" / "22" -> "22".
_DIGITS_RX = re.compile(r"\d+")

_LOOKUP_TIMEOUT_SEC = 30


def to_record_id(sid: Optional[str]) -> Optional[str]:
    """Return the REDCap record_id for a study SID, or None if it has no digits.

    The REDCap record_id is the SID's number without the ``SID_`` prefix and
    without leading zeros (``SID_01`` -> ``"1"``), because that is how the
    records are keyed on the REDCap side.

    Args:
        sid: Study SID such as ``"SID_22"``. Also accepts ``"sid 22"`` or a bare
            ``"22"``. Falsy input returns None.

    Returns:
        The numeric record_id as a string, or None when there is nothing to
        match on (falsy sid, or an id carrying no digits at all).
    """
    if not sid:
        return None
    match = _DIGITS_RX.search(str(sid))
    if match is None:
        return None
    # int() normalises "007" -> "7"; REDCap stores ids without leading zeros.
    return str(int(match.group()))


async def resolve_record_id(sid: Optional[str]) -> Optional[str]:
    """Return the REDCap record_id for a study SID.

    Thin async seam over :func:`to_record_id` so the sync callers (and the tests
    that monkeypatch them) keep a single awaitable entry point. Returns None when
    the speaker had no parseable SID, in which case the caller records the
    submission as pending instead of pushing it.
    """
    return to_record_id(sid)


async def record_exists(record_id: Optional[str]) -> bool:
    """Return True when REDCap already holds a record with this record_id.

    Read-only: exports just the ``record_id`` field of the one record. Used as a
    pre-flight check before importing survey answers, so a submission for a
    subject the coordinator has not created is refused rather than turned into a
    new record.

    Raises:
        httpx.HTTPError: if REDCap is unreachable or answers with an error
            status. The caller must surface that instead of importing, because a
            failed check cannot prove the record exists.
    """
    if not record_id or not REDCAP_ENABLED:
        return False

    async with httpx.AsyncClient(timeout=_LOOKUP_TIMEOUT_SEC) as client:
        response = await client.post(
            REDCAP_API_URL,
            data={
                "token": REDCAP_API_TOKEN,
                "content": "record",
                "format": "json",
                "type": "flat",
                "records[0]": record_id,
                "fields[0]": "record_id",
                "returnFormat": "json",
            },
        )
    response.raise_for_status()
    rows = response.json()
    return any(str(row.get("record_id", "")) == str(record_id) for row in rows)
