#!/usr/bin/env bash
# ============================================================================
#  check-connections.sh — verify all external dependencies for native mode
#
#  Pings PostgreSQL, Redis, NLP-classifiers (Docker), and Azure OpenAI.
#  Prints a coloured PASS/FAIL line per check and exits non-zero on any
#  failure so CI / scripts can branch on it.
#
#  Usage:
#    bash scripts/check-connections.sh
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 5)
# ============================================================================
set -uo pipefail   # no -e — keep checking after a failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/app/Backend/.env"
VENV_DIR="$REPO_ROOT/.venv"

GREEN="\033[92m"; RED="\033[91m"; YELLOW="\033[93m"; BOLD="\033[1m"; RESET="\033[0m"
PASS=0; FAIL=0
pass() { echo -e "  ${GREEN}[PASS]${RESET} $1"; PASS=$((PASS+1)); }
fail() { echo -e "  ${RED}[FAIL]${RESET} $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "  ${YELLOW}[WARN]${RESET} $1"; }

if [[ ! -f "$ENV_FILE" ]]; then
    fail ".env missing — copy from .env.example"
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo ""
echo -e "${BOLD}=== Connection checks (native mode) ===${RESET}"
echo ""

# ── 1. PostgreSQL ───────────────────────────────────────────────────────────
echo "─── 1. PostgreSQL ─────────"
if pg_isready -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5433}" -q 2>/dev/null; then
    if PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5433}" \
        -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -tAc "SELECT 1" >/dev/null 2>&1; then
        pass "postgres reachable + auth OK ($POSTGRES_HOST:$POSTGRES_PORT, db=$POSTGRES_DB)"
    else
        fail "postgres reachable but auth failed (check POSTGRES_PASSWORD)"
    fi
else
    fail "postgres NOT listening on $POSTGRES_HOST:$POSTGRES_PORT"
fi
echo ""

# ── 2. Redis ────────────────────────────────────────────────────────────────
echo "─── 2. Redis ─────────────"
if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q PONG; then
    pass "redis responds PONG (${REDIS_HOST:-localhost}:${REDIS_PORT:-6379})"
else
    warn "redis NOT reachable — backend will run with rate-limiting disabled"
fi
echo ""

# ── 3. NLP classifiers (Docker) ─────────────────────────────────────────────
echo "─── 3. NLP classifiers ───"
NLP_URL="${NLP_API_URL:-http://localhost:8001}"
if curl -sf -m 3 "${NLP_URL}/ping" >/dev/null 2>&1; then
    pass "NLP classifiers reachable at $NLP_URL"
elif curl -sf -m 3 "${NLP_URL}/" >/dev/null 2>&1; then
    pass "NLP classifiers reachable at $NLP_URL (no /ping endpoint)"
else
    fail "NLP NOT reachable at $NLP_URL — start Docker: docker compose -f docker-compose-frontend.yml up -d"
fi
echo ""

# ── 4. Azure OpenAI ─────────────────────────────────────────────────────────
echo "─── 4. Azure OpenAI ──────"
if [[ -z "${AZURE_OPENAI_ENDPOINT:-}" || -z "${AZURE_OPENAI_KEY:-}" || "${AZURE_OPENAI_KEY:-}" == "YOUR_KEY_HERE" ]]; then
    warn "AZURE_OPENAI_* not configured — AI sub-pipeline will be skipped"
else
    # Minimal call: list deployments (or whatever GET works)
    HTTP=$(curl -s -o /dev/null -m 5 -w "%{http_code}" -H "api-key: $AZURE_OPENAI_KEY" \
           "${AZURE_OPENAI_ENDPOINT}/openai/deployments?api-version=${AZURE_OPENAI_API_VERSION:-2024-08-01-preview}" 2>/dev/null || echo "000")
    if [[ "$HTTP" == "200" ]]; then
        pass "Azure OpenAI reachable + key valid (HTTP 200)"
    elif [[ "$HTTP" == "401" || "$HTTP" == "403" ]]; then
        fail "Azure OpenAI rejected key (HTTP $HTTP — wrong key?)"
    elif [[ "$HTTP" == "000" ]]; then
        fail "Azure OpenAI unreachable (check endpoint URL or network)"
    else
        warn "Azure OpenAI returned HTTP $HTTP (unusual but key may still work)"
    fi
fi
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}PASS${RESET}  $PASS/$TOTAL connections OK"
    exit 0
else
    echo -e "  ${RED}${BOLD}FAIL${RESET}  $PASS/$TOTAL OK, $FAIL failed"
    exit 1
fi
