"""System endpoints — root, health, readiness.

Extracted from main.py per CR #1 (Thin Main): infrastructure-level
endpoints belong in their own router, not inline in the entry point.

What lives here vs. what does NOT:
    YES : root info, healthcheck, readiness probe.
    NO  : business logic. Anything domain-specific (patients, doctors,
          surveys, transcripts, ...) belongs in its own routes_*.py.

Why /health and /ready are unauthenticated:
    Container orchestrators have to call these from outside the
    application's auth context. Docker's HEALTHCHECK directive,
    Kubernetes liveness/readiness probes, AWS ELB target health checks
    — none of them carry an API key. If we required auth here, the
    orchestrator would mark the container unhealthy and restart it in
    a loop, which is exactly the opposite of what a healthcheck is for.

Why TWO endpoints (health vs. ready)?
    They answer different questions and orchestrators treat them
    differently:
        /health : "Is the process alive enough to keep running?"
                  Used by liveness probes — failure restarts the pod.
        /ready  : "Should I send traffic to this instance right now?"
                  Used by readiness probes — failure removes the pod
                  from the load balancer pool but keeps it running.
    Splitting them prevents a slow Redis from causing pod restarts
    and lets a still-warming-up backend stop receiving traffic
    without being killed.
"""

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.base import AuthUser
from db import db_ready_ping, get_db
from redis_client import get_redis

# A single router — main.py picks it up via `app.include_router(system_router)`.
# No prefix because these endpoints live at the root of the URL space
# (/, /health, /ready) so external monitors find them at the obvious paths.
router = APIRouter()


@router.get("/")
async def root(user: AuthUser = Depends(get_current_user)):
    """Authenticated landing endpoint.

    Returns a tiny self-description for clients that hit the API root.
    Auth is required so that anonymous scanners only see 401 on /, not
    a hint about what the service is. The /docs and /health pointers
    here are convenience links for human callers (e.g. API consumers
    using curl or HTTPie).
    """
    return {
        "message": "COMPASS API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Liveness probe — checks DB and Redis. No API key required.

    Returns 200 with a per-component status map when the process is
    healthy enough to keep running. Returns 503 (Service Unavailable)
    only when the database is down — DB is the one dependency we
    cannot serve traffic without. Redis being "disabled" or "unhealthy"
    is reported but does NOT trigger 503, because the backend keeps
    working (uncached) when Redis is gone.

    The NLP classifier container is intentionally NOT probed here. The
    AI pipeline repo (Phase A) owns that container's lifecycle, and the
    dashboard backend (Phase B) does not call it at request time — the
    webapp reads pipeline results from the database, not from the NLP
    service. Reporting NLP status from this endpoint would surface a
    component that this process does not actually depend on.

    Response shape on success:
        {"status": "healthy",
         "components": {"database": "healthy", "redis": "..."}}
    """
    # Build the components dict incrementally so even partial failures
    # produce a useful response body for the operator.
    components: Dict[str, str] = {}

    # ── Database ────────────────────────────────────────────────────
    # `SELECT 1` is the canonical "is postgres alive?" probe — it
    # touches the connection without locking any rows or tables.
    try:
        await db.execute(text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        # Catch broad — if ANYTHING about the DB is broken we want
        # the healthcheck to mark it unhealthy rather than 500-ing.
        components["database"] = "unhealthy"

    # ── Redis ───────────────────────────────────────────────────────
    # get_redis() returns None when Redis was intentionally disabled
    # at startup (no REDIS_URL or init failed). Distinguish that case
    # ("disabled") from "Redis was supposed to work but doesn't right
    # now" ("unhealthy") so dashboards can tell them apart.
    redis = get_redis()
    if redis is not None:
        try:
            await redis.ping()
            components["redis"] = "healthy"
        except Exception:
            components["redis"] = "unhealthy"
    else:
        components["redis"] = "disabled"

    # Final verdict. Only DB drives the 503 — see docstring for why.
    overall = "healthy" if components["database"] == "healthy" else "unhealthy"
    if overall != "healthy":
        # Use HTTPException (not just a status_code= kwarg) so the
        # response goes through FastAPI's normal error pipeline and
        # the body shape stays consistent with other 5xx responses.
        raise HTTPException(
            status_code=503,
            detail={"status": overall, "components": components},
        )
    return {"status": overall, "components": components}


@router.get("/ready")
async def ready():
    """Readiness probe — cheap "can I serve traffic?" check.

    Deliberately lighter than /health: it only pings the DB and skips
    Redis. Readiness probes run very frequently (every few seconds in
    k8s), so we keep the work to the single dependency that actually
    blocks request serving.
    """
    # db_ready_ping() returns True/False — we just forward it. Anything
    # more nuanced belongs in /health.
    return {"ready": await db_ready_ping()}
