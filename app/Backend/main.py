#!/usr/bin/env python3
"""FastAPI entry point — Prostate Cancer Doctor-Patient Conversation API.

Per CR #1 (Thin Main): this file orchestrates the app — it does not
contain runtime logic. Lifespan, system endpoints, and routes all live
in their own modules. `create_app()` is a factory so tests can spin up
isolated instances.

How uvicorn finds this file:
    `uvicorn main:app` tells uvicorn to import the `main` module and
    look for the module-level name `app`. The very last line of this
    file (`app = create_app()`) is what makes that name exist. If you
    rename the variable, change the uvicorn command too.

Reading order for a junior dev landing here for the first time:
    1. The ROUTERS list below — it is the index of every API surface
       the backend exposes. Each entry maps to a routes_*.py file.
    2. create_app() — the factory. Reads CORS / docs visibility from
       env, instantiates FastAPI, adds middleware, registers every
       router. No business logic lives here intentionally.
    3. app_lifespan.py — what runs at startup / shutdown (Redis,
       NLP HTTP client, rate limiter).
    4. routes_system.py — the only routes wired into the app's root
       (/, /health, /ready). Everything else is under /api/...

Why a factory function instead of building `app` at module top-level:
    - Tests can call `create_app()` to get a FRESH instance per test,
      so test state never leaks between tests.
    - Future P5.S2 work will pass settings / logging in as arguments,
      which is only possible if app construction is a function call.
    - Mirrors the pattern Flask / FastAPI tutorials recommend for any
      app larger than a toy script.
"""

import logging
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Lifespan = the async startup/shutdown context. Defined separately so
# this file stays focused on routing.
from app_lifespan import lifespan
from core.logging import configure_logging
from core.settings import get_settings

# Each routes_*.py module exposes a `router = APIRouter(...)`. We import
# them as named aliases (`as <name>_router`) so the ROUTERS list below
# reads like a table of contents instead of a wall of namespaced names.
from auth.admin_auth_routes import router as admin_auth_router
from auth.admin_routes import router as auth_router
from routes_admin_pipeline import router as admin_pipeline_router
from routes_admin_integrity import router as admin_integrity_router
from routes_admin_upload import router as admin_upload_router
from routes_doctor import router as doctor_router
from routes_patient import router as patient_router
from routes_surveys import router as surveys_router
from routes_system import router as system_router
from routes_track_doctor import router as track_doctor_router
from routes_track_patient_report import router as track_patient_report_router
from routes_track_patient_followup import router as track_patient_followup_router
from routes_track_recordings import router as track_recordings_router

# Native mode: make the sibling AI pipeline repo importable (ai_pipeline.*),
# used at request time by /api/doctor/score-sentence and /api/doctor/ai-rewrite.
# In Docker the repo is bundled at /app (handled at the call site); natively it
# sits beside the dashboard repo. Append (not insert-at-0) so the dashboard's
# own modules (db, models, ...) are never shadowed by same-named AI-repo modules.
# Placed after imports (not before) to keep module imports at the top — ai_pipeline
# is imported lazily at request time, so the path only needs to exist by then.
_AI_REPO = Path(__file__).resolve().parents[3] / "AI_physician_patient_communication"
if _AI_REPO.is_dir() and str(_AI_REPO) not in sys.path:
    sys.path.append(str(_AI_REPO))

# Apply the standard logging config (level + format) BEFORE create_app()
# runs so the FastAPI startup banner and lifespan hooks get the same
# format as request handlers. Idempotent — safe to call from tests too.
configure_logging()

# Module-level logger so log lines are tagged "main" and can be filtered
# separately from FastAPI / SQLAlchemy / Redis log output.
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Router registry
# ──────────────────────────────────────────────────────────────────────────────
# Edit this list to add or remove an API surface. Order matters only
# when two routers declare overlapping paths (FastAPI matches in
# include_router order). `system_router` deliberately ships first so
# the root `/`, `/health`, `/ready` paths win against any future router
# that might accidentally shadow them.
ROUTERS = [
    system_router,
    doctor_router,
    patient_router,
    surveys_router,
    track_patient_report_router,
    track_patient_followup_router,
    track_doctor_router,
    track_recordings_router,
    auth_router,
    admin_auth_router,
    admin_pipeline_router,
    admin_integrity_router,
    admin_upload_router,
]


