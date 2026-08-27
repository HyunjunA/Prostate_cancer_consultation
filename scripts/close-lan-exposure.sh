#!/usr/bin/env bash
# ============================================================================
#  close-lan-exposure.sh — end the webapp's LAN window on a deadline
#
#  WHY THIS EXISTS
#    docker-compose-frontend.yml publishes 3001 on 0.0.0.0 so the dashboard is
#    reachable across the LAN. That serves patient reports and survey answers
#    over plain HTTP with no TLS, so the exposure was agreed as a fixed window
#    rather than left open. Every previous open/close in this project was
#    manual and depended on someone remembering.
#
#    Windows so far:
#      1st  2026-08-07 .. 2026-08-14  — closed itself on schedule
#      2nd  2026-08-18 .. 2026-08-21  — extended before it fired (see 3rd)
#      3rd  2026-08-21 .. 2026-09-04  — extended before it fired (see 4th)
#      4th  2026-08-27 .. 2026-09-30  — current (to the end of September, on request)
#
#  WHY A RECURRING CHECK, NOT A ONE-SHOT AT THE DEADLINE
#    A job scheduled for the deadline minute fails OPEN: if the machine is down
#    or cron misses it, it never runs and the port stays exposed with nobody
#    aware. This asks "is it past the deadline yet?" on a schedule instead, so a
#    missed window closes at the next run after boot. It can end late, never not
#    at all.
#
#  WHAT IT DOES, ONCE PAST THE DEADLINE
#    - rewrites the published port from 0.0.0.0 to 127.0.0.1 in the compose file
#    - recreates ONLY the webapp container (no image rebuild; the deployed code
#      is untouched)
#    - removes its own crontab line, so a deliberate re-open later is not
#      silently slammed shut by a guard nobody remembers installing
#
#  Safe to run at any time: before the deadline, or after it has already closed,
#  it does nothing.
# ============================================================================
set -euo pipefail

# Local time. The server runs America/Los_Angeles; the window ends after
# Wednesday 2026-09-30, i.e. the first instant of October.
DEADLINE="2026-10-01 00:00:00"

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose-frontend.yml"
SERVICE="webapp"

OPEN_BINDING='- "0.0.0.0:3001:3000"'
CLOSED_BINDING='- "127.0.0.1:3001:3000"'

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"; }

[[ -f "$COMPOSE_FILE" ]] || { log "ERROR: compose file not found: $COMPOSE_FILE"; exit 1; }

now_epoch=$(date +%s)
deadline_epoch=$(date -d "$DEADLINE" +%s)

# Not yet — stay quiet. This runs every 15 minutes; logging each no-op would
# bury the one line that matters.
(( now_epoch < deadline_epoch )) && exit 0

# Already closed (by this script on an earlier run, or by hand). Nothing to do.
if ! grep -qF -- "$OPEN_BINDING" "$COMPOSE_FILE"; then
    exit 0
fi

log "Deadline $DEADLINE passed — closing the LAN exposure of port 3001."

# Rewrite the published port. -i.bak leaves the previous file alongside, so a
# botched edit to a deployment file is recoverable.
sed -i.bak "s|${OPEN_BINDING}|${CLOSED_BINDING}|" "$COMPOSE_FILE"

if ! grep -qF -- "$CLOSED_BINDING" "$COMPOSE_FILE"; then
    log "ERROR: rewrite did not take effect — restoring and leaving the port open."
    mv "$COMPOSE_FILE.bak" "$COMPOSE_FILE"
    exit 1
fi
log "compose: published port is now 127.0.0.1:3001."

# Recreate the webapp container only. This box runs 13+ other projects, so never
# `down` the project or prune anything — act on the one service by name.
cd "$REPO_ROOT"
if docker compose -f "$COMPOSE_FILE" up -d "$SERVICE" >/dev/null 2>&1; then
    log "container recreated; 3001 is no longer published on the LAN."
else
    log "ERROR: docker compose up failed. The compose file is closed but the"
    log "       RUNNING container may still publish 0.0.0.0 — check by hand."
    exit 1
fi

# Take the schedule down. Leaving it armed would re-close the port every 15
# minutes after any future deliberate re-open — a trap that would be painful to
# diagnose weeks from now.
if crontab -l 2>/dev/null | grep -qF "$SCRIPT_PATH"; then
    crontab -l 2>/dev/null | grep -vF "$SCRIPT_PATH" | crontab -
    log "cron entry removed — this guard has done its job and will not run again."
fi

log "Done. Reach the dashboard over a tunnel:"
log "  ssh -L 3001:127.0.0.1:3001 <user>@<host>  ->  http://localhost:3001"
