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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Lifespan = the async startup/shutdown context. Defined separately so
# this file stays focused on routing.
from app_lifespan import lifespan
from core.settings import get_settings

# Each routes_*.py module exposes a `router = APIRouter(...)`. We import
# them as named aliases (`as <name>_router`) so the ROUTERS list below
# reads like a table of contents instead of a wall of namespaced names.
from auth.admin_routes import router as auth_router
from routes_admin_pipeline import router as admin_pipeline_router
from routes_doctor import router as doctor_router
from routes_nlp import router as nlp_router
from routes_patient import router as patient_router
from routes_surveys import router as surveys_router
from routes_system import router as system_router
from routes_track_doctor import router as track_doctor_router
from routes_track_patient_first import router as track_patient_first_router
from routes_track_patient_followup import router as track_patient_followup_router
from routes_track_recordings import router as track_recordings_router
from routes_transcript import router as transcript_router

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
    nlp_router,
    transcript_router,
    track_patient_first_router,
    track_patient_followup_router,
    track_doctor_router,
    track_recordings_router,
    auth_router,
    admin_pipeline_router,
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

    app = FastAPI(
        title="Prostate Cancer Doctor-Patient Conversation Archive API",
        description="API for doctor-patient consultation interface data",
        version="1.0.0",
        # docs_url=None disables /docs entirely (returns 404). Same for
        # redoc_url. We hide both in non-dev environments to avoid
        # surfacing the API schema to anonymous traffic in prod.
        docs_url="/docs" if settings.environment == "development" else None,
        redoc_url="/redoc" if settings.environment == "development" else None,
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
