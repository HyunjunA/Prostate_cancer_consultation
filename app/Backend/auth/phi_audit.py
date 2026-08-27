"""PHI access audit trail — HIPAA 164.312(b).

WHY A MIDDLEWARE
    `auth.access_control.check_patient_access` looks like the natural hook, and
    an earlier plan said so. It is not: it is called from 5 places across 28
    patient- and doctor-facing routes. Hooking it would have produced an audit
    trail with holes, which is worse than none — it reads as complete.

    A middleware records by construction. A route added next year cannot forget
    to opt in, and a route that changes its auth still gets logged.

WHAT IS RECORDED
    Only paths that can return patient data (see AUDITED_PREFIXES). Behaviour
    telemetry under /api/track/ is excluded: it is high volume, writes rather
    than reads, and carries no patient content — logging it would bury the rows
    that matter under noise.

    The query string is NOT stored. It carries the file token, and copying that
    into a second table widens the exposure surface instead of narrowing it.
    `patient_ref` captures the token deliberately and on its own.

FAILURE MODE
    Audit failures never break a request. That is a real trade-off, so state it
    plainly: a request whose audit write fails is served and NOT recorded,
    which is a gap in the trail. The alternative — refusing the request — turns
    a database hiccup into an outage of the patient-facing system. For a
    research deployment with one database, availability wins; the failure is
    logged at ERROR so it is at least visible.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# Prefixes whose responses can contain patient data.
AUDITED_PREFIXES = (
    "/api/patient/",
    "/api/doctor/",
    "/api/surveys/",
    "/api/admin/",
)

# Never audited: high-volume writes with no patient content, and the
# unauthenticated liveness probes.
EXEMPT_PREFIXES = (
    "/api/track/",
    "/health",
    "/ready",
)

# Endpoints that sit under an audited prefix but disclose nothing about any
# patient. Exact matches only — a prefix rule here would be too easy to widen
# by accident.
#
# WHY THIS LIST EXISTS
#     Measured over the first 15 minutes of auditing: 214 of 283 rows were
#     /api/patient/processing-count, a poll that returns {"processing": N} and
#     names no patient. Only 4 rows carried a patient reference at all. Left
#     alone that is ~10 million rows and ~6 GB a year, of which three quarters
#     say nothing — and an audit log nobody can read is not an audit log. The
#     retention obligation (six years) makes the volume matter twice over.
#
# The bar for adding to this list: the response must be incapable of revealing
# anything about an individual, whoever calls it. A global counter qualifies.
# Anything keyed by a file token, speaker, or record id does not.
EXEMPT_PATHS = frozenset({
    "/api/patient/processing-count",   # returns {"processing": <int>} only
})

# File tokens are the AES-SIV base32 names the pipeline produces; speaker and
# record ids appear as path segments. Pull whichever is present so a reviewer
# can ask "who touched this patient?" without parsing paths by hand.
_TOKEN_RE = re.compile(r"/(?:files?|sentences|ai-summary|by-file|rewrites)/([^/?]+)")
_LONG_HASH_RE = re.compile(r"\b([A-Z2-7]{26,})\b")


def should_audit(path: str) -> bool:
    """True when this path can return patient data."""
    if path in EXEMPT_PATHS:
        return False
    if any(path.startswith(p) for p in EXEMPT_PREFIXES):
        return False
    return any(path.startswith(p) for p in AUDITED_PREFIXES)


def extract_patient_ref(path: str, query: str) -> Optional[str]:
    """Best-effort patient identifier for this request.

    Looks in the path first, then the query string — most patient reads pass
    the file token as `?f=` or `?file=`. Returns None rather than guessing when
    nothing recognisable is present; a wrong reference is worse than a blank
    one, because a reviewer would trust it.
    """
    m = _TOKEN_RE.search(path)
    if m:
        return m.group(1)[:500]
    for source in (path, query):
        m = _LONG_HASH_RE.search(source or "")
        if m:
            return m.group(1)[:500]
    return None


async def record_access(
    *,
    actor: Optional[str],
    source_ip: Optional[str],
    method: str,
    path: str,
    patient_ref: Optional[str],
    status_code: int,
    user_agent: Optional[str],
) -> None:
    """Write one audit row. Never raises."""
    try:
        from db import AsyncSessionLocal
        from models import PhiAccessLog

        async with AsyncSessionLocal() as session:
            session.add(
                PhiAccessLog(
                    actor=actor,
                    source_ip=source_ip,
                    method=method,
                    path=path[:500],
                    patient_ref=patient_ref,
                    status_code=status_code,
                    user_agent=(user_agent or "")[:500] or None,
                )
            )
            await session.commit()
    except Exception:
        # ERROR, not WARNING: a missing audit row is a compliance gap, and the
        # only signal that it happened is this line.
        logger.error(
            "PHI audit write FAILED — request served but not recorded: %s %s",
            method, path, exc_info=True,
        )


def resolve_actor(request) -> str:
    """Identify the caller as well as the current auth scheme allows.

    Under AUTH_MODE=api_key every caller shares one key and is indistinguishable
    — "system" is the honest answer, not a placeholder to be improved by
    guessing. An admin JWT is present on admin routes, so prefer that when it
    is there.
    """
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        try:
            from auth.backends.jwt_auth import _JWT_ALGORITHM, _JWT_SECRET, _get_jose

            jwt, _ = _get_jose()
            payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
            username = payload.get("username")
            if username:
                return str(username)[:255]
        except Exception:
            # An invalid or expired token still identifies an attempt; fall
            # through rather than failing the audit write.
            return "invalid-token"
    if request.headers.get("x-api-key"):
        return "system"
    return "anonymous"


def client_ip(request) -> Optional[str]:
    """Real client address, honouring the proxy chain.

    uvicorn runs with --proxy-headers and a restricted --forwarded-allow-ips,
    so request.client.host is already the forwarded address when the hop was
    trusted. The header is read as a fallback for direct callers.
    """
    if request.client and request.client.host:
        return request.client.host[:64]
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return None
