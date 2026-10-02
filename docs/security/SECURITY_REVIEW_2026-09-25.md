# Backend Security Review — 2026-09-25

**Scope**: `app/Backend/` and everything in the request path that decides whether a
call is allowed — the Next.js BFF proxy, nginx, the systemd/network layer, and the
NLP gateway.
**Method**: read from source and measured against the running host. No finding
below is inferred from another document.
**Data classification**: real PHI, HIPAA in scope.
**Status**: assessment. Nothing in this document has been changed on the server.

---

## Relationship to the existing documents

| Document | Standing after this review |
|---|---|
| `SECURITY_AUDIT.md` (2026-02-12) | **Superseded.** It describes the Docker-era deployment. Most of its findings are fixed or no longer apply |
| `PRODUCTION_READINESS.md` (2026-08-13) | **Still the governing assessment.** This review updates its security axis: three items it recorded as RESOLVED have regressed, one REMAINING item is more severe than recorded, and one is now fixed |
| `PHI_COMPLIANCE.md` | Unchanged. Still the policy reference |

Changes against the 2026-08-13 status table:

| Item | 2026-08-13 | Today |
|---|---|---|
| No TLS | REMAINING | **Resolved** — nginx terminates TLS on `:3000` |
| `/docs` and `/openapi.json` exposed | RESOLVED | **Regressed** — both 200 |
| Secrets degrade silently | RESOLVED | **Regressed** — the production validator does not run |
| JWT secret default `"change-me"` | RESOLVED | **Regressed** — the fallback guard is disarmed |
| No security headers | RESOLVED | **Partly true only** — API responses only; HTML has none |
| Shared API key = superuser | REMAINING (audit attribution) | **Re-classified CRITICAL** — it is an unauthenticated authorization bypass |
| Backend on `0.0.0.0` | REMAINING | Unchanged |

One root cause explains three of the four regressions: **`ENVIRONMENT=development`
on the production process** (see H-1).

---

## Summary

| ID | Severity | Finding |
|---|---|---|
| **C-1** | **Critical** | Shared API key resolves to `role=admin, is_superuser=True`, and the BFF injects it for anonymous callers — 35 routes, including user creation, are reachable with no credentials |
| **H-1** | High | The production backend runs with `ENVIRONMENT=development`, disarming four separate safety mechanisms |
| **H-2** | High | HTML responses carry no security headers at all; the page URL contains the credential and no `Referrer-Policy` protects it |
| **H-3** | High | Backend `:18001` and NLP gateway `:18080` bind `0.0.0.0` with no host firewall — nginx and the BFF can be bypassed |
| **H-4** | High | Access logs record capability URLs (credentials); world-readable mode, no rotation, unbounded growth |
| **M-1** | Medium | Capability URLs cannot be revoked or expired, and the audit trail cannot attribute their use |
| **M-2** | Medium | PHI audit and rate limiting both fail open, with no monitoring on either failure path |
| **M-3** | Medium | Retention script exists but is not scheduled; `session_recording` (PHI in practice) grows forever |
| **M-4** | Medium | NLP gateway disables authentication entirely when its key is unset |
| **M-5** | Medium | `DEID_KEY` is stretched by a single SHA-512; its required entropy is documented nowhere it is enforced |
| **M-6** | Medium | No dependency, secret, or static-analysis scanning in CI |
| **M-7** | Medium | 5 of 76 routes are rate-limited; every read path is unthrottled, so enumeration is free |
| **L-1** | Low | `X-Powered-By: Next.js` framework disclosure |
| **L-2** | Low | nginx `client_max_body_size 16m` contradicts the backend's 25 MB cap |
| **L-3** | Low | `sys.path.insert(0, "/app")` executed inside a request handler |
| **L-4** | Low | Three comments state conditions that are no longer true |

### What is already right

Stated first, because the plan below should not disturb any of it:

- **No SQL injection.** Every raw `text()` call is parameterized; there is no
  f-string or `%`-formatted SQL anywhere outside `archive/`.
- **Password handling is correct.** scrypt (n=2^14, r=8, p=1), per-password salt,
  `hmac.compare_digest` everywhere, and a silent rehash-on-login upgrade path for
  legacy SHA-256 rows.
- **Login throttling is well designed.** Eight failures per 15 minutes, counted on
  two independent axes (username and IP) with the lockout-vs-evasion trade-off
  written down.
- **Upload handling is solid.** `Path(name).name` strips traversal, a regex
  allowlist rejects non-de-identified names, the body is streamed with a running
  25 MB cap, and `.part` + `os.replace` makes the write atomic.
- **The de-identification cipher is correct.** AES-SIV with domain separation, and
  fail-soft to `None` rather than mis-attribution.
- **The PHI audit is middleware, not a helper hook** — so it cannot be forgotten by
  a route added later.
- **Secrets files are `0600`** and `/home/choih2` is `0700`.
- **Dependencies are current** — `python-jose 3.5.0`, `cryptography 49.0.0`,
  `starlette 1.6.0`, `fastapi 0.135.1`. Nothing in the security-relevant set is on
  a known-vulnerable version.

---

## C-1 — Critical: the shared API key is an unauthenticated superuser

### The chain

Four facts, each individually documented and defensible, compose into a bypass.

1. `auth/backends/api_key.py:33-38` — a valid `X-API-Key` resolves to:
   ```python
   AuthUser(user_id="system", username="system", role="admin", is_superuser=True)
   ```
2. `auth/access_control.py:39` — `check_patient_access` returns immediately when
   `user.is_superuser`. Under the deployed `AUTH_MODE=api_key` it is a no-op.
3. `auth/admin_routes.py:40-46` — `_require_admin` passes when
   `role == "admin" or is_superuser`. Same result.
4. `app/Webapp/src/app/api/backend/[...path]/route.ts:20-24` — the BFF adds
   `X-API-Key` from server-side configuration to **every** request it forwards,
   with no check on who sent it.

Fact 4 is what converts an internal design decision into an external
vulnerability. The key is a server-side secret the browser never sees — and the
proxy applies it on behalf of anyone who can reach the site.

### Verified

Non-destructive, read-only, no cookie, no credentials of any kind:

```console
$ curl -s http://127.0.0.1:3000/api/backend/auth/me
{"user_id":"system","username":"system","role":"admin","is_superuser":true}
```

An anonymous request through the public web path is `is_superuser: true`.

### Blast radius

The route inventory (76 routes) splits three ways:

| Protection | Count | What it covers |
|---|---|---|
| Genuinely unauthenticated, by design | 5 | `/health`, `/ready`, the two login endpoints, `/api/auth/mode` |
| **`get_current_user` only — i.e. anonymous** | **54** | all patient data, all doctor data, all surveys, all tracking writes, **and `/api/auth/*` user administration** |
| `require_admin_user` (real admin JWT) | 17 | the admin tracking and pipeline screens |

The 54 include, in descending order of severity:

- `POST /api/auth/users` — **create an account with `role: "admin"` and
  `is_superuser: true`.** This is a direct path from anonymous to a real admin
  session, which then unlocks the 17 routes that are actually protected.
- `POST /api/auth/users/{id}/keys` — mint additional API keys.
- `DELETE /api/auth/users/{id}` — delete administrators.
- `GET /api/patient/files?limit=5000` — **enumerate every consultation token.**
  Since §3.4's design makes the token the credential, one call dissolves the
  entire capability-URL model: an attacker does not need to guess a token, the
  API hands over the list.
- `GET /api/patient/ai-summary/{file}`, `/api/doctor/sentences/{file}/{speaker}`,
  `/api/surveys/by-file/{file}` — the patient-facing clinical content for any
  token so obtained.
