"""Module D: OAuth2 / OpenID Connect external IdP authentication.

Supports Google, Okta, Azure AD, and any OIDC-compliant provider.
The external IdP issues a JWT which is passed as ``Authorization: Bearer <token>``.
This backend verifies the token against the IdP's JWKS endpoint.

Users are auto-created in the local ``auth_user`` table on first login.

Required env vars:
    OAUTH2_ISSUER       — e.g. https://accounts.google.com
    OAUTH2_CLIENT_ID    — from the IdP console
    OAUTH2_AUDIENCE     — (optional) expected aud claim
"""

import logging
import os

from fastapi import HTTPException, Request, status

from auth.base import AuthBackend, AuthUser as AuthUserDTO

logger = logging.getLogger(__name__)

_ISSUER = os.getenv("OAUTH2_ISSUER", "")
_CLIENT_ID = os.getenv("OAUTH2_CLIENT_ID", "")
_AUDIENCE = os.getenv("OAUTH2_AUDIENCE", _CLIENT_ID)


def _get_jose():
    """Lazy import of python-jose."""
    try:
        from jose import jwt, JWTError, jwk
        return jwt, JWTError
    except ImportError:
        raise RuntimeError(
            "python-jose[cryptography] is required for AUTH_MODE=oauth2. "
            "Install with: pip install python-jose[cryptography]"
        )


async def _fetch_jwks(issuer: str) -> dict:
    """Fetch the JWKS from the issuer's well-known endpoint."""
    import httpx

    well_known_url = f"{issuer.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient() as client:
        oidc_resp = await client.get(well_known_url, timeout=10)
        oidc_resp.raise_for_status()
        jwks_uri = oidc_resp.json()["jwks_uri"]

        jwks_resp = await client.get(jwks_uri, timeout=10)
        jwks_resp.raise_for_status()
        return jwks_resp.json()


class OAuth2Backend(AuthBackend):
    """Authenticate using an external OAuth2/OIDC provider."""

    def __init__(self) -> None:
        if not _ISSUER:
            raise ValueError("OAUTH2_ISSUER env var is required for AUTH_MODE=oauth2")
        if not _CLIENT_ID:
            raise ValueError("OAUTH2_CLIENT_ID env var is required for AUTH_MODE=oauth2")
        self._jwks_cache: dict | None = None

    async def _get_jwks(self) -> dict:
        if self._jwks_cache is None:
            self._jwks_cache = await _fetch_jwks(_ISSUER)
        return self._jwks_cache

    async def authenticate(self, request: Request) -> AuthUserDTO:
        jwt_mod, JWTError = _get_jose()

        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid Authorization header",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header[7:]

        try:
            # Get unverified header to find the key ID
            unverified_header = jwt_mod.get_unverified_header(token)
            kid = unverified_header.get("kid")

            jwks = await self._get_jwks()

            # Find the matching key
            rsa_key = None
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    rsa_key = key
                    break

            if rsa_key is None:
                # Refresh JWKS in case keys rotated
                self._jwks_cache = None
                jwks = await self._get_jwks()
                for key in jwks.get("keys", []):
                    if key.get("kid") == kid:
                        rsa_key = key
                        break

            if rsa_key is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unable to find matching signing key",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            payload = jwt_mod.decode(
                token,
                rsa_key,
                algorithms=["RS256"],
                audience=_AUDIENCE if _AUDIENCE else None,
                issuer=_ISSUER,
            )
        except JWTError as exc:
            logger.warning("OAuth2 JWT decode failed: %s", exc)
            # Clear JWKS cache on failure (keys might have rotated)
            self._jwks_cache = None
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Extract user info from the IdP token
        sub = payload.get("sub", "")
        email = payload.get("email", "")
        name = payload.get("name") or payload.get("preferred_username") or email

        if not sub:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing 'sub' claim",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Auto-create or update user in local DB
        from auth.models import AuthUser
        from db import AsyncSessionLocal
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AuthUser).where(AuthUser.email == email)
            )
            db_user = result.scalar_one_or_none()

            if db_user is None:
                # Auto-create with 'user' role (admin must upgrade manually)
                db_user = AuthUser(
                    username=name,
                    email=email,
                    role="user",
                    is_superuser=False,
                    auth_provider=f"oauth2:{_ISSUER}",
                )
                db.add(db_user)
                await db.commit()
                await db.refresh(db_user)
                logger.info("Auto-created OAuth2 user: %s (%s)", name, email)

            if not db_user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="User account is deactivated",
                )

            return AuthUserDTO(
                user_id=str(db_user.id),
                username=db_user.username,
                role=db_user.role,
                is_superuser=db_user.is_superuser,
            )
