#!/usr/bin/env bash
# ============================================================================
#  run-backend.sh — Backend API launcher  (Phase 1: DB + Backend)
#
#  WHAT IT DOES
#    Starts the FastAPI backend as a NATIVE uvicorn process (no Docker for the
#    backend itself) on http://localhost:18000. This is the API the webapp
#    (Phase 3) proxies every request to, and it reads/writes the same native
#    PostgreSQL that the transcript pipeline (Phase 2) populates.
#
#  WHAT IT DOES *NOT* TOUCH
#    Only the backend. It does NOT start the webapp container, the NLP
#    classifier, Postgres, or Redis. Postgres + Redis are expected to already
#    be running (native brew services); the webapp is Phase 3 (run-webapp.sh);
#    the NLP classifier is a Phase-2 concern of the sibling AI repo. The
#    dashboard backend never calls the NLP classifier at request time.
#
#  STEPS, IN ORDER
#    1. Put postgres@16's bin on PATH (it is keg-only on macOS) so the
#       preflight check's psql / pg_isready work.
#    2. Load app/Backend/.env (DB URL, Azure keys, port, ...).
#    3. Activate the Python venv, and add the sibling AI repo to PYTHONPATH so
#       the doctor "Try & Score" / "AI Rewrite" routes can import ai_pipeline.*.
#    4. Run preflight-native.sh — verify Postgres auth, alembic at head, redis.
#    5. exec uvicorn main:app on :18000 (foreground; Ctrl-C to stop).
#
#  THREE-PHASE NATIVE DEPLOYMENT (each phase runs on its own)
#    Phase 1 (DB + Backend):  bash app/Backend/scripts/run-backend.sh        # :18000  <- this
#    Phase 2 (Transcripts):   cd ../AI_physician_patient_communication \
#                                  && bash scripts/run-pipeline-watch.sh  # NLP+AI -> DB
#    Phase 3 (Webapp):        bash app/Webapp/scripts/run-webapp.sh         # :3001
#
#  USAGE
#    bash app/Backend/scripts/run-backend.sh                # foreground (Ctrl-C to stop)
#    bash app/Backend/scripts/run-backend.sh --reload       # dev: auto-reload on file change
#    bash app/Backend/scripts/run-backend.sh --workers 4    # multi-worker (default 3)
#    # long-running / detached (avoids idle SIGTERM in some shells):
#    nohup bash app/Backend/scripts/run-backend.sh > /tmp/backend.log 2>&1 & disown
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This script lives in app/Backend/scripts/, so the repo root is THREE levels
# up (scripts/ -> app/Backend/ -> app/ -> repo root).
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"
ENV_FILE="$BACKEND_DIR/.env"

# postgres@16 is brew keg-only on macOS — prepend its bin to PATH so the
# child preflight-native.sh's pg_isready/psql work without user shell edits.
if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
    [[ -d "$PG_BIN" && ":$PATH:" != *":$PG_BIN:"* ]] && export PATH="$PG_BIN:$PATH"
fi

# ── Defaults / arg parsing ──────────────────────────────────────────────────
WORKERS=3
RELOAD=0
HOST="0.0.0.0"
PORT_OVERRIDE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --reload)
            RELOAD=1
            shift
            ;;
        --workers)
            WORKERS="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        --port)
            PORT_OVERRIDE="$2"
            shift 2
            ;;
        -h|--help)
            grep -E '^#( |$)' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown arg: $1" >&2
            exit 2
            ;;
    esac
done

# ── Sanity ──────────────────────────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || { echo "✗ $ENV_FILE not found — copy from .env.example" >&2; exit 1; }
[[ -d "$VENV_DIR" ]] || { echo "✗ Python venv missing at $VENV_DIR — run app/Backend/scripts/setup-native-{mac,linux}.sh" >&2; exit 1; }

# ── Load env (POSTGRES_*, AZURE_*, NLP_API_URL, PORT, ...) ──────────────────
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

PORT="${PORT_OVERRIDE:-${PORT:-18000}}"

# ── Activate venv ───────────────────────────────────────────────────────────
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# rpy2 needs R_HOME on macOS Apple Silicon
export R_HOME="${R_HOME:-$(R RHOME 2>/dev/null || true)}"

# ── PYTHONPATH: sibling AI repo so backend can import ai_pipeline.* ─────────
# Used by routes_doctor.py for request-time Try & Score and AI Rewrite:
#   from ai_pipeline.llm import call_llm
#   from ai_pipeline.utils.prompts import load_prompt
# Without this, those imports fail at request time and the route returns 503.
AI_REPO_DIR="$REPO_ROOT/../AI_physician_patient_communication"
if [[ -d "$AI_REPO_DIR" ]]; then
    export PYTHONPATH="$AI_REPO_DIR${PYTHONPATH:+:$PYTHONPATH}"
fi

# ── Preflight ───────────────────────────────────────────────────────────────
# preflight-native.sh now lives alongside this script in app/Backend/scripts/.
bash "$SCRIPT_DIR/preflight-native.sh"

# ── Launch ──────────────────────────────────────────────────────────────────
echo ""
echo "==============================================================="
echo "  Backend FastAPI (native) starting"
echo "==============================================================="
echo "  host:     $HOST"
echo "  port:     $PORT"
echo "  workers:  $WORKERS"
echo "  reload:   $([[ $RELOAD -eq 1 ]] && echo yes || echo no)"
echo "  app:      main:app"
echo "  cwd:      $BACKEND_DIR"
echo ""
echo "  Open: http://localhost:$PORT/docs"
echo "  Stop: Ctrl-C"
echo ""

cd "$BACKEND_DIR"

if [[ "$RELOAD" -eq 1 ]]; then
    exec uvicorn main:app --host "$HOST" --port "$PORT" --reload
else
    exec uvicorn main:app --host "$HOST" --port "$PORT" --workers "$WORKERS"
fi
