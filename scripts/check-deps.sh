#!/usr/bin/env bash
# ============================================================================
#  Native deployment — dependency checker (macOS + Linux)
#
#  Verifies every component installed by setup-native-{mac,linux}.sh.
#  Exits 0 on full pass, 1 on any failure.
#
#  Usage:
#    bash scripts/check-deps.sh
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 1 done-when criteria)
# ============================================================================
set -uo pipefail   # NOTE: no -e — we want to keep checking after a failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$REPO_ROOT/.venv"

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

# ── Header ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Native deployment — dependency check ===${RESET}"
echo ""

# ── 1. Binaries ─────────────────────────────────────────────────────────────
echo "─── 1. Binaries ────────────────────────────"
check_cmd psql --version
check_cmd redis-cli --version
check_cmd redis-server --version
check_cmd R --version
check_cmd python3.10 --version
echo ""

# ── 2. Postgres reachability ────────────────────────────────────────────────
echo "─── 2. PostgreSQL reachability ────────────"
if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -h localhost -p 5432 -q 2>/dev/null; then
        pass "postgres listening on localhost:5432"
    else
        fail "postgres NOT reachable on localhost:5432 (is it running?)"
    fi
else
    warn "pg_isready not on PATH — skipped"
fi
echo ""

# ── 3. Redis reachability ───────────────────────────────────────────────────
echo "─── 3. Redis reachability ─────────────────"
if redis-cli -h localhost -p 6379 ping 2>/dev/null | grep -q PONG; then
    pass "redis responds PONG on localhost:6379"
else
    fail "redis NOT reachable on localhost:6379 (is it running?)"
fi
echo ""

# ── 4. R stringi 1.8.4 + ICU 74.1 ───────────────────────────────────────────
echo "─── 4. R stringi 1.8.4 + ICU 74.1 ─────────"
STRINGI_VER=$(R --no-save --quiet -e 'cat(as.character(packageVersion("stringi")))' 2>/dev/null | tail -1)
if [[ "$STRINGI_VER" == "1.8.4" ]]; then
    pass "stringi version: $STRINGI_VER"
else
    fail "stringi version: $STRINGI_VER (expected 1.8.4)"
fi

ICU_VER=$(R --no-save --quiet -e 'cat(stringi::stri_info()$ICU.version)' 2>/dev/null | tail -1)
if [[ "$ICU_VER" == "74.1" ]]; then
    pass "ICU version: $ICU_VER"
else
    fail "ICU version: $ICU_VER (expected 74.1) — sentence segmentation will diverge"
fi
echo ""

# ── 5. Python venv + key libs ───────────────────────────────────────────────
echo "─── 5. Python venv + key libs ─────────────"
if [[ -d "$VENV_DIR" ]]; then
    pass ".venv exists at $VENV_DIR"
else
    fail ".venv missing at $VENV_DIR"
fi

if [[ -x "$VENV_DIR/bin/python" ]]; then
    PY_VER=$("$VENV_DIR/bin/python" --version 2>&1)
    pass "venv python: $PY_VER"

    for pkg in fastapi sqlalchemy asyncpg pandas openpyxl rpy2; do
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

# ── 6. Optional — Docker for NLP + webapp ───────────────────────────────────
echo "─── 6. Optional: Docker (for NLP + webapp) ─"
if command -v docker >/dev/null 2>&1; then
    if docker info >/dev/null 2>&1; then
        pass "Docker available + daemon running"
    else
        warn "Docker installed but daemon not running (start Docker Desktop)"
    fi
else
    warn "Docker not installed — required only for NLP-classifiers + webapp containers"
fi
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}=== Summary ===${RESET}"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}PASS${RESET}  $PASS_COUNT/$TOTAL checks passed"
    echo ""
    echo "  Native environment is ready. Next:"
    echo "    bash scripts/init-db-native.sh    # bootstrap database"
    exit 0
else
    echo -e "  ${RED}${BOLD}FAIL${RESET}  $PASS_COUNT/$TOTAL passed, $FAIL_COUNT failed"
    echo ""
    echo "  Re-run the appropriate setup script:"
    echo "    bash scripts/setup-native-mac.sh   # macOS"
    echo "    sudo bash scripts/setup-native-linux.sh   # Linux"
    exit 1
fi
