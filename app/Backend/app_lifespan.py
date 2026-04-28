"""FastAPI lifespan context — startup/shutdown hooks.

Extracted from main.py per CR #1 (Thin Main): main.py should orchestrate
the app, not contain runtime logic. Init/teardown of Redis, the NLP
HTTP client, and the rate limiter all live here.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from nlp_classifier_client import close_http_client
from redis_client import close_redis, init_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = await init_redis()
    if redis:
        try:
            from fastapi_limiter import FastAPILimiter
            await FastAPILimiter.init(redis, prefix="prostate:rl")
        except Exception:
            pass
    yield
    await close_http_client()
    await close_redis()
