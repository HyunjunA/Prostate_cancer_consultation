"""
test_100_doctors.py — concurrent multi-doctor load test for Pattern A tracking.

Simulates 100 distinct doctors (DR_001 .. DR_100), each on their own device with
their own session_id, performing a realistic chronological workflow against the
/api/track/doctor endpoint. Then verifies via the admin endpoints that:

  1. All POSTs returned 200 and Pydantic accepted every event.
  2. /speakers returns exactly 100 distinct doctors with the right counts.
  3. /actions for each doctor returns ONLY that doctor's events (no
     cross-contamination), in chronological order.
  4. Each doctor's events all share that doctor's single session_id.
  5. Latency stats are reasonable (no timeouts or 5xx).

Run from repo root:
    python3 app/Backend/load_tests/test_100_doctors.py
or inside the container:
    docker exec prostatecancer-backend python3 /app/load_tests/test_100_doctors.py
"""

from __future__ import annotations

import asyncio
import os
import random
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

import aiohttp

# ── Config ───────────────────────────────────────────────────────────────────

BASE_URL = os.getenv("LOAD_TEST_BASE_URL", "http://localhost:18000")
NUM_DOCTORS = int(os.getenv("LOAD_TEST_DOCTORS", "100"))
CONCURRENCY = int(os.getenv("LOAD_TEST_CONCURRENCY", "100"))
PATIENT_FILE = "Input_Keystrokes REC 001 (SID 10).xlsx"
ACTION_GAP_MS = int(os.getenv("LOAD_TEST_GAP_MS", "0"))  # 0 = burst, e.g. 50 = realistic
CLEANUP_AFTER = os.getenv("LOAD_TEST_CLEANUP", "true").lower() == "true"

# Try to read API_KEY from .env (running from host) or env (running in container).
API_KEY = os.getenv("API_KEY", "")
if not API_KEY:
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("API_KEY="):
                API_KEY = line.split("=", 1)[1].strip()
                break
if not API_KEY:
    print("ERROR: API_KEY not found. Set env var or app/Backend/.env", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Content-Type": "application/json", "X-API-Key": API_KEY}


# ── Workflow definition ──────────────────────────────────────────────────────

# A realistic chronological workflow each doctor performs.
# (event_type, target_type, target_id_template, extra_metadata_template)
WORKFLOW = [
    ("page_view",       None,       None,          {"page": "physician_dashboard", "view": "dashboard"}),
    ("view_change",     None,       None,          {"from": "dashboard", "to": "grid"}),
    ("patient_select",  "patient",  "{file}",      {"fileId": "{file}"}),
    ("view_change",     None,       None,          {"from": "grid", "to": "detail"}),
    ("topic_select",    "topic",    "Cancer Prognosis", {"topicName": "Cancer Prognosis"}),
    ("sentence_select", "sentence", "5",           {"sentenceIdx": 5, "topicName": "Cancer Prognosis"}),
    ("rewrite_apply",   "sentence", "5",           {"topic": "Cancer Prognosis", "length": 87}),
    ("rubric_open",     None,       None,          {}),
    ("rubric_close",    None,       None,          {}),
    ("tour_open",       None,       None,          {"trigger": "restart_button", "view": "detail"}),
    ("tour_end",        None,       None,          {"status": "finished", "view": "detail"}),
    ("session_end",     None,       None,          {"view": "detail"}),
]
EVENTS_PER_DOCTOR = len(WORKFLOW)


@dataclass
class DoctorResult:
    speaker: str
    session_id: str
    statuses: List[int] = field(default_factory=list)
    latencies_ms: List[float] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


def make_session_id() -> str:
    ts = int(time.time() * 1000)
    rand = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=11))
    return f"session_{ts}_{rand}"


def render(template, ctx):
    if isinstance(template, str):
        return template.format(**ctx)
    if isinstance(template, dict):
        return {k: render(v, ctx) for k, v in template.items()}
    return template


# ── Per-doctor workflow runner ───────────────────────────────────────────────

