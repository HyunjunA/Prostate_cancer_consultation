#!/usr/bin/env bash
# ============================================================================
#  Native deployment setup — macOS (Apple Silicon + Intel)
#
#  Installs PostgreSQL 16, Redis, Python 3.10, and creates a Python venv
#  with the backend's requirements.
#
#  R is intentionally NOT installed here. The pipeline's only R use is
#  sentence segmentation via stringi, which the segmentation.py library
#  routes through ``docker exec`` against the NLP-classifiers container
#  (R 4.5.1 + stringi 1.8.7 + ICU 74.2 — Michael's reference environment).
#  That avoids the R 4.5 + Apple clang 17 stringi compile bug entirely.
#
#  Usage:
#    chmod +x scripts/setup-native-mac.sh
#    bash scripts/setup-native-mac.sh
#
#  Idempotent: re-running skips steps that are already done.
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"

cd "$REPO_ROOT"

section() { echo ""; echo "==============================================================="; echo "  $1"; echo "==============================================================="; }
info()    { echo "  ▸ $1"; }
ok()      { echo "  ✓ $1"; }
warn()    { echo "  ⚠ $1"; }
fail()    { echo "  ✗ $1" >&2; exit 1; }

# ── Detect macOS + brew prefix ──────────────────────────────────────────────
section "Step 0: Detect environment"

if [[ "$(uname -s)" != "Darwin" ]]; then
    fail "This script is for macOS only. For Linux, use setup-native-linux.sh"
fi

if [[ "$(uname -m)" == "arm64" ]]; then
    BREW_PREFIX="/opt/homebrew"
    info "Detected Apple Silicon (arm64). brew prefix: $BREW_PREFIX"
else
    BREW_PREFIX="/usr/local"
    info "Detected Intel (x86_64). brew prefix: $BREW_PREFIX"
fi

if ! command -v brew >/dev/null 2>&1; then
    fail "Homebrew not found. Install from https://brew.sh first."
fi
ok "brew present at $(which brew)"

if ! command -v docker >/dev/null 2>&1; then
    fail "Docker CLI not on PATH. Install Docker Desktop (https://docker.com)."
fi
if ! docker info >/dev/null 2>&1; then
    warn "Docker daemon not running — start Docker Desktop before bringing up native mode"
else
    ok "Docker Desktop running"
fi

# ── Helper ──────────────────────────────────────────────────────────────────
brew_ensure() {
    local pkg="$1"
    if brew list --formula 2>/dev/null | grep -qx "$pkg"; then
        ok "$pkg already installed"
    else
        info "Installing $pkg ..."
        brew install "$pkg"
        ok "$pkg installed"
    fi
}

# ── Step 1: brew packages ───────────────────────────────────────────────────
section "Step 1: Install brew packages"

brew_ensure postgresql@16
brew_ensure redis
brew_ensure python@3.10

# Add postgresql@16 to PATH for this script
export PATH="$BREW_PREFIX/opt/postgresql@16/bin:$PATH"

# Pin postgres@16 to port 5433 to avoid the 5432 collision with system-wide
# EDB-style installs (Postgres.app, /Library/PostgreSQL/*). Idempotent —
# only appends `port = 5433` if the line is not already there. Matches the
# default in app/Backend/.env.example so nothing else needs editing.
PG_CONF="$BREW_PREFIX/var/postgresql@16/postgresql.conf"
if [[ -f "$PG_CONF" ]] && ! grep -q "^port = 5433" "$PG_CONF"; then
    echo "port = 5433" >> "$PG_CONF"
    ok "set port = 5433 in postgresql.conf"
else
    ok "postgres port already configured (or conf not yet created)"
fi

# ── Step 2: Start postgres + redis services ─────────────────────────────────
section "Step 2: Start postgresql@16 and redis services"

if brew services list | grep -E "^postgresql@16" | grep -q "started"; then
    ok "postgresql@16 already running"
else
    info "Starting postgresql@16 ..."
    brew services start postgresql@16
    sleep 3
    ok "postgresql@16 started"
fi

if brew services list | grep -E "^redis" | grep -q "started"; then
    ok "redis already running"
else
    info "Starting redis ..."
    brew services start redis
    sleep 1
    ok "redis started"
fi

# ── Step 3: Python venv ─────────────────────────────────────────────────────
section "Step 3: Python venv + backend requirements"

PYTHON_BIN="$BREW_PREFIX/opt/python@3.10/bin/python3.10"
if [[ ! -x "$PYTHON_BIN" ]]; then
    fail "python3.10 not found at $PYTHON_BIN — re-run brew install python@3.10"
fi

if [[ -d "$VENV_DIR" ]]; then
    ok ".venv already exists at $VENV_DIR"
else
    info "Creating venv at $VENV_DIR ..."
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    ok ".venv created"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
info "Installing backend requirements ..."
pip install --quiet --upgrade pip
pip install --quiet -r "$BACKEND_DIR/requirements.txt"
ok "Backend requirements installed (rpy2 NOT included — segmentation uses docker exec)"

# ── Step 4: Final summary ───────────────────────────────────────────────────
section "Setup complete"

cat <<EOF

  Native components installed:
    postgresql@16   $(psql --version 2>/dev/null | head -1)
    redis           $(redis-cli --version 2>/dev/null | head -1)
    python          $("$PYTHON_BIN" --version 2>/dev/null)
    venv            $VENV_DIR

  R is NOT installed on the host. Sentence segmentation calls stringi
  inside the NLP-classifiers Docker container via 'docker exec' —
  100% identical to Michael's reference (R 4.5.1 + stringi 1.8.7 + ICU 74.2).

  Next steps:
    1. cp app/Backend/.env.example app/Backend/.env
       (then edit POSTGRES_PASSWORD, AZURE_OPENAI_*, API_KEY)
    2. bash scripts/init-db-native.sh     # bootstrap database
    3. bash scripts/run-frontend-backend.sh         # start everything
    4. (separate terminal) source .venv/bin/activate &&
       python scripts/run-ai-nlp-pipeline.py --file ...

EOF
