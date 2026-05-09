#!/usr/bin/env bash
# ============================================================================
#  run-docker.sh — convenience wrapper for the existing Docker mode
#
#  Equivalent to:
#    docker compose -f app/Backend/docker-compose.yml up -d --build
#
#  Provided so users can ask "which mode am I in?" by looking at one
#  script per mode (run-docker.sh vs run-frontend-backend.sh).
#
#  Usage:
#    bash scripts/run-docker.sh             # bring everything up
#    bash scripts/run-docker.sh --logs       # tail backend logs
#    bash scripts/run-docker.sh --down       # stop everything
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 6, two-mode coexistence)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/app/Backend/docker-compose.yml"

cd "$REPO_ROOT"

case "${1:-up}" in
    up)
        # Block macOS sleep for the next hour. The Backend image build (R +
        # stringi compile) plus the prestart auto-pipeline (Azure OpenAI for
        # 5 domains) easily runs 15-25 min, and a sleeping Mac suspends
        # Docker Desktop's outbound network mid-call — observed once as a
        # 30-min ConnectTimeout on a single sentence. `caffeinate -di`
        # keeps the host awake without touching system settings; the -t
        # cap means the lock self-releases even if the script crashes.
        if command -v caffeinate >/dev/null 2>&1; then
            caffeinate -di -t 3600 &
            echo "  ✓ caffeinate started (PID $!) — Mac sleep blocked for 1h"
        fi

        docker compose -f "$COMPOSE_FILE" up -d --build
        echo ""
        echo "  Dashboard:  http://localhost:3001"
        echo "  API docs:   http://localhost:8000/docs"
        echo "  Logs:       bash scripts/run-docker.sh --logs"
        ;;
    --down|down)
        docker compose -f "$COMPOSE_FILE" down
        ;;
    --logs|logs)
        docker compose -f "$COMPOSE_FILE" logs -f backend
        ;;
    -h|--help)
        grep -E '^#( |$)' "$0" | sed 's/^# \?//'
        ;;
    *)
        echo "Unknown arg: $1" >&2
        echo "Usage: bash scripts/run-docker.sh [up|down|logs]" >&2
        exit 2
        ;;
esac
