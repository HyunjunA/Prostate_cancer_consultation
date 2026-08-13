"""Tests for admin API routes (auth/admin_routes.py).

Covers user CRUD, API key management, patient access management,
JWT login, /me, and /mode endpoints.

All endpoints require admin auth unless noted. The test uses the httpx
AsyncClient fixture with API_KEY auth (Module A), which returns a superuser
(role=admin, is_superuser=True), so all admin checks pass by default.

Test categories:
  - Helper functions: _require_admin, _hash_password, _verify_password
  - GET /api/auth/users — list users (pagination)
  - POST /api/auth/users — create user
  - GET /api/auth/users/{id} — get user by ID
  - PATCH /api/auth/users/{id} — update user
  - DELETE /api/auth/users/{id} — delete user
  - GET /api/auth/users/{id}/keys — list API keys
  - POST /api/auth/users/{id}/keys — create API key
  - DELETE /api/auth/users/{id}/keys/{key_id} — revoke key
  - GET /api/auth/users/{id}/patients — list patient access
  - POST /api/auth/users/{id}/patients — grant access
  - DELETE /api/auth/users/{id}/patients/{patient_id} — revoke access
  - POST /api/auth/login — JWT login
  - GET /api/auth/me — current user info
  - GET /api/auth/mode — auth mode info
"""

import pytest

from auth.models import AuthUser


# ── Helpers: Password hashing ─────────────────────────────────────────────

class TestPasswordHelpers:
    """Tests for _hash_password and _verify_password."""

    def test_hash_password_format(self):
        """New hashes are scrypt, and carry their own cost parameters.

        Storing n/r/p alongside the hash is what lets the cost be raised later
        without invalidating every existing password.
        """
        from auth.admin_routes import _hash_password
        result = _hash_password("mypassword")
        scheme, n, r, p, salt_hex, hash_hex = result.split("$", 5)
        assert scheme == "scrypt"
        assert int(n) >= 2 ** 14      # cost must not silently regress
        assert int(r) >= 8 and int(p) >= 1
        assert len(salt_hex) == 32    # 16 random bytes
        assert len(hash_hex) == 64    # 32-byte derived key

    def test_legacy_sha256_hashes_still_verify(self):
        """Accounts created before the scrypt switch must keep working.

        Rejecting them would lock every existing admin out at deploy time.
        """
        import hashlib
        import secrets
        from auth.admin_routes import _verify_password

        salt = secrets.token_hex(16)
        legacy = f"{salt}${hashlib.sha256(f'{salt}:hunter2'.encode()).hexdigest()}"
        assert _verify_password("hunter2", legacy) is True
        assert _verify_password("wrong", legacy) is False

    def test_needs_rehash_flags_only_legacy(self):
        """Legacy hashes are marked for upgrade; scrypt hashes are left alone.

        Getting this backwards would either re-hash on every single login or
        never migrate anyone.
        """
        import hashlib
        import secrets
        from auth.admin_routes import _hash_password, _needs_rehash

        salt = secrets.token_hex(16)
        legacy = f"{salt}${hashlib.sha256(f'{salt}:pw'.encode()).hexdigest()}"
        assert _needs_rehash(legacy) is True
        assert _needs_rehash(_hash_password("pw")) is False

    def test_malformed_hash_is_refused_not_raised(self):
        """A corrupt stored hash denies access instead of raising a 500.

        A 500 here distinguishes "this account exists but its row is broken"
        from "no such account", which is exactly what login must not reveal.
        """
        from auth.admin_routes import _verify_password
        for broken in ("", "scrypt$", "scrypt$notanint$8$1$aa$bb", "nodollarsign"):
            assert _verify_password("pw", broken) is False

    def test_hash_password_different_salts(self):
        """Same password should produce different hashes (different salts)."""
        from auth.admin_routes import _hash_password
        h1 = _hash_password("same-password")
        h2 = _hash_password("same-password")
        assert h1 != h2

    def test_verify_password_correct(self):
        """_verify_password should return True for correct password."""
        from auth.admin_routes import _hash_password, _verify_password
        stored = _hash_password("correct-password")
        assert _verify_password("correct-password", stored) is True

    def test_verify_password_incorrect(self):
        """_verify_password should return False for wrong password."""
        from auth.admin_routes import _hash_password, _verify_password
        stored = _hash_password("correct-password")
        assert _verify_password("wrong-password", stored) is False

    def test_verify_password_no_delimiter(self):
        """_verify_password should return False for stored hash without $."""
        from auth.admin_routes import _verify_password
        assert _verify_password("any", "no-dollar-sign") is False

    def test_verify_password_empty(self):
        """_verify_password with empty strings should return False."""
        from auth.admin_routes import _verify_password
        assert _verify_password("", "") is False