- `DELETE /api/surveys/submissions/{id}` and the REDCap import routes — data
  destruction and writes into the study record.

I verified the identity resolution only. I did **not** exercise any write path,
enumerate any token, or read any patient record.

### Why the prior assessment understated it

`PRODUCTION_READINESS.md:499` records this as the reason "every audit row reads
`actor=system`", and files it behind a per-user-key rollout decision. That framing
is about **attribution**. The missing observation is that `_require_admin` consults
the *same* `is_superuser` flag, so the property is not only "we cannot tell who
did it" but "there is no authorization boundary at all for 54 of 76 routes."

> **The generalisable lesson.** `is_superuser=True` was set to preserve
> pre-auth behaviour during an auth refactor — a reasonable transitional choice.
> It became a critical finding when `_require_admin` was later written to trust
> the same flag. **A compatibility shim that a new security check reads is no
> longer a shim; it is the policy.** Nothing flagged the moment it changed
> meaning, because neither change was wrong on its own.

### Remediation

Two steps, deliberately separated, because the first is safe to ship today and the
second needs a design decision.

**Step 1 — contain (hours, no design work).** Break the specific escalation path
without touching the patient/doctor data model:

- Add `dependencies=[Depends(require_admin_user)]` at the `APIRouter` level in
  `auth/admin_routes.py`. User and key administration must never have been
  reachable with the application key.
- Move `DELETE /api/surveys/submissions/{id}`,
  `DELETE /api/surveys/redcap/records/{id}` and the three REDCap import routes to
  `require_admin_user` as well. No patient or physician screen calls them.
- Remove `is_superuser=True` from `APIKeyBackend` and give it `role="service"`.
  Then audit every remaining `_require_admin` / `check_patient_access` call site
  and make the ones that must stay open explicit, rather than open by inheritance.

**Step 2 — build a real authorization boundary (a sprint).** The application key
authenticates the *application*; it can never authorize a *request*. Today nothing
checks that the caller of `/api/patient/ai-summary/{file}` holds a claim to that
file. The fix is to make the capability explicit:

- Require the file token as a signed, scoped credential rather than a path
  parameter, and verify at the dependency layer that the presented token matches
  the resource being addressed. `deid.py`'s domain separation already provides the
  primitive — a token is cryptographically bound to a kind. Extend that to bind a
  *session* to a token.
- Delete `/api/patient/files` or restrict it to `require_admin_user`. A list of
  every capability in the system should not exist on an application-key route
  under any circumstances.
- Then `check_patient_access` becomes a real check instead of a superuser gate,
  and `resolve_actor` can return something other than `"system"` (see M-1).

---

## H-1 — High: the production backend runs as `development`

`/proc/<pid>/environ` of the live uvicorn process (PID 2031329, started
2026-09-24) contains `ENVIRONMENT=development`, sourced from `app/Backend/.env:39`.

The codebase treats this string as the single production/non-production switch.
Four independent protections consult it, and all four are currently off:

| Mechanism | Location | Effect right now |
|---|---|---|
| API schema publication | `main.py` | `/docs`, `/redoc`, `/openapi.json` all return **200**, publishing **73 paths** |
| Production secrets validator | `core/settings.py:_production_requires_secrets` | Skipped. A missing `API_KEY` or `JWT_SECRET` would no longer refuse to start |
| CORS wildcard rejection | same validator | Skipped. `CORS_ORIGINS` containing `*` would be accepted |
| JWT development secret | `auth/backends/jwt_auth.py:38-42` | If `JWT_SECRET` were ever unset, the backend would sign admin sessions with the literal constant in that file |
| Root log level | `core/logging.py:44` | `DEBUG` — 5,716 DEBUG lines in the current log |

`API_KEY` and `JWT_SECRET` *are* set and `CORS_ORIGINS` has no wildcard, so three
of these are latent rather than exploited. The schema exposure is live.

