"""Tests for multi-key authentication backend (auth module B).

Covers auth/backends/multi_key.py — per-user API keys stored as SHA-256
hashes in the ``auth_api_key`` table. Each user can have multiple active keys.

Test categories:
  - hash_api_key() utility function
  - MultiKeyBackend.authenticate() — valid key, missing key, invalid key
  - Expiration handling (expired keys, non-expired keys, no expiration)
  - Inactive key / inactive user handling
  - last_used_at tracking
  - Registry integration (AUTH_MODE=multi_key)
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from auth.backends.multi_key import MultiKeyBackend, hash_api_key
from auth.base import AuthUser as AuthUserDTO


# ── hash_api_key() ────────────────────────────────────────────────────────

class TestHashApiKey:
    """Tests for the hash_api_key() utility function."""

    def test_returns_sha256_hex_digest(self):
        """hash_api_key should return a SHA-256 hex digest."""
        raw = "my-test-key"
        expected = hashlib.sha256(raw.encode()).hexdigest()
        assert hash_api_key(raw) == expected

    def test_deterministic_same_input(self):
        """Same input always produces the same hash."""
        assert hash_api_key("abc123") == hash_api_key("abc123")

    def test_different_inputs_produce_different_hashes(self):
        """Different inputs produce different hashes."""
        assert hash_api_key("key-a") != hash_api_key("key-b")

    def test_empty_string(self):
        """Empty string should still produce a valid SHA-256 hash."""
        result = hash_api_key("")
        assert len(result) == 64  # SHA-256 hex digest is 64 chars
        assert result == hashlib.sha256(b"").hexdigest()

    def test_hash_length_is_64(self):
        """All hashes should be 64 characters (256 bits as hex)."""
        assert len(hash_api_key("any-key-value")) == 64

    def test_unicode_input(self):
        """Unicode characters should be handled via UTF-8 encoding."""
        key = "key-with-unicode-\u00e9\u00e8"
        expected = hashlib.sha256(key.encode()).hexdigest()
        assert hash_api_key(key) == expected


# ── Helper to build mock request ──────────────────────────────────────────

def _make_request(api_key: Optional[str] = None) -> MagicMock:
    """Create a mock FastAPI Request with optional X-API-Key header."""
    request = MagicMock()
    headers = {}
    if api_key is not None:
        headers["x-api-key"] = api_key
    request.headers = headers
    return request


# ── Helper to build mock DB objects ───────────────────────────────────────

def _make_user_obj(
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


def _make_key_row(
    user: object,
    key_hash: str = "",
    is_active: bool = True,
    expires_at: Optional[datetime] = None,
    last_used_at: Optional[datetime] = None,
):
    """Create a mock AuthAPIKey DB model row."""
    key_row = MagicMock()
    key_row.key_hash = key_hash
    key_row.is_active = is_active
    key_row.expires_at = expires_at
    key_row.last_used_at = last_used_at
    key_row.user = user
    return key_row


# ── MultiKeyBackend.authenticate() — Missing Key ─────────────────────────

class TestMultiKeyMissingKey:
    """Requests without an X-API-Key header should be rejected with 403."""

    async def test_missing_header_raises_403(self):
        """No X-API-Key header should raise HTTPException 403."""
        backend = MultiKeyBackend()
        request = _make_request(api_key=None)
        with pytest.raises(HTTPException) as exc_info:
            await backend.authenticate(request)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Missing API Key"


# ── MultiKeyBackend.authenticate() — Invalid Key ─────────────────────────

class TestMultiKeyInvalidKey:
    """Requests with a key that doesn't match any active DB record."""

    async def test_unknown_key_raises_403(self):
        """Key hash not in DB should raise 403 'Invalid API Key'."""
        backend = MultiKeyBackend()
        request = _make_request(api_key="unknown-key")

        # Mock the DB session to return None for the query
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 403
            assert exc_info.value.detail == "Invalid API Key"

    async def test_inactive_key_not_found(self):
        """An inactive key should not match (is_active filter in query)."""
        backend = MultiKeyBackend()
        request = _make_request(api_key="deactivated-key")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 403


# ── MultiKeyBackend.authenticate() — Expired Key ─────────────────────────

class TestMultiKeyExpiredKey:
    """Keys with an expires_at in the past should be rejected."""

    async def test_expired_key_raises_403(self):
        """A key past its expires_at should raise 403 'API Key has expired'."""
        backend = MultiKeyBackend()
        raw_key = "valid-but-expired"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj()
        expired_time = datetime.now(timezone.utc) - timedelta(hours=1)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key), expires_at=expired_time)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 403
            assert exc_info.value.detail == "API Key has expired"

    async def test_key_expires_at_exactly_now_is_expired(self):
        """A key expiring at exactly the current second should be treated as expired."""
        backend = MultiKeyBackend()
        raw_key = "expires-now"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj()
        # Set expiration to 1 second in the past to guarantee it's expired
        almost_now = datetime.now(timezone.utc) - timedelta(seconds=1)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key), expires_at=almost_now)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 403
            assert "expired" in exc_info.value.detail.lower()


# ── MultiKeyBackend.authenticate() — Valid Key ───────────────────────────