# ── Helpers: _require_admin ───────────────────────────────────────────────

class TestRequireAdmin:
    """Tests for the _require_admin helper."""

    def test_admin_role_passes(self):
        """User with role='admin' should pass."""
        from auth.admin_routes import _require_admin
        from auth.base import AuthUser as AuthUserDTO
        user = AuthUserDTO(user_id="1", username="admin", role="admin", is_superuser=False)
        _require_admin(user)  # Should not raise

    def test_superuser_passes(self):
        """Superuser with any role should pass."""
        from auth.admin_routes import _require_admin
        from auth.base import AuthUser as AuthUserDTO
        user = AuthUserDTO(user_id="1", username="super", role="user", is_superuser=True)
        _require_admin(user)  # Should not raise

    def test_regular_user_fails(self):
        """Regular user with role='user' should raise 403."""
        from auth.admin_routes import _require_admin
        from auth.base import AuthUser as AuthUserDTO
        from fastapi import HTTPException
        user = AuthUserDTO(user_id="1", username="regular", role="user", is_superuser=False)
        with pytest.raises(HTTPException) as exc_info:
            _require_admin(user)
        assert exc_info.value.status_code == 403
        assert "Admin access required" in exc_info.value.detail

    def test_readonly_user_fails(self):
        """User with role='readonly' should raise 403."""
        from auth.admin_routes import _require_admin
        from auth.base import AuthUser as AuthUserDTO
        from fastapi import HTTPException
        user = AuthUserDTO(user_id="1", username="viewer", role="readonly", is_superuser=False)
        with pytest.raises(HTTPException) as exc_info:
            _require_admin(user)
        assert exc_info.value.status_code == 403


# ── Helper: create an admin user in DB ────────────────────────────────────

async def _seed_admin_user(db):
    """Create an admin user in the auth_user table and return it."""
    user = AuthUser(
        username="testadmin",
        email="admin@test.com",
        role="admin",
        is_superuser=True,
    )
    db.add(user)
    await db.flush()
    return user


# ── GET /api/auth/mode — Public Endpoint ─────────────────────────────────

class TestGetAuthMode:
    """GET /api/auth/mode returns the current AUTH_MODE (no auth required)."""

    async def test_returns_auth_mode(self, client):
        """Should return the current AUTH_MODE."""
        resp = await client.get("/api/auth/mode")
        assert resp.status_code == 200
        data = resp.json()
        assert "auth_mode" in data
        assert data["auth_mode"] == "api_key"  # Set by conftest


# ── GET /api/auth/me ──────────────────────────────────────────────────────

class TestGetMe:
    """GET /api/auth/me returns the current authenticated user's info."""

    async def test_returns_user_info(self, client, api_headers):
        """Should return user_id, username, role, is_superuser."""
        resp = await client.get("/api/auth/me", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "user_id" in data
        assert "username" in data
        assert "role" in data
        assert "is_superuser" in data

    async def test_returns_system_user_for_api_key_mode(self, client, api_headers):
        """In api_key mode, user should be the 'system' superuser."""
        resp = await client.get("/api/auth/me", headers=api_headers)
        data = resp.json()
        assert data["user_id"] == "system"
        assert data["username"] == "system"
        assert data["role"] == "admin"
        assert data["is_superuser"] is True

    async def test_me_without_auth_returns_403(self, client):
        """GET /me without authentication should return 403."""
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 403


# ── POST /api/auth/users — Create User ───────────────────────────────────

class TestCreateUser:
    """POST /api/auth/users creates a new user."""

    async def test_create_user_success(self, client, api_headers):
        """Creating a user with valid data should return 201."""
        resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={
                "username": "newuser",
                "email": "new@test.com",
                "password": "securepassword123",
                "role": "user",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert data["email"] == "new@test.com"
        assert data["role"] == "user"
        assert data["is_superuser"] is False
        assert data["is_active"] is True

    async def test_create_user_without_password(self, client, api_headers):
        """Creating a user without a password should succeed (OAuth2 users)."""
        resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "oauth-user", "role": "user"},
        )
        assert resp.status_code == 201

    async def test_create_admin_user(self, client, api_headers):
        """Creating a user with role='admin' and is_superuser=True."""
        resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={
                "username": "superadmin",
                "role": "admin",
                "is_superuser": True,
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["role"] == "admin"
        assert data["is_superuser"] is True

    async def test_create_user_without_auth_returns_403(self, client):
        """POST /users without auth should return 403."""
        resp = await client.post(
            "/api/auth/users",
            json={"username": "test", "role": "user"},
        )
        assert resp.status_code == 403

    async def test_create_user_invalid_role(self, client, api_headers):
        """Invalid role value should be rejected by schema validation."""
        resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "baduser", "role": "superadmin"},
        )
        assert resp.status_code == 422  # Pydantic validation error

    async def test_create_user_short_password(self, client, api_headers):
        """Password shorter than 8 chars should be rejected."""
        resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "short", "password": "abc", "role": "user"},
        )
        assert resp.status_code == 422