What makes this worth a High rather than a Medium is the shape of the failure: the
protections were built, reviewed, and recorded as RESOLVED, and a single
environment string silently reverted them. **A safety net that one variable can
disable without a log line is a safety net that will be found disabled.**

### Remediation

- Set `ENVIRONMENT=production` in `app/Backend/.env` and restart the backend.
  Verified safe to do: both required secrets are present and CORS has no wildcard,
  so the validator will pass rather than block startup.
- Log the resolved environment at INFO on startup, so the value is visible in the
  log rather than only in `/proc`.
- Add a startup assertion that refuses to bind a non-loopback address while
  `environment == "development"`. That makes the misconfiguration self-detecting
  rather than dependent on someone thinking to check.
- Set `LOG_LEVEL=INFO` explicitly rather than relying on the environment string to
  imply it — the two concerns should not share one switch.

---

## H-2 — High: no security headers on HTML, and the URL is the credential

`main.py`'s `_security_headers` middleware is correct and complete — for API
responses. Measured:

```
# http://127.0.0.1:18001/health          (backend JSON)
x-content-type-options: nosniff
x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
content-security-policy: default-src 'none'; frame-ancestors 'none'

# https://10.177.43.229:3000/admin/login  (the actual HTML document)
server: nginx
x-nextjs-cache: HIT
x-powered-by: Next.js
```

The HTML documents — the responses that execute JavaScript, render PHI into the
DOM, and hold the session cookie — carry **no security headers at all**. The
protection is applied to the responses that need it least. nginx proxies to
Next.js and adds nothing (`tls.conf:61-66`).

The most consequential omission is **`Referrer-Policy`**. The patient and
physician URLs carry the capability in the query string (`/?f=<token>`,
`?fileid=…&doctorid=…`). With no policy set, a browser attaches the full URL —
credential included — in the `Referer` header of any cross-origin subresource or
outbound link. The speech-to-text model weights are fetched from the Hugging Face
CDN from these same pages, which is exactly such a cross-origin request.

Also missing:

- **`Strict-Transport-Security`.** `main.py` withholds it with a comment
  explaining that the deployment is plain HTTP. nginx has terminated TLS since
  then; the justification has expired and neither layer sets the header.
- **`Content-Security-Policy`** on HTML — the only place a CSP does anything.
- **`X-Frame-Options` / `frame-ancestors`** on HTML — the patient report is
  clickjackable as it stands.

### Remediation

Add to the `server` block in `app/Webapp/nginx_setup/conf.d/tls.conf`, using
`always` so they attach to error responses too:

```nginx
add_header Referrer-Policy           "no-referrer" always;
add_header X-Content-Type-Options    "nosniff" always;
add_header X-Frame-Options           "DENY" always;
add_header Strict-Transport-Security "max-age=31536000" always;
```

`no-referrer`, not `strict-origin-when-cross-origin`: the origin alone is
harmless, but this application puts the secret in the path and query, so the only
safe policy is to send nothing. Set it at nginx rather than in Next.js so it
covers static assets and error pages as well.

Add a CSP for HTML separately and roll it out with `Content-Security-Policy-Report-Only`
first — the dictation worker and the CDN fetch make a first-attempt CSP likely to
break the page.

Set `poweredByHeader: false` in `next.config.js` (L-1).

Confirm the certificate chain and HSTS interact safely before enabling
`max-age`: the host is on a private address with an institutional CA, so pin the
value low (`max-age=300`) for one deployment cycle before committing to a year.

---

## H-3 — High: services bind `0.0.0.0` with no host firewall

Measured with `ss -ltnp`:

| Service | Bind | Reachable from |
|---|---|---|
| Backend uvicorn | `0.0.0.0:18001` | any host that can route to `10.177.43.229` |
| NLP gateway | `0.0.0.0:18080` | same |
| Next.js | `127.0.0.1:3000` | loopback only — correct |
| PostgreSQL | `127.0.0.1:5432` | loopback only — correct |
| Redis | `127.0.0.1:6380` | loopback only — correct |
| pgAdmin | `127.0.0.1:5050` | loopback, fronted by nginx on `:5432` |