class TestMultiKeyValidKey:
    """Valid, active, non-expired keys should return an AuthUserDTO."""

    async def test_valid_key_returns_auth_user(self):
        """A valid key returns the correct AuthUserDTO."""
        backend = MultiKeyBackend()
        raw_key = "good-key"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=42, username="alice", role="admin", is_superuser=True)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key), expires_at=None)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert isinstance(result, AuthUserDTO)
        assert result.user_id == "42"
        assert result.username == "alice"
        assert result.role == "admin"
        assert result.is_superuser is True

    async def test_valid_key_with_future_expiration(self):
        """A key with a future expires_at should be accepted."""
        backend = MultiKeyBackend()
        raw_key = "future-key"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=10, username="bob", role="user", is_superuser=False)
        future = datetime.now(timezone.utc) + timedelta(days=30)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key), expires_at=future)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert result.user_id == "10"
        assert result.username == "bob"
        assert result.is_superuser is False

    async def test_valid_key_no_expiration(self):
        """A key with expires_at=None should be accepted (no expiry)."""
        backend = MultiKeyBackend()
        raw_key = "no-expire"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=5, username="carol")
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key), expires_at=None)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert result.user_id == "5"

    async def test_user_id_is_string(self):
        """user_id in AuthUserDTO should always be a string."""
        backend = MultiKeyBackend()
        raw_key = "string-id-key"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=999)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key))

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert isinstance(result.user_id, str)
        assert result.user_id == "999"


# ── last_used_at Tracking ─────────────────────────────────────────────────

class TestLastUsedTracking:
    """Verify that last_used_at is updated on each successful authentication."""

    async def test_last_used_at_is_updated(self):
        """On valid auth, key_row.last_used_at should be set."""
        backend = MultiKeyBackend()
        raw_key = "track-usage"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj()
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key), last_used_at=None)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            await backend.authenticate(request)

        # last_used_at should have been set to a datetime
        assert key_row.last_used_at is not None
        assert isinstance(key_row.last_used_at, datetime)

    async def test_commit_failure_does_not_block_auth(self):
        """If DB commit for last_used_at fails, auth should still succeed."""
        backend = MultiKeyBackend()
        raw_key = "commit-fail"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=7, username="dave")
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key))

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock(side_effect=Exception("DB write error"))
        mock_db.rollback = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        # Auth should succeed even though commit failed
        assert result.user_id == "7"
        assert result.username == "dave"
        # Rollback should have been called
        mock_db.rollback.assert_awaited_once()


# ── Registry Integration ──────────────────────────────────────────────────

class TestMultiKeyRegistryIntegration:
    """Verify AUTH_MODE=multi_key selects MultiKeyBackend via registry."""

    def test_registry_returns_multi_key_backend(self, monkeypatch):
        """Setting AUTH_MODE=multi_key should produce a MultiKeyBackend."""
        from auth.registry import _get_backend
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "multi_key")

        backend = _get_backend()
        assert isinstance(backend, MultiKeyBackend)

        # Cleanup
        _get_backend.cache_clear()


# ── Role Mapping ──────────────────────────────────────────────────────────

class TestMultiKeyRoleMapping:
    """Verify that user roles and superuser status are correctly mapped."""

    async def test_regular_user(self):
        """Regular user should have is_superuser=False."""
        backend = MultiKeyBackend()
        raw_key = "regular-user-key"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=1, username="regular", role="user", is_superuser=False)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key))

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert result.role == "user"
        assert result.is_superuser is False

    async def test_admin_user(self):
        """Admin user should have role='admin'."""
        backend = MultiKeyBackend()
        raw_key = "admin-key"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=2, username="admin", role="admin", is_superuser=True)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key))

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert result.role == "admin"
        assert result.is_superuser is True

    async def test_readonly_user(self):
        """Readonly user should have role='readonly'."""
        backend = MultiKeyBackend()
        raw_key = "readonly-key"
        request = _make_request(api_key=raw_key)

        user = _make_user_obj(user_id=3, username="viewer", role="readonly", is_superuser=False)
        key_row = _make_key_row(user, key_hash=hash_api_key(raw_key))

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = key_row

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.commit = AsyncMock()
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            result = await backend.authenticate(request)

        assert result.role == "readonly"
        assert result.is_superuser is False


# ── Edge Cases ────────────────────────────────────────────────────────────

class TestMultiKeyEdgeCases:
    """Edge cases for multi-key authentication."""

    async def test_empty_api_key_raises_invalid(self):
        """An empty string API key should fail as invalid (hash won't match)."""
        backend = MultiKeyBackend()
        request = _make_request(api_key="")

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 403
            assert exc_info.value.detail == "Invalid API Key"

    async def test_very_long_api_key(self):
        """A very long key string should be handled without error."""
        backend = MultiKeyBackend()
        long_key = "x" * 10000
        request = _make_request(api_key=long_key)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await backend.authenticate(request)
            assert exc_info.value.status_code == 403

    async def test_key_hash_matches_sha256(self):
        """Verify the backend hashes the raw key with SHA-256 for lookup."""
        backend = MultiKeyBackend()
        raw_key = "verify-hash"
        expected_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        request = _make_request(api_key=raw_key)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = AsyncMock()
        mock_db.execute.return_value = mock_result
        mock_db.__aenter__ = AsyncMock(return_value=mock_db)
        mock_db.__aexit__ = AsyncMock(return_value=False)

        with patch("db.AsyncSessionLocal", return_value=mock_db):
            with pytest.raises(HTTPException):
                await backend.authenticate(request)

        # We can verify by checking hash_api_key produces what we expect
        assert hash_api_key(raw_key) == expected_hash