# ── GET /api/auth/users — List Users ──────────────────────────────────────

class TestListUsers:
    """GET /api/auth/users lists users with pagination."""

    async def test_list_users_empty(self, client, api_headers):
        """Should return empty list when no users exist."""
        resp = await client.get("/api/auth/users", headers=api_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_users_after_create(self, client, api_headers):
        """Should return created users."""
        await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "user1", "role": "user"},
        )
        resp = await client.get("/api/auth/users", headers=api_headers)
        assert resp.status_code == 200
        users = resp.json()
        assert len(users) >= 1
        assert any(u["username"] == "user1" for u in users)

    async def test_list_users_pagination(self, client, api_headers):
        """Pagination should limit results."""
        for i in range(5):
            await client.post(
                "/api/auth/users",
                headers=api_headers,
                json={"username": f"page-user-{i}", "role": "user"},
            )

        resp = await client.get("/api/auth/users?page=1&size=2", headers=api_headers)
        assert resp.status_code == 200
        users = resp.json()
        assert len(users) == 2

    async def test_list_users_without_auth(self, client):
        """GET /users without auth should return 403."""
        resp = await client.get("/api/auth/users")
        assert resp.status_code == 403


# ── GET /api/auth/users/{id} — Get User ──────────────────────────────────

class TestGetUser:
    """GET /api/auth/users/{id} returns a single user."""

    async def test_get_user_success(self, client, api_headers):
        """Should return the user with matching ID."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "getme", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.get(f"/api/auth/users/{user_id}", headers=api_headers)
        assert resp.status_code == 200
        assert resp.json()["username"] == "getme"

    async def test_get_user_not_found(self, client, api_headers):
        """Should return 404 for nonexistent user ID."""
        resp = await client.get("/api/auth/users/99999", headers=api_headers)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "User not found"


# ── PATCH /api/auth/users/{id} — Update User ─────────────────────────────

class TestUpdateUser:
    """PATCH /api/auth/users/{id} updates user fields."""

    async def test_update_username(self, client, api_headers):
        """Should update the username."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "original", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/auth/users/{user_id}",
            headers=api_headers,
            json={"username": "updated"},
        )
        assert resp.status_code == 200
        assert resp.json()["username"] == "updated"

    async def test_update_role(self, client, api_headers):
        """Should update the role."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "rolechange", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/auth/users/{user_id}",
            headers=api_headers,
            json={"role": "admin"},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    async def test_update_password(self, client, api_headers):
        """Should update the password (hashed)."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "pwdchange", "password": "oldpassword1", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/auth/users/{user_id}",
            headers=api_headers,
            json={"password": "newpassword1"},
        )
        assert resp.status_code == 200

    async def test_update_is_active(self, client, api_headers):
        """Should deactivate a user."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "deactivate-me", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/auth/users/{user_id}",
            headers=api_headers,
            json={"is_active": False},
        )
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    async def test_update_nonexistent_user(self, client, api_headers):
        """Should return 404 for nonexistent user."""
        resp = await client.patch(
            "/api/auth/users/99999",
            headers=api_headers,
            json={"username": "ghost"},
        )
        assert resp.status_code == 404

    async def test_partial_update_preserves_other_fields(self, client, api_headers):
        """Updating one field should not change others."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "partial", "email": "partial@test.com", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.patch(
            f"/api/auth/users/{user_id}",
            headers=api_headers,
            json={"username": "changed"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "changed"
        assert data["email"] == "partial@test.com"
        assert data["role"] == "user"


# ── DELETE /api/auth/users/{id} — Delete User ────────────────────────────

class TestDeleteUser:
    """DELETE /api/auth/users/{id} removes a user."""

    async def test_delete_user_success(self, client, api_headers):
        """Should return 204 on successful deletion."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "deleteme", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/auth/users/{user_id}", headers=api_headers)
        assert resp.status_code == 204

        # Verify user is gone
        get_resp = await client.get(f"/api/auth/users/{user_id}", headers=api_headers)
        assert get_resp.status_code == 404

    async def test_delete_nonexistent_user(self, client, api_headers):
        """Should return 404 for nonexistent user."""
        resp = await client.delete("/api/auth/users/99999", headers=api_headers)
        assert resp.status_code == 404


# ── POST /api/auth/users/{id}/keys — Create API Key ──────────────────────

class TestCreateAPIKey:
    """POST /api/auth/users/{id}/keys generates a new API key."""

    async def test_create_key_success(self, client, api_headers):
        """Should return 201 with the raw key."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "keyuser", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.post(
            f"/api/auth/users/{user_id}/keys",
            headers=api_headers,
            json={"label": "test-key"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "raw_key" in data
        assert len(data["raw_key"]) > 0
        assert data["label"] == "test-key"
        assert data["is_active"] is True

    async def test_create_key_with_expiration(self, client, api_headers):
        """Should set expires_at when expires_in_days is provided."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "expireuser", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.post(
            f"/api/auth/users/{user_id}/keys",
            headers=api_headers,
            json={"label": "expires-key", "expires_in_days": 30},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["expires_at"] is not None

    async def test_create_key_without_expiration(self, client, api_headers):
        """Key without expires_in_days should have no expiration."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "noexpire", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.post(
            f"/api/auth/users/{user_id}/keys",
            headers=api_headers,
            json={},
        )
        assert resp.status_code == 201
        assert resp.json()["expires_at"] is None

    async def test_create_key_for_nonexistent_user(self, client, api_headers):
        """Should return 404 if user doesn't exist."""
        resp = await client.post(
            "/api/auth/users/99999/keys",
            headers=api_headers,
            json={"label": "ghost-key"},
        )
        assert resp.status_code == 404


# ── GET /api/auth/users/{id}/keys — List API Keys ────────────────────────

class TestListAPIKeys:
    """GET /api/auth/users/{id}/keys lists a user's API keys."""

    async def test_list_keys_empty(self, client, api_headers):
        """Should return empty list when user has no keys."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "nokeys", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.get(f"/api/auth/users/{user_id}/keys", headers=api_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_keys_after_create(self, client, api_headers):
        """Should show created keys (without raw_key)."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "haskeys", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        await client.post(
            f"/api/auth/users/{user_id}/keys",
            headers=api_headers,
            json={"label": "key-1"},
        )

        resp = await client.get(f"/api/auth/users/{user_id}/keys", headers=api_headers)
        assert resp.status_code == 200
        keys = resp.json()
        assert len(keys) == 1
        assert keys[0]["label"] == "key-1"
        # raw_key should NOT be in list response
        assert "raw_key" not in keys[0]


