#!/usr/bin/env python3
"""
FastAPI Main Application - Prostate Cancer Doctor-Patient Conversation Archive API" (Async)
Provides API for doctor-patient consultation interface data
"""

from contextlib import asynccontextmanager
from typing import Dict
import logging
import os
import json

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from dotenv import load_dotenv

from auth import get_current_user
from auth.base import AuthUser
from db import get_db, db_ready_ping

load_dotenv()
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# FastAPI App & CORS
# ──────────────────────────────────────────────────────────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

from routes_doctor import router as doctor_router
from routes_patient import router as patient_router
from routes_surveys import router as surveys_router
from routes_nlp import router as nlp_router
from routes_transcript import router as transcript_router
from routes_track_patient_first import router as track_patient_first_router
from routes_track_patient_followup import router as track_patient_followup_router
from routes_track_doctor import router as track_doctor_router
from routes_track_recordings import router as track_recordings_router
from auth.admin_routes import router as auth_router
from routes_admin_pipeline import router as admin_pipeline_router
from redis_client import init_redis, close_redis, get_redis
from nlp_classifier_client import close_http_client, nlp_health_check


# ──────────────────────────────────────────────────────────────────────────────
# App lifecycle (replaces deprecated on_event)
# ──────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    redis = await init_redis()
    if redis:
        try:
            from fastapi_limiter import FastAPILimiter
            await FastAPILimiter.init(redis, prefix="prostate:rl")
        except Exception:
            pass
    yield
    # Shutdown
    await close_http_client()
    await close_redis()


app = FastAPI(
    title="Prostate Cancer Doctor-Patient Conversation Archive API",
    description="API for doctor-patient consultation interface data",
    version="1.0.0",
    docs_url="/docs" if ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if ENVIRONMENT == "development" else None,
    lifespan=lifespan,
)

cors_origins = os.getenv(
    "CORS_ORIGINS", '["http://localhost:3000","http://localhost:5173","http://localhost:8080"]'
)
if isinstance(cors_origins, str):
    cors_origins = json.loads(cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(doctor_router)
app.include_router(patient_router)
app.include_router(surveys_router)
app.include_router(nlp_router)
app.include_router(transcript_router)
app.include_router(track_patient_first_router)
app.include_router(track_patient_followup_router)
app.include_router(track_doctor_router)
app.include_router(track_recordings_router)
app.include_router(auth_router)
app.include_router(admin_pipeline_router)

# ──────────────────────────────────────────────────────────────────────────────
# Basic routes
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/")
async def root(user: AuthUser = Depends(get_current_user)):
    return {
        "message": "Prostate Cancer Doctor-Patient Conversation Archive API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint - No API Key required. Checks DB, Redis, NLP."""
    components: Dict[str, str] = {}

    # DB check
    try:
        await db.execute(text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        components["database"] = "unhealthy"

    # Redis check
    redis = get_redis()
    if redis is not None:
        try:
            await redis.ping()
            components["redis"] = "healthy"
        except Exception:
            components["redis"] = "unhealthy"
    else:
        components["redis"] = "disabled"

    # NLP check
    nlp_status = await nlp_health_check()
    components["nlp"] = nlp_status["status"]

    overall = "healthy" if components["database"] == "healthy" else "unhealthy"
    status_code = 200 if overall == "healthy" else 503
    if status_code == 503:
        raise HTTPException(status_code=503, detail={"status": overall, "components": components})
    return {"status": overall, "components": components}

@app.get("/ready")
async def ready():
    """Readiness check endpoint - No API Key required"""
    return {"ready": await db_ready_ping()}

