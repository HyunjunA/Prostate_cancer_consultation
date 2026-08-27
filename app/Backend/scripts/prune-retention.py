#!/usr/bin/env python3
"""Apply data retention to the tables that would otherwise grow forever.

WHY THIS EXISTS
    Two tables accumulate with no expiry rule:

    session_recording — gzipped rrweb replays of the patient's screen. 149 rows
        over 13 days at the time of writing, growing linearly. It reproduces
        the patient's screen pixel for pixel, which makes it PHI in practice,
        yet it exists for UX review, not for the record. Keeping it forever
        widens the exposure surface for no clinical or legal benefit.

    phi_access_log — the HIPAA audit trail. This one is the opposite case: it
        must be KEPT, not trimmed. HIPAA 164.316(b)(2) requires six years, so
        the default below is deliberately long and the script refuses to go
        below it.

WHAT THIS DOES NOT DO
    Nothing is scheduled here. Installing a cron entry is a change to the
    server, which is out of scope for application work — run this by hand, or
    ask whoever administers the host to schedule it:

        .venv/bin/python app/Backend/scripts/prune-retention.py --dry-run
        .venv/bin/python app/Backend/scripts/prune-retention.py --apply

    --dry-run is the default. Deleting patient-adjacent data on an unattended
    first run is not something this script will do by accident.
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Run from anywhere: the backend package expects its own directory on the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, func, select  # noqa: E402

# Session replays exist to review how the interface behaves, which is a
# question answered within weeks. 90 days is generous for that and bounded.
SESSION_RECORDING_DAYS = int(os.getenv("SESSION_RECORDING_RETENTION_DAYS", "90"))

# HIPAA 164.316(b)(2): six years. This is a floor, not a target.
AUDIT_LOG_MIN_DAYS = 6 * 365
AUDIT_LOG_DAYS = int(os.getenv("PHI_AUDIT_RETENTION_DAYS", str(AUDIT_LOG_MIN_DAYS)))


async def main(apply: bool) -> int:
    from db import AsyncSessionLocal
    from models import PhiAccessLog, SessionRecording

    if AUDIT_LOG_DAYS < AUDIT_LOG_MIN_DAYS:
        print(
            f"REFUSING: PHI_AUDIT_RETENTION_DAYS={AUDIT_LOG_DAYS} is below the "
            f"{AUDIT_LOG_MIN_DAYS}-day (six-year) HIPAA minimum.",
            file=sys.stderr,
        )
        return 2

    now = datetime.now(timezone.utc)
    targets = [
        ("session_recording", SessionRecording, SessionRecording.created_at,
         now - timedelta(days=SESSION_RECORDING_DAYS), SESSION_RECORDING_DAYS),
        ("phi_access_log", PhiAccessLog, PhiAccessLog.occurred_at,
         now - timedelta(days=AUDIT_LOG_DAYS), AUDIT_LOG_DAYS),
    ]

    mode = "APPLY" if apply else "DRY RUN"
    print(f"[{mode}] retention as of {now.isoformat(timespec='seconds')}")

    async with AsyncSessionLocal() as session:
        for name, model, ts_col, cutoff, days in targets:
            total = await session.scalar(select(func.count()).select_from(model))
            expired = await session.scalar(
                select(func.count()).select_from(model).where(ts_col < cutoff)
            )
            print(
                f"  {name:20s} keep {days:5d}d  "
                f"total {total or 0:7d}  expired {expired or 0:7d}"
            )
            if apply and expired:
                await session.execute(delete(model).where(ts_col < cutoff))
                await session.commit()
                print(f"  {name:20s} deleted {expired} row(s)")

    if not apply:
        print("\nNothing was deleted. Re-run with --apply to act on this.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", default=True,
                       help="report only (default)")
    group.add_argument("--apply", action="store_true",
                       help="actually delete expired rows")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(apply=args.apply)))
