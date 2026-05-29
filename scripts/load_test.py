"""Programmatic load test for the dashboard backend.

Spawns N concurrent "user sessions" against a running native backend
and reports how it holds up — latency percentiles per endpoint, error
rate, requests/sec — so we can answer "does this stay healthy at 30
concurrent users?" with measurements instead of guesses.

Three session profiles are simulated:
    patient_first_visit  — landing fetches + submitting one domain response
    patient_followup     — survey submit (DCS-style, posts to /api/surveys)
    behavior_tracking    — bursts of /api/track-* writes (the silent
                           background traffic from any active user)

Usage (run a regular test against the local backend):

    /Users/.../Prostate_cancer_consultation_dashboard/.venv/bin/python \
        scripts/load_test.py --users 10 --duration 30

Flags:
    --users N         Number of concurrent user sessions (default 10)
    --duration N      Total wall-clock seconds to keep firing (default 30)
    --base-url URL    Backend base URL (default http://localhost:18000)
    --include-try-score   Also exercise /api/doctor/score-sentence
                          (Azure OpenAI — burns quota; off by default)
    --target-patient ID   Use this patid (must exist in DB; default SID_10)

The script does NOT touch Phase 2 (no NLP container calls, no
transcript processing). It exercises only Phase 1's request surface,
which is what real concurrent users hit.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.parse import quote

import httpx


# Bootstrap — read API_KEY from the dashboard's .env (gitignored).
DASHBOARD_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = DASHBOARD_ROOT / "app" / "Backend" / ".env"


def _load_api_key() -> str:
    """Pull the X-API-Key header value from app/Backend/.env."""
    if not ENV_FILE.exists():
        sys.stderr.write(f"\n.env not found at {ENV_FILE}\n")
        sys.exit(1)
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line.startswith("API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.stderr.write("\nAPI_KEY not found in .env\n")
    sys.exit(1)


# ── Per-request timing collector ────────────────────────────────────────────
class Stats:
    """Accumulates (endpoint → list[latency_ms]) and per-endpoint error counts."""

    def __init__(self) -> None:
        self.latencies: Dict[str, List[float]] = defaultdict(list)
        self.errors: Dict[str, int] = defaultdict(int)
        self.started_at = time.perf_counter()

    def record(self, label: str, ms: float, ok: bool) -> None:
        self.latencies[label].append(ms)
        if not ok:
            self.errors[label] += 1

    def summary(self) -> Dict[str, Dict[str, float]]:
        out: Dict[str, Dict[str, float]] = {}
        for label, samples in self.latencies.items():
            samples_sorted = sorted(samples)
            n = len(samples_sorted)
            if n == 0:
                continue
            out[label] = {
                "count": n,
                "errors": self.errors[label],
                "p50": _percentile(samples_sorted, 50),
                "p95": _percentile(samples_sorted, 95),
                "p99": _percentile(samples_sorted, 99),
                "min": samples_sorted[0],
                "max": samples_sorted[-1],
                "mean": statistics.mean(samples_sorted),
            }
        return out

    def total_requests(self) -> int:
        return sum(len(v) for v in self.latencies.values())

    def total_errors(self) -> int:
        return sum(self.errors.values())


def _percentile(sorted_samples: List[float], p: float) -> float:
    if not sorted_samples:
        return 0.0
    k = (len(sorted_samples) - 1) * (p / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sorted_samples) - 1)
    if lo == hi:
        return sorted_samples[lo]
    return sorted_samples[lo] + (sorted_samples[hi] - sorted_samples[lo]) * (k - lo)


# ── Single timed request — wrapper around httpx.Client.request ─────────────
async def _request(client: httpx.AsyncClient, stats: Stats, label: str,
                   method: str, path: str, **kwargs) -> Tuple[int, float]:
    """Issue a request, record latency + ok-flag, return (status, ms)."""
    t0 = time.perf_counter()
    try:
        resp = await client.request(method, path, **kwargs)
        ms = (time.perf_counter() - t0) * 1000
        ok = 200 <= resp.status_code < 300
        stats.record(label, ms, ok)
        return resp.status_code, ms
    except Exception:
        ms = (time.perf_counter() - t0) * 1000
        stats.record(label, ms, False)
        return -1, ms


# ── Session profiles ────────────────────────────────────────────────────────
# Each profile is one round of "what a real user does"; the runner
# loops over the chosen profile until --duration expires.
# `_FACTOR_WHITELIST` mirror — must match routes_patient.py to avoid
# 422s from random-but-invalid factor strings. Keep this in sync if
# new domains / factors are added.
_FACTORS_BY_DOMAIN = {
    "le":  ["Tumor grade", "Age", "Marital status",
            "Health conditions or comorbidities", "Tumor stage"],
    "ed":  ["Tumor grade", "Age", "Tumor stage",
            "Health conditions or comorbidities", "Baseline function"],
    "inc": ["Tumor grade", "Age", "Tumor stage",
            "Health conditions or comorbidities", "Baseline function"],
    "ius": ["Tumor grade", "Age", "Tumor stage",
            "Health conditions or comorbidities", "Baseline function"],
}


async def _profile_patient_first_visit(client, stats, target_file, target_speaker):
    """Fetch the four endpoints the first-visit page hits on load,
    then submit a single domain response."""
    file_q = quote(target_file)
    speaker_q = quote(target_speaker)

    await _request(client, stats, "GET /api/patient/files",
                   "GET", "/api/patient/files")
    await _request(client, stats, "GET /api/patient/ai-summary/{file}",
                   "GET", f"/api/patient/ai-summary/{file_q}")
    await _request(client, stats, "GET /api/patient/summaries/{file}/{speaker}",
                   "GET", f"/api/patient/summaries/{file_q}/{speaker_q}")
    await _request(client, stats, "GET /api/patient/first-visit-responses/{file}/{speaker}",
                   "GET", f"/api/patient/first-visit-responses/{file_q}/{speaker_q}")

    # Submit one domain — values shaped to pass server-side validation.
    domain = random.choice(["cp", "le", "ed", "inc", "ius"])
    body = {
        "file": target_file,
        "speaker": target_speaker,
        "domain": domain,
        "vas_primary": random.randint(0, 100),
        "timeline": random.choice(["3 months", "6 months", "11-15 years", "Over next 16-20 years"]),
    }
    if domain == "cp":
        # cp is the only domain that supports vas_secondary, and it
        # rejects `factors` outright.
        body["vas_secondary"] = random.randint(0, 100)
    else:
        body["factors"] = [random.choice(_FACTORS_BY_DOMAIN[domain])]
    await _request(client, stats, "PUT /api/patient/first-visit-responses",
                   "PUT", "/api/patient/first-visit-responses", json=body)


async def _profile_behavior_tracking(client, stats, target_file, target_speaker):
    """Burst of UI-interaction tracking events — the chatty background
    traffic any active session generates.

    Body shape matches routes_track_patient_first.PatientFirstBatch:
    one batch per request, each batch carries a list of events.
    """
    from datetime import datetime, timezone
    session_id = f"loadtest-{random.randint(1000, 9999)}"
    events = []
    for _ in range(3):
        domain = random.choice(["cp", "le", "ed", "inc", "ius"])
        events.append({
            # topic_open requires a domain — that's the validator's
            # cross-field rule, satisfied here.
            "event_type": "topic_open",
            "domain": domain,
            "metadata": {"x": random.random()},
            "device_type": "desktop",
            "client_timestamp": datetime.now(timezone.utc).isoformat(),
        })
    body = {
        "session_id": session_id,
        "file": target_file,
        "speaker": target_speaker,
        "events": events,
    }
    await _request(client, stats, "POST /api/track/patient-first",
                   "POST", "/api/track/patient-first", json=body)


# ── Per-session driver — loops one profile until the deadline ──────────────
async def _run_session(session_id: int, profiles, base_url, headers, stats,
                       deadline, target_file, target_speaker):
    async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=10.0) as client:
        while time.perf_counter() < deadline:
            profile = random.choice(profiles)
            try:
                await profile(client, stats, target_file, target_speaker)
            except Exception as e:
                # Don't let one bad request kill the session; keep firing.
                print(f"  [session {session_id}] error: {e}", file=sys.stderr)
            # Tiny think-time so all sessions don't hammer in lock-step
            await asyncio.sleep(random.uniform(0.05, 0.25))


# ── Reporting ───────────────────────────────────────────────────────────────
def _print_report(stats: Stats, users: int, duration: float) -> None:
    summary = stats.summary()
    total = stats.total_requests()
    errors = stats.total_errors()
    rps = total / duration if duration > 0 else 0

    print("\n" + "=" * 78)
    print(f"Load test summary — {users} users × {duration:.1f}s")
    print("=" * 78)
    print(f"  Total requests : {total}")
    print(f"  Errors         : {errors}  ({100 * errors / total:.2f}%)" if total else "  Errors         : 0")
    print(f"  Throughput     : {rps:.1f} req/s")
    print()
    print(f"  {'endpoint':<60} {'count':>6} {'p50':>7} {'p95':>7} {'p99':>7} {'err':>5}")
    print(f"  {'-'*60} {'-'*6} {'-'*7} {'-'*7} {'-'*7} {'-'*5}")
    # Sort by p95 desc — slowest endpoints surface first
    for label, s in sorted(summary.items(), key=lambda kv: -kv[1]["p95"]):
        print(
            f"  {label:<60} {int(s['count']):>6} "
            f"{s['p50']:>6.1f}ms {s['p95']:>6.1f}ms {s['p99']:>6.1f}ms "
            f"{int(s['errors']):>5}"
        )
    print("=" * 78)


# ── Main ───────────────────────────────────────────────────────────────────
async def main_async(args: argparse.Namespace) -> int:
    api_key = _load_api_key()
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    profiles = [_profile_patient_first_visit, _profile_behavior_tracking]
    if args.include_try_score:
        # Try & Score is an opt-in profile because it spends Azure OpenAI quota.
        async def _try_score(client, stats, _file, _patid):
            body = {"text": "The five-year survival rate is around 95 percent.", "class_": "cp"}
            await _request(client, stats, "POST /api/doctor/score-sentence",
                           "POST", "/api/doctor/score-sentence", json=body)
        profiles.append(_try_score)

    # Resolve the patid → file → speaker mapping. patient_summary stores
    # speaker as "Patient_<filename without ext>" (set by the persistence
    # helper), so the server-side FK / lookup needs that exact form, not
    # a short SID. SID_10 is just the operator-friendly alias here.
    target_patid = args.target_patient
    file_for_patid = {
        "SID_10": "Input_Keystrokes REC 001 (SID 10).xlsx",
        "SID_14": "Input_Keystrokes REC001 (SID 14).xlsx",
        "SID_15": "Input_Keystrokes REC001 (SID 15).xlsx",
    }
    if target_patid not in file_for_patid:
        sys.stderr.write(f"\nUnknown --target-patient {target_patid} (use SID_10/14/15)\n")
        return 1
    target_file = file_for_patid[target_patid]
    target_speaker = f"Patient_{Path(target_file).stem}"  # what the DB stores

    print(f"Load test config:")
    print(f"  Base URL:        {args.base_url}")
    print(f"  Target patient:  {target_patid}  ({target_file})")
    print(f"  Target speaker:  {target_speaker}")
    print(f"  Concurrent users:{args.users}")
    print(f"  Duration:        {args.duration}s")
    print(f"  Profiles:        {[p.__name__ for p in profiles]}")
    print()

    stats = Stats()
    deadline = time.perf_counter() + args.duration
    started = time.perf_counter()

    # Spawn all user sessions at once — the most pessimistic shape
    # (everyone arrives at the same moment).
    sessions = [
        asyncio.create_task(_run_session(
            i, profiles, args.base_url, headers, stats,
            deadline, target_file, target_speaker,
        ))
        for i in range(args.users)
    ]
    await asyncio.gather(*sessions)

    elapsed = time.perf_counter() - started
    _print_report(stats, args.users, elapsed)
    return 0 if stats.total_errors() == 0 else 1


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--users", type=int, default=10)
    p.add_argument("--duration", type=int, default=30, help="Seconds")
    p.add_argument("--base-url", type=str, default="http://localhost:18000")
    p.add_argument("--target-patient", type=str, default="SID_10",
                   help="SID_10 / SID_14 / SID_15 — must exist in DB")
    p.add_argument("--include-try-score", action="store_true",
                   help="Also exercise Try & Score (Azure OpenAI — burns quota)")
    return p.parse_args()


if __name__ == "__main__":
    sys.exit(asyncio.run(main_async(parse_args())))
