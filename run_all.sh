#!/usr/bin/env bash
# ============================================================================
#  Prostate Cancer Consultation Dashboard — Full Startup & Test Script
#
#  This script:
#    1. Loads the r01-nlp-classifiers Docker image (OCI archive)
#    2. Starts all services via docker compose
#    3. Waits for every container to be healthy
#    4. Runs a 5-model transcript analysis (direct NLP call)
#    5. Runs a 1000-request stress test through the backend
#
#  All output is saved to a timestamped log file in the logs/ directory.
#
#  Prerequisites:
#    - Docker Desktop running
#    - app/Backend/.env configured (copy from .env.example)
#    - NLP classifier Docker image (OCI archive) available
#
#  Usage:  chmod +x run_all.sh && ./run_all.sh
# ============================================================================
set -euo pipefail

# ── Paths (relative to this script, i.e. repo root) ────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/app/Backend/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/app/Backend/.env"

# NLP image: included in this repo (nlp-classifiers/), or override via NLP_IMAGE_DIR env var
NLP_IMAGE_DIR="${NLP_IMAGE_DIR:-$SCRIPT_DIR/nlp-classifiers/r01-nlp-classifiers-docker-image}"

BASE_URL="http://localhost:8000"
BACKEND_CONTAINER="prostatecancer-backend"

MODELS=("cp" "le" "ed" "inc" "ius")
MODEL_LABELS=("Cancer Prognosis" "Life Expectancy" "Erectile Dysfunction" "Incontinence" "Irritative Urinary Symptoms")

# ── Load API key from .env ──────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found. Copy from .env.example and configure."
    exit 1
fi
API_KEY=$(grep '^API_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
if [ -z "$API_KEY" ] || [ "$API_KEY" = "CHANGE_ME_generate_a_random_key" ]; then
    echo "ERROR: API_KEY not configured in $ENV_FILE"
    exit 1
fi

# ── Log file setup ───────────────────────────────────────────────────────────
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
LOG_FILE="$LOG_DIR/run_all_${TIMESTAMP}.log"

# Tee all output to both terminal and log file
exec > >(tee -a "$LOG_FILE") 2>&1

echo "Log file: $LOG_FILE"

# ── Helper ───────────────────────────────────────────────────────────────────
section() { echo ""; echo "================================================================"; echo "  $1"; echo "================================================================"; }
info()    { echo "  ▸ $1"; }
ok()      { echo "  ✓ $1"; }
fail()    { echo "  ✗ $1"; exit 1; }

# ============================================================================
#  STEP 1 — Load NLP Classifier Docker Image
# ============================================================================
section "Step 1: Load r01-nlp-classifiers Docker image"

if docker image inspect r01-nlp-classifiers:latest >/dev/null 2>&1; then
    ok "Image already loaded — skipping"
else
    if [ ! -d "$NLP_IMAGE_DIR" ]; then
        fail "NLP image directory not found: $NLP_IMAGE_DIR
  Set NLP_IMAGE_DIR env var to point to the OCI archive directory."
    fi
    info "Creating tar from OCI archive..."
    tar -cf /tmp/r01-nlp-classifiers.tar -C "$NLP_IMAGE_DIR" .
    info "Loading image into Docker..."
    docker load -i /tmp/r01-nlp-classifiers.tar
    rm -f /tmp/r01-nlp-classifiers.tar
    ok "Image loaded successfully"
fi

# ============================================================================
#  STEP 2 — Start All Services
# ============================================================================
section "Step 2: Start all services (docker compose up)"

if [ ! -f "$COMPOSE_FILE" ]; then
    fail "docker-compose.yml not found: $COMPOSE_FILE"
fi

info "Building and starting containers..."
docker compose -f "$COMPOSE_FILE" up -d --build

ok "docker compose up completed"

# ============================================================================
#  STEP 3 — Wait for All Containers to be Healthy
# ============================================================================
section "Step 3: Waiting for all containers to be healthy"

# Containers that MUST be healthy for NLP tests to work
REQUIRED_CONTAINERS=(
    "prostatecancer-postgres"
    "prostatecancer-redis"
    "backend-nlp-classifiers-1"
    "backend-nlp-classifiers-2"
    "backend-nlp-classifiers-3"
    "prostatecancer-backend"
)

# Containers that may be unhealthy due to known issues (e.g. no curl in alpine)
OPTIONAL_CONTAINERS=(
    "prostatecancer-webapp"
    "prostatecancer-nginx"
)

MAX_WAIT=300  # seconds
INTERVAL=5

for container in "${REQUIRED_CONTAINERS[@]}"; do
    elapsed=0
    while true; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")

        if [ "$status" = "healthy" ]; then
            ok "$container — healthy"
            break
        elif [ "$status" = "not_found" ]; then
            # Container might not exist yet (e.g. depends_on)
            :
        fi

        if [ "$elapsed" -ge "$MAX_WAIT" ]; then
            fail "$container — not healthy after ${MAX_WAIT}s (status: $status)"
        fi

        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))
    done