# ── DELETE /api/auth/users/{id}/keys/{key_id} — Revoke Key ───────────────

class TestRevokeAPIKey:
    """DELETE /api/auth/users/{id}/keys/{key_id} deactivates a key."""

    async def test_revoke_key_success(self, client, api_headers):
        """Should return 204 and deactivate the key."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "revokeuser", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        key_resp = await client.post(
            f"/api/auth/users/{user_id}/keys",
            headers=api_headers,
            json={"label": "revoke-me"},
        )
        key_id = key_resp.json()["id"]

        resp = await client.delete(
            f"/api/auth/users/{user_id}/keys/{key_id}", headers=api_headers
        )
        assert resp.status_code == 204

    async def test_revoke_nonexistent_key(self, client, api_headers):
        """Should return 404 for nonexistent key."""
        create_resp = await client.post(
            "/api/auth/users",
            headers=api_headers,
            json={"username": "nokey", "role": "user"},
        )
        user_id = create_resp.json()["id"]

        resp = await client.delete(
            f"/api/auth/users/{user_id}/keys/99999", headers=api_headers
        )
        assert resp.status_code == 404


# ── POST /api/auth/users/{id}/patients — Grant Patient Access ────────────



# ── POST /api/auth/login — JWT Login ─────────────────────────────────────

class TestJWTLogin:
    """POST /api/auth/login authenticates with username+password for JWT."""

    async def test_login_disabled_in_api_key_mode(self, client):
        """Login should return 400 when AUTH_MODE is not 'jwt'."""
        resp = await client.post(
            "/api/auth/login",
            json={"username": "test", "password": "testpass"},
        )
        assert resp.status_code == 400
        assert "AUTH_MODE=jwt" in resp.json()["detail"]
