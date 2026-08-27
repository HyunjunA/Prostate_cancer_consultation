#!/usr/bin/env bash
# ============================================================================
#  backup-db.sh — nightly encrypted dump of the COMPASS database
#
#  WHY THIS EXISTS
#    Until now there was no backup of any kind. A failed disk, a mistyped
#    DROP, or a bad migration would have destroyed every pipeline result,
#    survey response, and behavioural record permanently — and unlike most
#    data this cannot be re-collected, because you cannot ask patients to
#    repeat a consultation.
#
#  WHY THE DUMP IS ENCRYPTED
#    A plain dump is patient data sitting in a file. This host is shared with
#    ten other accounts, and the whole point of a backup is that copies of it
#    travel elsewhere. gpg symmetric encryption means a copy that leaves this
#    machine is not readable on arrival.
#
#  WHAT THIS DOES NOT PROTECT AGAINST
#    Backups land on the SAME DISK as the database. That covers the common
#    failures — an accidental delete, a migration that mangles a table — but
#    NOT the disk itself dying. Set OFFHOST_DEST (see below) to close that
#    gap; until then this is a partial backup and should be described as one.
#
#  USAGE
#    bash app/Backend/scripts/backup-db.sh
#    Intended to be run nightly from cron.
#
#  RESTORING
#    See restore-check-db.sh, which rehearses exactly this on every run.
#    A backup nobody has restored is not a backup.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

# Where dumps land. Outside the repository: these files are PHI and must
# never be reachable by an accidental `git add`.
BACKUP_DIR="${BACKUP_DIR:-$HOME/compass-backups}"

# Passphrase for gpg symmetric encryption. Kept outside the repo, 0600.
PASSPHRASE_FILE="${PASSPHRASE_FILE:-$HOME/.config/compass/backup-passphrase}"

# How many dumps to keep. 14 nightlies is enough to notice and recover from a
# corruption that took a few days to spot, and at ~1 MB each costs nothing.
KEEP="${KEEP:-14}"

# Optional off-host copy, e.g. "user@host:/path". Empty by default because
# unattended copying needs SSH key auth that is not set up yet.
OFFHOST_DEST="${OFFHOST_DEST:-}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found"
[[ -f "$PASSPHRASE_FILE" ]] || fail "passphrase file not found: $PASSPHRASE_FILE
       Create it once with:
         mkdir -p \"\$(dirname \"$PASSPHRASE_FILE\")\"
         openssl rand -base64 48 > \"$PASSPHRASE_FILE\"
         chmod 600 \"$PASSPHRASE_FILE\"
       Then store a copy somewhere safe — WITHOUT it the backups are
       unreadable, including by you."

# Refuse a world-readable passphrase: it would make the encryption decorative.
perms=$(stat -c '%a' "$PASSPHRASE_FILE")
[[ "$perms" == "600" || "$perms" == "400" ]] || \
    fail "$PASSPHRASE_FILE is mode $perms; expected 600. chmod 600 it."

# Load POSTGRES_* / DATABASE_URL the same way init-db-native.sh does.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTGRES_HOST:?POSTGRES_HOST not set in $ENV_FILE}"
: "${POSTGRES_PORT:?POSTGRES_PORT not set in $ENV_FILE}"
: "${POSTGRES_USER:?POSTGRES_USER not set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB not set in $ENV_FILE}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date '+%Y%m%d-%H%M%S')"
OUT="$BACKUP_DIR/${POSTGRES_DB}-${STAMP}.sql.gz.gpg"
TMP="$OUT.partial"

log "dumping $POSTGRES_DB from $POSTGRES_HOST:$POSTGRES_PORT"

# Plain SQL rather than -Fc: any psql can restore it, including a future
# maintainer on a different machine with no pg_restore to hand.
# pipefail (set -o above) makes a pg_dump failure fail the whole pipeline
# rather than silently producing a truncated, encrypted, useless file.
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    --host "$POSTGRES_HOST" \
    --port "$POSTGRES_PORT" \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --no-owner --no-privileges \
  | gzip -9 \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$PASSPHRASE_FILE" \
        --output "$TMP"

# Sanity floor. An empty or near-empty artifact means the dump failed in a way
# that still exited 0; promoting it and then rotating would quietly replace
# good backups with junk.
size=$(stat -c '%s' "$TMP")
(( size > 10240 )) || fail "dump is only ${size} bytes — refusing to keep it"

mv "$TMP" "$OUT"
chmod 600 "$OUT"
log "wrote $(basename "$OUT") ($(numfmt --to=iec "$size"))"

# Rotate only AFTER a good dump exists, never before.
mapfile -t old < <(ls -1t "$BACKUP_DIR"/${POSTGRES_DB}-*.sql.gz.gpg 2>/dev/null | tail -n +$((KEEP + 1)))
if (( ${#old[@]} > 0 )); then
    printf '%s\n' "${old[@]}" | xargs -r rm --
    log "pruned ${#old[@]} backup(s) beyond the newest $KEEP"
fi

if [[ -n "$OFFHOST_DEST" ]]; then
    if rsync -a --partial "$OUT" "$OFFHOST_DEST/"; then
        log "copied off-host to $OFFHOST_DEST"
    else
        # Loud, because a backup that never leaves the box is the failure mode
        # this setting exists to prevent.
        fail "off-host copy to $OFFHOST_DEST FAILED — the backup is local only"
    fi
else
    log "NOTE: OFFHOST_DEST unset — this backup lives on the same disk as the database."
fi

log "done."
