#!/usr/bin/env python3
"""FastAPI entry point — Prostate Cancer Doctor-Patient Conversation API.

Per CR #1 (Thin Main): this file orchestrates the app — it does not
contain runtime logic. Lifespan, system endpoints, and routes all live
in their own modules. `create_app()` is a factory so tests can spin up
isolated instances.
"""

import json
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app_lifespan import lifespan
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

load_dotenv()
logger = logging.getLogger(__name__)

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
    environment = os.getenv("ENVIRONMENT", "development")
    cors_origins = json.loads(
        os.getenv(
            "CORS_ORIGINS",
            '["http://localhost:3000","http://localhost:5173","http://localhost:8080"]',
        )
    )

    app = FastAPI(
        title="Prostate Cancer Doctor-Patient Conversation Archive API",
        description="API for doctor-patient consultation interface data",
        version="1.0.0",
        docs_url="/docs" if environment == "development" else None,
        redoc_url="/redoc" if environment == "development" else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in ROUTERS:
        app.include_router(router)

    return app


app = create_app()
