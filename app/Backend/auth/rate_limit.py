"""Rate limiting helper — a fail-open wrapper around fastapi-limiter.

WHY A WRAPPER
    `FastAPILimiter` was initialised at startup but applied to no route, so
    nothing was ever throttled. Attaching `RateLimiter` directly would have
    fixed that and introduced a worse problem: its `__call__` raises a bare
    Exception when Redis is unavailable, which turns every protected route into
    a 500. A Redis outage would take down patient-facing pages.

    That is the wrong direction to fail. Rate limiting is a hardening measure;
    the endpoints behind it still authenticate and still validate input. So
    when the limiter cannot run, requests pass and the failure is logged.

    A 429 from a genuine limit breach is NOT swallowed — only infrastructure
    failures are.

WHAT IS PROTECTED, AND WHY THOSE
    - The AI endpoints. Each call reaches Azure OpenAI and costs real money;
      an unthrottled loop is a billing incident as much as a load problem.
    - Transcript upload. 25 MB per request, and each accepted file starts a
      pipeline run.
    - Survey submission. A write path reachable with only a URL token.

    Read-only patient and doctor endpoints are deliberately left alone for now:
    the dashboards issue many small reads in normal use, and a limit tuned
    wrongly there would break the product to solve a problem nobody has yet.

IDENTITY
    fastapi-limiter keys on client IP. That only became meaningful once the
    webapp proxy started forwarding X-Forwarded-For — before it, every browser
    shared the container's address and one user could exhaust everyone's quota.
"""

import logging

from fastapi import Depends, HTTPException, Request, Response
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

logger = logging.getLogger(__name__)


def limit(times: int, seconds: int):
    """Return a FastAPI dependency limiting a route to `times` per `seconds`.

    Usage::

        @router.post("/expensive", dependencies=[limit(10, 60)])

    Fails open: when the limiter is unavailable the request proceeds.
    """
    limiter = RateLimiter(times=times, seconds=seconds)

    async def _dependency(request: Request, response: Response) -> None:
        if not FastAPILimiter.redis:
            # Startup logged the init failure already; staying quiet here keeps
            # one Redis outage from writing a line per request.
            return
        try:
            await limiter(request, response)
        except HTTPException:
            # 429 — a real breach. Must reach the client.
            raise
        except Exception:
            logger.warning(
                "Rate limiter unavailable for %s %s; allowing the request",
                request.method, request.url.path, exc_info=True,
            )

    return Depends(_dependency)
