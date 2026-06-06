#!/usr/bin/env bash
# ============================================================================
#  run-webapp.sh — dashboard webapp entry point (Phase 3)
#
#  Brings up ONLY the Docker webapp container (docker-compose-frontend.yml).
#  This is the Phase-3 counterpart to run-backend.sh (Phase 1, native
#  uvicorn). The two are independent: the webapp container serves the UI and
#  proxies API calls to the native backend at request time, so it can start
#  on its own — but patient/doctor data only appears once the backend
#  (Phase 1) is also up.
#
#  The NLP classifier is NOT touched here (it is a Phase-2 write-time asset
#  of the sibling AI repo). Postgres/redis are not touched either.
#
#  Usage:
#    bash app/Webapp/scripts/run-webapp.sh            # start the webapp container
#    bash app/Webapp/scripts/run-webapp.sh --build    # rebuild the image first (after code changes)
#
#  Stop:
#    docker compose -f docker-compose-frontend.yml stop webapp
#
#  3-phase split:
#    Phase 1 (DB + Backend):  bash app/Backend/scripts/run-backend.sh        # :18000
#    Phase 2 (Transcripts):   cd ../AI_..._communication && bash scripts/run-pipeline-watch.sh
#    Phase 3 (Webapp):        bash app/Webapp/scripts/run-webapp.sh         # :3001  ← this script
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This script lives in app/Webapp/scripts/, so the repo root is THREE levels up
# (scripts/ -> app/Webapp/ -> app/ -> repo root). cd there so the relative paths
# below (docker-compose-frontend.yml, app/Webapp/.env, app/Backend/.env) work.
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

GREEN="\033[92m"; YELLOW="\033[93m"; BOLD="\033[1m"; RESET="\033[0m"
section() { echo ""; echo -e "${BOLD}${GREEN}=== $1 ===${RESET}"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET} $1"; }

COMPOSE_FILE="docker-compose-frontend.yml"
CONTAINER="prostatecancer-webapp-native"

# ── Args ────────────────────────────────────────────────────────────────────
BUILD=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build) BUILD=1; shift ;;
        -h|--help)
            grep -E '^#( |$)' "$0" | sed 's/^# \?//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# ── 0. Sanity ──────────────────────────────────────────────────────────────
if [[ ! -f app/Webapp/.env ]]; then
    warn "app/Webapp/.env missing — copying from .example"
    cp app/Webapp/.env.example app/Webapp/.env
fi

# Export the env vars docker-compose-frontend.yml interpolates (e.g. `${API_KEY}`).
# Without this, compose substitutes empty strings — the webapp boots without an
# API key and every backend call fails (UI shows "No patients found" /
# "Loading..."). Same reason run-frontend-backend.sh sources it.
if [[ -f app/Backend/.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source app/Backend/.env
    set +a
else
    warn "app/Backend/.env missing — compose interpolation (\${API_KEY}) will be empty"
fi

# ── 1. (Optional) build ─────────────────────────────────────────────────────
if [[ $BUILD -eq 1 ]]; then
    section "Building webapp image"
    docker compose -f "$COMPOSE_FILE" build webapp
fi

# ── 2. Start the webapp container ────────────────────────────────────────────
section "Starting Docker (webapp only)"
docker compose -f "$COMPOSE_FILE" up -d --pull never webapp

# ── 3. Wait for healthy ──────────────────────────────────────────────────────
echo "  Waiting for webapp healthcheck (up to 60s) ..."
DEADLINE=$((SECONDS + 60))
STATUS=missing
while [[ $SECONDS -lt $DEADLINE ]]; do
    STATUS=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    [[ "$STATUS" == "healthy" ]] && { echo "  ✓ webapp healthy"; break; }
    sleep 3
done
[[ "$STATUS" != "healthy" ]] && warn "webapp not healthy yet — check: docker logs $CONTAINER"

echo ""
echo -e "${BOLD}${GREEN}  Webapp up:${RESET}  http://localhost:3001"
echo "  (Patient/doctor data needs the backend — Phase 1: bash app/Backend/scripts/run-backend.sh)"
