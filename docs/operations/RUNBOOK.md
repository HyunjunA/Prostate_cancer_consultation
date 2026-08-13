# Operations Runbook — COMPASS on caire-server

**Host**: `caire-server` (10.226.8.205) · **Last verified**: 2026-08-13

This document answers one question: **something is wrong — what do I do?**

`docs/setup/DEPLOYMENT_NATIVE.md` covers standing the system up. This covers keeping it up. If you are reading it at 2 a.m., start at [Triage](#triage).

> **Who this is for.** Anyone holding the `choih2` account on caire-server. It assumes no prior knowledge of how the system was built, because the whole reason it exists is that the knowledge currently lives in one person's head.

---

## The system in 60 seconds

Five moving parts. Three are supervised by systemd, two are Docker containers.

| # | Part | How it runs | Port | Restarts itself? |
|---|---|---|---|---|
| 1 | Webapp (Next.js) | Docker `prostatecancer-webapp-native` | 3001 | Yes |
| 2 | Backend API (FastAPI) | systemd `compass-backend` | 18001 | Yes |
| 3 | AI pipeline watcher | systemd `compass-watcher` | — | Yes |
| 4 | NLP gateway | systemd `compass-nlp-gateway` | 18080 | Yes |
| 5 | NLP classifier (R) | Docker `prostatecancer-nlp-native` | 8888 (loopback) | Yes |

Plus PostgreSQL on `127.0.0.1:5439` and Redis on `127.0.0.1:6380`, both host services, both loopback-only.

Browser traffic goes: **browser → webapp (3001) → backend (18001) → PostgreSQL**. The webapp proxies every API call, so "the site loads but nothing appears" almost always means the backend, not the webapp.

---

## Triage

Run this first. It takes ten seconds and tells you which section to jump to.

```bash
# 1. Are the supervised services up?
systemctl --user status compass-backend compass-watcher compass-nlp-gateway --no-pager | grep -E "●|Active:"

# 2. Are the containers up?
docker ps --filter name=prostatecancer --format "{{.Names}} {{.Status}}"

# 3. Does the backend think it is healthy?
curl -s http://127.0.0.1:18001/health

# 4. Does the site answer?
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/
```

| Symptom | Go to |
|---|---|
| A `compass-*` service is not `active (running)` | [A service is down](#a-service-is-down) |
| `/health` reports `database` or `redis` unhealthy | [Database or Redis is unhealthy](#database-or-redis-is-unhealthy) |
| Site loads but data is missing or errors | [Site loads but data is missing](#site-loads-but-data-is-missing) |
| An upload never gets processed | [An upload is stuck](#an-upload-is-stuck) |
| Everything is up but the site is unreachable from another machine | [Nobody can reach the site](#nobody-can-reach-the-site) |
| Patient data may have been exposed | **[INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) — stop and read that first** |

---

## A service is down

systemd restarts these automatically, so finding one down means it is failing repeatedly, not that it simply died.

```bash
# What happened, most recent first
journalctl --user -u compass-backend -n 50 --no-pager

# The application's own log
tail -50 app/Backend/logs/backend.log
```

Log locations:

| Service | Log |
|---|---|
| `compass-backend` | `app/Backend/logs/backend.log` |
| `compass-watcher` | `../AI_physician_patient_communication/logs/pipeline_watch.log` |
| `compass-nlp-gateway` | `../AI_physician_patient_communication/nlp_classifier_server/logs/gateway.log` |

To restart by hand:

```bash
systemctl --user restart compass-backend
sleep 5 && curl -s http://127.0.0.1:18001/health
```

**Common causes**

- *`Address already in use`* — an old process still holds the port. Find and kill the **parent**, not a worker: `ss -tlnp | grep 18001`, then `kill <parent PID>`. Killing a worker just makes the master respawn it and the port stays held.
- *Backend exits immediately* — usually `.env`. `app/Backend/.env` must exist and `DATABASE_URL` must use `postgresql+asyncpg://`. The error appears in `backend.log`.
- *Watcher restarts in a loop* — it is probably re-entering a failing pipeline run on the same file. Move the offending file out of `../AI_physician_patient_communication/data/incoming/` and restart.

---

## Database or Redis is unhealthy

Neither is supervised by these units; they are host services.

```bash
pg_isready -h 127.0.0.1 -p 5439            # expect: accepting connections
redis-cli -p 6380 ping                      # expect: PONG
ss -tln | grep -E ':(5439|6380)'            # expect: both on 127.0.0.1
```

If PostgreSQL is down the backend cannot serve anything. Restarting it needs the system service (`sudo systemctl restart postgresql@16-main` or equivalent) — that requires sudo, which this account has with a password.

**Do not** delete or reinitialise the data directory to "fix" a startup problem. Read the PostgreSQL log first. The database is the one component whose loss is not recoverable from anything on this host except a backup.

---

## Site loads but data is missing

This is the classic post-reboot state: the webapp container comes back on its own, the backend is still starting or failed, so every API call returns an error while the page itself renders.

```bash
curl -s http://127.0.0.1:18001/health
systemctl --user status compass-backend --no-pager | head -5
```

If the backend is healthy but pages are still empty, check that the webapp can reach it. The container uses `host.docker.internal:18001`:

```bash
docker exec prostatecancer-webapp-native wget -qO- http://host.docker.internal:18001/health
```

Empty output here means the container cannot reach the backend even though the backend is fine — a networking problem, not an application one.

---

## An upload is stuck

Admin uploads land in the drop folder and the watcher picks them up within ~5 seconds.

```bash
ls -la ../AI_physician_patient_communication/data/incoming/
tail -30 ../AI_physician_patient_communication/logs/pipeline_watch.log
systemctl --user status compass-watcher --no-pager | head -5
```

A file sitting in the drop folder for more than a few minutes means the watcher is down, wedged, or has already seen that exact file.

**Known behaviour:** the watcher skips a file it has already processed *in the current run* when the name, size, and mtime are all unchanged, and logs a line saying so. Re-uploading a genuinely modified file works; re-uploading a byte-identical one does not. The admin upload page warns about duplicates before you get this far.

---

## Nobody can reach the site

Check what the port is published on:

```bash
ss -tln | grep 3001
```

- `0.0.0.0:3001` — reachable from the LAN.
- `127.0.0.1:3001` — loopback only; use an SSH tunnel:
  ```bash
  ssh -L 3001:127.0.0.1:3001 choih2@10.226.8.205    # then http://localhost:3001
  ```

The binding is set in `docker-compose-frontend.yml`. `scripts/close-lan-exposure.sh` runs from cron and flips it to loopback after the agreed window — so a site that was reachable yesterday and is not today may simply have hit its deadline. That is intended behaviour, not a fault.

---

## Restarting everything

In dependency order:

```bash
systemctl --user restart compass-backend compass-nlp-gateway compass-watcher
docker compose -f docker-compose-frontend.yml up -d webapp
sleep 10
curl -s http://127.0.0.1:18001/health && curl -s -o /dev/null -w " webapp=%{http_code}\n" http://127.0.0.1:3001/
```

After a host reboot everything should return unattended — the three units are enabled with lingering on, and both containers use `restart: unless-stopped`. **This has not yet been proven by an actual reboot.** If you do reboot, verify with the [Triage](#triage) block and record the result here.

---

## Rebuilding the webapp after a code change

```bash
git pull
docker compose -f docker-compose-frontend.yml build webapp
docker compose -f docker-compose-frontend.yml up -d webapp
docker ps --filter name=prostatecancer-webapp-native --format "{{.Status}}"
```

Wait for `(healthy)` — it takes about 30 seconds. The backend picks up Python changes only on restart:

```bash
systemctl --user restart compass-backend
```

> **Caveat:** `npm run build` does **not** currently fail on type errors — `next.config.js` sets `typescript.ignoreBuildErrors: true`. A build that succeeds is not evidence the code is correct.

---

## Rolling back

There are no release tags yet, so rollback means "return to a known-good commit".

```bash
git log --oneline -20                  # find the last commit known to work
git checkout <sha>
docker compose -f docker-compose-frontend.yml build webapp
docker compose -f docker-compose-frontend.yml up -d webapp
systemctl --user restart compass-backend
```

**Database migrations do not roll back with the code.** If the bad deploy applied an Alembic migration, reverting the code leaves the schema ahead of it. Check with `cd app/Backend && alembic current`, and downgrade deliberately (`alembic downgrade -1`) only after confirming the migration is reversible. When it is not, restore from backup instead.

---

## Restoring the database

Backups: `~/compass-backups/`, encrypted, nightly at 02:15, 14 kept.
Passphrase: `~/.config/compass/backup-passphrase`. **Without it the backups cannot be read by anyone, including you.**

Verify a backup is restorable — this is safe, it uses a scratch database and drops it afterwards:

```bash
bash app/Backend/scripts/restore-check-db.sh
```

To restore for real, into the live database. **This overwrites current data. Take a fresh backup first.**

```bash
bash app/Backend/scripts/backup-db.sh                       # safety net first

systemctl --user stop compass-backend compass-watcher       # stop writers

gpg --decrypt --passphrase-file ~/.config/compass/backup-passphrase \
    ~/compass-backups/<file>.sql.gz.gpg \
  | gunzip \
  | psql -h 127.0.0.1 -p 5439 -U prostatecancer_user -d prostatecancer_db_native

systemctl --user start compass-backend compass-watcher
curl -s http://127.0.0.1:18001/health
```

Backups currently live on the **same disk as the database**, so they do not survive a disk failure. See `docs/security/PRODUCTION_READINESS.md`, axis E.

---

## Escalation

| Situation | Action |
|---|---|
| Patient data may have been exposed | [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md), immediately |
| Database is unrecoverable from backup | Institutional IT — this host is theirs |
| REDCap sync failing | Study coordinator; do not retry imports blindly, REDCap rejects a whole record on one bad field |
| Certificate / network / firewall | Institutional IT |

---

## Known gaps that affect triage

Be aware of these before concluding something is broken:

- **No alerting.** Nothing notifies anyone when a service fails. The nightly CI suite ran red for two months without anyone noticing. If you are reading this, you are the monitoring.
- **Access logs cannot identify a user.** 93% of entries show the webapp container's address because the proxy does not forward the client's. Do not expect the log to tell you who did something.
- **No PHI access audit log.** There is no record of who viewed which patient record, and it cannot be reconstructed after the fact.

Full detail: [`../security/PRODUCTION_READINESS.md`](../security/PRODUCTION_READINESS.md).
