"""Admin authentication routes — login / me.

Independent of ``AUTH_MODE``: issues a JWT for admin users so the admin
tracking screens can be gated behind a real login while the rest of the API
keeps using ``AUTH_MODE=api_key``. The token is returned in the response body;
the Next.js login route handler stores it in an httpOnly cookie. Logout is
handled entirely on the Next.js side by clearing that cookie (the JWT is
stateless), so there is no server logout endpoint.

This is intentionally separate from ``auth/admin_routes.py``'s ``/api/auth/login``,
which only functions under ``AUTH_MODE=jwt``.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.admin_routes import _verify_password
from auth.admin_session import require_admin_user
from auth.backends.jwt_auth import _JWT_EXPIRE_MINUTES, create_access_token
from auth.base import AuthUser as AuthUserDTO
from auth.models import AuthUser
from auth.schemas import LoginRequest, TokenResponse, UserResponse
from db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin-auth", tags=["Admin Auth"])


@router.post("/login", response_model=TokenResponse)
async def admin_login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate an admin (username + password) and return a JWT.

    Works regardless of the global ``AUTH_MODE``. Only users with the admin
    role (or ``is_superuser``) may obtain a token here; everyone else gets 403
    so a non-admin account cannot mint an admin session.
    """
    result = await db.execute(
        select(AuthUser).where(
            AuthUser.username == body.username,
            AuthUser.is_active.is_(True),
        )
    )
    db_user = result.scalar_one_or_none()

    if (
        db_user is None
        or not db_user.password_hash
        or not _verify_password(body.password, db_user.password_hash)
    ):
        # Same message for unknown user and bad password — no account enumeration.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if db_user.role != "admin" and not db_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    token = create_access_token(
        user_id=db_user.id,
        username=db_user.username,
        role=db_user.role,
        is_superuser=db_user.is_superuser,
    )
    logger.info("Admin login succeeded for user=%s (id=%s)", db_user.username, db_user.id)

    return TokenResponse(
        access_token=token,
        expires_in=_JWT_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
async def admin_me(
    user: AuthUserDTO = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AuthUser:
    """Return the currently authenticated admin user (for the UI / session check)."""
    result = await db.execute(select(AuthUser).where(AuthUser.id == int(user.user_id)))
    db_user = result.scalar_one_or_none()
    if db_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return db_user
