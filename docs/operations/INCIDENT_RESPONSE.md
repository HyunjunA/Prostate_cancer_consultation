# Incident Response — Suspected PHI Exposure

**Scope**: COMPASS on caire-server (10.226.8.205) · **Last verified**: 2026-08-13

This is the procedure for a suspected or confirmed exposure of patient data. HIPAA requires that one exists **before** it is needed (§164.308(a)(6)), and it cannot be written honestly while an incident is in progress.

> **This document does not make anyone the decision-maker on breach notification.** That determination belongs to the institution's privacy office. What follows exists so that the technical steps — containment and evidence preservation — happen correctly and early, and so that the people who *do* decide receive accurate facts.

---

## Definition

Treat as a suspected exposure any of:

- A patient reports seeing another patient's data.
- A report or survey link works for someone it was not sent to, beyond the intended recipient.
- Patient data appears somewhere it should not — an email, a shared drive, a screenshot, a public site.
- An archive, database dump, or `deid_mapping.csv` copy leaves the host without authorisation.
- Unexpected access is observed in the logs or database.
- A laptop, phone, or drive holding any of the above is lost or stolen.

When unsure whether something qualifies, **treat it as one and report it.** Over-reporting costs a conversation; under-reporting costs a violation.

---

## Step 1 — Contain, but preserve

**Act within minutes. Do not destroy evidence while doing it.**

Close the exposure path:

```bash
# Take the site off the LAN — loopback only, keeps the service running
cd /home/choih2/test-prostate-cancer/Prostate_cancer_consultation_dashboard
sed -i 's|- "0.0.0.0:3001:3000"|- "127.0.0.1:3001:3000"|' docker-compose-frontend.yml
docker compose -f docker-compose-frontend.yml up -d webapp
ss -tln | grep 3001          # expect 127.0.0.1:3001
```

If the exposure is broader than the web interface, stop the writers as well:

```bash
systemctl --user stop compass-backend compass-watcher
```

**Do not**, at this stage:

- delete logs, files, or database rows — including the ones that look like the problem;
- rotate credentials before capturing which credential was in use;
- rebuild, redeploy, or `git checkout` anything;
- restart a service you have not yet captured logs from.

Containment means cutting off access, not tidying up. Deleted evidence cannot be recovered, and the scope of an incident is what determines whether notification is required.

---

## Step 2 — Preserve evidence

Do this before any further changes. It takes about a minute.

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
EVID=~/incident-$STAMP
mkdir -p "$EVID" && chmod 700 "$EVID"

# Application and access logs
cp app/Backend/logs/backend.log "$EVID/" 2>/dev/null
cp ../AI_physician_patient_communication/logs/pipeline_watch.log "$EVID/" 2>/dev/null

# Service history
journalctl --user -u compass-backend --since "7 days ago" > "$EVID/journal-backend.txt"
docker logs prostatecancer-webapp-native --since 168h > "$EVID/webapp.log" 2>&1

# System state at the time of discovery
ss -tlnp                     > "$EVID/listening-ports.txt" 2>&1
docker ps -a                 > "$EVID/containers.txt" 2>&1
systemctl --user list-units 'compass-*' > "$EVID/units.txt" 2>&1
date                         > "$EVID/captured-at.txt"

# A database snapshot, so the state can be examined without touching live data
bash app/Backend/scripts/backup-db.sh
```

Then write `$EVID/notes.md` by hand, while it is fresh: what was observed, by whom, at what time, what you did, and in what order. Memory degrades quickly and this becomes the timeline everyone else relies on.

---

## Step 3 — Report

**Report promptly. Do not wait until the cause is understood.**

Notify, in this order:

1. **The study PI** — they own the research and the IRB relationship.
2. **The institutional privacy / compliance office** — they make the breach determination and own any notification. HIPAA's 60-day clock (§164.404) starts at *discovery*, not at diagnosis.
3. **Institutional IT** — they own this host, and the incident may extend beyond this project.
4. **The IRB**, if the study protocol requires it — check the approved protocol.

State plainly what is known and what is not. "Around 14:30 a patient reported seeing another patient's report; the site is now loopback-only; scope not yet determined" is a good report. Do not estimate a number of affected individuals before the scope is established.

---

## Step 4 — Determine scope

This is where the assessment's known gaps hurt, so plan around them from the start.

**What the logs can tell you**

- `app/Backend/logs/backend.log` — which endpoints were called, when, with what status.
- `~/compass-backups/` — nightly encrypted snapshots, 14 days.
- `session_recording` (database) — gzipped screen replays, roughly the last two weeks.
- Behaviour tables (`patient_report_page_behavior` and siblings) — what happened inside a session.

**What the logs cannot tell you**

- **Who accessed anything.** ~93% of access-log entries record the webapp container's address, not the user's, because the proxy does not forward the client address.
- **Which patient record a given request touched**, in any dedicated audit trail. There is no PHI access log; it must be inferred from URL paths in the access log.
- **Anything before the current log file**, if the host has rebooted since the incident and logging still pointed at a temporary directory.

Say so explicitly in your report. "We cannot determine who accessed this from the available logs" is a finding the privacy office needs, and stating it early is far better than implying certainty you do not have.

**Useful queries**

```bash
# Requests touching a given file token
grep '<file-token>' app/Backend/logs/backend.log

# Non-container source addresses — i.e. direct access, bypassing the webapp
grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+ - "' app/Backend/logs/backend.log \
  | grep -v '172\.31\.' | sort | uniq -c | sort -rn
```

---

## Step 5 — Remediate, only once scope is agreed

With the privacy office's agreement:

- Rotate whatever was exposed — API key, admin password, REDCap token, `DEID_KEY`.
- Regenerate patient links if link tokens were disclosed.
- Close the specific technical path in code or configuration.
- Record the fix and the date.

Rotating `DEID_KEY` deserves particular care: it is the key that maps hashed identifiers back to study IDs, and changing it breaks the link between existing hashed data and the mapping file. Do not rotate it without understanding that consequence.

---

## Step 6 — Write it up

Within a week of closure, record in `docs/operations/incidents/`:

- Timeline: discovery, containment, report, scope, remediation.
- What was exposed, to whom, for how long.
- Root cause — technical and procedural.
- What made detection slow, and what would make it faster.
- Actions taken, with owners and dates.

HIPAA requires documented incident handling (§164.308(a)(6)(ii)). It is also the only mechanism by which the next incident is less bad than this one.

---

## Standing weaknesses to state in any report

These are known, documented, and unresolved as of 2026-08-13. An incident report that omits them understates the uncertainty.

| Gap | Consequence during an incident |
|---|---|
| No PHI access audit log | Cannot establish who viewed which record |
| Proxy drops the client address | Access logs cannot attribute activity to a person |
| No alerting | Detection depends entirely on someone noticing |
| No TLS | Traffic on the LAN was readable in transit while exposed |
| Shared API key with superuser rights | One credential, no per-user attribution |
| Backups on the same disk | A disk-level incident takes the evidence with it |

Full detail and remediation plan: [`../security/PRODUCTION_READINESS.md`](../security/PRODUCTION_READINESS.md).

---

## Contacts

Fill these in **now**, not during an incident.

| Role | Name | Contact | Backup contact |
|---|---|---|---|
| Study PI | | | |
| Privacy / compliance office | | | |
| Institutional IT | | | |
| IRB | | | |
| System maintainer | | | |
