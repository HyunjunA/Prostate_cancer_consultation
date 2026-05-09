#!/usr/bin/env bash
# ============================================================================
#  Native PostgreSQL bootstrap (Phase 2)
#
#  - Creates the postgres role (if missing) and sets its password
#  - Creates the database (if missing)
#  - Runs `alembic upgrade head` against the new database
#  - Verifies that all 18 tables + alembic_version are present
#
#  Idempotent: safe to re-run.
#
#  Prerequisites:
#    1. bash scripts/setup-native-mac.sh        (or setup-native-linux.sh)
#    2. cp app/Backend/.env.example app/Backend/.env
#       (then edit POSTGRES_PASSWORD etc.)
#
#  Usage:
#    bash scripts/init-db-native.sh
#
#  Reference: dev_docs/DEPLOYMENT_NATIVE_PLAN.md (Phase 2)
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/app/Backend"
VENV_DIR="$REPO_ROOT/.venv"
ENV_FILE="$BACKEND_DIR/.env"

cd "$REPO_ROOT"

# ── Pretty print ────────────────────────────────────────────────────────────
section() { echo ""; echo "==============================================================="; echo "  $1"; echo "==============================================================="; }
info()    { echo "  ▸ $1"; }
ok()      { echo "  ✓ $1"; }
fail()    { echo "  ✗ $1" >&2; exit 1; }

# ── Step 0: Sanity ──────────────────────────────────────────────────────────
section "Step 0: Sanity checks"

if [[ ! -f "$ENV_FILE" ]]; then
    fail "$ENV_FILE not found. Copy from .env.example and fill in values:
       cp app/Backend/.env.example app/Backend/.env"
fi

if [[ ! -d "$VENV_DIR" ]]; then
    fail "Python venv not found at $VENV_DIR. Run setup-native-mac.sh (or -linux.sh) first."
fi

# Source env vars (POSTGRES_*, DATABASE_URL, ...)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTGRES_HOST:?POSTGRES_HOST not set in $ENV_FILE}"
: "${POSTGRES_PORT:?POSTGRES_PORT not set in $ENV_FILE}"
: "${POSTGRES_USER:?POSTGRES_USER not set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB not set in $ENV_FILE}"
: "${DATABASE_URL:?DATABASE_URL not set in $ENV_FILE}"

if [[ "$POSTGRES_PASSWORD" == "CHANGE_ME" ]]; then
    fail "POSTGRES_PASSWORD is still the placeholder CHANGE_ME. Edit $ENV_FILE."
fi

ok "env loaded: db=$POSTGRES_DB user=$POSTGRES_USER host=$POSTGRES_HOST:$POSTGRES_PORT"

# ── Step 1: Confirm postgres is reachable (no auth yet) ─────────────────────
section "Step 1: postgres reachability"

if ! command -v pg_isready >/dev/null 2>&1; then
    fail "pg_isready not on PATH. Re-run setup-native-mac.sh (or -linux.sh)."
fi

if ! pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -q; then
    fail "postgres NOT listening on $POSTGRES_HOST:$POSTGRES_PORT.
       Start it:  brew services start postgresql@16   (macOS)
                  sudo systemctl start postgresql      (Linux)"
fi
ok "postgres listening on $POSTGRES_HOST:$POSTGRES_PORT"

# ── Step 2: Pick a superuser to bootstrap with ──────────────────────────────
# On macOS brew install, the OS user is the default superuser.
# On Linux apt install, 'postgres' is the default superuser.
section "Step 2: Pick bootstrap superuser"

CURRENT_USER="$(whoami)"
SUPER=""
if PGPASSWORD="" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$CURRENT_USER" -d postgres -c "SELECT 1" >/dev/null 2>&1; then
    SUPER="$CURRENT_USER"
elif sudo -n -u postgres psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d postgres -c "SELECT 1" >/dev/null 2>&1; then
    SUPER="postgres"
else
    fail "Couldn't connect as either '$CURRENT_USER' (peer) or 'postgres' (sudo).
       On macOS:  createdb \$(whoami)
       On Linux:  sudo -u postgres ... (script needs sudo access)"
fi
ok "Using superuser: $SUPER"

# Helper: run a SQL command as the bootstrap superuser
run_super_sql() {
    local sql="$1"
    if [[ "$SUPER" == "postgres" ]]; then
        sudo -u postgres psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -d postgres -c "$sql"
    else
        psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$SUPER" -d postgres -c "$sql"
    fi
}

# ── Step 3: Create role + database (idempotent) ─────────────────────────────
section "Step 3: Create role + database"

