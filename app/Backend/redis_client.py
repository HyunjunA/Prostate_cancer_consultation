"""Redis connection management module.

Follows the same lifecycle pattern as db.py: module-level state created
at startup, closed at shutdown, accessed via a tiny accessor function
the rest of the codebase imports.

Graceful degradation:
    If Redis is unavailable (no server, wrong password, network glitch,
    etc.) we log a warning and set the module-level handle to None.
    Callers must check for None — see `get_redis()` — and fall back to
    "no caching, no rate limiting" behaviour. The backend keeps serving
    traffic; users just lose cache hits and limit enforcement.

What Redis is used for in this backend:
    1. Caching NLP responses     : nlp_classifier_client.py uses
                                   make_cache_key() to memoise expensive
                                   classifier calls. Same sentence + same
                                   model + same params -> same cache hit.
    2. Rate limiting              : fastapi-limiter (configured in
                                   app_lifespan.py) stores per-user
                                   counters in Redis under the
                                   "prostate:rl" key prefix.
    3. Future: session storage,
       distributed locks, pub/sub : not yet wired but the connection
                                   is already shared so adding them
                                   will not require a new client.

Why module-level state instead of a class:
    The Redis client is a singleton per process. Wrapping it in a class
    would just add ceremony (RedisService.get_instance()) without
    changing behaviour. Module-level globals + init/close + accessor
    is the same pattern the rest of the codebase uses for the DB and
    is the simplest thing that works correctly with FastAPI's lifespan.
"""

import hashlib
import json
import logging
import os
from typing import Optional

from redis.asyncio import Redis

# Per-module logger so log lines are tagged with the module name and
# can be filtered separately from FastAPI / SQLAlchemy logs.
logger = logging.getLogger(__name__)

# Connection URL. Defaults to a local Redis on the standard port +
# database 0 — convenient for development. Production overrides this
# via the REDIS_URL env var (typically pointing at a managed Redis
# like ElastiCache or Upstash).
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# The single shared client. Starts as None; init_redis() populates it
# at app startup. Stays None forever if Redis is unavailable.
# The leading underscore signals "module-private" — outside callers
# should go through get_redis() instead of touching this directly.
_redis: Optional[Redis] = None


async def init_redis() -> Optional[Redis]:
    """Initialise the shared Redis connection. Call once at app startup.

    Wired into the FastAPI lifespan in app_lifespan.py. Connecting at
    startup (rather than on the first request) means:
      - The first request does not pay the connect latency.
      - We discover Redis being unavailable before users do, and log
        a warning right at boot rather than mid-traffic.

    Returns:
        The Redis client on success, or None if the connection failed.
        The same value is also stored in the module-level `_redis`.
    """
    global _redis
    try:
        # decode_responses=True asks redis-py to return str instead of
        # bytes for GET/HGET/etc. We always store JSON or short ASCII,
        # so paying the decode cost up-front is simpler than calling
        # `.decode()` everywhere.
        _redis = Redis.from_url(REDIS_URL, decode_responses=True)
        # ping() round-trips the server before we tell anyone we are
        # "connected" — Redis.from_url itself never makes a TCP call,
        # so without ping() we would not notice a misconfigured URL
        # until the very first cache lookup.
        await _redis.ping()
        logger.info("Redis connected: %s", REDIS_URL)
        return _redis
    except Exception:
        # Catch broad: connection refused, auth failure, DNS error,
        # SSL handshake failure — all are "Redis cannot be reached"
        # and all should degrade the same way (no cache, no limits).
        logger.warning("Redis unavailable — caching disabled")
        _redis = None
        return None


async def close_redis() -> None:
    """Close the Redis connection. Call once at app shutdown.

    Wired into the FastAPI lifespan in app_lifespan.py. Idempotent: if
    Redis was never initialised (or already closed), this is a no-op,
    so shutting down a backend that never had Redis available will not
    raise here.
    """
    global _redis
    if _redis is not None:
        await _redis.close()
        # Reset to None so any post-shutdown caller (e.g. a stray
        # background task) sees "Redis disabled" instead of a closed
        # client that errors on use.
        _redis = None
        logger.info("Redis connection closed")


def get_redis() -> Optional[Redis]:
    """Return the current Redis instance (None if caching is disabled).

    This is the ONLY way callers should read the module-level state.
    Importing `_redis` directly would bind to its value at import time
    (None) instead of looking it up on each call, so it would always
    look disabled even after init_redis() succeeded.

    Usage:
        redis = get_redis()
        if redis is None:
            return compute_expensive()  # no cache available
        cached = await redis.get(key)
        ...
    """
    return _redis


def make_cache_key(namespace: str, payload: dict) -> str:
    """Build a deterministic cache key from *namespace* and *payload*.

    Args:
        namespace: Short tag identifying which subsystem owns the key
            (e.g. "nlp", "redcap"). Lets us scan or invalidate one
            subsystem's keys without touching others.
        payload:   The inputs that uniquely identify the cached value.
            Anything JSON-serialisable. Order does NOT matter — see
            `sort_keys=True` below.

    Returns:
        A string of the form ``cache:{namespace}:{sha256_hex}``. Length
        is bounded (namespace is short, sha256 is 64 hex chars), so
        keys never blow up Redis memory regardless of payload size.

    Why hash instead of stringifying the payload directly:
        Redis keys are technically unbounded but we want predictable,
        compact keys for log readability and memory accounting. A
        hashed payload also avoids leaking sensitive input data into
        Redis key dumps and `MONITOR` output.

    Why ``sort_keys=True``:
        Two callers passing {"a": 1, "b": 2} and {"b": 2, "a": 1} mean
        the same thing logically. Sorting keys before serialisation
        gives both calls the same cache key (and thus the same hit).

    Why ``ensure_ascii=True``:
        Forces non-ASCII chars to \\uXXXX escapes so the digest is
        identical across Python versions / locales / platforms.
    """
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"cache:{namespace}:{digest}"
