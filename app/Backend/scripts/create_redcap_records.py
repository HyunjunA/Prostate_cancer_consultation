"""Create empty (record_id-only) REDCap records for an explicit list of record_ids.

A general-purpose sibling of ``seed_redcap_record_ids.py``. That script derives its
record_ids from the transcript filenames in the AI repo's ``data/input`` directory,
which makes it useless for ad-hoc work: you cannot ask it for a specific record_id.
This script takes the ids on the command line instead.

Each record is an empty shell containing only the ``record_id`` field. Existing fields
on existing records are never cleared (``overwriteBehavior=normal``), and only the
record_ids that do not already exist are sent to REDCap.

Safety: defaults to a dry-run. It only writes when ``--commit`` is passed.

Usage (from app/Backend/ — core.settings reads .env relative to the working directory):
    python scripts/create_redcap_records.py --record-ids SID_22,SID_24            # dry-run
    python scripts/create_redcap_records.py --record-ids SID_22,SID_24 --commit   # write

Exit codes:
    0  success (including dry-run and "nothing to create")
    2  bad input or REDCap not configured (no API call made)
    3  the write failed, or verification found a requested id still missing
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List

# Make dashboard modules (core.settings) importable when run from app/Backend/.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.settings import get_settings  # noqa: E402
from redcap_mapping import to_record_id  # noqa: E402

# Reuse the REDCap I/O helpers rather than reimplementing them. Both are pure
# functions; importing the module only manipulates sys.path.
from seed_redcap_record_ids import (  # noqa: E402
    create_records,
    export_existing_record_ids,
)


def parse_record_ids(raw: str) -> List[str]:
    """Split a comma-separated record_id argument into a clean, ordered list.

    Each entry is normalised to the REDCap record_id via
    ``redcap_mapping.to_record_id`` (``"SID_22"`` -> ``"22"``), so the ids written
    here match the ones the sync path attributes submissions to. Whitespace is
    stripped, entries carrying no digits are dropped, and duplicates are removed
    while preserving the order the caller wrote them in.

    Args:
        raw: The raw ``--record-ids`` value, e.g. ``"SID_22, SID_24"``.

    Returns:
        The deduplicated numeric record_ids, in input order. Empty if nothing
        usable was given.
    """
    seen: set[str] = set()
    record_ids: List[str] = []
    for token in raw.split(","):
        rid = to_record_id(token.strip())
        if rid and rid not in seen:
            seen.add(rid)
            record_ids.append(rid)
    return record_ids


def main() -> int:
    """Run the dry-run / commit flow. Returns the process exit code."""
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--record-ids", required=True,
                    help="Comma-separated record_ids to create, e.g. SID_22,SID_24")
    ap.add_argument("--commit", action="store_true",
                    help="Actually write to REDCap (default is a dry-run).")
    args = ap.parse_args()

    record_ids = parse_record_ids(args.record_ids)
    if not record_ids:
        print("ERROR: --record-ids contained no usable ids.")
        return 2

    settings = get_settings()
    url, token = settings.redcap_api_url, settings.redcap_api_token
    if not (url and token):
        print("ERROR: REDCap is not configured (redcap_api_url / redcap_api_token unset).")
        return 2

    print(f"REDCap    : {url}")
    print(f"requested ({len(record_ids)}): {', '.join(record_ids)}")

    # Read-only pre-check: which already exist?
    existing = set(export_existing_record_ids(url, token))
    new = [r for r in record_ids if r not in existing]
    already = [r for r in record_ids if r in existing]
    print(f"already in REDCap ({len(already)}): {', '.join(already) or '-'}")
    print(f"to create/new     ({len(new)}): {', '.join(new) or '-'}")
    # Show the exact records that would be written, so a dry-run proves the ids
    # were normalised (SID_22 -> "22") before anything reaches REDCap.
    print("payload           :", json.dumps([{"record_id": r} for r in record_ids]))

    if not args.commit:
        print("\nDRY-RUN — no write made. Re-run with --commit to write to REDCap.")
        return 0

    if not new:
        print("\nNothing new to create — every requested record_id already exists.")
        return 0

    # Actual write. Only the ids that do not exist yet, so the {"count": N} response
    # and the REDCap audit log reflect exactly what was created.
    print(f"\nCOMMIT — creating {len(new)} record_id-only record(s) in REDCap...")
    resp = create_records(url, token, new)
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
    print(f"VERIFY OK — all {len(record_ids)} record_id(s) present in REDCap.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