`firewalld` is **inactive** and there is no nft ruleset. The only barrier is the
cloud security group, which is outside this repository and outside this review —
**it should be verified independently, because every mitigation in this section
rests on it.**

Consequences:

- Anything on the same network segment reaches the backend directly, bypassing
  nginx, TLS, the BFF, and every header in H-2. Combined with C-1, an attacker
  there needs only the API key — and `/openapi.json` (H-1) documents all 73 paths
  for them.
- The NLP gateway on `:18080` handles transcript text, which is PHI. Its `.env`
  does set `NLP_GATEWAY_API_KEY`, so it is currently authenticated — see M-4 for
  what happens if that value is ever lost.

### Remediation

- Bind the backend to `127.0.0.1:18001` (`scripts/run-backend.sh` default `HOST`).
  The BFF already connects via `localhost`, so this is transparent — and it also
  removes the fragility described in the course §3.1, where pointing `BACKEND_URL`
  at the LAN address would silently degrade every audit row.
- Bind the NLP gateway to `127.0.0.1:18080` if the pipeline runs on this host;
  keep it authenticated and add TLS if it must stay remote.
- Install a default-deny host firewall regardless. Relying on a single cloud-side
  control for a PHI system is a single point of failure, not defence in depth.

---

## H-4 — High: capability URLs are written to unrotated, permissive logs

`/home/choih2/COMPASS/logs/backend.log`, 3.6 MB, 46,848 lines:

- **866 lines contain a de-identified token** in the request path or query
  string. Those tokens are the credential (§3.4). An access log is therefore a
  credential store.
- File mode is **`0644`**; `.env` next to it is `0600`. The parent
  `/home/choih2` is `0700`, which is what actually prevents other local accounts
  from reading it — the file's own mode provides no protection. Any backup,
  `rsync`, support bundle or container mount that escapes that directory carries
  the credentials with it.
- **No rotation.** No `logrotate` entry, no `systemd` timer. The unit uses
  `StandardOutput=append` to a flat file that grows without bound.
- There is no retention rule for it either, in a deployment with a six-year audit
  obligation and therefore a strong incentive to keep files indefinitely.

`webapp.log` contains no tokens.

### Remediation

- `chmod 0640` the log directory contents and make the directory itself `0750`.
- Add a `logrotate` entry: daily, `rotate 14`, `compress`, `create 0640`.
- Filter the query string out of uvicorn access logging, the same decision
  `phi_audit.py` already made deliberately for `phi_access_log` — and for the same
  reason. The audit layer got this right; the access log did not get the memo.
- Decide a retention period for operational logs explicitly and separately from
  the HIPAA audit retention, so "we must keep audit records for six years" does
  not silently become "we keep credentials in plaintext for six years."

---

## Medium findings

### M-1 — Capability URLs cannot be revoked, and their use cannot be attributed

A consequence of the design rather than a defect in it, but it needs to be written
down and accepted explicitly:

| | Shared API key | Admin JWT | Personal link |
|---|---|---|---|
| Revocable | only by rotating for everyone | per user | **no** |
| Expires | no | 60 min | **no** |
| Audit actor | `"system"` | username | `"system"` |

A link forwarded to a wrong address, pasted into a support ticket or left in
browser history remains valid permanently, and `phi_access_log` records its use as
`"system"` — indistinguishable from legitimate traffic. The system cannot answer
"which physician accessed this record?" and cannot answer "has this link been
used by someone it was not sent to?"

`resolve_actor`'s docstring is admirably honest that `"system"` is "the honest
answer, not a placeholder to be improved by guessing." The remediation is not to
improve the guess but to remove the ambiguity: `AUTH_MODE=multi_key` is already
implemented (`auth/backends/multi_key.py`) and is the intended path. It needs a
key-distribution and revocation decision, not code.

