#!/usr/bin/env bash
# ============================================================================
#  Native deployment setup — Linux (Ubuntu 20.04+ / Debian 11+)
#
#  Installs PostgreSQL 16, Redis, R 4.x with stringi 1.8.4 (ICU 74.1),
#  Python 3.10, and creates a Python venv with backend dependencies.
#
#  Usage:
#    chmod +x scripts/setup-native-linux.sh
#    sudo bash scripts/setup-native-linux.sh
#
#  Idempotent: re-running skips steps that are already done.
#  Requires sudo for apt and systemctl operations.
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md
# ============================================================================
set -euo pipefail

# ── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"

cd "$REPO_ROOT"

section() { echo ""; echo "==============================================================="; echo "  $1"; echo "==============================================================="; }
info()    { echo "  ▸ $1"; }
ok()      { echo "  ✓ $1"; }
fail()    { echo "  ✗ $1" >&2; exit 1; }

# ── Step 0: Detect Linux distribution ───────────────────────────────────────
section "Step 0: Detect environment"

if [[ "$(uname -s)" != "Linux" ]]; then
    fail "This script is for Linux only. For macOS, use setup-native-mac.sh"
fi

if ! command -v apt-get >/dev/null 2>&1; then
    fail "apt-get not found. This script supports Ubuntu/Debian only."
fi

# Need sudo for apt + systemctl
if [[ $EUID -ne 0 ]]; then
    fail "Run with sudo: sudo bash scripts/setup-native-linux.sh"
fi

. /etc/os-release
info "Detected: $PRETTY_NAME"
ok "apt-get present"

# ── Step 1: apt packages ────────────────────────────────────────────────────
section "Step 1: Install apt packages"

# Add PostgreSQL APT repo for postgresql-16
if ! apt-cache search ^postgresql-16$ >/dev/null 2>&1 || ! dpkg -l postgresql-16 >/dev/null 2>&1; then
    info "Adding PostgreSQL APT repository ..."
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates gnupg lsb-release
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] \
        https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
fi

info "Installing postgresql-16 ..."
apt-get install -y -qq postgresql-16 postgresql-contrib-16
ok "postgresql-16 installed"

info "Installing redis-server ..."
apt-get install -y -qq redis-server
ok "redis-server installed"

info "Installing python3.10 + venv ..."
apt-get install -y -qq python3.10 python3.10-venv python3.10-dev python3-pip
ok "python3.10 installed"

info "Installing R + build deps for stringi ..."
apt-get install -y -qq r-base r-base-dev libicu-dev gcc g++ make
ok "R + build deps installed"

# ── Step 2: Start services ──────────────────────────────────────────────────
section "Step 2: Start postgresql + redis services"

systemctl enable postgresql >/dev/null 2>&1
systemctl start postgresql
sleep 2
ok "postgresql started"

systemctl enable redis-server >/dev/null 2>&1
systemctl start redis-server
sleep 1
ok "redis-server started"

# ── Step 3: R stringi 1.8.4 (ICU 74.1) ──────────────────────────────────────
section "Step 3: R stringi 1.8.4 (ICU 74.1) — may take ~10 minutes"

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
    info "Compiling stringi 1.8.4 from source. Grab a coffee."
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

    ICU_VERSION=$(R --no-save --quiet -e 'cat(stringi::stri_info()$ICU.version)' 2>/dev/null | tail -1)
    if [[ "$ICU_VERSION" != "74.1" ]]; then
        fail "stringi compiled but ICU=$ICU_VERSION (expected 74.1). Pipeline tokenizer would diverge."
    fi
    ok "ICU 74.1 confirmed"
fi

# ── Step 4: Python venv ─────────────────────────────────────────────────────
section "Step 4: Python venv + backend requirements"

# Resolve to actual repo owner so the venv isn't owned by root
REPO_OWNER=$(stat -c '%U' "$REPO_ROOT")

run_as_owner() {
    if [[ "$REPO_OWNER" == "root" ]]; then
        bash -c "$*"
    else
        sudo -u "$REPO_OWNER" bash -c "$*"
    fi
}

if [[ -d "$VENV_DIR" ]]; then
    ok ".venv already exists at $VENV_DIR"
else
    info "Creating venv at $VENV_DIR (as $REPO_OWNER) ..."
    run_as_owner "python3.10 -m venv '$VENV_DIR'"
    ok ".venv created"
fi

info "Installing backend requirements ..."
run_as_owner "source '$VENV_DIR/bin/activate' && pip install --quiet --upgrade pip && pip install --quiet -r '$BACKEND_DIR/requirements.txt'"
ok "Backend requirements installed"

R_HOME_VALUE="$(R RHOME)"
if ! run_as_owner "source '$VENV_DIR/bin/activate' && python -c 'import rpy2'" 2>/dev/null; then
    info "Installing rpy2 with R_HOME=$R_HOME_VALUE"
    run_as_owner "source '$VENV_DIR/bin/activate' && R_HOME='$R_HOME_VALUE' pip install --quiet 'rpy2==3.5.11'"
fi
ok "rpy2 available (R_HOME=$R_HOME_VALUE)"

# ── Step 5: Final summary ───────────────────────────────────────────────────
section "Setup complete"

cat <<EOF

  Native components installed:
    postgresql-16   $(psql --version 2>/dev/null | head -1)
    redis           $(redis-cli --version 2>/dev/null | head -1)
    R               $(R --version 2>/dev/null | head -1)
    stringi         $(R --no-save --quiet -e 'cat(as.character(packageVersion("stringi")))' 2>/dev/null | tail -1) (ICU $(R --no-save --quiet -e 'cat(stringi::stri_info()\$ICU.version)' 2>/dev/null | tail -1))
    python          $(python3.10 --version 2>/dev/null)
    venv            $VENV_DIR  (owner: $REPO_OWNER)

  Next steps:
    1. Bootstrap the database:
         bash scripts/init-db-native.sh
    2. Start the backend:
         bash scripts/run-backend-native.sh
    3. Run the standalone pipeline:
         python scripts/run-pipeline-standalone.py --file data/transcripts/SID_10.xlsx

EOF
