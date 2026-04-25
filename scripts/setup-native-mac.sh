#!/usr/bin/env bash
# ============================================================================
#  Native deployment setup — macOS (Apple Silicon + Intel)
#
#  Installs PostgreSQL 16, Redis, R 4.x with stringi 1.8.4 (ICU 74.1),
#  Python 3.10, and creates a Python venv with backend dependencies.
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

# ── Paths (relative to repo root) ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"

cd "$REPO_ROOT"

# ── Pretty print ────────────────────────────────────────────────────────────
section() { echo ""; echo "==============================================================="; echo "  $1"; echo "==============================================================="; }
info()    { echo "  ▸ $1"; }
ok()      { echo "  ✓ $1"; }
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

# ── Helper: install brew package only if missing ────────────────────────────
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
brew_ensure r
brew_ensure python@3.10

# Add postgresql@16 to PATH for this script
export PATH="$BREW_PREFIX/opt/postgresql@16/bin:$PATH"

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

# ── Step 3: R stringi 1.8.4 (ICU 74.1) ──────────────────────────────────────
section "Step 3: R stringi 1.8.4 (ICU 74.1) — may take ~10 minutes"

# Skip if already installed at the right version
ALREADY_HAS_STRINGI=$(R --no-save --quiet -e 'cat(as.character(packageVersion("stringi")))' 2>/dev/null | tail -1 || echo "")
if [[ "$ALREADY_HAS_STRINGI" == "1.8.4" ]]; then
    ICU_VERSION=$(R --no-save --quiet -e 'cat(stringi::stri_info()$ICU.version)' 2>/dev/null | tail -1)
    if [[ "$ICU_VERSION" == "74.1" ]]; then
        ok "stringi 1.8.4 with ICU 74.1 already installed — skipping compile"
    else
        info "stringi 1.8.4 found but ICU=$ICU_VERSION (need 74.1) — recompiling"
        ALREADY_HAS_STRINGI=""
    fi
fi

if [[ "$ALREADY_HAS_STRINGI" != "1.8.4" ]]; then
    info "Compiling stringi 1.8.4 from source (CRAN archive). Grab a coffee."
    R --no-save --quiet <<'REOF'
install.packages(
    "https://cloud.r-project.org/src/contrib/Archive/stringi/stringi_1.8.4.tar.gz",
    repos = NULL,
    type = "source",
    quiet = TRUE,
    configure.args = "--disable-pkg-config --disable-cxx11"
)
REOF
    ok "stringi 1.8.4 compiled"

    # Verify ICU version
    ICU_VERSION=$(R --no-save --quiet -e 'cat(stringi::stri_info()$ICU.version)' 2>/dev/null | tail -1)
    if [[ "$ICU_VERSION" != "74.1" ]]; then
        fail "stringi compiled but ICU=$ICU_VERSION (expected 74.1). Pipeline tokenizer would diverge from the reference."
    fi
    ok "ICU 74.1 confirmed"
fi

# ── Step 4: Python venv ─────────────────────────────────────────────────────
section "Step 4: Python venv + backend requirements"

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
ok "Backend requirements installed"

# rpy2 needs R_HOME to find the brew-installed R
export R_HOME="$(R RHOME)"
if ! python -c "import rpy2" 2>/dev/null; then
    info "rpy2 not yet installed — installing with R_HOME=$R_HOME"
    R_HOME="$R_HOME" pip install --quiet "rpy2==3.5.11"
fi
ok "rpy2 available (R_HOME=$R_HOME)"

# ── Step 5: Final summary ───────────────────────────────────────────────────
section "Setup complete"

cat <<EOF

  Native components installed:
    postgresql@16   $(psql --version 2>/dev/null | head -1)
    redis           $(redis-cli --version 2>/dev/null | head -1)
    R               $(R --version 2>/dev/null | head -1)
    stringi         $(R --no-save --quiet -e 'cat(as.character(packageVersion("stringi")))' 2>/dev/null | tail -1) (ICU $(R --no-save --quiet -e 'cat(stringi::stri_info()\$ICU.version)' 2>/dev/null | tail -1))
    python          $("$PYTHON_BIN" --version 2>/dev/null)
    venv            $VENV_DIR

  Next steps:
    1. Bootstrap the database:
         bash scripts/init-db-native.sh
    2. Start the backend:
         bash scripts/run-backend-native.sh
    3. Run the standalone pipeline:
         python scripts/run-pipeline-standalone.py --file data/transcripts/SID_10.xlsx

EOF
