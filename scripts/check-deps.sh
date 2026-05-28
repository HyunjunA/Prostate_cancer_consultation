#!/usr/bin/env bash
# ============================================================================
#  Native deployment — dependency checker (macOS + Linux)
#
#  Verifies every component installed by setup-native-{mac,linux}.sh and
#  the NLP-classifiers Docker container that segmentation.py relies on.
#
#  Usage:
#    bash scripts/check-deps.sh
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 1 done-when criteria)
# ============================================================================
set -uo pipefail   # NOTE: no -e — keep checking after a failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$REPO_ROOT/.venv"
ENV_FILE="$REPO_ROOT/app/Backend/.env"

# Pull POSTGRES_HOST/PORT, REDIS_HOST/PORT from .env if present so the
# checks below probe the same endpoints the actual stack uses (5433 / 6379 by
# default — see .env.example). Falls back to project defaults when the
# env file does not exist yet (e.g. running check-deps.sh before configure).
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi
PG_HOST="${POSTGRES_HOST:-localhost}"
PG_PORT="${POSTGRES_PORT:-5433}"
RD_HOST="${REDIS_HOST:-localhost}"
RD_PORT="${REDIS_PORT:-6379}"

# postgres@16 is brew keg-only on macOS — prepend its bin to PATH so
# pg_isready/psql work without requiring users to edit ~/.zshrc.
if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
    [[ -d "$PG_BIN" && ":$PATH:" != *":$PG_BIN:"* ]] && export PATH="$PG_BIN:$PATH"
fi

# ── Pretty print ────────────────────────────────────────────────────────────
GREEN="\033[92m"; RED="\033[91m"; YELLOW="\033[93m"; BOLD="\033[1m"; RESET="\033[0m"
PASS_COUNT=0
FAIL_COUNT=0

pass() { echo -e "  ${GREEN}[PASS]${RESET} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo -e "  ${RED}[FAIL]${RESET} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn() { echo -e "  ${YELLOW}[WARN]${RESET} $1"; }

check_cmd() {
    local cmd="$1" version_flag="${2:---version}"
    if command -v "$cmd" >/dev/null 2>&1; then
        local v; v=$("$cmd" $version_flag 2>&1 | head -1)
        pass "$cmd present: $v"
    else
        fail "$cmd not found in PATH"
    fi
}

echo ""
echo -e "${BOLD}=== Native deployment — dependency check ===${RESET}"
echo ""

# ── 1. Native binaries ──────────────────────────────────────────────────────
echo "─── 1. Native binaries ────────────────────"
check_cmd psql --version
check_cmd redis-cli --version
check_cmd redis-server --version
check_cmd python3.10 --version
echo ""

# ── 2. Postgres reachability ────────────────────────────────────────────────
echo "─── 2. PostgreSQL reachability ────────────"
if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h "$PG_HOST" -p "$PG_PORT" -q 2>/dev/null; then
        pass "postgres listening on $PG_HOST:$PG_PORT"
    else
        fail "postgres NOT reachable on $PG_HOST:$PG_PORT (is it running?)"
    fi
else
    warn "pg_isready not on PATH — skipped"
fi
echo ""

# ── 3. Redis reachability ───────────────────────────────────────────────────
echo "─── 3. Redis reachability ─────────────────"
if redis-cli -h "$RD_HOST" -p "$RD_PORT" ping 2>/dev/null | grep -q PONG; then
    pass "redis responds PONG on $RD_HOST:$RD_PORT"
else
    fail "redis NOT reachable on $RD_HOST:$RD_PORT (is it running?)"
fi
echo ""

# ── 4. Python venv + key libs ───────────────────────────────────────────────
echo "─── 4. Python venv + key libs ─────────────"
if [[ -d "$VENV_DIR" ]]; then
    pass ".venv exists at $VENV_DIR"
else
    fail ".venv missing at $VENV_DIR"
fi

if [[ -x "$VENV_DIR/bin/python" ]]; then
    PY_VER=$("$VENV_DIR/bin/python" --version 2>&1)
    pass "venv python: $PY_VER"

    # rpy2 is intentionally NOT required — segmentation uses docker exec
    for pkg in fastapi sqlalchemy asyncpg pandas openpyxl; do
        if "$VENV_DIR/bin/python" -c "import $pkg" 2>/dev/null; then
            v=$("$VENV_DIR/bin/python" -c "import $pkg; print(getattr($pkg, '__version__', '?'))" 2>/dev/null)
            pass "venv has $pkg ($v)"
        else
            fail "venv missing $pkg"
        fi
    done
else
    fail "venv python not executable"
fi
echo ""

# ── 5. Docker + NLP container ───────────────────────────────────────────────
echo "─── 5. Docker + NLP container ─────────────"
if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
        pass "Docker daemon running"
    else
        fail "Docker installed but daemon not running (start Docker Desktop)"
    fi

    # NLP container — required for segmentation (docker exec → R + stringi)
    NLP_CONTAINER="${STRINGI_DOCKER_CONTAINER:-prostatecancer-nlp-native}"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$NLP_CONTAINER"; then
        pass "NLP container '$NLP_CONTAINER' running"

        # Probe stringi version via docker exec
        STRINGI_INFO=$(docker exec "$NLP_CONTAINER" Rscript -e \
            'cat(sprintf("stringi %s, ICU %s",
                        packageVersion("stringi"),
                        stringi::stri_info()$ICU.version))' 2>/dev/null || echo "")
        if [[ -n "$STRINGI_INFO" ]]; then
            pass "docker exec stringi probe: $STRINGI_INFO"
        else
            fail "docker exec stringi probe failed"
        fi
    else
        warn "NLP container '$NLP_CONTAINER' not running — segmentation will fail until you start it (bash scripts/run-frontend-backend.sh)"
    fi
else
    fail "Docker not installed — required for NLP-classifiers + webapp containers"
fi
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}=== Summary ===${RESET}"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}PASS${RESET}  $PASS_COUNT/$TOTAL checks passed"
    echo ""
    echo "  Native environment is ready. Next:"
    echo "    bash scripts/init-db-native.sh    # bootstrap database (if not done)"
    echo "    bash scripts/run-frontend-backend.sh        # start everything"
    exit 0
else
    echo -e "  ${RED}${BOLD}FAIL${RESET}  $PASS_COUNT/$TOTAL passed, $FAIL_COUNT failed"
    echo ""
    echo "  Re-run the appropriate setup script:"
    echo "    bash scripts/setup-native-mac.sh   # macOS"
    echo "    sudo bash scripts/setup-native-linux.sh   # Linux"
    exit 1
fi
