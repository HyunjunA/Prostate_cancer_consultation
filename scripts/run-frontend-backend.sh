#!/usr/bin/env bash
# ============================================================================
#  run-frontend-backend.sh — dashboard entry point (Phase B)
#
#  Brings up the dashboard's *read-time* stack:
#    - Native postgres + redis (already running via brew services)
#    - Docker webapp container       (docker-compose-frontend.yml)
#    - Native Backend FastAPI        (uvicorn, foreground)
#
#  The NLP classifier container is NOT touched here — it is a write-time
#  asset of the AI pipeline (sibling AI_physician_patient_communication
#  repo) and is started by the AI repo's main_complete_pipeline_db.py
#  during Phase A. Dashboard request handlers never call the NLP
#  container at request time, so this script does not depend on it
#  being up.
#
#  Usage:
#    bash scripts/run-frontend-backend.sh                # foreground backend
#    bash scripts/run-frontend-backend.sh --reload       # dev hot-reload
#    bash scripts/run-frontend-backend.sh --skip-docker  # assume webapp already up
#    bash scripts/run-frontend-backend.sh --backend-only # skip docker entirely
#
#  Stop:
#    Ctrl-C        # stops backend
#    docker compose -f docker-compose-frontend.yml down   # stops webapp
#
#  Process new transcripts (Phase A — separate command, run from the AI repo):
#    cd ../AI_physician_patient_communication
#    ../Prostate_cancer_consultation_dashboard/.venv/bin/python \
#        main_complete_pipeline_db.py --dir data/input
#
#  Reference: README.md "Quick Start — Native Deployment" (Phase A vs Phase B)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

GREEN="\033[92m"; YELLOW="\033[93m"; BOLD="\033[1m"; RESET="\033[0m"
section() { echo ""; echo -e "${BOLD}${GREEN}=== $1 ===${RESET}"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $1"; }

# ── Args ────────────────────────────────────────────────────────────────────
SKIP_DOCKER=0
BACKEND_ONLY=0
BACKEND_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-docker)  SKIP_DOCKER=1; shift ;;
        --backend-only) BACKEND_ONLY=1; SKIP_DOCKER=1; shift ;;
        --reload|--workers|--host|--port)
            BACKEND_ARGS+=("$1")
            if [[ -n "${2:-}" && "${2:0:2}" != "--" ]]; then
                BACKEND_ARGS+=("$2"); shift 2
            else
                shift
            fi ;;
        -h|--help)
            grep -E '^#( |$)' "$0" | sed 's/^# \?//'
            exit 0 ;;
        *)
            echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# ── 0. Sanity ──────────────────────────────────────────────────────────────
if [[ ! -f app/Backend/.env ]]; then
    echo "✗ app/Backend/.env missing — copy from .env.example" >&2
    exit 1
fi

if [[ ! -f app/Webapp/.env && $BACKEND_ONLY -eq 0 ]]; then
    warn "app/Webapp/.env missing — copying from .example"
    cp app/Webapp/.env.example app/Webapp/.env
fi

# Export the env vars docker-compose-frontend.yml interpolates (e.g. `${API_KEY}`).
# Without this, compose substitutes empty strings — webapp boots without an
# API key and every backend call fails (manifests in the UI as
# "No patients found" / "Loading...").
if [[ -f app/Backend/.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source app/Backend/.env
    set +a
fi

# ── 1. Start webapp container (unless skipped) ─────────────────────────────
# The dashboard's compose file only owns the webapp container now —
# nlp-classifiers was moved to the AI pipeline's responsibility (see
# the AI repo's main_complete_pipeline_db.py and
# docker-compose-ai-nlp-pipeline.yml).
if [[ $SKIP_DOCKER -eq 0 ]]; then
    section "Starting Docker (webapp only)"

    docker compose -f docker-compose-frontend.yml up -d --pull never

    # Wait briefly for webapp to report healthy. Webapp boot is fast
    # (~5–10 s) so we cap the wait to 60 s rather than the 120 s we
    # used to wait for the NLP container.
    echo "  Waiting for webapp healthcheck (up to 60s) ..."
    DEADLINE=$((SECONDS + 60))
    STATUS=missing
    while [[ $SECONDS -lt $DEADLINE ]]; do
        STATUS=$(docker inspect --format '{{.State.Health.Status}}' prostatecancer-webapp-native 2>/dev/null || echo "missing")
        if [[ "$STATUS" == "healthy" ]]; then
            echo "  ✓ webapp healthy"
            break
        fi
        sleep 3
    done

    if [[ "$STATUS" != "healthy" ]]; then
        warn "webapp not healthy yet — proceeding anyway. Check: docker logs prostatecancer-webapp-native"
    fi
else
    section "Skipping Docker (--skip-docker)"
fi

# ── 2. Backend native (foreground) ──────────────────────────────────────────
section "Starting native Backend"
exec bash "$SCRIPT_DIR/run-backend.sh" ${BACKEND_ARGS[@]+"${BACKEND_ARGS[@]}"}