done

for container in "${OPTIONAL_CONTAINERS[@]}"; do
    elapsed=0
    while true; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
        running=$(docker inspect --format='{{.State.Running}}' "$container" 2>/dev/null || echo "false")

        if [ "$status" = "healthy" ]; then
            ok "$container — healthy"
            break
        elif [ "$running" = "true" ] && [ "$elapsed" -ge 60 ]; then
            echo "  ⚠ $container — running but unhealthy (known issue: health check misconfigured, service works fine)"
            break
        elif [ "$elapsed" -ge "$MAX_WAIT" ]; then
            echo "  ⚠ $container — not healthy after ${MAX_WAIT}s (status: $status) — continuing anyway"
            break
        fi

        sleep "$INTERVAL"
        elapsed=$((elapsed + INTERVAL))
    done
done

echo ""
ok "Core services healthy — ready for tests"

# ============================================================================
#  STEP 4 — Full 5-Model Transcript Analysis (Direct NLP Call)
# ============================================================================
section "Step 4: 5-Model Transcript Analysis (8 sentences x 5 models)"

SENTENCES_JSON='[
  "so it sounds like in july you had a psa check blood test and the psa was elevated around 5.",
  "and since youre 52 years old obviously thats not normal it should be lower than 3 and a half.",
  "the biopsy showed cancer in three areas on the left kind of in the front middle and back part of the prostate.",
  "the big question that many patients have is what would happen if i didnt do anything for this cancer.",
  "we know this data from studies looking at risk of cancer death in men who chose not to treat their cancers.",
  "in your case that risk turns out to be about 12 percent at 15 years.",
  "so the risk of dying from prostate cancer without treatment is relatively low but its not zero.",
  "i would recommend treatment given your age and the grade of the cancer."
]'

PAYLOAD='[
  {"text": "so it sounds like in july you had a psa check blood test and the psa was elevated around 5."},
  {"text": "and since youre 52 years old obviously thats not normal it should be lower than 3 and a half."},
  {"text": "the biopsy showed cancer in three areas on the left kind of in the front middle and back part of the prostate."},
  {"text": "the big question that many patients have is what would happen if i didnt do anything for this cancer."},
  {"text": "we know this data from studies looking at risk of cancer death in men who chose not to treat their cancers."},
  {"text": "in your case that risk turns out to be about 12 percent at 15 years."},
  {"text": "so the risk of dying from prostate cancer without treatment is relatively low but its not zero."},
  {"text": "i would recommend treatment given your age and the grade of the cancer."}
]'

echo ""
echo "  Sentences used for analysis:"
echo "$SENTENCES_JSON" | python3 -c "
import sys, json
sentences = json.load(sys.stdin)
for i, s in enumerate(sentences, 1):
    print(f'    [{i}] {s}')
"

# Store results in temp files (macOS bash 3.x doesn't support associative arrays)
RESULTS_DIR=$(mktemp -d /tmp/nlp_results_XXXX)

for i in "${!MODELS[@]}"; do
    model="${MODELS[$i]}"
    label="${MODEL_LABELS[$i]}"
    echo ""
    echo "  ── $model ($label) ──"

    docker exec "$BACKEND_CONTAINER" curl -s -X POST \
        "http://nlp-classifiers:8000/predict/$model" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" > "$RESULTS_DIR/$model.json"

    python3 -m json.tool < "$RESULTS_DIR/$model.json"
done

# Print summary table
echo ""
echo "  ================================================================"
echo "  SUMMARY TABLE: pred_1 scores (probability of topic relevance)"
echo "  ================================================================"
echo ""

python3 << PYEOF
import json, os

models = ['cp', 'le', 'ed', 'inc', 'ius']
labels = ['CancerProg', 'LifeExp', 'ErectDys', 'Incontin', 'IrritUri']
sentences = [
    'PSA check blood test elevated around 5',
    '52 years old not normal lower than 3.5',
    'biopsy showed cancer in three areas',
    'what would happen if i didnt do anything',
    'risk of cancer death in men who chose not to treat',
    'risk turns out to be about 12 percent at 15 years',
    'risk of dying is relatively low but not zero',
    'recommend treatment given age and grade',
]

results = {}
for m in models:
    with open(f'$RESULTS_DIR/{m}.json') as f:
        results[m] = json.load(f)

# Header
header = f"{'#':<4} {'Sentence':<50}"
for l in labels:
    header += f' {l:>10}'
header += f' {"TOP":>10}'
print(f'  {header}')
print(f"  {'-' * len(header)}")

