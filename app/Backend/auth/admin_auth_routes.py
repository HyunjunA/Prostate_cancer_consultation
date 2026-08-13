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

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import login_guard
from auth.admin_routes import _hash_password, _needs_rehash, _verify_password
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
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate an admin (username + password) and return a JWT.

    Works regardless of the global ``AUTH_MODE``. Only users with the admin
    role (or ``is_superuser``) may obtain a token here; everyone else gets 403
    so a non-admin account cannot mint an admin session.
    """
    ip = login_guard.client_ip(request)

    # Check the throttle BEFORE touching the database or hashing anything, so a
    # locked-out attacker cannot keep spending server CPU on scrypt.
    if await login_guard.is_locked(body.username, ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
            headers={"Retry-After": str(login_guard.WINDOW_SECONDS)},
        )

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
        await login_guard.record_failure(body.username, ip)
        # Failed logins were not recorded at all, so a sustained attack left no
        # trace. Log the username and source, never the attempted password.
        logger.warning(
            "Admin login failed for user=%s from ip=%s", body.username, ip
        )
        # Same message for unknown user and bad password — no account enumeration.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if db_user.role != "admin" and not db_user.is_superuser:
        # Credentials were correct, so this is not a guess — do not count it
        # against the throttle, but do record it: a valid non-admin account
        # probing the admin endpoint is worth seeing.
        logger.warning(
            "Non-admin user=%s attempted admin login from ip=%s", db_user.username, ip
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    await login_guard.clear(body.username, ip)

    # Upgrade a legacy hash now, while the plaintext is in hand — the only
    # moment it can be done without asking the user to reset anything. Wrapped
    # so a write failure cannot turn a valid login into an error: the upgrade
    # is opportunistic and will simply be retried at the next login.
    if _needs_rehash(db_user.password_hash):
        try:
            db_user.password_hash = _hash_password(body.password)
            await db.commit()
            logger.info("Upgraded password hash to scrypt for user=%s", db_user.username)
        except Exception:
            await db.rollback()
            logger.warning(
                "Password hash upgrade failed for user=%s; login still granted",
                db_user.username, exc_info=True,
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
