#!/usr/bin/env bash
# ============================================================================
#  run-native.sh — unified native-mode entry point (Phase 6)
#
#  Brings up the full native-mode stack:
#    - Native postgres + redis (already running via brew services)
#    - Docker NLP-classifiers + Docker webapp (docker-compose-minimal.yml)
#    - Native Backend FastAPI (uvicorn, foreground)
#
#  Usage:
#    bash scripts/run-native.sh                # foreground backend
#    bash scripts/run-native.sh --reload       # dev hot-reload
#    bash scripts/run-native.sh --skip-docker  # assume webapp+nlp already up
#    bash scripts/run-native.sh --backend-only # skip docker entirely
#
#  Stop:
#    Ctrl-C        # stops backend
#    docker compose -f docker-compose-minimal.yml down   # stops webapp+nlp
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 6)
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
if [[ ! -f app/Backend/.env.native ]]; then
    echo "✗ app/Backend/.env.native missing — copy from .env.native.example" >&2
    exit 1
fi

if [[ ! -f app/Webapp/.env.native && $BACKEND_ONLY -eq 0 ]]; then
    warn "app/Webapp/.env.native missing — copying from .example"
    cp app/Webapp/.env.native.example app/Webapp/.env.native
fi

# Export the env vars docker-compose-minimal.yml interpolates (e.g. `${API_KEY}`).
# Without this, compose substitutes empty strings — webapp boots without an
# API key and every backend call fails (manifests in the UI as
# "No patients found" / "Loading...").
if [[ -f app/Backend/.env.native ]]; then
    set -a
    # shellcheck disable=SC1091
    source app/Backend/.env.native
    set +a
fi

# ── 1. Start NLP + webapp Docker (unless skipped) ──────────────────────────
if [[ $SKIP_DOCKER -eq 0 ]]; then
    section "Starting Docker (NLP + webapp only)"

    # Load the NLP OCI archive into docker daemon if the image isn't there yet.
    # The archive lives in the sibling AI_physician_patient_communication repo
    # (where AI/NLP assets are kept, separate from dashboard infra).
    if ! docker image inspect r01-nlp-classifiers:latest >/dev/null 2>&1; then
        NLP_IMAGE_DIR="${NLP_IMAGE_DIR:-$REPO_ROOT/../AI_physician_patient_communication/nlp-classifiers/r01-nlp-classifiers-docker-image}"
        if [[ ! -d "$NLP_IMAGE_DIR" ]]; then
            echo "✗ NLP OCI archive not found at $NLP_IMAGE_DIR" >&2
            echo "  Set NLP_IMAGE_DIR env var or clone AI_physician_patient_communication." >&2
            exit 1
        fi
        echo "  ▸ Loading NLP image from $NLP_IMAGE_DIR ..."
        tar -cf /tmp/r01-nlp-classifiers.tar -C "$NLP_IMAGE_DIR" .
        docker load -i /tmp/r01-nlp-classifiers.tar
        rm -f /tmp/r01-nlp-classifiers.tar
        echo "  ✓ NLP image loaded"
    fi

    docker compose -f docker-compose-minimal.yml up -d
    echo "  Waiting for NLP healthcheck (up to 90s) ..."

    DEADLINE=$((SECONDS + 120))
    while [[ $SECONDS -lt $DEADLINE ]]; do
        STATUS=$(docker inspect --format '{{.State.Health.Status}}' prostatecancer-nlp-native 2>/dev/null || echo "missing")
        if [[ "$STATUS" == "healthy" ]]; then
            echo "  ✓ NLP healthy"
            break
        fi
        sleep 3
    done

    if [[ "$STATUS" != "healthy" ]]; then
        warn "NLP not healthy yet — proceeding anyway. Check: docker logs prostatecancer-nlp-native"
    fi
else
    section "Skipping Docker (--skip-docker)"
fi

# ── 2. Backend native (foreground) ──────────────────────────────────────────
section "Starting native Backend"
exec bash "$SCRIPT_DIR/run-backend-native.sh" ${BACKEND_ARGS[@]+"${BACKEND_ARGS[@]}"}
