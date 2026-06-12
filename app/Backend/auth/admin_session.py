"""Admin session authentication — JWT-based, independent of ``AUTH_MODE``.

The dashboard API runs ``AUTH_MODE=api_key`` (a single shared key injected by
the Next.js proxy) for the patient/doctor-facing endpoints, which are reached
without a per-user login. The admin tracking screens, by contrast, must be
gated behind a real per-user login.

This module provides the ``require_admin_user`` dependency: it authenticates an
admin from a JWT issued by ``POST /api/admin-auth/login`` and presented either
as an ``Authorization: Bearer <token>`` header or an ``admin_session`` cookie.
It verifies the signature and expiry, reloads the user, and enforces the admin
role — regardless of which backend ``AUTH_MODE`` selects for the rest of the
API. The JWT is signed/verified with the same secret as ``auth.backends.jwt_auth``.
"""

import logging
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy import select

from auth.backends.jwt_auth import _JWT_ALGORITHM, _JWT_SECRET, _get_jose
from auth.base import AuthUser as AuthUserDTO

logger = logging.getLogger(__name__)

# Name of the httpOnly cookie set by the Next.js login route handler.
ADMIN_COOKIE_NAME = "admin_session"


def _extract_token(request: Request) -> Optional[str]:
    """Pull the admin JWT from the Authorization header or the session cookie.

    The Next.js proxy forwards the cookie value as ``Authorization: Bearer``;
    the cookie itself is supported as a fallback for direct calls.
    """
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    cookie = request.cookies.get(ADMIN_COOKIE_NAME)
    if cookie:
        return cookie.strip()
    return None


async def require_admin_user(request: Request) -> AuthUserDTO:
    """FastAPI dependency — require a valid, active, admin-role JWT.

    Raises 401 when the token is missing/invalid/expired or the user is gone,
    and 403 when the authenticated user is not an admin.
    """
    jwt, JWTError = _get_jose()

    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except JWTError as exc:
        logger.warning("Admin JWT decode failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin session",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Re-load the user so a deactivated/deleted account cannot keep a live token.
    from auth.models import AuthUser
    from db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AuthUser).where(
                AuthUser.id == int(user_id),
                AuthUser.is_active.is_(True),
            )
        )
        db_user = result.scalar_one_or_none()

    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    if db_user.role != "admin" and not db_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return AuthUserDTO(
        user_id=str(db_user.id),
        username=db_user.username,
        role=db_user.role,
        is_superuser=db_user.is_superuser,
    )