Minimum compensating control until then: add an expiry claim to the file token, so
a link that leaks stops working eventually rather than never.

### M-2 — Both fail-open paths are unmonitored

`phi_audit.record_access` never raises: a request whose audit write fails is
served and not recorded. `rate_limit.limit` allows the request when Redis is
unavailable. Both are correct choices for a research deployment with one database,
and both are documented with their reasoning.

The gap is that each has exactly one detection mechanism — a log line — and
nothing watches it. Measured against the failure-mode table in the course, six of
eleven realistic backend failures present with no user-visible symptom at all.

**Remediation (cheap, high return):**

- Alert on any occurrence of `PHI audit write FAILED` and `Rate limiter unavailable`.
- Alert if `phi_access_log` receives zero rows in an hour during working hours.
- Alert if `transcript_analysis_log` has rows whose patient token does not
  resolve — that is the only signal that distinguishes a wrong `DEID_KEY` from an
  empty database, and without it the two are visually identical.

### M-3 — Retention exists but does not run

`app/Backend/scripts/prune-retention.py` is written, documents its own reasoning,
and defaults to `--dry-run`. It is scheduled nowhere: no user timer, no cron entry.

`session_recording` holds gzipped rrweb replays that reproduce the patient's
screen pixel for pixel. The script's own docstring calls this PHI in practice, and
notes it exists for UX review rather than for the record. It is growing with no
expiry.

Remediation: install a `systemd --user` timer running the script weekly with
`--apply`, after one supervised `--dry-run`. The script already refuses to trim
`phi_access_log` below the six-year HIPAA floor, so the dangerous direction is
already guarded.

### M-4 — NLP gateway authentication is fail-open by default

`nlp_classifier_server/gateway/app.py:58-78`:

```python
API_KEY = os.getenv("NLP_GATEWAY_API_KEY", "")
...
if not API_KEY:
    return          # auth disabled, every request accepted
```

The key **is** set in the gateway's `.env`, so authentication is active today. But
the service binds `0.0.0.0:18080` (H-3) and handles transcript text. A lost
`.env`, a unit edited to drop `EnvironmentFile=`, or a migration to a host where
the variable is not carried across turns an authenticated PHI service into an open
one, with a warning log line as the only signal.

Remediation: refuse to start when the key is unset, unless an explicit
`GATEWAY_ALLOW_ANONYMOUS=1` is also present. The same fail-closed reasoning
`core/settings.py` already applies to `API_KEY` and `JWT_SECRET`.

### M-5 — `DEID_KEY` carries all of the cryptographic strength

`deid.py:45-51` derives the AES-SIV key with a single `hashlib.sha512` — no salt,
no iteration count, no memory hardness. This is necessary, not sloppy: the
upstream de-identification app must derive the same key on a different machine
with no shared state, so a salted KDF would require transporting the salt.

The consequence is that `DEID_KEY` must be high-entropy and generated, never
human-chosen. That requirement appears in no validator, no startup check and no
documentation adjacent to the code. Brute-forcing a memorable passphrase at
SHA-512 speeds is cheap.

Remediation: add a startup check that rejects a `DEID_KEY` below a minimum length
and entropy, and state the generation procedure in `PHI_COMPLIANCE.md`. Note the
related open item already recorded in `PRODUCTION_READINESS.md` — the key is still
plaintext on the same host as the data it re-identifies.

### M-6 — No security scanning in CI

`.github/workflows/` contains `backend-ci.yml`, `webapp-ci.yml` and
`nightly-e2e.yml`. They run Ruff and pytest. There is no dependency audit, no
secret scanning, no SAST, and no Dependabot configuration.

Dependencies happen to be current today. Nothing in the pipeline would report it
if they stopped being.

Remediation, in order of return per hour of work:

