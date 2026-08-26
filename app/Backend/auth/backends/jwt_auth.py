"""Module C: JWT token authentication.

Users authenticate via ``POST /api/auth/login`` (username + password),
receive a JWT access token, then pass it as ``Authorization: Bearer <token>``
on subsequent requests.
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status

from auth.base import AuthBackend, AuthUser as AuthUserDTO
from core.settings import get_settings

logger = logging.getLogger(__name__)

# Read through Settings, NOT os.getenv. pydantic-settings loads .env as a FILE;
# those values never enter the process environment, so os.getenv("JWT_SECRET")
# returned None under systemd (the unit sets no EnvironmentFile) and this
# silently fell through to the development literal below. The backend then
# signed admin JWTs with a constant published in this repo while the webapp
# middleware verified them against the real .env secret: every admin login
# succeeded at the API and was then bounced straight back to the login page.
#
# The Settings validator did not catch it because it checks `settings.jwt_secret`
# — the value this module was not using. Reading the same source it validates is
# what makes that check mean something.
_settings = get_settings()

_JWT_SECRET = _settings.jwt_secret or os.getenv("SECRET_KEY") or ""

if not _JWT_SECRET:
    # No "change-me" fallback outside development. A default value means anyone
    # who reads this file can mint a valid admin session — and because
    # everything keeps working, nothing ever surfaces that it happened.
    if _settings.environment == "development":
        _JWT_SECRET = "insecure-development-only-secret-do-not-use-in-production"
        logger.warning(
            "JWT_SECRET is unset; using the development-only signing secret. "
            "Admin sessions are forgeable — never run this outside development."
        )
    else:
        raise RuntimeError(
            f"ENVIRONMENT={_settings.environment!r} but JWT_SECRET is unset. "
            "Set it in app/Backend/.env. Refusing to sign admin sessions with a "
            "publicly known secret."
        )
_JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", os.getenv("ALGORITHM", "HS256"))
_JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))


def _get_jose():
    """Lazy import of python-jose to fail only when JWT mode is actually used."""
    try:
        from jose import jwt, JWTError
        return jwt, JWTError
    except ImportError:
        raise RuntimeError(
            "python-jose[cryptography] is required for AUTH_MODE=jwt. "
            "Install with: pip install python-jose[cryptography]"
        )


def create_access_token(user_id: int, username: str, role: str, is_superuser: bool) -> str:
    """Create a JWT access token for a user."""
    jwt, _ = _get_jose()
    expire = datetime.now(timezone.utc) + timedelta(minutes=_JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "is_superuser": is_superuser,
        "exp": expire,
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


class JWTBackend(AuthBackend):
    """Authenticate using JWT Bearer tokens."""

    async def authenticate(self, request: Request) -> AuthUserDTO:
        jwt, JWTError = _get_jose()

        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header[7:]  # strip "Bearer "

        try:
            payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        except JWTError as exc:
            logger.warning("JWT decode failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Optionally verify user still exists and is active
        from auth.models import AuthUser
        from db import AsyncSessionLocal
        from sqlalchemy import select

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
                headers={"WWW-Authenticate": "Bearer"},
            )

        return AuthUserDTO(
            user_id=str(db_user.id),
            username=db_user.username,
            role=db_user.role,
            is_superuser=db_user.is_superuser,
        )