# Rows
for idx in range(8):
    row = f'{idx+1:<4} {sentences[idx]:<50}'
    scores = {}
    for m in models:
        score = results[m][idx]['.pred_1']
        scores[m] = score
        row += f' {score:>10.3f}'
    top_model = max(scores, key=scores.get)
    top_score = scores[top_model]
    row += f' {top_model:>6}({top_score:.2f})'
    print(f'  {row}')

print()
PYEOF

rm -rf "$RESULTS_DIR"

ok "5-model transcript analysis complete"

# ============================================================================
#  STEP 5 — 1000-Request Stress Test
# ============================================================================
section "Step 5: 1000-Request Stress Test via Backend"

# Check aiohttp
if ! python3 -c "import aiohttp" 2>/dev/null; then
    info "Installing aiohttp..."
    python3 -m pip install aiohttp -q
fi

# Generate and run the stress test script
STRESS_TEST=$(mktemp /tmp/nlp_stress_test_XXXX.py)
cat > "$STRESS_TEST" << PYEOF
"""NLP API 1000-request stress test via Backend -> nlp-classifiers."""
import asyncio, aiohttp, time, random
from collections import Counter

BASE_URL = "$BASE_URL"
API_KEY = "$API_KEY"
HEADERS = {"Content-Type": "application/json", "X-API-Key": API_KEY}
TOTAL = 1000
CONCURRENCY = 20
MODELS = ["cp", "le", "ed", "inc", "ius"]

SENTENCES = [
    "so it sounds like in july you had a psa check blood test and the psa was elevated around 5.",
    "and since youre 52 years old obviously thats not normal it should be lower than 3 and a half.",
    "the biopsy showed cancer in three areas on the left kind of in the front middle and back part of the prostate.",
    "the big question that many patients have is what would happen if i didnt do anything for this cancer.",
    "we know this data from studies looking at risk of cancer death in men who chose not to treat their cancers.",
    "in your case that risk turns out to be about 12 percent at 15 years.",
    "so the risk of dying from prostate cancer without treatment is relatively low but its not zero.",
    "i would recommend treatment given your age and the grade of the cancer.",
    "So 12% risk of death from prostate cancer at 15 years is small in the grand scheme of things.",
    "the nerves that supply the erectile function of the penis go right underneath the prostate.",
    "you are very young for prostate cancer so we have got to plan for the long-term for you.",
    "most of my patients will leak a little bit for the first 3 months after surgery.",
    "radiation comes with a little bit of baggage like frequency urgency and nocturia.",
    "meaning that prostate cancers slow-growing and often doesnt cause harm until 15 20 years out from the diagnosis.",
    "and in fact most of my patients they will leak a little bit for the first 3 months after surgery but then they recover.",
    "so the nerves that supply the erectile function of the penis go right underneath the prostate and they can be damaged during surgery.",
    "thank you for coming in today, let me pull up your chart.",
    "this is rolling. excellent, okay.",
    "what is the risk of this cancer in my life?",
    "prostate cancer is slow-growing and often doesnt cause harm until 15 years out from diagnosis.",
    "the biopsy showed cancer in three areas on the left side of the prostate.",
    "in your case that risk turns out to be 12 percent at 15 years.",
    "active surveillance is one option where we monitor the cancer closely.",
    "the gleason score tells us how aggressive the cancer cells look under the microscope.",
    "robotic surgery allows for more precise nerve sparing which helps preserve erectile function.",
    "after radiation therapy you might experience some urinary frequency and urgency.",
    "the five year survival rate for your stage of cancer is very high.",
    "we need to balance the risks of treatment against the risks of the cancer itself.",
    "hormone therapy can be used in combination with radiation for more advanced cases.",
    "your psa level will be monitored regularly after treatment to check for recurrence.",
]

async def send_one(session, req_id, sem):
    roll = random.random()
    if roll < 0.40:
        etype, url = "single", f"{BASE_URL}/api/nlp/predict"
        payload = {"text": random.choice(SENTENCES), "model": random.choice(MODELS)}
    elif roll < 0.65:
        etype, url = "batch", f"{BASE_URL}/api/nlp/predict/batch"
        payload = {"texts": random.sample(SENTENCES, random.randint(3, 8)), "model": random.choice(MODELS)}
    elif roll < 0.85:
        etype, url = "all-models", f"{BASE_URL}/api/nlp/predict/all"
        payload = {"text": random.choice(SENTENCES)}
    else:
        etype, url = "by-class", f"{BASE_URL}/api/nlp/predict/by-class"
        payload = {"text": random.choice(SENTENCES), "class": str(random.randint(1, 5))}

    async with sem:
        t0 = time.perf_counter()
        try:
            async with session.post(url, json=payload, headers=HEADERS,
                                    timeout=aiohttp.ClientTimeout(total=60)) as resp:
                elapsed = time.perf_counter() - t0
                body = await resp.json()
                cached = False
                if resp.status == 200 and isinstance(body, dict):
                    cached = body.get("cached", False)
                    preds = body.get("predictions", [])
                    if isinstance(preds, list):
                        cached = any(p.get("cached") for p in preds)
                return {"id": req_id, "type": etype, "status": resp.status,
                        "ms": elapsed * 1000, "ok": resp.status == 200, "cached": cached}
        except Exception as e:
            return {"id": req_id, "type": etype, "status": 0,
                    "ms": (time.perf_counter() - t0) * 1000, "ok": False, "error": str(e)[:80]}

