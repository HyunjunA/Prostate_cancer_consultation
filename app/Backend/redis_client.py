"""
Redis connection management module.
Follows the same lifecycle pattern as db.py (module-level state + init/close).
Graceful degradation: if Redis is unavailable, caching is simply disabled.
"""

import hashlib
import json
import logging
import os
from typing import Optional

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_redis: Optional[Redis] = None


async def init_redis() -> Optional[Redis]:
    """Initialise the shared Redis connection. Call once at app startup."""
    global _redis
    try:
        _redis = Redis.from_url(REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info("Redis connected: %s", REDIS_URL)
        return _redis
    except Exception:
        logger.warning("Redis unavailable — caching disabled")
        _redis = None
        return None


async def close_redis() -> None:
    """Close the Redis connection. Call once at app shutdown."""
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None
        logger.info("Redis connection closed")


def get_redis() -> Optional[Redis]:
    """Return the current Redis instance (None if caching is disabled)."""
    return _redis


def make_cache_key(namespace: str, payload: dict) -> str:
    """Build a deterministic cache key from *namespace* and *payload*.

    Key format: ``cache:{namespace}:{sha256_hex}``
    """
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return f"cache:{namespace}:{digest}"
