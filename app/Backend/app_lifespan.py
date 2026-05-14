"""FastAPI lifespan context — startup/shutdown hooks.

Extracted from main.py per CR #1 (Thin Main): main.py should orchestrate
the app, not contain runtime logic. Init/teardown of Redis and the
rate limiter live here.

What "lifespan" means in FastAPI:
    A lifespan is an async context manager that FastAPI runs once when
    the app starts and once when it stops. Code BEFORE `yield` runs at
    startup; code AFTER `yield` runs at shutdown. This is the modern
    replacement for the deprecated `@app.on_event("startup")` /
    `@app.on_event("shutdown")` decorators.

Why each piece is here:
    - Redis init     : we need one shared connection pool, not one per
                       request. Created at startup so the very first
                       request doesn't pay the connect cost.
    - FastAPILimiter : its rate-limit counters live in Redis, so it
                       must be initialised AFTER Redis is up. Wrapped
                       in try/except because rate limiting is a "nice
                       to have" — Redis being down should disable
                       limiting, not crash the whole backend.
    - close_redis    : graceful shutdown so we don't leave the Redis
                       pool open when uvicorn is told to stop (e.g.
                       SIGTERM during a deploy).
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from redis_client import close_redis, init_redis

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Async context manager wired into FastAPI(lifespan=...).

    The `app` argument is required by the FastAPI lifespan protocol
    even though we do not use it — FastAPI passes itself in so the
    hook can attach state (e.g. `app.state.redis = redis`) if needed.
    """
    # ── Startup ─────────────────────────────────────────────────────
    # init_redis() returns None when Redis is intentionally disabled
    # (no REDIS_URL) or when the connect attempt fails. The backend is
    # designed to keep working without Redis — caching is just absent.
    redis = await init_redis()

    if redis:
        # Rate limiter is optional. We import lazily so the dependency
        # is only required when Redis is actually present, and we
        # swallow any init failure (e.g. wrong fastapi-limiter version)
        # so a misconfiguration in this corner does not block boot.
        try:
            from fastapi_limiter import FastAPILimiter
            # `prefix` namespaces our keys in Redis so multiple apps
            # sharing the same Redis instance do not collide.
            await FastAPILimiter.init(redis, prefix="prostate:rl")
        except Exception as exc:
            # Rate limiter init is non-fatal, but a silent swallow makes
            # version-mismatch and Redis-shape problems invisible until
            # someone wonders why /login isn't being throttled. Log so
            # operators see the failure in startup logs.
            logger.warning("FastAPILimiter init failed (rate limiting disabled): %s", exc)

    # `yield` hands control back to FastAPI. The app serves traffic
    # for as long as the process is alive. Anything below this line
    # only runs when the app is shutting down.
    yield

    # ── Shutdown ────────────────────────────────────────────────────
    # Close the Redis pool. No-op if Redis was never initialised, so
    # a missing init does not turn into a shutdown crash.
    await close_redis()