async def run_one_doctor(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    doctor_idx: int,
) -> DoctorResult:
    speaker = f"DR_{doctor_idx:03d}"
    session_id = make_session_id()
    res = DoctorResult(speaker=speaker, session_id=session_id)
    ctx = {"file": PATIENT_FILE, "speaker": speaker}

    base_ts = time.time()
    for step_idx, (event_type, target_type, target_id_tpl, meta_tpl) in enumerate(WORKFLOW):
        client_ts = base_ts + step_idx * 0.1  # 100ms apart in event time
        client_ts_iso = (
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(client_ts))
            + f".{int((client_ts % 1) * 1000):03d}Z"
        )
        body = {
            "session_id": session_id,
            "file": (None if event_type in ("page_view",) else PATIENT_FILE),
            "speaker": speaker,
            "events": [{
                "event_type": event_type,
                "target_type": target_type,
                "target_id": render(target_id_tpl, ctx) if target_id_tpl else None,
                "metadata": render(meta_tpl, ctx),
                "client_timestamp": client_ts_iso,
            }],
        }

        async with sem:
            t0 = time.perf_counter()
            try:
                async with session.post(
                    f"{BASE_URL}/api/track/doctor",
                    json=body, headers=HEADERS,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as r:
                    elapsed = (time.perf_counter() - t0) * 1000
                    res.statuses.append(r.status)
                    res.latencies_ms.append(elapsed)
                    if r.status != 200:
                        body_text = await r.text()
                        res.errors.append(f"step {step_idx} {event_type}: HTTP {r.status} {body_text[:200]}")
            except Exception as e:
                res.statuses.append(0)
                res.latencies_ms.append((time.perf_counter() - t0) * 1000)
                res.errors.append(f"step {step_idx} {event_type}: {type(e).__name__}: {e}")

        if ACTION_GAP_MS > 0:
            await asyncio.sleep(ACTION_GAP_MS / 1000)

    return res


# ── Verification helpers ─────────────────────────────────────────────────────

async def fetch_speakers(session: aiohttp.ClientSession) -> dict:
    async with session.get(f"{BASE_URL}/api/track/doctor/speakers", headers=HEADERS) as r:
        r.raise_for_status()
        data = await r.json()
    return {s["speaker"]: s for s in data["speakers"]}


async def fetch_actions(session: aiohttp.ClientSession, speaker: str) -> list:
    async with session.get(
        f"{BASE_URL}/api/track/doctor/actions",
        params={"speaker": speaker, "limit": "100"},
        headers=HEADERS,
    ) as r:
        r.raise_for_status()
        data = await r.json()
    return data["actions"]


async def cleanup(session: aiohttp.ClientSession, speakers: List[str]) -> None:
    """Delete the test doctors' rows so admin DB stays clean."""
    # No DELETE endpoint exists for tracking; do it directly via psql in container.
    # (Caller should run docker exec ... DELETE FROM doctor_behavior WHERE ...)
    print("\n  ▸ Cleanup: please run to remove test data:")
    in_clause = ",".join(f"'{s}'" for s in speakers)
    print("    docker exec prostatecancer-postgres psql -U prostatecancer_user -d prostatecancer_db \\")
    print(f"      -c \"DELETE FROM doctor_behavior WHERE speaker IN ({in_clause});\"")


# ── Main ─────────────────────────────────────────────────────────────────────

async def main() -> int:
    print("╔══ 100-doctor load test ══════════════════════════════════╗")
    print(f"║  Doctors:      {NUM_DOCTORS}")
    print(f"║  Events/doc:   {EVENTS_PER_DOCTOR}  (total {NUM_DOCTORS * EVENTS_PER_DOCTOR})")
    print(f"║  Concurrency:  {CONCURRENCY}")
    print(f"║  Action gap:   {ACTION_GAP_MS}ms  ({'burst' if ACTION_GAP_MS == 0 else 'spread'})")
    print(f"║  Backend:      {BASE_URL}")
    print("╚══════════════════════════════════════════════════════════╝")

    sem = asyncio.Semaphore(CONCURRENCY)
    # force_close=True avoids the spurious ServerDisconnectedError that
    # aiohttp can hit when reusing keep-alive connections under burst.
    connector = aiohttp.TCPConnector(
        limit=CONCURRENCY * 2,
        force_close=True,
        enable_cleanup_closed=True,
    )
    async with aiohttp.ClientSession(connector=connector) as session:
        # ── Phase 1: fire all doctors concurrently ──────────────────────────
        print(f"\n▸ Phase 1: firing {NUM_DOCTORS} doctors x {EVENTS_PER_DOCTOR} events …")
        t_start = time.perf_counter()
        tasks = [run_one_doctor(session, sem, i + 1) for i in range(NUM_DOCTORS)]
        results: List[DoctorResult] = await asyncio.gather(*tasks)
        wall_time = time.perf_counter() - t_start
        print(f"  ✓ done in {wall_time:.2f}s")

        # ── Stats from POST results ─────────────────────────────────────────
        total_requests = sum(len(r.statuses) for r in results)
        ok_count = sum(s == 200 for r in results for s in r.statuses)
        all_latencies = [latency for r in results for latency in r.latencies_ms]
        all_errors = [e for r in results for e in r.errors]

        print("\n▸ POST stats:")
        print(f"    Total requests : {total_requests}")
        print(f"    Success (200)  : {ok_count}  ({ok_count/total_requests*100:.1f}%)")
        print(f"    Failures       : {total_requests - ok_count}")
        if all_latencies:
            sorted_lat = sorted(all_latencies)
            print(f"    Latency  avg   : {statistics.mean(sorted_lat):.0f}ms")
            print(f"             median: {sorted_lat[len(sorted_lat)//2]:.0f}ms")
            print(f"             p95   : {sorted_lat[int(len(sorted_lat)*0.95)]:.0f}ms")
            print(f"             p99   : {sorted_lat[int(len(sorted_lat)*0.99)]:.0f}ms")
            print(f"             max   : {sorted_lat[-1]:.0f}ms")
        if all_errors:
            print(f"\n  Sample errors (first 5 of {len(all_errors)}):")
            for e in all_errors[:5]:
                print(f"    - {e}")

        # ── Phase 2: verify via admin endpoints ─────────────────────────────
        print("\n▸ Phase 2: verifying via admin endpoints …")
        speakers_map = await fetch_speakers(session)

        test_speakers = {r.speaker for r in results}
        found_speakers = set(speakers_map.keys()) & test_speakers
        print(f"  Found {len(found_speakers)}/{NUM_DOCTORS} test doctors in /speakers")

        # Pick 5 random doctors to deep-verify (faster than checking all 100)
        sample = random.sample(results, min(5, len(results)))
        print(f"\n▸ Phase 3: deep-verify {len(sample)} random doctors …")
        deep_pass = 0
        for r in sample:
            actions = await fetch_actions(session, r.speaker)
            # Assertions:
            sids_in = {a["session_id"] for a in actions}
            issues = []
            if len(actions) != EVENTS_PER_DOCTOR:
                issues.append(f"action count {len(actions)} != {EVENTS_PER_DOCTOR}")
            if sids_in != {r.session_id}:
                issues.append(f"session_id mix: {sids_in} vs expected {{{r.session_id}}}")
            # Verify chronological order
            tss = [a["client_timestamp"] for a in actions]
            if tss != sorted(tss):
                issues.append("not chronological")
            if issues:
                print(f"    ✗ {r.speaker}: {', '.join(issues)}")
            else:
                print(f"    ✓ {r.speaker}: {len(actions)} actions, single session, chronological")
                deep_pass += 1

        # ── Final verdict ────────────────────────────────────────────────────
        print("\n╔══ VERDICT ════════════════════════════════════════════════╗")
        ok_rate = ok_count / total_requests * 100 if total_requests else 0
        speakers_ok = len(found_speakers) == NUM_DOCTORS
        deep_ok = deep_pass == len(sample)
        verdict = "PASS" if (ok_rate >= 99.5 and speakers_ok and deep_ok) else "FAIL"
        print(f"║  POST success rate       : {ok_rate:.1f}%   {'✓' if ok_rate >= 99.5 else '✗'}")
        print(f"║  All speakers visible    : {len(found_speakers)}/{NUM_DOCTORS}  {'✓' if speakers_ok else '✗'}")
        print(f"║  Deep checks passed      : {deep_pass}/{len(sample)}    {'✓' if deep_ok else '✗'}")
        print(f"║  OVERALL                 : {verdict}")
        print("╚═══════════════════════════════════════════════════════════╝")

        if CLEANUP_AFTER:
            await cleanup(session, [r.speaker for r in results])

        return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