1. `gitleaks` on every push — this repository handles secrets that must never be
   committed, and Rule 1 currently depends entirely on reviewer discipline.
2. `pip-audit` and `npm audit --production` as a non-blocking job first, then
   blocking once the baseline is clean.
3. Dependabot for both ecosystems.
4. `bandit` or Ruff's `S` ruleset last — it will mostly restate what this review
   found, but it keeps it from recurring.

### M-7 — Rate limiting covers 5 of 76 routes

Protected: `score-sentence` and `ai-rewrite` (20/60s), `upload-transcript`
(10/60s), `surveys/submit` (30/60s), `surveys/progress` (120/60s). The selection
is well reasoned — every route that costs money or starts work.

Read paths are deliberately unlimited, with the stated justification that the
dashboards issue many small reads and a badly tuned limit "would break the product
to solve a problem nobody has yet."

That position was defensible when the read paths were believed to be behind a
credential. Given C-1 they are not, so `/api/patient/files` followed by a loop over
`/api/patient/ai-summary/{file}` is an unthrottled bulk export. The right fix is
C-1; a generous per-IP ceiling on the read paths is worth adding regardless, as the
control that limits damage when an authorization assumption turns out to be wrong.

---

## Low findings

- **L-1** `X-Powered-By: Next.js` on every HTML response. `poweredByHeader: false`.
- **L-2** nginx `client_max_body_size 16m` (`tls.conf:39`) contradicts the
  backend's 25 MB streaming cap. Uploads between 16 and 25 MB fail at nginx with a
  413 the application never sees and cannot explain to the operator. Align them.
- **L-3** `routes_doctor.py:1131-1133` runs `sys.path.insert(0, "/app")` inside a
  request handler, reversing the deliberate `sys.path.append` discipline in
  `main.py`. `/app` does not exist on this host, so the line is inert — and will
  stop being inert the day this runs in a container again.
- **L-4** Three comments state conditions that are no longer true and will mislead
  the next reader: the HSTS justification in `main.py` (TLS now exists), the
  "proxy does not forward the client address" note in `auth/login_guard.py` (it
  does now), and `scripts/run-backend.sh`'s header (`:18000`, `:3001`, Docker).

---

## Development plan

Ordered by risk reduced per hour, not by severity. Phases 0 and 1 are
configuration and containment; phase 2 is the real design work.

### Phase 0 — same day (≈ 4 hours, no design decisions)

| # | Action | Fixes | Verify by |
|---|---|---|---|
| 0.1 | `require_admin_user` at router level in `auth/admin_routes.py` | C-1 escalation path | `curl /api/backend/auth/users` → 401 |
| 0.2 | `require_admin_user` on the survey `DELETE` and REDCap import routes | C-1 write paths | Same, per route |
| 0.3 | `ENVIRONMENT=production` in `app/Backend/.env`, restart backend | H-1 (all five effects) | `/openapi.json` → 404; startup log shows `production`; no DEBUG lines |
| 0.4 | Add the four `add_header` lines to `tls.conf`, reload nginx | H-2 except CSP | `curl -skI https://…/admin/login` shows all four |
| 0.5 | `logrotate` entry + `chmod 0640` on `logs/` | H-4 growth and mode | `logrotate -d` dry run |

Phase 0 closes the anonymous-admin path, the schema disclosure, and the referrer
leak. It changes no application logic and is fully reversible.

**One caution on 0.3:** confirm the webapp's admin login still works after the
restart. `ENVIRONMENT` also gates the JWT development-secret fallback, and the
2026-08-25 incident recorded in `INCIDENT_2026-08-25_ADMIN_LOGIN.md` was caused by
exactly that kind of secret mismatch between the two sides. `JWT_SECRET` is set, so
this should be a no-op — verify it rather than assume it.

### Phase 1 — this week (≈ 2 days)

