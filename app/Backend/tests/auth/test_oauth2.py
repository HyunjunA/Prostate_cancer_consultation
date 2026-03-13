"""Tests for OAuth2 / OpenID Connect authentication backend (auth module D).

Covers auth/backends/oauth2.py — External IdP token verification via JWKS,
auto-creation of local users, and deactivated user handling.

Test categories:
  - OAuth2Backend.__init__() — env var validation
  - _fetch_jwks() — JWKS endpoint fetching
  - OAuth2Backend.authenticate() — header validation, token decode, user lookup
  - Auto-creation of new users from IdP tokens
  - Deactivated user handling
  - JWKS key rotation / cache invalidation
  - Registry integration (AUTH_MODE=oauth2)
"""

from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

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


# ── OAuth2Backend.__init__() — Env Var Validation ─────────────────────────

class TestOAuth2Init:
    """OAuth2Backend requires OAUTH2_ISSUER and OAUTH2_CLIENT_ID."""

    def test_missing_issuer_raises_value_error(self, monkeypatch):
        """Missing OAUTH2_ISSUER should raise ValueError."""
        monkeypatch.setenv("OAUTH2_ISSUER", "")
        monkeypatch.setenv("OAUTH2_CLIENT_ID", "test-client-id")

        # Need to reload the module to pick up new env vars
        import importlib
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "test-client-id")

        with pytest.raises(ValueError, match="OAUTH2_ISSUER"):
            oauth2_mod.OAuth2Backend()

    def test_missing_client_id_raises_value_error(self, monkeypatch):
        """Missing OAUTH2_CLIENT_ID should raise ValueError."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://accounts.google.com")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "")

        with pytest.raises(ValueError, match="OAUTH2_CLIENT_ID"):
            oauth2_mod.OAuth2Backend()

    def test_valid_env_creates_backend(self, monkeypatch):
        """Valid OAUTH2_ISSUER and OAUTH2_CLIENT_ID should create backend."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://accounts.google.com")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "my-client-id")

        backend = oauth2_mod.OAuth2Backend()
        assert backend._jwks_cache is None


# ── OAuth2Backend.authenticate() — Missing Header ────────────────────────

class TestOAuth2MissingHeader:
    """Requests without a proper Authorization: Bearer header should fail."""

    async def test_no_auth_header_raises_401(self, monkeypatch):
        """Missing Authorization header should raise 401."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header=None)

        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401
        assert "Missing or invalid" in exc_info.value.detail

    async def test_no_auth_header_www_authenticate(self, monkeypatch):
        """401 response should include WWW-Authenticate: Bearer header."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header=None)

        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.headers.get("WWW-Authenticate") == "Bearer"

    async def test_non_bearer_scheme_raises_401(self, monkeypatch):
        """Basic auth scheme should be rejected."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header="Basic dXNlcjpwYXNz")

        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401

    async def test_empty_auth_header_raises_401(self, monkeypatch):
        """Empty Authorization header should raise 401."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header="")

        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401


# ── OAuth2Backend.authenticate() — Invalid Token ─────────────────────────

class TestOAuth2InvalidToken:
    """Requests with invalid/tampered tokens should fail."""

    async def test_malformed_token_raises_401(self, monkeypatch):
        """A completely invalid JWT string should raise 401."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header="Bearer not-a-jwt-at-all")

        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 401

    async def test_jwt_decode_error_clears_jwks_cache(self, monkeypatch):
        """On JWTError, the JWKS cache should be cleared."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        backend._jwks_cache = {"keys": []}  # Pre-populate cache
        request = _make_request(auth_header="Bearer invalid.jwt.token")

        with pytest.raises(HTTPException):
            await backend.authenticate(request)

        # Cache should be cleared after failure
        assert backend._jwks_cache is None


# ── OAuth2Backend — JWKS Key Matching ─────────────────────────────────────

