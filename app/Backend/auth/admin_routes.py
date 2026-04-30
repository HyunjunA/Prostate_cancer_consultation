"""Admin API routes for managing users, API keys, and patient access.

All endpoints require an authenticated admin user (``role == "admin"``).
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.base import AuthUser as AuthUserDTO
from auth.models import AuthAPIKey, AuthUser, PatientAccess
from auth.schemas import (
    APIKeyCreate,
    APIKeyCreated,
    APIKeyResponse,
    LoginRequest,
    PatientAccessGrant,
    PatientAccessResponse,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Auth Admin"])


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _require_admin(user: AuthUserDTO) -> None:
    """Raise 403 if user is not an admin."""
    if user.role != "admin" and not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def _hash_password(password: str) -> str:
    """Hash a password with SHA-256 + salt.

    For production consider argon2/bcrypt via passlib; SHA-256 is used here
    to avoid adding passlib to requirements until Phase 4 (JWT mode).
    """
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${hashed}"


def _verify_password(password: str, stored: str) -> bool:
    """Verify a password against the stored salt$hash."""
    if "$" not in stored:
        return False
    salt, hashed = stored.split("$", 1)
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest() == hashed


# ──────────────────────────────────────────────────────────────────────────────
# User CRUD
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only)."""
    _require_admin(user)
    offset = (page - 1) * size
    stmt = select(AuthUser).order_by(AuthUser.id).offset(offset).limit(size)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user (admin only)."""
    _require_admin(user)

    new_user = AuthUser(
        username=body.username,
        email=body.email,
        password_hash=_hash_password(body.password) if body.password else None,
        role=body.role,
        is_superuser=body.is_superuser,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user by ID (admin only)."""
    _require_admin(user)
    result = await db.execute(select(AuthUser).where(AuthUser.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UserUpdate,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user fields (admin only)."""
    _require_admin(user)
    result = await db.execute(select(AuthUser).where(AuthUser.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    if "password" in update_data:
        db_user.password_hash = _hash_password(update_data.pop("password"))
    for field, value in update_data.items():
        setattr(db_user, field, value)

    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: int,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user (admin only). Cascades to keys and access records."""
    _require_admin(user)
    result = await db.execute(select(AuthUser).where(AuthUser.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(db_user)
    await db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# API Key Management
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/users/{user_id}/keys", response_model=List[APIKeyResponse])
async def list_user_keys(
    user_id: int,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List API keys for a user (admin only). Raw keys are NOT returned."""
    _require_admin(user)
    stmt = select(AuthAPIKey).where(AuthAPIKey.user_id == user_id).order_by(AuthAPIKey.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/users/{user_id}/keys", response_model=APIKeyCreated, status_code=201)
async def create_api_key(
    user_id: int,
    body: APIKeyCreate,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new API key for a user.

    The raw key is returned **only once** in the response.
    """
    _require_admin(user)

    # Verify target user exists
    result = await db.execute(select(AuthUser).where(AuthUser.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    raw_key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    new_key = AuthAPIKey(
        user_id=user_id,
        key_hash=key_hash,
        label=body.label,
        expires_at=expires_at,
    )
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)

    return APIKeyCreated(
        id=new_key.id,
        label=new_key.label,
        is_active=new_key.is_active,
        created_at=new_key.created_at,
        expires_at=new_key.expires_at,
        last_used_at=new_key.last_used_at,
        raw_key=raw_key,
    )


@router.delete("/users/{user_id}/keys/{key_id}", status_code=204)
async def revoke_api_key(
    user_id: int,
    key_id: int,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    _require_admin(user)
    stmt = select(AuthAPIKey).where(
        AuthAPIKey.id == key_id,
        AuthAPIKey.user_id == user_id,
    )
    result = await db.execute(stmt)
    key_row = result.scalar_one_or_none()
    if not key_row:
        raise HTTPException(status_code=404, detail="API key not found")
    key_row.is_active = False
    await db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# Patient Access Management
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/users/{user_id}/patients", response_model=List[PatientAccessResponse])
async def list_patient_access(
    user_id: int,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List patient access records for a user (admin only)."""
    _require_admin(user)
    stmt = select(PatientAccess).where(PatientAccess.user_id == user_id).order_by(PatientAccess.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/users/{user_id}/patients", response_model=PatientAccessResponse, status_code=201)
async def grant_patient_access(
    user_id: int,
    body: PatientAccessGrant,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Grant patient access to a user (admin only)."""
    _require_admin(user)

    # Verify target user exists
    result = await db.execute(select(AuthUser).where(AuthUser.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Check for duplicate
    stmt = select(PatientAccess).where(
        PatientAccess.user_id == user_id,
        PatientAccess.patient_id == body.patient_id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Access already granted for this patient")

    access = PatientAccess(
        user_id=user_id,
        patient_id=body.patient_id,
        access_type=body.access_type,
        granted_by=int(user.user_id) if user.user_id.isdigit() else None,
    )
    db.add(access)
    await db.commit()
    await db.refresh(access)
    return access


@router.delete("/users/{user_id}/patients/{patient_id}", status_code=204)
async def revoke_patient_access(
    user_id: int,
    patient_id: str,
    user: AuthUserDTO = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke patient access from a user (admin only)."""
    _require_admin(user)
    stmt = select(PatientAccess).where(
        PatientAccess.user_id == user_id,
        PatientAccess.patient_id == patient_id,
    )
    result = await db.execute(stmt)
    access = result.scalar_one_or_none()
    if not access:
        raise HTTPException(status_code=404, detail="Patient access not found")
    await db.delete(access)
    await db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# JWT Login (only active when AUTH_MODE=jwt)
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with username + password and receive a JWT token.

    Only functional when ``AUTH_MODE=jwt``.
    """
    import os
    if os.getenv("AUTH_MODE", "api_key") != "jwt":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login endpoint is only available in AUTH_MODE=jwt",
        )

    result = await db.execute(
        select(AuthUser).where(
            AuthUser.username == body.username,
            AuthUser.is_active.is_(True),
        )
    )
    db_user = result.scalar_one_or_none()

    if db_user is None or not db_user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not _verify_password(body.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    from auth.backends.jwt_auth import create_access_token, _JWT_EXPIRE_MINUTES

    token = create_access_token(
        user_id=db_user.id,
        username=db_user.username,
        role=db_user.role,
        is_superuser=db_user.is_superuser,
    )

    return TokenResponse(
        access_token=token,
        expires_in=_JWT_EXPIRE_MINUTES * 60,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Auth Info
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(user: AuthUserDTO = Depends(get_current_user)):
    """Return the currently authenticated user's info."""
    return {
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "is_superuser": user.is_superuser,
    }


@router.get("/mode")
async def get_auth_mode():
    """Return the current AUTH_MODE (public, no auth required)."""
    import os
    return {"auth_mode": os.getenv("AUTH_MODE", "api_key")}
