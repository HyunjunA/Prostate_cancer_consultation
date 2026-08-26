# Incident — admin login bounced back to the login page (2026-08-13 → 2026-08-25)

**Status**: resolved 2026-08-25
**Duration**: 12 days (2026-08-13 15:00 PDT → 2026-08-25 17:09 PDT)
**Affected**: every admin session on the caire-server deployment (`:3001/admin/*`)
**PHI exposure**: none observed. A forgeable admin token existed on the LAN for the same 12 days (see *Security consequence*); the backend log records no admin session established from it.

---

## Symptom

Signing in at `/admin/login` with correct credentials appeared to do nothing. The form
submitted, no error was shown, and the browser returned to the login page.

The misleading part: the credentials were never the problem. The login call
**succeeded**.

```
POST /api/admin-auth/login          → 200 {"ok":true}, admin_session cookie set
GET  /admin/tracking (with cookie)  → 307 → /admin/login?next=%2Fadmin%2Ftracking
```

`backend.log` recorded `Admin login succeeded for user=admin (id=1)` for attempts the
user experienced as failures. Anyone debugging from the credential end — resetting the
password, checking `auth_user`, checking the login throttle — was looking at a
component that was working correctly.

---

## Root cause

**The backend signed admin JWTs with a different secret than the one the webapp
middleware used to verify them.**

`app/Webapp/src/middleware.ts` guards `/admin/*` by verifying the `admin_session`
JWT's HS256 signature against `process.env.JWT_SECRET`. The webapp container had the
real secret from `app/Backend/.env`. The backend was signing with
`"insecure-development-only-secret-do-not-use-in-production"` — the development
fallback literal in `auth/backends/jwt_auth.py`.

Every signature check therefore failed, and the middleware did what it is supposed to
do with an unverifiable token: redirect to the login page.

### Why the backend fell back to the development secret

Two mechanisms read configuration, and only one of them reads the `.env` **file**:

| Reader | Source | Result |
|---|---|---|
| `core/settings.py` (pydantic-settings) | `.env` file in the working directory | ✅ got the real secret |
| `auth/backends/jwt_auth.py` (`os.getenv`) | process environment only | ❌ `None` → development fallback |

`os.getenv` cannot see a `.env` file. It only sees variables actually exported into
the process environment. Until 2026-08-13 something did export them:
`app/Backend/scripts/run-backend.sh` (the documented launch path) does

```bash
set -a
source "$ENV_FILE"     # app/Backend/.env
```

`set -a` exports every variable it sources, so `os.getenv("JWT_SECRET")` worked and
admin login worked.

On 2026-08-13 the backend was moved to a supervised systemd unit,
`~/.config/systemd/user/compass-backend.service`, for good reasons documented in the
unit itself (the bare process did not survive crashes or reboots). The unit calls
uvicorn **directly**:

```ini
WorkingDirectory=.../app/Backend
ExecStart=.../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 18001 --workers 3 ...
```

That bypasses `run-backend.sh` and its `set -a; source .env`, and the unit sets no
`EnvironmentFile=`. The process environment lost every application variable — the
running backend had 14 environment variables, all systemd/session defaults, and
`JWT_SECRET` was not among them.

The unit's `WorkingDirectory` was set correctly and deliberately ("pydantic-settings
reads .env from the working directory"), so **everything routed through Settings kept
working**: the database connected, the API key validated, CORS behaved. Only the three
raw `os.getenv` reads in `jwt_auth.py` changed behaviour, and only one of them —
`JWT_SECRET` — had a fallback with consequences.

---

## Why it was not caught

1. **The fallback made it fail silently.** A missing secret produced a working-but-wrong
   system instead of a crash. Commit `b31e8f2` ("fail closed", 2026-08-13 14:29) had
   removed the older `"change-me"` default precisely to prevent this, but replaced it
   with another constant rather than a hard failure outside development.

