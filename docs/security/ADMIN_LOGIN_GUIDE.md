# Admin Login & Tracking — User Guide

This guide explains how to sign in to the dashboard's **admin area**, what you
can do there, how sessions behave, and how to manage admin accounts. It also
includes an operator/setup reference and troubleshooting.

The admin area is gated behind a per-user login. Only accounts with the
**admin** role can sign in and view the tracking dashboards.

---

## 1. Who this is for

- **Admin users** — people who need to view the behavior-tracking dashboards
  (sections 2–6).
- **Operators / developers** — whoever runs the backend and creates admin
  accounts (sections 7–10).

---

## 2. Accessing the admin area

| What | URL |
|------|-----|
| Admin home (tracking overview) | `http://localhost:3001/admin/tracking` |
| Login page | `http://localhost:3001/admin/login` |

If you open any `/admin/...` page **without being signed in, you are
automatically redirected to the login page.** This is expected — it is the
security gate. The original destination is remembered (e.g.
`/admin/login?next=/admin/tracking`) so that after a successful login you are
returned to the page you were trying to reach.

> The rest of the dashboard (patient and doctor pages) is **not** affected by
> this login. Only `/admin/*` requires it.

---

## 3. Signing in

1. Go to `http://localhost:3001/admin/login` (or open any `/admin/...` page and
   let it redirect you there).
2. Enter your **username** and **password**.
3. Click **Sign in**.
4. On success you are taken to the admin tracking overview (or back to the page
   you originally requested).

If the credentials are wrong you stay on the login page with an
"Invalid username or password" message. The same generic message is shown for
an unknown username and a wrong password (so the form does not reveal which
usernames exist).

---

## 4. The admin tracking dashboards

From the admin home (`http://localhost:3001/admin/tracking`) you can open:

| Dashboard | URL | What it shows |
|-----------|-----|---------------|
| **Patient First-Visit Behavior** | `/admin/tracking/patient-first` | How patients interacted with the first-visit report (toggles opened, ratings, dwell time, sessions). |
| **Patient Follow-up Survey Behavior** | `/admin/tracking/patient-followup` | Interaction with the follow-up surveys (DCS / SDM / Risk / Satisfaction). |
| **Doctor Behavior** | `/admin/tracking/doctor` | Doctor-side actions (sentence rewrites, score trajectory, per-action events). |
| **Session Recordings** | `/admin/tracking/recordings` | Replay or download captured UI sessions. Patient identifiers are masked at capture time. |

Every one of these pages loads its data from admin-only API endpoints that
require your signed-in admin session — they cannot be read without it.

---

## 5. Signing out

A top bar appears on every admin page showing **"Signed in as &lt;username&gt;"**
and a **Sign out** button. Clicking **Sign out** clears your session and returns
you to the login page. After signing out, visiting any `/admin/...` page again
redirects you to login.

---

## 6. Sessions & timeouts

- A session lasts **60 minutes** by default (configurable — see section 9).
- When the session expires, the next `/admin/...` page you open redirects you to
  the login page, and admin data requests return an authentication error. Just
  sign in again.
- The session is stored in a secure, **httpOnly** cookie named `admin_session`.
  It is never visible to page JavaScript, which protects it from cross-site
  scripting. Over HTTPS the cookie is additionally marked `Secure`.

---

## 7. Managing admin accounts (operators)

Admin accounts live in the `auth_user` table. The user-management API is itself
admin-protected, so the **first** admin must be created with a command-line
seed script.

**Create or reset an admin account:**

```bash
cd /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard
.venv/bin/python app/Backend/scripts/create_admin.py --username admin
# You will be prompted for the password (hidden input, asked twice).
```

Options:

- `--username <name>` (required) — the login id.
- `--password <value>` — set non-interactively; omit it to be prompted securely.
- `--email <addr>` — optional.
- `--no-superuser` — create with role `admin` but `is_superuser = false`.

If the username already exists the script **resets its password** and ensures
the admin role — so it doubles as a password-reset tool. Passwords are stored as
a salted SHA-256 hash; the plaintext is never written to disk.

> Choose a strong password and do not commit it anywhere. Change any temporary
> password that was set during initial setup.

---

## 8. How it works (architecture)

