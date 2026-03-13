"""Module A: Single shared API key authentication (default).

Replicates the existing ``_verify_api_key`` behaviour exactly.
The returned ``AuthUser`` has ``is_superuser=True`` so that all patient
access-control checks are bypassed — identical to pre-auth behaviour.
"""

import hmac
import os

from fastapi import HTTPException, Request, status

from auth.base import AuthBackend, AuthUser

_API_KEY: str = os.environ["API_KEY"]


class APIKeyBackend(AuthBackend):
    """Authenticate using a single shared ``X-API-Key`` header."""

    async def authenticate(self, request: Request) -> AuthUser:
        api_key = request.headers.get("x-api-key")
        if api_key is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing API Key",
            )
        if not hmac.compare_digest(api_key, _API_KEY):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid API Key",
            )
        return AuthUser(
            user_id="system",
            username="system",
            role="admin",
            is_superuser=True,
        )
