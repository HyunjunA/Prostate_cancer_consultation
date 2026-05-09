# Test automation — what runs where, and how to extend it

This repo runs three layers of automated checks. The mapping below shows
which check fires when and how loud the failure signal is.

## What runs when

| Trigger | Workflow / hook | Coverage | Typical duration |
|---|---|---|---|
| `git push` (local) | `.git/hooks/pre-push` | Backend ruff lint + `pytest --collect-only` | ~30 s |
| File save (local) | `bash scripts/watch-tests.sh` | Backend `pytest -m "not e2e"` (re-runs on save) | ~10 s per cycle |
| PR / push (Backend changes) | `.github/workflows/backend-ci.yml` | Ruff + full unit + integration tests | 4–6 min |
| PR / push (Webapp changes) | `.github/workflows/webapp-ci.yml` | next lint + jest | 3 min |
| Nightly 03:00 UTC | `.github/workflows/nightly-e2e.yml` | Full e2e against postgres + redis service containers | 8–12 min |
| Manual on-demand | Same nightly workflow via `workflow_dispatch` | Same as above, against any branch / SHA | 8–12 min |

## How failure notifications work

GitHub emails the repo owner on every red workflow run by default — no
extra setup required. Recipients tune cadence under GitHub → Settings →
Notifications (per-user). The workflows do not post to Slack or any
other external channel; failure visibility comes entirely from email
plus the Actions tab in the repo UI.

## What you do once to enable nightly e2e secrets

The nightly workflow reads the same env names as `.env.native`. Add
each as a GitHub Actions secret if you want the corresponding test
path to run:

| Secret | Effect when unset |
|---|---|
| `E2E_API_KEY` | Falls back to `nightly-e2e-stub-key` (auth-required tests still run) |
| `E2E_JWT_SECRET` | Falls back to a 32+ char stub (JWT-mode tests still run) |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY` | AI-pipeline tests skip via the existing skipif guard |
| `REDCAP_API_URL`, `REDCAP_API_TOKEN` | REDCap-sync tests skip |

The Postgres + Redis service containers spin up automatically inside
the runner — no extra secrets needed.

## How to run each layer manually

> **Use the project venv (Python 3.10), not the system python.** The
> backend uses PEP-604 union syntax (`X | None`) and `pydantic-settings`,
> neither of which work under macOS system Python 3.9. Either activate
> the venv first (`source .venv/bin/activate`) or invoke via the venv
> binary (`.venv/bin/python -m pytest …`). The pre-push hook,
> `watch-tests.sh`, and CI all do this automatically — only manual
> invocations need the reminder.

```bash
# Activate venv once per shell (skips the prefix on every call below)
source .venv/bin/activate

# Backend unit + integration (most-used)
cd app/Backend
pytest -m "not e2e" -q

# Backend e2e against a local stack
bash scripts/run-frontend-backend.sh                   # spin up the stack
cd app/Backend && pytest -m e2e -q

# Webapp unit + lint
cd app/Webapp && npm run lint && npm test

# Webapp Playwright (needs the backend up)
cd app/Webapp && npm run test:e2e

# Re-run on every save (development loop)
bash scripts/watch-tests.sh                 # default: not e2e
bash scripts/watch-tests.sh tests/test_db.py
```

## Why the layering looks like this

Each layer catches a different failure mode:

* **Pre-push hook** catches the cheapest mistakes (broken imports, lint
  rule violations) before they ever reach GitHub. Fast enough that
  `git push --no-verify` doesn't become muscle memory.
* **PR CI** runs the full unit + integration suite on a clean checkout
  with locked dependencies. This is the gate that would have caught a
  drift in any local environment.
* **Nightly e2e** is the only place that exercises the real wire format
  end-to-end (real postgres schema, real auth flow, real HTTP between
  components). It catches the bug class where every unit test passes
  but the deploy is broken — env wiring, schema drift, real-world
  service contracts.

Adding a new check? Pick the cheapest layer that can catch it. Don't
push integration tests into `pre-push` (slow) and don't push e2e tests
into PR CI (flaky and infra-heavy).