class TestOAuth2KeyMatching:
    """Test JWKS key matching and rotation logic."""

    async def test_no_matching_kid_refreshes_jwks(self, monkeypatch):
        """If kid not found in cached JWKS, cache should be invalidated and refetched."""
        from jose import jwt as jwt_mod

        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()

        # Create a token with a specific kid
        token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid"
        request = _make_request(auth_header=f"Bearer {token}")

        # First JWKS fetch returns no matching key, second also no match -> 401
        fetch_count = 0

        async def mock_fetch_jwks(issuer):
            nonlocal fetch_count
            fetch_count += 1
            return {"keys": [{"kid": "other-kid", "kty": "RSA"}]}

        with patch.object(oauth2_mod, "_fetch_jwks", side_effect=mock_fetch_jwks):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 401
            assert "Unable to find matching signing key" in exc_info.value.detail
            # Should have fetched JWKS twice (initial + retry)
            assert fetch_count == 2

    async def test_kid_found_on_first_try(self, monkeypatch):
        """If kid is found in cached JWKS, decode is attempted (no 'key not found' error)."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()

        # Pre-populate JWKS cache with a matching kid
        backend._jwks_cache = {"keys": [{"kid": "test-kid", "kty": "RSA"}]}

        token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid"
        request = _make_request(auth_header=f"Bearer {token}")

        # Mock _get_jose so that decode raises JWTError (simulating invalid signature)
        mock_jwt = MagicMock()
        mock_jwt.get_unverified_header.return_value = {"kid": "test-kid", "alg": "RS256"}
        mock_error = type("JWTError", (Exception,), {})
        mock_jwt.decode.side_effect = mock_error("invalid signature")

        with patch.object(oauth2_mod, "_get_jose", return_value=(mock_jwt, mock_error)):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
        # The error should be about decode failure, not key matching
        assert exc_info.value.status_code == 401
        assert "Invalid or expired" in exc_info.value.detail


# ── OAuth2Backend — Missing sub Claim ─────────────────────────────────────

class TestOAuth2MissingSub:
    """Token without 'sub' claim should be rejected."""

    async def test_missing_sub_raises_401(self, monkeypatch):
        """A decoded token missing 'sub' should raise 401."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header="Bearer some-token")

        # Mock jwt.decode to return a payload without 'sub'
        mock_jwt = MagicMock()
        mock_jwt.get_unverified_header.return_value = {"kid": "k1", "alg": "RS256"}
        mock_jwt.decode.return_value = {"email": "a@b.com", "name": "test"}
        mock_error = type("JWTError", (Exception,), {})

        backend._jwks_cache = {"keys": [{"kid": "k1"}]}

        with patch.object(oauth2_mod, "_get_jose", return_value=(mock_jwt, mock_error)):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 401
            assert "sub" in exc_info.value.detail.lower()


# ── OAuth2Backend — User Auto-Creation ────────────────────────────────────

class TestOAuth2AutoCreate:
    """OAuth2 should auto-create users on first login."""

    async def test_new_user_auto_created_with_user_role(self, monkeypatch, db):
        """First-time OAuth2 user should be auto-created with role='user'."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header="Bearer valid-token")

        # Mock JWT decode
        mock_jwt = MagicMock()
        mock_jwt.get_unverified_header.return_value = {"kid": "k1", "alg": "RS256"}
        mock_jwt.decode.return_value = {
            "sub": "google-12345",
            "email": "newuser-oauth@example.com",
            "name": "New OAuth User",
        }
        mock_error = type("JWTError", (Exception,), {})

        backend._jwks_cache = {"keys": [{"kid": "k1"}]}

        # Use real DB session (from fixture) wrapped in a context manager mock
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=db)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch.object(oauth2_mod, "_get_jose", return_value=(mock_jwt, mock_error)):
            with patch("db.AsyncSessionLocal", return_value=mock_session_ctx):
                result = await backend.authenticate(request)

        assert isinstance(result, AuthUserDTO)
        assert result.username == "New OAuth User"
        assert result.role == "user"
        assert result.is_superuser is False


# ── OAuth2Backend — Deactivated User ──────────────────────────────────────

class TestOAuth2DeactivatedUser:
    """Deactivated users should be rejected even with a valid token."""

    async def test_deactivated_user_raises_403(self, monkeypatch):
        """An existing but deactivated user should raise 403."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        backend = oauth2_mod.OAuth2Backend()
        request = _make_request(auth_header="Bearer valid-token")

        mock_jwt = MagicMock()
        mock_jwt.get_unverified_header.return_value = {"kid": "k1", "alg": "RS256"}
        mock_jwt.decode.return_value = {
            "sub": "google-12345",
            "email": "inactive@example.com",
            "name": "Inactive User",
        }
        mock_error = type("JWTError", (Exception,), {})

        backend._jwks_cache = {"keys": [{"kid": "k1"}]}

        # Mock DB: user exists but is_active=False
        mock_db_user = MagicMock()
        mock_db_user.id = 50
        mock_db_user.username = "Inactive User"
        mock_db_user.is_active = False

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_db_user

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch.object(oauth2_mod, "_get_jose", return_value=(mock_jwt, mock_error)):
            with patch("db.AsyncSessionLocal", return_value=mock_db):
                with pytest.raises(HTTPException) as exc_info:
                    await backend.authenticate(request)
                assert exc_info.value.status_code == 403
                assert "deactivated" in exc_info.value.detail.lower()