| # | Action | Fixes |
|---|---|---|
| 1.1 | Bind backend and NLP gateway to `127.0.0.1`; install a default-deny host firewall | H-3 |
| 1.2 | Independently verify the cloud security group actually restricts inbound | H-3 |
| 1.3 | Strip query strings from uvicorn access logs | H-4 |
| 1.4 | Remove `is_superuser=True` from `APIKeyBackend`; make every remaining open route explicitly open | C-1 step 1 |
| 1.5 | Alerts on the three silent-failure signals | M-2 |
| 1.6 | Schedule `prune-retention.py` weekly after one supervised dry run | M-3 |
| 1.7 | Fail closed when `NLP_GATEWAY_API_KEY` is unset | M-4 |
| 1.8 | `gitleaks` + `pip-audit` + `npm audit` in CI | M-6 |

1.4 is the step that needs care: removing the flag will surface every place that
was silently relying on it. Do it behind a feature flag, run the E2E suite, and
expect to find route handlers that need an explicit decision rather than a fix.

### Phase 2 — next sprint (≈ 1–2 weeks, needs a design decision first)

| # | Action | Fixes |
|---|---|---|
| 2.1 | Design review: how is a capability URL bound to a session, and what expires? | C-1, M-1 |
| 2.2 | Implement token-scoped authorization; `check_patient_access` becomes a real check | C-1 step 2 |
| 2.3 | Remove or admin-gate `GET /api/patient/files` | C-1 |
| 2.4 | Add an expiry claim to file tokens | M-1 |
| 2.5 | Roll out `AUTH_MODE=multi_key` so the audit trail can name a person | M-1 |
| 2.6 | `DEID_KEY` entropy check at startup; document generation procedure | M-5 |
| 2.7 | CSP on HTML, report-only first | H-2 |
| 2.8 | Per-IP ceiling on read paths | M-7 |
| 2.9 | L-1 through L-4 | housekeeping |

2.1 is a genuine decision, not a task, and it should not be skipped straight to
implementation. The options — signed session cookie bound to a token, short-lived
exchange token, per-recipient link — trade off against the property the design
currently buys: patients need no account, no password, and no onboarding. That
property is clinically valuable and should be given up deliberately, if at all.

### Out of scope for this plan, but should be tracked

- The admin password recorded as `admin1234567` in `PRODUCTION_READINESS.md`. I did
  not attempt a login, so I cannot confirm its current value — **verify and rotate.**
  Given C-1 step 1 makes the admin JWT the only real boundary, the strength of that
  password becomes considerably more important than it was.
- `DEID_KEY` stored in plaintext on the host holding the data it re-identifies —
  already recorded as PARTIAL in `PRODUCTION_READINESS.md` §axis E.
- Whether `nginx :5432` (pgAdmin) is reachable from outside the network segment.
  pgAdmin is a full database client behind a single password.

---

## Verification performed

| Claim | How it was established |
|---|---|
| Anonymous caller is superuser | `curl` to `/api/backend/auth/me`, read-only, no credentials |
| 76 routes and their protection levels | Static parse of every `routes_*.py` and `auth/*routes.py`, including router-level `dependencies=` |
| `ENVIRONMENT=development` live | `/proc/2031329/environ` |
| `/docs`, `/openapi.json` serving | `curl` — 200, 73 paths |
| Header comparison | `curl -I` against both the backend and the TLS listener |
| Bind addresses, firewall | `ss -ltnp`, `systemctl is-active firewalld` |
| Log contents | Pattern **counts** only — no log content was printed or copied |
| No SQL injection | `grep` for `text(f"`, `execute(f"`, `%`-formatted SQL across the tree |
| Dependency versions | `pip list` |
| Retention not scheduled | `systemctl --user list-timers`, `crontab -l` |

**Not attempted, deliberately:** no write of any kind, no token enumeration, no
patient record read, no login attempt, and no query against the production
database. The authorization bypass was confirmed with the single read-only
identity call shown above, which was sufficient — every other consequence follows
by reading the code.
