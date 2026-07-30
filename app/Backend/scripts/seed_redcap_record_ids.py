"""Seed REDCap with record_id-only records extracted from data/input filenames.

The dashboard attributes each survey to the REDCap record whose ``record_id`` is the
NUMBER in the study SID — ``SID_22`` -> record ``22`` (see
redcap_mapping.to_record_id). Records are normally created by hand in REDCap ("Add
new record"); this script is the bulk convenience path for standing up the same
empty shells from the transcript filenames. For a one-off id, use
``create_redcap_records.py``.

For each transcript file in the AI repo's ``data/input`` directory, derive the study
SID (e.g. ``SID_21``) via the canonical ``extract_patient_id()``, reduce it to its
numeric record_id, and create a REDCap record that contains ONLY the ``record_id``
field — an empty shell.

Safety: defaults to a dry-run. It only writes to REDCap when ``--commit`` is passed.
Existing records are untouched (a record_id-only import with overwriteBehavior=normal
does not clear other fields).

Usage (from app/Backend/):
    python scripts/seed_redcap_record_ids.py                 # dry-run (no write)
    python scripts/seed_redcap_record_ids.py --commit        # write to REDCap
    python scripts/seed_redcap_record_ids.py --input-dir /path/to/data/input
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import List

import httpx

# Make dashboard modules (core.settings) importable when run from app/Backend/.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.settings import get_settings  # noqa: E402
from redcap_mapping import to_record_id  # noqa: E402

# Default input dir = sibling AI repo's data/input.
# app/Backend/scripts -> Backend -> dashboard -> prostate_cancer_project
PROJECT_ROOT = BACKEND_DIR.parent.parent.parent
DEFAULT_INPUT_DIR = PROJECT_ROOT / "AI_physician_patient_communication" / "data" / "input"


def _extract_sid(filepath: Path) -> str:
    """Return the SID_<n> record id for a filename.

    Prefers the canonical extract_patient_id() from the AI repo (single source of
    truth); falls back to an inline regex that matches its "SID <n>" / "SID<n>" ->
    "SID_<n>" behavior if that import is unavailable.
    """
    try:
        ai_root = PROJECT_ROOT / "AI_physician_patient_communication"
        if str(ai_root) not in sys.path:
            sys.path.insert(0, str(ai_root))
        from utils.file_manager import extract_patient_id  # type: ignore

        return extract_patient_id(filepath)
    except Exception:
        m = re.search(r"SID\s*_?\s*(\d+)", filepath.stem, flags=re.IGNORECASE)
        return f"SID_{m.group(1)}" if m else filepath.stem


def derive_record_ids(input_dir: Path) -> List[str]:
    """List input files and map each to its REDCap record_id (deduped, sorted).

    The SID from the filename is normalised the same way the sync path does it
    (``redcap_mapping.to_record_id``: ``SID_22`` -> ``22``), so seeded shells and
    attributed submissions land on the same record. Files whose SID carries no
    digits are skipped — there is nothing to key a record on.
    """
    files = sorted(input_dir.glob("*.xlsx")) + sorted(input_dir.glob("*.csv"))
    ids = {rid for rid in (to_record_id(_extract_sid(f)) for f in files) if rid}
    return sorted(ids, key=int)


def export_existing_record_ids(url: str, token: str) -> List[str]:
    """Read-only export of existing record_ids from REDCap."""
    data = {
        "token": token,
        "content": "record",
        "format": "json",
        "type": "flat",
        "fields[0]": "record_id",
        "returnFormat": "json",
    }
    resp = httpx.post(url, data=data, timeout=60)
    resp.raise_for_status()
    return sorted({r.get("record_id", "") for r in resp.json() if r.get("record_id")})


def create_records(url: str, token: str, record_ids: List[str]) -> httpx.Response:
    """Create record_id-only records in REDCap (the actual write)."""
    records = [{"record_id": rid} for rid in record_ids]
    payload = {
        "token": token,
        "content": "record",
        "format": "json",
        "type": "flat",
        "overwriteBehavior": "normal",
        "returnContent": "count",
        "returnFormat": "json",
        "data": json.dumps(records),
    }
    return httpx.post(url, data=payload, timeout=60)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR,
                    help=f"Transcript input dir (default: {DEFAULT_INPUT_DIR})")
    ap.add_argument("--commit", action="store_true",
                    help="Actually write to REDCap (default is a dry-run).")
    args = ap.parse_args()

    settings = get_settings()
    url, token = settings.redcap_api_url, settings.redcap_api_token
    if not (url and token):
        print("ERROR: REDCap is not configured (redcap_api_url / redcap_api_token unset).")
        return 2

    if not args.input_dir.is_dir():
        print(f"ERROR: input dir not found: {args.input_dir}")
        return 2

    record_ids = derive_record_ids(args.input_dir)
    if not record_ids:
        print(f"No input files found under {args.input_dir} — nothing to do.")
        return 1

    print(f"Input dir : {args.input_dir}")
    print(f"REDCap    : {url}")
    print(f"record_ids ({len(record_ids)}): {', '.join(record_ids)}")

    # Read-only pre-check: which already exist?
    existing = set(export_existing_record_ids(url, token))
    new = [r for r in record_ids if r not in existing]
    already = [r for r in record_ids if r in existing]
    print(f"already in REDCap ({len(already)}): {', '.join(already) or '-'}")
    print(f"to create/new     ({len(new)}): {', '.join(new) or '-'}")
    print("payload sample    :", json.dumps([{"record_id": r} for r in record_ids[:2]]))

    if not args.commit:
        print("\nDRY-RUN — no write made. Re-run with --commit to write to REDCap.")
        return 0

    # Actual write (all record_ids; existing ones are a harmless no-op).
    print("\nCOMMIT — writing record_id-only records to REDCap...")
    resp = create_records(url, token, record_ids)
    print(f"REDCap response: HTTP {resp.status_code} {resp.text[:300]}")
    if resp.status_code != 200:
        print("Write FAILED — see response above.")
        return 3

    # Verify (read-only).
    after = set(export_existing_record_ids(url, token))
    missing = [r for r in record_ids if r not in after]
    if missing:
        print(f"VERIFY FAILED — still missing: {', '.join(missing)}")
        return 3
    print(f"VERIFY OK — all {len(record_ids)} record_ids present in REDCap.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