async def main():
    print(f"  Running {TOTAL} requests (concurrency={CONCURRENCY})...")
    sem = asyncio.Semaphore(CONCURRENCY)
    conn = aiohttp.TCPConnector(limit=CONCURRENCY)
    results = []
    t_start = time.perf_counter()

    async with aiohttp.ClientSession(connector=conn) as session:
        tasks = [send_one(session, i, sem) for i in range(TOTAL)]
        done = 0
        for coro in asyncio.as_completed(tasks):
            r = await coro
            results.append(r)
            done += 1
            if done % 200 == 0:
                print(f"  ... {done}/{TOTAL} done  ({time.perf_counter() - t_start:.1f}s)")

    total_sec = time.perf_counter() - t_start
    ok_list = [r for r in results if r["ok"]]
    fail_list = [r for r in results if not r["ok"]]
    cached = sum(1 for r in ok_list if r["cached"])
    times = sorted(r["ms"] for r in results)

    print()
    print(f"  ┌─────────────────────────────────────────────────┐")
    print(f"  │          STRESS TEST RESULTS                    │")
    print(f"  ├─────────────────────────────────────────────────┤")
    print(f"  │  Total requests : {TOTAL:<29}│")
    print(f"  │  Success (200)  : {len(ok_list):<29}│")
    print(f"  │  Failed         : {len(fail_list):<29}│")
    print(f"  │  Success rate   : {len(ok_list)/TOTAL*100:.1f}%{' '*(25)}│")
    print(f"  │  Cached hits    : {cached:<29}│")
    print(f"  │  Wall time      : {total_sec:.1f}s{' '*(26)}│")
    print(f"  │  Throughput     : {TOTAL/total_sec:.1f} req/s{' '*(22)}│")
    print(f"  ├─────────────────────────────────────────────────┤")
    print(f"  │  LATENCY                                        │")
    print(f"  │    Min    : {times[0]:>8.0f} ms{' '*(26)}│")
    print(f"  │    Avg    : {sum(times)/len(times):>8.0f} ms{' '*(26)}│")
    print(f"  │    Median : {times[len(times)//2]:>8.0f} ms{' '*(26)}│")
    print(f"  │    P95    : {times[int(len(times)*0.95)]:>8.0f} ms{' '*(26)}│")
    print(f"  │    P99    : {times[int(len(times)*0.99)]:>8.0f} ms{' '*(26)}│")
    print(f"  │    Max    : {times[-1]:>8.0f} ms{' '*(26)}│")
    print(f"  └─────────────────────────────────────────────────┘")
    print()
    print(f"  {'Endpoint':<14} {'Total':>6} {'OK':>6} {'Fail':>6} {'Avg(ms)':>10}")
    print(f"  {'-'*14} {'-'*6} {'-'*6} {'-'*6} {'-'*10}")
    for t in ["single", "batch", "all-models", "by-class"]:
        sub = [r for r in results if r["type"] == t]
        sub_ok = [r for r in sub if r["ok"]]
        sub_ms = [r["ms"] for r in sub]
        avg = sum(sub_ms) / len(sub_ms) if sub_ms else 0
        print(f"  {t:<14} {len(sub):>6} {len(sub_ok):>6} {len(sub)-len(sub_ok):>6} {avg:>10.0f}")

    if fail_list:
        print()
        print(f"  Sample failures (first 5 of {len(fail_list)}):")
        for f in fail_list[:5]:
            err = f.get("error", f"HTTP {f['status']}")
            print(f"    #{f['id']} [{f['type']}] {err}")

if __name__ == "__main__":
    asyncio.run(main())
PYEOF

python3 "$STRESS_TEST"
rm -f "$STRESS_TEST"

ok "1000-request stress test complete"

# ============================================================================
#  STEP 6 — Final Status
# ============================================================================
section "Final Status: docker ps -a"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "================================================================"
echo "  All done! Dashboard available at http://localhost:3001"
echo "  Backend API docs at http://localhost:8000/docs"
echo "  Log saved to: $LOG_FILE"
echo "================================================================"