def create_app() -> FastAPI:
    """Build and return a fully-configured FastAPI app instance.

    Called once at module load (last line of this file) to produce the
    `app` object uvicorn serves. Also re-callable from tests to spin
    up an isolated instance.

    Behaviour driven by environment variables:
        ENVIRONMENT   : when not "development", /docs and /redoc are
                        hidden so production does not leak the schema.
        CORS_ORIGINS  : JSON array of allowed origins. Defaults to the
                        common dev ports (3000, 5173, 8080) so a fresh
                        clone "just works" without an .env edit.

    Returns:
        A FastAPI app with lifespan, CORS middleware, and all routers
        from ROUTERS already registered.
    """
    # All env-var knobs come through the typed Settings (core/settings.py).
    # Pulling once here keeps create_app() pure-ish — easier to test.
    settings = get_settings()

    # Anything that is not explicitly "development" is treated as production.
    # Fail-closed: a typo in ENVIRONMENT hides the schema rather than exposing
    # it, which is the safer direction to be wrong in.
    _dev = settings.environment == "development"

    app = FastAPI(
        title="COMPASS API",
        description=(
            "API for the COMPASS research platform — "
            "**COM**munication of **P**rostate c**A**ncer **S**hared deci**S**ions. "
            "Backend for the doctor-patient consultation analysis dashboard."
        ),
        version="1.0.0",
        # docs_url=None disables /docs entirely (returns 404). Same for
        # redoc_url. We hide all three in non-dev environments to avoid
        # surfacing the API schema to anonymous traffic in prod.
        #
        # openapi_url matters as much as the other two and used to be left at
        # its default: /docs was a 404 while /openapi.json still served the
        # full schema, so hiding the UI hid nothing. Every endpoint, parameter,
        # and response model stayed one request away.
        docs_url="/docs" if _dev else None,
        redoc_url="/redoc" if _dev else None,
        openapi_url="/openapi.json" if _dev else None,
        # lifespan replaces the deprecated @app.on_event hooks. See
        # app_lifespan.py for what runs at startup vs shutdown.
        lifespan=lifespan,
    )

    # CORS = Cross-Origin Resource Sharing. Without this middleware,
    # browsers refuse fetch() calls from the React webapp (a different
    # origin than the API). allow_credentials=True lets the browser
    # send cookies / auth headers cross-origin.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Security response headers.
    #
    # A reverse proxy would normally set these, but there is no proxy in front
    # of this backend yet, and the API is reachable directly. Setting them here
    # also means they survive a future proxy being misconfigured — defence in
    # depth rather than a single place to get wrong.
    #
    # HSTS is deliberately NOT sent: the deployment is plain HTTP today, and
    # sending Strict-Transport-Security over HTTP would pin browsers to an
    # https:// origin that does not answer, locking users out of a working
    # site. It belongs with the TLS work, not before it.
    @app.middleware("http")
    async def _security_headers(request, call_next):
        response = await call_next(request)
        # Stop the browser second-guessing declared content types, which is
        # how a JSON response gets executed as script.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        # This API is never legitimately framed; denying it removes clickjacking.
        response.headers.setdefault("X-Frame-Options", "DENY")
        # Patient links carry the file token in the URL. Without this the token
        # leaks to any third-party host in a Referer header.
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        # API responses are data, never a document; forbid every subresource.
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'",
        )
        return response

    # Register every router from the table of contents above. Single
    # loop instead of 12 explicit `app.include_router(...)` calls —
    # adding a new router is now a one-line change in ROUTERS.
    for router in ROUTERS:
        app.include_router(router)

    return app


# uvicorn looks for this module-level `app` name. Calling create_app()
# at import time is what makes the name exist. There is intentionally
# nothing else after this line — keeping the entry point lean is the
# whole point of CR #1 (Thin Main).
app = create_app()
