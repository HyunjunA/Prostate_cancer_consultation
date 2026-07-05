"""CLI for the data-integrity verifiers — DB · REDCap · activity.

Runs integrity_checks.run_all_checks against the live DB (and read-only production
REDCap) and prints a report. Exit 0 if all checks pass/warn, 1 if any FAILs — so it
drops straight into CI. Self-contained: reads DATABASE_URL + REDCap creds from .env.

Usage (from app/Backend/):
    python scripts/verify_integrity.py                # all checks, human report
    python scripts/verify_integrity.py --json         # machine-readable
    python scripts/verify_integrity.py --skip-redcap  # DB + activity only
    python scripts/verify_integrity.py --check c1     # one checker (c1|c2|c3)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.settings import get_settings  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402
import integrity_checks as ic  # noqa: E402

GREEN, YELLOW, RED, RESET = "\033[92m", "\033[93m", "\033[91m", "\033[0m"
TAG = {"pass": f"{GREEN}[PASS]{RESET}", "warn": f"{YELLOW}[WARN]{RESET}", "fail": f"{RED}[FAIL]{RESET}"}


async def _run(check: str | None, skip_redcap: bool) -> dict:
    s = get_settings()
    async with AsyncSessionLocal() as db:
        if check == "c1":
            results = await ic.check_db_integrity(db)
        elif check == "c2":
            results = await ic.check_redcap_reconciliation(db, s.redcap_api_url, s.redcap_api_token)
        elif check == "c3":
            results = await ic.check_activity_crosscheck(db)
        else:
            return await ic.run_all_checks(db, s.redcap_api_url, s.redcap_api_token, skip_redcap=skip_redcap)
        statuses = [r.status for r in results]
        overall = "fail" if "fail" in statuses else ("warn" if "warn" in statuses else "pass")
        return {"overall": overall, "results": [r.to_dict() for r in results]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", choices=["c1", "c2", "c3"], help="Run a single checker")
    ap.add_argument("--skip-redcap", action="store_true", help="Skip DB↔REDCap reconciliation")
    ap.add_argument("--json", action="store_true", help="Machine-readable output")
    args = ap.parse_args()

    report = asyncio.run(_run(args.check, args.skip_redcap))

    if args.json:
        print(json.dumps(report, indent=2, default=str))
    else:
        print(f"\nData integrity — overall: {TAG.get(report['overall'], report['overall'])}\n")
        for r in report["results"]:
            line = f"  {TAG.get(r['status'])} {r['name']}  (count={r['count']}"
            line += f", total={r['total']})" if r.get("total") is not None else ")"
            if r.get("detail"):
                line += f"  — {r['detail']}"
            print(line)
            for ex in r.get("examples", [])[:5]:
                print(f"        · {ex}")
        print()

    return 1 if report["overall"] == "fail" else 0


if __name__ == "__main__":
    raise SystemExit(main())
