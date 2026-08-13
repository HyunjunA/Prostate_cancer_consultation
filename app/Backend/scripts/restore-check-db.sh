#!/usr/bin/env bash
# ============================================================================
#  restore-check-db.sh — prove the latest backup can actually be restored
#
#  WHY THIS EXISTS
#    A backup that has never been restored is not a backup. Nightly dumps
#    appearing on disk while the restore silently fails is a common and
#    expensive way to discover you had nothing. This script rehearses the
#    restore on every run and compares row counts against the live database,
#    so "the backup works" is a measured fact rather than an assumption.
#
#  SAFETY
#    Restoring is the one operation here that can destroy data, so the target
#    database name must end in `_restorecheck`. The guard below refuses
#    anything else outright — there is no flag to override it. The scratch
#    database is dropped and recreated on every run and must never hold
#    anything worth keeping.
#
#  USAGE
#    bash app/Backend/scripts/restore-check-db.sh            # newest backup
#    bash app/Backend/scripts/restore-check-db.sh <file.gpg> # a specific one
#
#  Exit code is 0 only when the restore succeeded AND every table's row count
#  matches the live database, so cron/monitoring can treat non-zero as real.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

BACKUP_DIR="${BACKUP_DIR:-$HOME/compass-backups}"
PASSPHRASE_FILE="${PASSPHRASE_FILE:-$HOME/.config/compass/backup-passphrase}"

log()  { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

[[ -f "$ENV_FILE" ]]        || fail "$ENV_FILE not found"
[[ -f "$PASSPHRASE_FILE" ]] || fail "passphrase file not found: $PASSPHRASE_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTGRES_HOST:?POSTGRES_HOST not set}"
: "${POSTGRES_PORT:?POSTGRES_PORT not set}"
: "${POSTGRES_USER:?POSTGRES_USER not set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
: "${POSTGRES_DB:?POSTGRES_DB not set}"

SCRATCH_DB="${SCRATCH_DB:-prostatecancer_restorecheck}"

# ── The guard. Nothing below runs against a name that is not scratch. ───────
if [[ "$SCRATCH_DB" != *_restorecheck ]]; then
    fail "refusing to run: SCRATCH_DB is '$SCRATCH_DB', which does not end in
       '_restorecheck'. This script DROPs its target database; the suffix is
       what keeps a typo from pointing it at live data."
fi
if [[ "$SCRATCH_DB" == "$POSTGRES_DB" ]]; then
    fail "refusing to run: SCRATCH_DB equals the live database ($POSTGRES_DB)"
fi

BACKUP="${1:-}"
if [[ -z "$BACKUP" ]]; then
    BACKUP=$(ls -1t "$BACKUP_DIR"/*.sql.gz.gpg 2>/dev/null | head -1) \
        || fail "no backups found in $BACKUP_DIR"
    [[ -n "$BACKUP" ]] || fail "no backups found in $BACKUP_DIR"
fi
[[ -f "$BACKUP" ]] || fail "backup not found: $BACKUP"

log "rehearsing restore of $(basename "$BACKUP") into $SCRATCH_DB"

export PGPASSWORD="$POSTGRES_PASSWORD"
psql_admin() {
    psql --host "$POSTGRES_HOST" --port "$POSTGRES_PORT" \
         --username "$POSTGRES_USER" --dbname postgres \
         --quiet --no-psqlrc -v ON_ERROR_STOP=1 "$@"
}

# Recreate the scratch database from empty, so a stale leftover cannot make a
# broken restore look complete.
psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null
psql_admin -c "CREATE DATABASE \"$SCRATCH_DB\";" >/dev/null

restore_log=$(mktemp)
trap 'rm -f "$restore_log"' EXIT

if ! gpg --batch --quiet --decrypt --passphrase-file "$PASSPHRASE_FILE" "$BACKUP" \
     | gunzip \
     | psql --host "$POSTGRES_HOST" --port "$POSTGRES_PORT" \
            --username "$POSTGRES_USER" --dbname "$SCRATCH_DB" \
            --quiet --no-psqlrc -v ON_ERROR_STOP=1 > "$restore_log" 2>&1
then
    log "restore FAILED — last lines:"
    tail -20 "$restore_log"
    psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null
    exit 1
fi
log "restore completed without error"

# ── Compare row counts table by table ──────────────────────────────────────
# One query per table, driven from bash. An earlier version assembled a single
# UNION ALL statement inside SQL and silently collapsed 17 tables into one —
# reporting PASS while comparing almost nothing, which is precisely the false
# assurance this script exists to prevent. With tables this small the extra
# round-trips cost nothing and the logic is obviously correct.
q() {
    psql --host "$POSTGRES_HOST" --port "$POSTGRES_PORT" \
         --username "$POSTGRES_USER" --dbname "$1" \
         -tA --no-psqlrc -v ON_ERROR_STOP=1 -c "$2"
}

exact_counts_for() {
    local db="$1" t c
    while read -r t; do
        [[ -n "$t" ]] || continue
        c=$(q "$db" "SELECT count(*) FROM \"$t\";")
        printf '%s|%s\n' "$t" "$c"
    done < <(q "$db" "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;")
}

live_counts=$(exact_counts_for "$POSTGRES_DB")
rest_counts=$(exact_counts_for "$SCRATCH_DB")

live_tables=$(grep -c . <<<"$live_counts" || true)

# A comparison that covers almost nothing must not be allowed to report PASS.
# The schema has had 15+ application tables since migration 029; anything far
# below that means the enumeration broke, not that the database shrank.
MIN_TABLES="${MIN_TABLES:-10}"
if (( live_tables < MIN_TABLES )); then
    log "only $live_tables table(s) enumerated in the live database (expected >= $MIN_TABLES)."
    log "Treating this as a broken check, not a passing one."
    psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null
    exit 1
fi

if diff_out=$(diff <(echo "$live_counts") <(echo "$rest_counts")); then
    rows=$(awk -F'|' '{s+=$2} END {print s+0}' <<<"$live_counts")
    log "row counts MATCH across $live_tables tables ($rows rows total)"
    status=0
else
    log "row counts DIFFER between live and restored:"
    echo "$diff_out" | head -30
    status=1
fi

psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null
log "scratch database dropped"

if (( status == 0 )); then
    log "PASS — $(basename "$BACKUP") is restorable."
else
    log "FAIL — restored data does not match live. Investigate before trusting this backup."
fi
exit $status
