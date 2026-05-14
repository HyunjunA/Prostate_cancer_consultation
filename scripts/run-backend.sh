#!/usr/bin/env bash
# ============================================================================
#  Backend FastAPI native launcher (Phase 3)
#
#  Runs the FastAPI backend as a native uvicorn process against the
#  native PostgreSQL + Redis (and the still-Docker NLP-classifiers).
#  No prestart.sh, no Docker for the backend itself.
#
#  Steps:
#    1. Source the venv
#    2. Load app/Backend/.env into the environment
#    3. Run scripts/preflight-native.sh (ICU, DB, redis, alembic)
#    4. exec uvicorn (or gunicorn in production-like mode)
#
#  Usage:
#    bash scripts/run-backend.sh                # foreground (Ctrl-C to stop)
#    bash scripts/run-backend.sh --reload       # dev: auto-reload on file change
#    bash scripts/run-backend.sh --workers 4    # multi-worker (default 3)
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 3)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"
ENV_FILE="$BACKEND_DIR/.env"

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
[[ -d "$VENV_DIR" ]] || { echo "✗ Python venv missing at $VENV_DIR — run setup-native-{mac,linux}.sh" >&2; exit 1; }

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