```
Browser ──/admin/*──▶ Next.js middleware ──(verify admin_session cookie:
                          signature + expiry + admin role)
                          │ valid → render page
                          │ invalid/missing → redirect /admin/login

Login form ──POST /api/admin-auth/login──▶ Next route handler
                          ──POST backend /api/admin-auth/login──▶ FastAPI
                          (verify username/password, require admin role)
                          ◀── JWT ── set httpOnly admin_session cookie

Admin page ──/api/backend/...──▶ Next proxy (attaches the cookie's JWT as
                          Authorization: Bearer) ──▶ FastAPI admin endpoints
                          (require_admin_user re-verifies the JWT + admin role)
```

Two independent checks protect the admin area:

1. **Middleware (UX gate):** verifies the cookie's JWT signature and expiry
   before any admin page renders, and bounces unauthenticated users to login.
2. **Backend (hard gate):** every admin data endpoint independently re-verifies
   the JWT and the admin role on each request. Even a forged cookie that somehow
   passed the page gate would get rejected on every data call.

The admin login is **independent of the rest of the API's auth mode** — the
patient/doctor API keeps using its existing shared-key access, while the admin
endpoints additionally require a logged-in admin. The behavior-tracking
*write* path (patient browsers posting events) is unchanged and does **not**
require an admin login.

---

## 9. Operator setup reference

**Shared secret (required).** The admin JWT is signed by the backend and
verified by the webapp middleware, so both must share the same secret:

- Backend: `JWT_SECRET` in
  `/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Backend/.env`
- Webapp: `JWT_SECRET` in
  `/Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard/app/Webapp/.env`

These two values **must be identical.** Generate a strong value with:

```bash
python -c "import secrets; print(secrets.token_hex(48))"
```

Rotating `JWT_SECRET` invalidates all active admin sessions (everyone must log
in again). The `.env` files are gitignored; only the `.env.example` templates
are committed.

**Session length.** `JWT_EXPIRE_MINUTES` in the backend `.env` (default `60`).

**Run the stack (native).**

```bash
cd /Users/choih2/Documents/GitHub/Graciela_Lab_Collab/prostate_cancer_project/Prostate_cancer_consultation_dashboard
# Backend (FastAPI on :18000)
bash app/Backend/scripts/run-backend.sh
# Webapp (Docker, served on :3001)
docker compose -f docker-compose-frontend.yml up -d --force-recreate webapp
```

After changing any backend admin-auth code, restart the backend; after changing
webapp code (middleware, login page, proxy), rebuild and recreate the webapp
container:

```bash
docker compose -f docker-compose-frontend.yml build webapp
docker compose -f docker-compose-frontend.yml up -d --force-recreate webapp
```

---

## 10. Troubleshooting

| Symptom | Likely cause & fix |
|---------|--------------------|
| `/admin/...` keeps redirecting to `/admin/login` | You are not signed in, or your session expired. Sign in again. If it loops right after a correct login, the webapp and backend `JWT_SECRET` values differ — make them identical and recreate the webapp container. |
| "Invalid username or password" on a correct password | The account may not exist, may be inactive, or may not have the admin role. Recreate/reset it with `create_admin.py` (section 7). |
| Login page shows "Backend unreachable" | The backend (`:18000`) is not running, or the webapp container cannot reach it. Start the backend (section 9) and confirm `http://localhost:18000/health` responds. |
| Webapp container cannot reach the backend even though it is running | Something else may be occupying the host's `:18000` (for example an IDE "port forward" squatting on `127.0.0.1:18000`, which can shadow `host.docker.internal`). Free the port and restart the backend. |
| Signed in but admin data is empty / 401 in the network tab | The session expired mid-use, or the cookie was cleared. Sign in again. |
| Forgot the admin password | Reset it by re-running `create_admin.py --username <name>` (section 7). |

---

## 11. Security notes

- Admin credentials are personal — do not share them.
- The session cookie is `httpOnly` + `SameSite=Strict`, and `Secure` over HTTPS.
- Never commit real passwords or the real `JWT_SECRET`; only the `.env.example`
  templates belong in version control.
- Deactivating a user (`is_active = false`) or deleting them immediately
  invalidates their sessions on the next request, because the backend reloads
  the user on every admin call.
- Hardening ideas for later: login rate-limiting, CSRF tokens for state-changing
  admin actions, and short-lived access tokens with refresh.
