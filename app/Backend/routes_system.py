"""System endpoints — root, health, readiness.

Extracted from main.py per CR #1 (Thin Main): infrastructure-level
endpoints belong in their own router, not inline in the entry point.

`/health` and `/ready` are intentionally unauthenticated so that
container orchestrators (Docker healthcheck, k8s probes) can hit them.
"""

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.base import AuthUser
from db import db_ready_ping, get_db
from nlp_classifier_client import nlp_health_check
from redis_client import get_redis

router = APIRouter()


@router.get("/")
async def root(user: AuthUser = Depends(get_current_user)):
    return {
        "message": "Prostate Cancer Doctor-Patient Conversation Archive API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check — DB, Redis, NLP. No API key required."""
    components: Dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        components["database"] = "unhealthy"

    redis = get_redis()
    if redis is not None:
        try:
            await redis.ping()
            components["redis"] = "healthy"
        except Exception:
            components["redis"] = "unhealthy"
    else:
        components["redis"] = "disabled"

    nlp_status = await nlp_health_check()
    components["nlp"] = nlp_status["status"]

    overall = "healthy" if components["database"] == "healthy" else "unhealthy"
    if overall != "healthy":
        raise HTTPException(
            status_code=503,
            detail={"status": overall, "components": components},
        )
    return {"status": overall, "components": components}


@router.get("/ready")
async def ready():
    """Readiness check — No API key required."""
    return {"ready": await db_ready_ping()}