# ── _fetch_jwks() ─────────────────────────────────────────────────────────

class TestFetchJWKS:
    """Tests for the _fetch_jwks helper that contacts the IdP."""

    async def test_fetch_jwks_follows_well_known(self):
        """_fetch_jwks should fetch /.well-known/openid-configuration then jwks_uri."""
        from auth.backends.oauth2 import _fetch_jwks

        mock_oidc_response = MagicMock()
        mock_oidc_response.json.return_value = {
            "jwks_uri": "https://issuer.test/jwks"
        }
        mock_oidc_response.raise_for_status = MagicMock()

        mock_jwks_response = MagicMock()
        mock_jwks_response.json.return_value = {
            "keys": [{"kid": "key-1", "kty": "RSA"}]
        }
        mock_jwks_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_oidc_response, mock_jwks_response])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await _fetch_jwks("https://issuer.test")

        assert result == {"keys": [{"kid": "key-1", "kty": "RSA"}]}

    async def test_fetch_jwks_strips_trailing_slash(self):
        """Issuer URL with trailing slash should still construct proper URL."""
        from auth.backends.oauth2 import _fetch_jwks

        mock_oidc_response = MagicMock()
        mock_oidc_response.json.return_value = {
            "jwks_uri": "https://issuer.test/jwks"
        }
        mock_oidc_response.raise_for_status = MagicMock()

        mock_jwks_response = MagicMock()
        mock_jwks_response.json.return_value = {"keys": []}
        mock_jwks_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=[mock_oidc_response, mock_jwks_response])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            await _fetch_jwks("https://issuer.test/")

        # The first call should be to the well-known URL (without double slash)
        first_call_url = mock_client.get.call_args_list[0][0][0]
        assert "//" not in first_call_url.replace("https://", "")


# ── Registry Integration ──────────────────────────────────────────────────

class TestOAuth2RegistryIntegration:
    """Verify AUTH_MODE=oauth2 selects OAuth2Backend via registry."""

    def test_registry_returns_oauth2_backend(self, monkeypatch):
        """Setting AUTH_MODE=oauth2 should produce an OAuth2Backend."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "https://issuer.test")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "client-id")

        from auth.registry import _get_backend
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "oauth2")

        backend = _get_backend()
        assert isinstance(backend, oauth2_mod.OAuth2Backend)

        # Cleanup
        _get_backend.cache_clear()

    def test_registry_oauth2_without_env_raises(self, monkeypatch):
        """AUTH_MODE=oauth2 without OAUTH2_ISSUER should raise ValueError."""
        import auth.backends.oauth2 as oauth2_mod
        monkeypatch.setattr(oauth2_mod, "_ISSUER", "")
        monkeypatch.setattr(oauth2_mod, "_CLIENT_ID", "")

        from auth.registry import _get_backend
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "oauth2")

        with pytest.raises(ValueError, match="OAUTH2_ISSUER"):
            _get_backend()

        # Cleanup
        _get_backend.cache_clear()


# ── _get_jose() Lazy Import ──────────────────────────────────────────────

class TestOAuth2GetJose:
    """Tests for the oauth2-specific _get_jose function."""

    def test_get_jose_returns_jwt_and_error(self):
        """_get_jose() should return (jwt, JWTError) tuple."""
        from auth.backends.oauth2 import _get_jose
        jwt_mod, error_cls = _get_jose()
        assert hasattr(jwt_mod, "encode")
        assert hasattr(jwt_mod, "decode")
        assert issubclass(error_cls, Exception)
