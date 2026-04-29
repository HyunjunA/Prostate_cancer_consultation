"""Module B: Per-user API key authentication.

Each user has one or more unique API keys stored as SHA-256 hashes in
``auth_api_key``. The key is sent via the same ``X-API-Key`` header.
"""

import hashlib
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from auth.base import AuthBackend, AuthUser as AuthUserDTO

logger = logging.getLogger(__name__)


def hash_api_key(raw_key: str) -> str:
    """Deterministic SHA-256 hash used for key lookup."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


class MultiKeyBackend(AuthBackend):
    """Authenticate using per-user API keys (``X-API-Key`` header)."""

    async def authenticate(self, request: Request) -> AuthUserDTO:
        api_key = request.headers.get("x-api-key")
        if api_key is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing API Key",
            )

        key_hash = hash_api_key(api_key)

        # Lazy imports to avoid circular dependency at module load time
        from auth.models import AuthAPIKey, AuthUser
        from db import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            stmt = (
                select(AuthAPIKey)
                .join(AuthUser, AuthAPIKey.user_id == AuthUser.id)
                .options(selectinload(AuthAPIKey.user))
                .where(
                    AuthAPIKey.key_hash == key_hash,
                    AuthAPIKey.is_active.is_(True),
                    AuthUser.is_active.is_(True),
                )
            )
            result = await db.execute(stmt)
            key_row = result.scalar_one_or_none()

            if key_row is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid API Key",
                )

            # Check expiration
            if key_row.expires_at and key_row.expires_at < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="API Key has expired",
                )

            # Update last_used_at (best-effort, non-blocking).
            # Failures are non-fatal — the auth check has already
            # succeeded by this point — but a silent swallow makes a
            # broken DB write invisible to operators. Log so the
            # failure surfaces, then roll back to keep the session
            # usable for whatever comes next.
            try:
                key_row.last_used_at = datetime.now(timezone.utc)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                logger.warning(
                    "last_used_at update failed for api_key (auth still succeeded): %s",
                    exc,
                )

            user = key_row.user
            return AuthUserDTO(
                user_id=str(user.id),
                username=user.username,
                role=user.role,
                is_superuser=user.is_superuser,
            )
