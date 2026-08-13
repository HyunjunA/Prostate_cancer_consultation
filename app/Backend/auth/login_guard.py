"""Failed-login throttling for the admin session endpoint.

WHY THIS EXISTS
    ``POST /api/admin-auth/login`` accepted unlimited attempts. Ten wrong
    passwords in a row all returned 401 and nothing recorded that it happened,
    so an online dictionary attack was bounded only by network speed — against
    an account that, until recently, used ``admin1234567``.

    scrypt makes each guess cost ~50 ms, which already blunts this. But CPU
    cost alone still permits thousands of attempts an hour, and it burns the
    server's CPU to do it. A counter is the cheaper and firmer answer.

DESIGN
    Two independent counters, both in Redis with a sliding TTL:

      - per username — stops a dictionary run against one known account
      - per source IP — stops one client spraying many usernames

    Locking on username alone lets an attacker lock out a legitimate admin by
    failing on purpose. Locking on IP alone is evaded by rotating addresses.
    Tracking both means the common attacks are covered and the denial-of-
    service angle needs control of many addresses to matter.

FAILURE MODE
    Redis unavailable → this returns "not locked" and logs a warning. That is
    deliberate: the alternative is that a Redis outage locks every admin out of
    the system, turning a cache failure into a full outage. Rate limiting is a
    hardening measure, and the password check itself still stands behind it.

    NOTE: source IP is currently the webapp container for browser traffic,
    because the Next.js proxy does not forward the client address. The per-IP
    counter therefore behaves as one shared bucket for all browser logins until
    that is fixed (readiness assessment, axis J). The per-username counter is
    unaffected and does the real work in the meantime.
"""

import logging
from typing import Optional, Tuple

from fastapi import Request

logger = logging.getLogger(__name__)

# 8 attempts is well beyond a mistyped password and far below anything useful
# for guessing. 15 minutes is long enough to make sustained attempts pointless
# and short enough that a locked-out admin can wait it out rather than needing
# someone with database access.
MAX_ATTEMPTS = 8
WINDOW_SECONDS = 15 * 60

_USER_KEY = "loginfail:user:{}"
_IP_KEY = "loginfail:ip:{}"


def client_ip(request: Request) -> str:
    """Best-effort source address for the caller.

    Prefers the left-most X-Forwarded-For entry when a proxy supplies one.
    That header is client-controlled and trivially spoofed, so it is used only
    to *spread* counters across callers, never to grant access or bypass a
    limit — a forged value can at worst give the attacker their own bucket,
    which the per-username counter still covers.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


async def _counts(username: str, ip: str) -> Optional[Tuple[int, int]]:
    """Return (username failures, ip failures), or None when Redis is absent."""
    from redis_client import get_redis

    redis = get_redis()
    if redis is None:
        return None
    try:
        user_n = await redis.get(_USER_KEY.format(username.lower()))
        ip_n = await redis.get(_IP_KEY.format(ip))
        return int(user_n or 0), int(ip_n or 0)
    except Exception:
        logger.warning("login guard: Redis read failed; not throttling", exc_info=True)
        return None


async def is_locked(username: str, ip: str) -> bool:
    """True when either counter has reached the limit inside the window."""
    counts = await _counts(username, ip)
    if counts is None:
        return False
    user_n, ip_n = counts
    if user_n >= MAX_ATTEMPTS:
        logger.warning(
            "login guard: username=%s locked (%d failures in %ds)",
            username, user_n, WINDOW_SECONDS,
        )
        return True
    if ip_n >= MAX_ATTEMPTS:
        logger.warning(
            "login guard: ip=%s locked (%d failures in %ds)",
            ip, ip_n, WINDOW_SECONDS,
        )
        return True
    return False


async def record_failure(username: str, ip: str) -> None:
    """Increment both counters and refresh their expiry."""
    from redis_client import get_redis

    redis = get_redis()
    if redis is None:
        return
    try:
        for key in (_USER_KEY.format(username.lower()), _IP_KEY.format(ip)):
            # The TTL is re-set on every failure, so the window slides forward
            # while attempts continue rather than expiring mid-attack.
            await redis.incr(key)
            await redis.expire(key, WINDOW_SECONDS)
    except Exception:
        logger.warning("login guard: Redis write failed", exc_info=True)


async def clear(username: str, ip: str) -> None:
    """Drop both counters after a successful login."""
    from redis_client import get_redis

    redis = get_redis()
    if redis is None:
        return
    try:
        await redis.delete(_USER_KEY.format(username.lower()), _IP_KEY.format(ip))
    except Exception:
        logger.warning("login guard: Redis clear failed", exc_info=True)
