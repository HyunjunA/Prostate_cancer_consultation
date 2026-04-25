#!/usr/bin/env bash
# ============================================================================
#  Native preflight (Phase 3)
#
#  Equivalent to prestart.sh but for the native deployment mode. Runs
#  every time before launching the native backend / standalone pipeline.
#
#  Performs:
#    1. PostgreSQL reachability + auth
#    2. Redis reachability (warning only — backend tolerates it down)
#    3. NLP-classifiers container reachability + docker exec stringi probe
#       (segmentation uses this container for R/stringi, not the host)
#    4. Alembic migration check (auto-runs `upgrade head` if behind)
#
#  Usage:
#    bash scripts/preflight-native.sh
#
#  Exits 0 on success, non-zero on hard failure.
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 3)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"
ENV_FILE="$BACKEND_DIR/.env.native"

# ── Pretty print ────────────────────────────────────────────────────────────
section() { echo ""; echo "===  $1"; }
ok()      { echo "  ✓ $1"; }
warn()    { echo "  ⚠ $1"; }
fail()    { echo "  ✗ $1" >&2; exit 1; }

# ── Step 0: Sanity ──────────────────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found — copy from .env.native.example"
[[ -d "$VENV_DIR" ]] || fail "Python venv missing at $VENV_DIR — run setup-native-{mac,linux}.sh"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTGRES_HOST:?POSTGRES_HOST not in env}"
: "${POSTGRES_PORT:?POSTGRES_PORT not in env}"
: "${POSTGRES_USER:?POSTGRES_USER not in env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not in env}"
: "${POSTGRES_DB:?POSTGRES_DB not in env}"

# ── Step 1: PostgreSQL ──────────────────────────────────────────────────────
section "PostgreSQL reachability + auth"

if ! command -v pg_isready >/dev/null 2>&1; then
    fail "pg_isready not on PATH"
fi

if ! pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -q; then
    fail "postgres not listening on $POSTGRES_HOST:$POSTGRES_PORT
       Start it:  brew services start postgresql@16   (macOS)
                  sudo systemctl start postgresql      (Linux)"
fi
ok "postgres listening on $POSTGRES_HOST:$POSTGRES_PORT"

if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1" >/dev/null 2>&1; then
    fail "Cannot connect as $POSTGRES_USER@$POSTGRES_DB. Run scripts/init-db-native.sh first."
fi
ok "postgres auth OK ($POSTGRES_USER@$POSTGRES_DB)"

# ── Step 2: Redis (soft) ────────────────────────────────────────────────────
section "Redis reachability"

if command -v redis-cli >/dev/null 2>&1; then
    # 3s shell-level timeout — some VS Code/Cursor processes squat on :6379
    # accepting the connection but never replying, hanging redis-cli's own timer.
    REDIS_REPLY=$(perl -e 'alarm 3; exec @ARGV' \
        redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping 2>/dev/null || echo "")
    if echo "$REDIS_REPLY" | grep -q PONG; then
        ok "redis responds PONG"
    else
        warn "redis NOT reachable / timeout. Backend will run with rate-limiting disabled."
    fi
else
    warn "redis-cli not on PATH — skipped"
fi

# ── Step 3: NLP-classifiers container + docker exec stringi probe ──────────
section "NLP-classifiers container (provides R + stringi via docker exec)"

NLP_CONTAINER="${STRINGI_DOCKER_CONTAINER:-prostatecancer-nlp-native}"

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$NLP_CONTAINER"; then
    fail "NLP container '$NLP_CONTAINER' not running.
       Start it:  docker compose -f docker-compose-minimal.yml up -d
       (Or use bash scripts/run-native.sh which auto-loads + starts it.)"
fi
ok "container $NLP_CONTAINER running"

# Probe stringi via docker exec — the same call segmentation.py will make
PROBE=$(docker exec "$NLP_CONTAINER" Rscript -e \
    'cat(sprintf("stringi=%s ICU=%s",
                 packageVersion("stringi"),
                 stringi::stri_info()$ICU.version))' 2>/dev/null || echo "")
if [[ -z "$PROBE" ]]; then
    fail "docker exec stringi probe failed — segmentation will not work"
fi
ok "docker exec stringi probe OK ($PROBE)"

# ── Step 4: Alembic migration head ──────────────────────────────────────────
section "Alembic migration check"

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
export DATABASE_URL DATABASE_URL_SYNC

cd "$BACKEND_DIR"
CURRENT=$(alembic current 2>/dev/null | tail -1 | awk '{print $1}')
HEAD=$(alembic heads 2>/dev/null | tail -1 | awk '{print $1}')

if [[ -z "$HEAD" ]]; then
    fail "alembic heads returned nothing — broken migration tree"
fi

if [[ "$CURRENT" == "$HEAD" ]]; then
    ok "alembic at head: $HEAD"
else
    warn "alembic behind ($CURRENT, head=$HEAD) — running upgrade ..."
    alembic upgrade head
    ok "alembic upgraded to head: $HEAD"
fi
cd "$REPO_ROOT"

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
ok "preflight passed"