2. **The validator checked a value nobody used.** The same commit added a Settings
   validator that refuses to start when `ENVIRONMENT != development` and `jwt_secret`
   is unset. `settings.jwt_secret` was correctly populated from the `.env` file, so the
   validator passed — while `jwt_auth.py` signed with the fallback. The check and the
   consumer read different sources, so the check certified nothing. `settings.py`'s own
   comment records the split ("auth/backends/jwt_auth.py reads it from the environment
   directly") without treating it as a defect.

3. **No test spans the two processes.** The mismatch is between the backend process and
   the webapp container. Within a single process both signing and verification use the
   same constant, so all 137 auth tests passed then and pass now.

4. **Nothing else broke.** Because Settings kept reading the file, there was no
   collateral symptom pointing at "the environment is empty".

5. **The failure surface said the opposite of the truth.** The API returned 200, the
   backend logged success, and the browser silently returned to a login form — the
   signature of a wrong password, which is what it was mistaken for.

---

## Timeline

| When (PDT) | Event |
|---|---|
| 2026-06-12 09:06 | `2af1863` adds the admin login UI and the `/admin/*` middleware gate. From here two independent processes read `JWT_SECRET`. |
| — | Backend runs via `run-backend.sh`, which exports `.env`. Admin login works. |
| 2026-08-13 14:28 | `app/Backend/.env` last modified (`ENVIRONMENT=production`, `JWT_SECRET` set). |
| 2026-08-13 14:29 | `b31e8f2` replaces the `"change-me"` default and adds the Settings validator. |
| 2026-08-13 14:39 | `compass-backend.service` created — no `EnvironmentFile=`, uvicorn invoked directly. |
| 2026-08-13 14:39 | Webapp image built with the correct `JWT_SECRET`. |
| **2026-08-13 15:00** | **Backend restarted under systemd. Breakage begins.** |
| 2026-08-13 15:39 | First `Admin login failed` in the log — 39 minutes after the cutover. No `Admin login succeeded` is recorded again until 2026-08-25. |
| 2026-08-14 → 08-24 | No admin login attempts recorded. |
| 2026-08-25 | Reported and diagnosed. |
| 2026-08-25 17:09 | Fix deployed; verified end to end. |

---

## Fix

`app/Backend/auth/backends/jwt_auth.py` now resolves the signing secret through
`core.settings.get_settings()` — the same source the validator checks — instead of
`os.getenv`:

- `_JWT_SECRET = _settings.jwt_secret or os.getenv("SECRET_KEY") or ""`
- If it is still empty: use the development literal **only** when
  `environment == "development"`, and log a warning saying sessions are forgeable.
  Otherwise raise at import, refusing to start.

With `ENVIRONMENT=production` on this host, a silent recurrence is now impossible: the
backend fails to start instead.

`EnvironmentFile=` was deliberately **not** added to the systemd unit. `.env` contains
`CORS_ORIGINS='["http://..."]'`; systemd's environment-file parser does not handle that
quoting the way a shell does, so the unit could fail to start. Fixing the code removes
the dependency on how the process is launched, which is the more durable answer.

### Verification (measured, 2026-08-25)

| Check | Before | After |
|---|---|---|
| `/admin/tracking` with a fresh session cookie | 307 → login | **200** |
| `/api/backend/admin-auth/me` | 401 | 200, `role: admin` |
| Token forged with the published constant | **200 — accepted** | **401 — rejected** |
| Backend signing key vs webapp `JWT_SECRET` | different | identical (`sha256[:12] = 4c4968be07a8`) |
| Backend test suite | — | 580 passed, 4 skipped |

---

## Security consequence

The development fallback is a constant published in this repository, and the backend
listens on `0.0.0.0:18001`. For the 12 days of the incident, any host on the LAN could
mint a token signed with that constant and present it to the backend's admin gate. This
was confirmed by forging one during diagnosis: `GET /api/admin-auth/me` returned 200
with `role: admin, is_superuser: true` for a token that was never issued by a login.

The webapp middleware was not the protection here — it rejected those tokens for the
same reason it rejected the real ones. The backend hard gate
(`auth/admin_session.py`) was the exposed surface, and it is reachable directly without
going through the webapp.

Both the outage and the exposure came from the same line of code.

---

## Follow-ups

- [ ] **Rotate `JWT_SECRET`.** The current value was never leaked, but the window during
      which forged sessions were accepted is long enough to warrant rotation. Rotating
      invalidates all existing admin sessions.
- [ ] **Replace the admin password.** Unrelated to this incident but still open —
      `admin1234567` is tracked as REMAINING in `PRODUCTION_READINESS.md`. Use
      `app/Backend/scripts/create_admin.py --username admin --password '<new>'`.
- [ ] **Audit remaining `os.getenv` calls in request paths.** `jwt_auth.py` still reads
      `JWT_ALGORITHM` and `JWT_EXPIRE_MINUTES` this way. No symptom today because the
      `.env` values match the defaults (`HS256`, `60`), but changing
      `JWT_EXPIRE_MINUTES` in `.env` will silently have no effect. `app/Backend/CLAUDE.md`
      already requires `get_settings()` over `os.getenv` in new code.
- [ ] **Make config checks test the consumer, not the declaration.** A startup assertion
      that the value `jwt_auth` will actually sign with is non-default would have caught
      this at 15:00 on 2026-08-13 instead of 12 days later.
- [ ] **Give the middleware a distinguishable failure.** A rejected-signature redirect
      currently looks identical to "not logged in". A distinct marker on the redirect
      (or a warning log in the middleware) would have pointed at the token rather than
      the password.

---

## Lesson

Moving a service to a supervisor changes its environment, not just its lifecycle. This
codebase had two configuration readers with different notions of where configuration
lives — a file for one, the process environment for the other. As long as the launch
script exported the file, the difference was invisible. The systemd migration removed
that coincidence and the two readers diverged, silently, in the one place where a
silent divergence also removes an authentication boundary.

The guard added the same afternoon was aimed at exactly this failure and missed it,
because it validated the value that was correct rather than the value that was used.