# Create role if missing
if run_super_sql "SELECT 1 FROM pg_roles WHERE rolname = '$POSTGRES_USER'" 2>/dev/null | grep -q "1 row"; then
    ok "role '$POSTGRES_USER' already exists"
else
    info "Creating role '$POSTGRES_USER' ..."
    run_super_sql "CREATE ROLE \"$POSTGRES_USER\" WITH LOGIN CREATEDB PASSWORD '$POSTGRES_PASSWORD';" >/dev/null
    ok "role '$POSTGRES_USER' created"
fi

# Always (re)set password — covers the case where the role pre-existed with a different password
run_super_sql "ALTER ROLE \"$POSTGRES_USER\" WITH PASSWORD '$POSTGRES_PASSWORD';" >/dev/null
ok "password set on '$POSTGRES_USER'"

# Create database if missing
if run_super_sql "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'" 2>/dev/null | grep -q "1 row"; then
    ok "database '$POSTGRES_DB' already exists"
else
    info "Creating database '$POSTGRES_DB' (owner: $POSTGRES_USER) ..."
    run_super_sql "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";" >/dev/null
    ok "database '$POSTGRES_DB' created"
fi

# ── Step 4: Confirm we can connect with our app credentials ─────────────────
section "Step 4: Confirm app-user connection"

PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_user, current_database()" \
    || fail "Could not connect as $POSTGRES_USER@$POSTGRES_DB. Check pg_hba.conf for password auth."
ok "app credentials work"

# ── Step 5a: Apply database_schema.sql (baseline schema) ────────────────────
# In Docker the postgres entrypoint runs this on first init; for native we
# apply it manually before alembic migrations.
section "Step 5a: Apply database_schema.sql"

SCHEMA_SQL="$BACKEND_DIR/database_schema.sql"
if [[ ! -f "$SCHEMA_SQL" ]]; then
    fail "$SCHEMA_SQL not found"
fi

# Skip if baseline tables already exist (idempotent re-run)
if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='session_recording'" 2>/dev/null | grep -q 1; then
    ok "database_schema.sql already applied (session_recording present)"
else
    info "Applying database_schema.sql ..."
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$SCHEMA_SQL" -v ON_ERROR_STOP=1 >/dev/null
    ok "database_schema.sql applied"
fi

# ── Step 5b: Run alembic migrations (stamps baseline if needed) ─────────────
section "Step 5b: alembic upgrade head"

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# Alembic uses the sync URL (env.py reads DATABASE_URL_SYNC if defined,
# falls back to DATABASE_URL). Export both to be safe.
export DATABASE_URL DATABASE_URL_SYNC

cd "$BACKEND_DIR"
CURRENT=$(alembic current 2>/dev/null | tail -1 | awk '{print $1}')
if [[ -z "$CURRENT" ]]; then
    info "No alembic version yet — stamping 001_baseline (schema is in place)"
    alembic stamp 001_baseline
fi
info "Current alembic revision (before): $(alembic current 2>&1 | tail -1)"
alembic upgrade head
ok "alembic upgrade head complete"
info "Current alembic revision (after):  $(alembic current 2>&1 | tail -1)"
cd "$REPO_ROOT"

# ── Step 6: Verify table count ──────────────────────────────────────────────
section "Step 6: Verify schema"

TABLE_COUNT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
info "Tables in public schema: $TABLE_COUNT"

if [[ "$TABLE_COUNT" -ge 18 ]]; then
    ok "Schema has $TABLE_COUNT tables (>= 18 expected)"
else
    fail "Schema has only $TABLE_COUNT tables (expected at least 18). Migrations may have failed."
fi

# Check for the new pipeline tables specifically
for tbl in nlp_all_predictions nlp_pipeline_intermediate llm_pipeline_intermediate llm_domain_scoring_and_summary transcript_analysis_log sentence_prediction patient_summary; do
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM information_schema.tables WHERE table_name='$tbl'" | grep -q 1; then
        ok "table present: $tbl"
    else
        fail "table missing: $tbl"
    fi
done

# ── Done ────────────────────────────────────────────────────────────────────
section "Database ready"

cat <<EOF

  Native PostgreSQL is bootstrapped.
    URL:          postgresql://$POSTGRES_USER:***@$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB
    Tables:       $TABLE_COUNT (in public schema)
    Migrations:   $(cd "$BACKEND_DIR" && alembic current 2>&1 | tail -1)

  Quick checks:
    psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c "\\dt"

  Next steps:
    bash scripts/run-backend.sh           # start native FastAPI
    python scripts/run-ai-nlp-pipeline.py    # standalone pipeline run

EOF
