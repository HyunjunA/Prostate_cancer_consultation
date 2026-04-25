#!/usr/bin/env bash
# ============================================================================
#  run-docker.sh — convenience wrapper for the existing Docker mode
#
#  Equivalent to:
#    docker compose -f app/Backend/docker-compose.yml up -d --build
#
#  Provided so users can ask "which mode am I in?" by looking at one
#  script per mode (run-docker.sh vs run-native.sh).
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
