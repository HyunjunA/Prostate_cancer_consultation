"""Production SID -> REDCap record_id mapping.

REDCap auto-numbers record_ids (1, 2, 3 …) when a coordinator registers a patient,
and the patient's study SID is stored in a REDCap field (settings.redcap_sid_field).
This module reads that ``{SID: record_id}`` mapping from REDCap (read-only export)
and resolves a submission's SID to REDCap's own record_id at sync time.

This is the production replacement for the test-only scheme where the record_id was
the un-hashed SID itself (`deid.unhash_patient_sid`). Read-only: it never writes.
"""
from __future__ import annotations

import json
import logging
from typing import Dict, Optional

import httpx

from core.settings import get_settings
from redis_client import get_redis, make_cache_key

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # seconds
_CACHE_KEY = make_cache_key("redcap", {"map": "sid_to_record_id"})
_MEM_CACHE: Dict[str, Optional[Dict[str, str]]] = {"map": None}  # fallback when Redis is down


async def _export_map() -> Dict[str, str]:
    """Read-only REDCap export of record_id + the SID field -> {sid: record_id}."""
    s = get_settings()
    if not s.redcap_enabled:
        return {}
    data = {
        "token": s.redcap_api_token, "content": "record", "format": "json",
        "type": "flat", "returnFormat": "json",
        "fields[0]": "record_id", "fields[1]": s.redcap_sid_field,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(s.redcap_api_url, data=data)
    resp.raise_for_status()
    mapping: Dict[str, str] = {}
    for rec in resp.json():
        sid = str(rec.get(s.redcap_sid_field, "")).strip()
        rid = str(rec.get("record_id", "")).strip()
        if sid and rid:
            mapping[sid] = rid
    return mapping


async def load_sid_to_record_id(force: bool = False) -> Dict[str, str]:
    """Return the {SID: record_id} map, cached (Redis TTL) with in-process fallback."""
    r = get_redis()
    if not force:
        if r is not None:
            try:
                cached = await r.get(_CACHE_KEY)
                if cached:
                    return json.loads(cached)
            except Exception:  # noqa: BLE001 - cache is best-effort
                pass
        elif _MEM_CACHE["map"] is not None:
            return _MEM_CACHE["map"]

    try:
        mapping = await _export_map()
    except Exception as exc:  # noqa: BLE001 - never crash a survey submit on REDCap
        logger.warning("REDCap SID map export failed: %s", exc)
        return _MEM_CACHE["map"] or {}

    _MEM_CACHE["map"] = mapping
    if r is not None:
        try:
            await r.set(_CACHE_KEY, json.dumps(mapping), ex=_CACHE_TTL)
        except Exception:  # noqa: BLE001
            pass
    return mapping


async def resolve_record_id(sid: Optional[str]) -> Optional[str]:
    """Resolve a study SID to the REDCap record_id, or None.

    - test mode (default): record_id == the SID itself (the seeded scheme).
    - production mode: look up REDCap's own auto-numbered record_id via the
      {SID: record_id} map; on a cache miss, refresh once (the patient may have
      just been registered) before giving up.
    """
    if not sid:
        return None
    if get_settings().redcap_record_id_mode != "production":
        return sid  # TEST: record_id == SID
    mapping = await load_sid_to_record_id()
    if sid in mapping:
        return mapping[sid]
    mapping = await load_sid_to_record_id(force=True)
    return mapping.get(sid)
