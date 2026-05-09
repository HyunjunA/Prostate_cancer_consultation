#!/usr/bin/env bash
# ============================================================================
#  Native deployment setup — Linux (Ubuntu 20.04+ / Debian 11+)
#
#  Installs PostgreSQL 16, Redis, Python 3.10, and creates a Python venv
#  with the backend's requirements.
#
#  R is intentionally NOT installed here. The pipeline's only R use is
#  sentence segmentation via stringi, which the segmentation.py library
#  routes through ``docker exec`` against the NLP-classifiers container
#  (R 4.5.1 + stringi 1.8.7 + ICU 74.2 — Michael's reference environment).
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

# ── Step 0: Detect Linux distribution ───────────────────────────────────────
section "Step 0: Detect environment"

if [[ "$(uname -s)" != "Linux" ]]; then
    fail "This script is for Linux only. For macOS, use setup-native-mac.sh"
fi

if ! command -v apt-get >/dev/null 2>&1; then
    fail "apt-get not found. This script supports Ubuntu/Debian only."
fi

if [[ $EUID -ne 0 ]]; then
    fail "Run with sudo: sudo bash scripts/setup-native-linux.sh"
fi

. /etc/os-release
info "Detected: $PRETTY_NAME"
ok "apt-get present"

if ! command -v docker >/dev/null 2>&1; then
    fail "Docker not installed. https://docs.docker.com/engine/install/"
fi
if ! docker info >/dev/null 2>&1; then
    warn "Docker daemon not running — start it before bringing up native mode (sudo systemctl start docker)"
else
    ok "Docker running"
fi

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

# ── Step 3: Python venv ─────────────────────────────────────────────────────
section "Step 3: Python venv + backend requirements"

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
ok "Backend requirements installed (rpy2 NOT included — segmentation uses docker exec)"

# ── Step 4: Final summary ───────────────────────────────────────────────────
section "Setup complete"

cat <<EOF

  Native components installed:
    postgresql-16   $(psql --version 2>/dev/null | head -1)
    redis           $(redis-cli --version 2>/dev/null | head -1)
    python          $(python3.10 --version 2>/dev/null)
    venv            $VENV_DIR  (owner: $REPO_OWNER)

  R is NOT installed on the host. Sentence segmentation calls stringi
  inside the NLP-classifiers Docker container via 'docker exec' —
  100% identical to Michael's reference (R 4.5.1 + stringi 1.8.7 + ICU 74.2).

  Next steps:
    1. cp app/Backend/.env.native.example app/Backend/.env.native
       (then edit POSTGRES_PASSWORD, AZURE_OPENAI_*, API_KEY)
    2. bash scripts/init-db-native.sh
    3. bash scripts/run-frontend-backend.sh
    4. python scripts/run-ai-nlp-pipeline.py --file ...

EOF
