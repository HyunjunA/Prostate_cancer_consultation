#!/usr/bin/env bash
# ============================================================================
#  Native preflight (Phase 3)
#
#  Equivalent to prestart.sh but for the native deployment mode. Runs
#  every time before launching the native backend / standalone pipeline.
#  Skipped checks for the Docker-only steps.
#
#  Performs:
#    1. R + stringi 1.8.4 + ICU 74.1 verification
#    2. PostgreSQL reachability + auth
#    3. Redis reachability (warning only — backend tolerates it down)
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

# ── Step 1: R + stringi + ICU ───────────────────────────────────────────────
section "R + stringi 1.8.4 + ICU 74.1"

if ! command -v R >/dev/null 2>&1; then
    fail "R not on PATH — run setup-native-{mac,linux}.sh"
fi

ICU_VER=$(R --no-save --quiet -e 'cat(stringi::stri_info()$ICU.version)' 2>/dev/null | tail -1)
if [[ "$ICU_VER" == "74.1" ]]; then
    ok "ICU 74.1 confirmed (R stringi will match the reference pipeline)"
else
    fail "ICU mismatch: expected 74.1, got '$ICU_VER'. Recompile stringi via setup-native-*.sh"
fi

# ── Step 2: PostgreSQL ──────────────────────────────────────────────────────
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

# ── Step 3: Redis (soft) ────────────────────────────────────────────────────
section "Redis reachability"

if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q PONG; then
        ok "redis responds PONG"
    else
        warn "redis NOT reachable. Backend will run with rate-limiting disabled."
    fi
else
    warn "redis-cli not on PATH — skipped"
fi

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
