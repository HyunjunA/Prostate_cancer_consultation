#!/usr/bin/env bash
# watch-tests.sh — re-run the backend test suite whenever a Python file changes.
#
# Usage:
#   bash scripts/watch-tests.sh                 # default: not e2e (fast feedback)
#   bash scripts/watch-tests.sh tests/test_db.py  # narrower target
#   bash scripts/watch-tests.sh -- -k scores      # extra pytest args
#
# Why this exists: pytest-watch (`ptw`) re-runs pytest on save. Pairing it
# with `-m "not e2e"` keeps the cycle under ~10s so you get tight feedback
# while editing — without firing the long e2e path that needs the whole
# infrastructure stack up.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PY="$REPO_ROOT/.venv/bin/python"
PTW="$REPO_ROOT/.venv/bin/ptw"
BACKEND_DIR="$REPO_ROOT/app/Backend"

if [[ ! -x "$PTW" ]]; then
    echo "✗ pytest-watch not installed in venv. Run:"
    echo "    $REPO_ROOT/.venv/bin/pip install pytest-watch"
    exit 1
fi

# Source the dev env so tests find DATABASE_URL etc.
if [[ -f "$BACKEND_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$BACKEND_DIR/.env"
    set +a
fi

# Sibling repo path: sentence_classification lives in the AI repo; tests need
# to be able to import from it. Same path the backend uses at runtime.
export PYTHONPATH="$BACKEND_DIR/../../../AI_physician_patient_communication:$BACKEND_DIR"

cd "$BACKEND_DIR"

# Default target if no positional arg: full unit + integration suite, not e2e.
TARGET="tests/"
PYTEST_ARGS=()
WATCH_PATHS=("$BACKEND_DIR")

# Parse args: anything before "--" is a target, anything after is forwarded to pytest.
positional=()
forward=()
saw_dashdash=0
for arg in "$@"; do
    if [[ "$arg" == "--" ]]; then
        saw_dashdash=1
        continue
    fi
    if (( saw_dashdash )); then
        forward+=("$arg")
    else
        positional+=("$arg")
    fi
done

if (( ${#positional[@]} > 0 )); then
    TARGET="${positional[*]}"
fi

# Always exclude e2e from the watcher loop — they need the full infra running
# and they're too slow for save-driven cycles.
echo "── pytest-watch: $TARGET (excluding e2e) ──"
echo "  Press Ctrl-C to stop."

exec "$PTW" \
    "${WATCH_PATHS[@]}" \
    --runner "$VENV_PY -m pytest" \
    -- \
    $TARGET \
    -m "not e2e" \
    -q --tb=line \
    "${forward[@]}"
