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

# postgres@16 is brew keg-only on macOS — prepend its bin to PATH so
# pg_isready/psql work without requiring users to edit ~/.zshrc.
if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    PG_BIN="$(brew --prefix postgresql@16 2>/dev/null)/bin"
    [[ -d "$PG_BIN" && ":$PATH:" != *":$PG_BIN:"* ]] && export PATH="$PG_BIN:$PATH"
fi

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
# Default port matches docker-compose-ai-nlp-pipeline.yml in the sibling
# AI repo (8888). Phase 2 owns this container's lifecycle; Phase 1 does
# not call it at request time, so a missing container is a WARN, not a
# FAIL — it only blocks Phase 2 pipeline runs.
NLP_URL="${NLP_API_URL:-http://localhost:8888}"
if curl -sf -m 3 "${NLP_URL}/ping" >/dev/null 2>&1; then
    pass "NLP classifiers reachable at $NLP_URL"
elif curl -sf -m 3 "${NLP_URL}/" >/dev/null 2>&1; then
    pass "NLP classifiers reachable at $NLP_URL (no /ping endpoint)"
else
    warn "NLP not reachable at $NLP_URL — required only for Phase 2 pipeline runs (Phase 2's main_complete_pipeline_db.py brings it up automatically)"
fi
echo ""

# ── 4. Azure OpenAI ─────────────────────────────────────────────────────────
echo "─── 4. Azure OpenAI ──────"
if [[ -z "${AZURE_OPENAI_ENDPOINT:-}" || -z "${AZURE_OPENAI_KEY:-}" || "${AZURE_OPENAI_KEY:-}" == "YOUR_KEY_HERE" ]]; then
    warn "AZURE_OPENAI_* not configured — AI sub-pipeline will be skipped"
elif [[ -z "${AZURE_OPENAI_MODEL:-}" ]]; then
    warn "AZURE_OPENAI_MODEL (deployment name) not set — can only verify endpoint reachability, not key or deployment name"
else
    # Probe the actual inference endpoint the pipeline uses, not the
    # management /openai/deployments list (which inference-only keys
    # legitimately 404 on). One token in + one token out (~$0.00006 on
    # GPT-4o) — cheap enough to be routine and catches all the real
    # failure modes:
    #   200 = key + deployment + api version all valid
    #   400 = bad api version / payload
    #   401/403 = key rejected
    #   404 = deployment name (AZURE_OPENAI_MODEL) wrong
    #   429 = key works but quota exhausted
    ENDPOINT="${AZURE_OPENAI_ENDPOINT%/}"  # strip trailing slash → no // in URL
    API_VERSION="${AZURE_OPENAI_API_VERSION:-2024-08-01-preview}"
    URL="${ENDPOINT}/openai/deployments/${AZURE_OPENAI_MODEL}/chat/completions?api-version=${API_VERSION}"
    HTTP=$(curl -s -o /dev/null -m 10 -w "%{http_code}" \
           -X POST -H "Content-Type: application/json" -H "api-key: $AZURE_OPENAI_KEY" \
           -d '{"messages":[{"role":"user","content":"."}],"max_tokens":1}' \
           "$URL" 2>/dev/null || echo "000")
    case "$HTTP" in
        200) pass "Azure OpenAI chat/completions reachable + key + deployment '$AZURE_OPENAI_MODEL' all valid" ;;
        401|403) fail "Azure OpenAI rejected key (HTTP $HTTP — check AZURE_OPENAI_KEY)" ;;
        404) fail "Azure OpenAI deployment '$AZURE_OPENAI_MODEL' not found (HTTP 404 — check AZURE_OPENAI_MODEL matches a deployment on $ENDPOINT)" ;;
        400) fail "Azure OpenAI rejected request (HTTP 400 — likely AZURE_OPENAI_API_VERSION='$API_VERSION' not supported by this resource)" ;;
        429) warn "Azure OpenAI quota exhausted (HTTP 429 — key works but rate-limited; pipeline will be slow or fail)" ;;
        000) fail "Azure OpenAI unreachable (no response — check AZURE_OPENAI_ENDPOINT='$ENDPOINT' and network)" ;;
        5*) warn "Azure OpenAI returned HTTP $HTTP — server-side issue, key likely fine" ;;
        *)  warn "Azure OpenAI returned HTTP $HTTP — unexpected, treat as soft pass" ;;
    esac
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
