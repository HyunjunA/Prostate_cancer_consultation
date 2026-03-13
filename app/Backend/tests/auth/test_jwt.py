"""Tests for JWT authentication backend (auth module C).

Covers auth/backends/jwt_auth.py — JWT Bearer token authentication where users
log in with username + password and receive an access token.

Test categories:
  - create_access_token() — token creation with correct payload
  - JWTBackend.authenticate() — valid tokens, missing header, invalid tokens
  - Expired token handling
  - Token payload validation (missing sub, malformed)
  - Inactive / missing user in DB
  - Registry integration (AUTH_MODE=jwt)
  - _get_jose() lazy import
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from auth.backends.jwt_auth import (
    JWTBackend,
    _JWT_ALGORITHM,
    _JWT_SECRET,
    create_access_token,
)
from auth.base import AuthUser as AuthUserDTO


# ── Helper: build a mock Request ──────────────────────────────────────────

def _make_request(auth_header: Optional[str] = None) -> MagicMock:
    """Create a mock FastAPI Request with an optional Authorization header."""
    request = MagicMock()
    headers = {}
    if auth_header is not None:
        headers["authorization"] = auth_header
    request.headers = headers
    return request


def _make_db_user(
    user_id: int = 1,
    username: str = "testuser",
    role: str = "user",
    is_superuser: bool = False,
    is_active: bool = True,
):
    """Create a mock AuthUser DB model object."""
    user = MagicMock()
    user.id = user_id
    user.username = username
    user.role = role
    user.is_superuser = is_superuser
    user.is_active = is_active
    return user


# ── create_access_token() ─────────────────────────────────────────────────

class TestCreateAccessToken:
    """Tests for the create_access_token() function."""

    def test_returns_string_token(self):
        """create_access_token should return a string JWT."""
        token = create_access_token(
            user_id=1, username="alice", role="admin", is_superuser=True
        )
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_payload_contains_sub(self):
        """Token payload should include 'sub' as a string user_id."""
        token = create_access_token(
            user_id=42, username="bob", role="user", is_superuser=False
        )
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        assert payload["sub"] == "42"

    def test_token_payload_contains_username(self):
        """Token payload should include the username."""
        token = create_access_token(
            user_id=1, username="carol", role="user", is_superuser=False
        )
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        assert payload["username"] == "carol"

    def test_token_payload_contains_role(self):
        """Token payload should include the role."""
        token = create_access_token(
            user_id=1, username="dave", role="admin", is_superuser=True
        )
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        assert payload["role"] == "admin"

    def test_token_payload_contains_is_superuser(self):
        """Token payload should include is_superuser flag."""
        token = create_access_token(
            user_id=1, username="eve", role="user", is_superuser=True
        )
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        assert payload["is_superuser"] is True

    def test_token_payload_contains_exp(self):
        """Token should have an expiration claim."""
        token = create_access_token(
            user_id=1, username="frank", role="user", is_superuser=False
        )
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        assert "exp" in payload

    def test_token_expiration_is_in_future(self):
        """The exp claim should be in the future."""
        token = create_access_token(
            user_id=1, username="grace", role="user", is_superuser=False
        )
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_different_users_get_different_tokens(self):
        """Two different users should produce different tokens."""
        t1 = create_access_token(user_id=1, username="a", role="user", is_superuser=False)
        t2 = create_access_token(user_id=2, username="b", role="user", is_superuser=False)
        assert t1 != t2


# ── JWTBackend.authenticate() — Missing Header ───────────────────────────

class TestJWTMissingHeader:
    """Requests without Authorization header should fail."""

    async def test_no_auth_header_raises_401(self):
        """Missing Authorization header should raise 401."""
        backend = JWTBackend()
        request = _make_request(auth_header=None)
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401
        assert "Missing or invalid" in exc_info.value.detail

    async def test_no_auth_header_includes_www_authenticate(self):
        """401 response should include WWW-Authenticate: Bearer header."""
        backend = JWTBackend()
        request = _make_request(auth_header=None)
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.headers.get("WWW-Authenticate") == "Bearer"

    async def test_non_bearer_scheme_raises_401(self):
        """Authorization header without 'Bearer ' prefix should fail."""
        backend = JWTBackend()
        request = _make_request(auth_header="Basic dXNlcjpwYXNz")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401

    async def test_empty_auth_header_raises_401(self):
        """Empty Authorization header should raise 401."""
        backend = JWTBackend()
        request = _make_request(auth_header="")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401

    async def test_bearer_only_no_token_raises_401(self):
        """'Bearer ' with no token value should raise 401 (invalid token)."""
        backend = JWTBackend()
        request = _make_request(auth_header="Bearer ")

        # The empty string after "Bearer " will fail JWT decode
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401


# ── JWTBackend.authenticate() — Invalid Token ────────────────────────────

class TestJWTInvalidToken:
    """Requests with an invalid or tampered JWT should fail."""

    async def test_malformed_token_raises_401(self):
        """A completely invalid JWT string should raise 401."""
        backend = JWTBackend()
        request = _make_request(auth_header="Bearer not-a-real-jwt")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401
        assert "Invalid or expired" in exc_info.value.detail

    async def test_wrong_secret_raises_401(self):
        """A token signed with a different secret should fail verification."""
        token = jwt.encode(
            {"sub": "1", "username": "test", "role": "user", "is_superuser": False,
             "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret",
            algorithm="HS256",
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401


# ── JWTBackend.authenticate() — Expired Token ────────────────────────────

class TestJWTExpiredToken:
    """Tokens past their expiration should be rejected."""

    async def test_expired_token_raises_401(self):
        """A token with exp in the past should raise 401."""
        expired_payload = {
            "sub": "1",
            "username": "test",
            "role": "user",
            "is_superuser": False,
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        token = jwt.encode(expired_payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401
        assert "Invalid or expired" in exc_info.value.detail


# ── JWTBackend.authenticate() — Missing sub Claim ────────────────────────

class TestJWTMissingSub:
    """Tokens without a 'sub' claim should fail."""

    async def test_token_without_sub_raises_401(self):
        """A token missing the 'sub' claim should raise 401."""
        payload = {
            "username": "test",
            "role": "user",
            "is_superuser": False,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401
        assert "Invalid token payload" in exc_info.value.detail

    async def test_token_with_empty_sub_raises_401(self):
        """A token with empty string 'sub' should raise 401."""
        payload = {
            "sub": "",
            "username": "test",
            "role": "user",
            "is_superuser": False,
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401


# ── JWTBackend.authenticate() — Valid Token + DB Checks ──────────────────

class TestJWTValidToken:
    """Valid token + active user in DB should succeed."""

    async def test_valid_token_returns_auth_user(self):
        """A valid token with an active user in DB returns AuthUserDTO."""
        token = create_access_token(
            user_id=10, username="alice", role="admin", is_superuser=True
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")

        db_user = _make_db_user(
            user_id=10, username="alice", role="admin", is_superuser=True
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = db_user

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert isinstance(result, AuthUserDTO)
        assert result.user_id == "10"
        assert result.username == "alice"
        assert result.role == "admin"
        assert result.is_superuser is True

    async def test_valid_token_inactive_user_raises_401(self):
        """Token is valid but user is inactive in DB -> 401."""
        token = create_access_token(
            user_id=20, username="deactivated", role="user", is_superuser=False
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")

        # DB returns None (user inactive, filtered out by is_active query)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 401
            assert "User not found or inactive" in exc_info.value.detail

    async def test_valid_token_deleted_user_raises_401(self):
        """Token is valid but user was deleted from DB -> 401."""
        token = create_access_token(
            user_id=99, username="deleted", role="user", is_superuser=False
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 401

    async def test_returns_db_values_not_token_values(self):
        """AuthUserDTO should reflect DB values, not token payload values."""
        # Create token with one set of values
        token = create_access_token(
            user_id=30, username="token-name", role="user", is_superuser=False
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"Bearer {token}")

        # DB has potentially different values (username/role updated after token issued)
        db_user = _make_db_user(
            user_id=30, username="db-name", role="admin", is_superuser=True
        )

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = db_user

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        # Should use DB values
        assert result.username == "db-name"
        assert result.role == "admin"
        assert result.is_superuser is True


# ── Registry Integration ──────────────────────────────────────────────────

class TestJWTRegistryIntegration:
    """Verify AUTH_MODE=jwt selects JWTBackend via the registry."""

    def test_registry_returns_jwt_backend(self, monkeypatch):
        """Setting AUTH_MODE=jwt should produce a JWTBackend."""
        from auth.registry import _get_backend
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "jwt")

        backend = _get_backend()
        assert isinstance(backend, JWTBackend)

        # Cleanup
        _get_backend.cache_clear()


# ── _get_jose() Lazy Import ──────────────────────────────────────────────

class TestGetJose:
    """Tests for the lazy jose import function."""

    def test_get_jose_returns_jwt_and_error(self):
        """_get_jose() should return (jwt, JWTError) tuple."""
        from auth.backends.jwt_auth import _get_jose
        jwt_mod, error_cls = _get_jose()
        assert hasattr(jwt_mod, "encode")
        assert hasattr(jwt_mod, "decode")
        assert issubclass(error_cls, Exception)


# ── Bearer Prefix Handling ────────────────────────────────────────────────

class TestBearerPrefixHandling:
    """Edge cases in extracting the token from the Authorization header."""

    async def test_lowercase_bearer_accepted(self):
        """'bearer ' (lowercase) should also be accepted."""
        token = create_access_token(
            user_id=1, username="test", role="user", is_superuser=False
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"bearer {token}")

        db_user = _make_db_user(user_id=1, username="test")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = db_user

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)
        assert result.user_id == "1"

    async def test_mixed_case_bearer_accepted(self):
        """'BEARER ' (uppercase) should also be accepted due to .lower()."""
        token = create_access_token(
            user_id=2, username="test2", role="user", is_superuser=False
        )
        backend = JWTBackend()
        request = _make_request(auth_header=f"BEARER {token}")

        db_user = _make_db_user(user_id=2, username="test2")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = db_user

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)
        assert result.user_id == "2"
