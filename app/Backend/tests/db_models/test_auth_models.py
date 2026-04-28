"""Tests for authentication SQLAlchemy models defined in auth/models.py.

Models tested (3 total):
  1. AuthUser       — application user with role/active/superuser flags
  2. AuthAPIKey     — per-user API key (hashed), FK to AuthUser
  3. PatientAccess  — per-user patient access grants, FK to AuthUser

These models share the same Base as the main models.py (verified).
"""

from sqlalchemy import inspect, select

from auth.models import AuthUser, AuthAPIKey, PatientAccess
from models import Base


# ── AuthUser ──────────────────────────────────────────────────────────────


class TestAuthUser:
    """AuthUser model — user account with role and superuser flags."""

    async def test_instantiation_minimal(self):
        """Create with only required fields."""
        user = AuthUser(username="testuser")
        assert user.username == "testuser"
        assert user.id is None  # not yet persisted

    async def test_default_role_not_set_in_python(self):
        """Python default for role is None; server_default='user' applies on INSERT."""
        user = AuthUser(username="u")
        # server_default only applies after DB insert, Python-side is None
        assert user.role is None

    async def test_default_is_superuser_not_set_in_python(self):
        """Python default for is_superuser is None; server_default='false' applies on INSERT."""
        user = AuthUser(username="u")
        assert user.is_superuser is None

    async def test_default_is_active_not_set_in_python(self):
        """Python default for is_active is None; server_default='true' applies on INSERT."""
        user = AuthUser(username="u")
        assert user.is_active is None

    async def test_email_field(self):
        user = AuthUser(username="u", email="u@test.com")
        assert user.email == "u@test.com"

    async def test_password_hash_field(self):
        user = AuthUser(username="u", password_hash="hashed123")
        assert user.password_hash == "hashed123"

    async def test_auth_provider_not_set_in_python(self):
        """Python default for auth_provider is None; server_default='local' applies on INSERT."""
        user = AuthUser(username="u")
        assert user.auth_provider is None

    async def test_primary_key_is_id(self):
        mapper = inspect(AuthUser)
        pk_cols = [col.name for col in mapper.primary_key]
        assert pk_cols == ["id"]

    async def test_repr(self):
        user = AuthUser(id=5, username="alice", role="admin")
        r = repr(user)
        assert "5" in r
        assert "alice" in r
        assert "admin" in r

    async def test_api_keys_relationship_exists(self):
        mapper = inspect(AuthUser)
        assert "api_keys" in mapper.relationships

    async def test_patient_accesses_relationship_exists(self):
        mapper = inspect(AuthUser)
        assert "patient_accesses" in mapper.relationships

    async def test_persist_and_query(self, db):
        user = AuthUser(
            username="persist-test",
            email="persist@test.com",
            role="user",
            is_superuser=False,
            is_active=True,
            auth_provider="local",
        )
        db.add(user)
        await db.commit()

        result = await db.execute(
            select(AuthUser).where(AuthUser.username == "persist-test")
        )
        row = result.scalar_one()
        assert row.id is not None
        assert row.email == "persist@test.com"
        assert row.role == "user"

    async def test_tablename(self):
        assert AuthUser.__tablename__ == "auth_user"

    async def test_shares_base_with_main_models(self):
        """AuthUser uses the same Base as models.py (single metadata registry)."""
        assert issubclass(AuthUser, Base)


# ── AuthAPIKey ────────────────────────────────────────────────────────────


class TestAuthAPIKey:
    """AuthAPIKey model — per-user API key storage."""

    async def test_instantiation(self):
        key = AuthAPIKey(user_id=1, key_hash="abc123hash", label="dev key")
        assert key.user_id == 1
        assert key.key_hash == "abc123hash"
        assert key.label == "dev key"

    async def test_default_is_active_not_set_in_python(self):
        """server_default='true' only applies on INSERT."""
        key = AuthAPIKey(user_id=1, key_hash="h")
        assert key.is_active is None

    async def test_expires_at_nullable(self):
        key = AuthAPIKey(user_id=1, key_hash="h")
        assert key.expires_at is None

    async def test_last_used_at_nullable(self):
        key = AuthAPIKey(user_id=1, key_hash="h")
        assert key.last_used_at is None

    async def test_user_relationship_exists(self):
        mapper = inspect(AuthAPIKey)
        assert "user" in mapper.relationships

    async def test_repr(self):
        key = AuthAPIKey(id=10, user_id=3, label="prod")
        r = repr(key)
        assert "10" in r
        assert "3" in r
        assert "prod" in r

    async def test_persist_with_parent(self, db):
        user = AuthUser(
            username="keyowner",
            email="keyowner@test.com",
            role="user",
            is_superuser=False,
            is_active=True,
            auth_provider="local",
        )
        db.add(user)
        await db.flush()

        key = AuthAPIKey(
            user_id=user.id,
            key_hash="sha256hexhashvalue",
            label="test key",
            is_active=True,
        )
        db.add(key)
        await db.commit()

        result = await db.execute(
            select(AuthAPIKey).where(AuthAPIKey.user_id == user.id)
        )
        row = result.scalar_one()
        assert row.key_hash == "sha256hexhashvalue"
        assert row.label == "test key"

    async def test_tablename(self):
        assert AuthAPIKey.__tablename__ == "auth_api_key"

    async def test_shares_base_with_main_models(self):
        assert issubclass(AuthAPIKey, Base)


# ── PatientAccess ─────────────────────────────────────────────────────────


class TestPatientAccess:
    """PatientAccess model — maps users to patients with access types."""

    async def test_instantiation(self):
        pa = PatientAccess(user_id=1, patient_id="sid-01", access_type="read")
        assert pa.user_id == 1
        assert pa.patient_id == "sid-01"
        assert pa.access_type == "read"

    async def test_default_access_type_not_set_in_python(self):
        """server_default='read' only applies on INSERT."""
        pa = PatientAccess(user_id=1, patient_id="sid-01")
        assert pa.access_type is None

    async def test_granted_by_nullable(self):
        pa = PatientAccess(user_id=1, patient_id="sid-01")
        assert pa.granted_by is None

    async def test_user_relationship_exists(self):
        mapper = inspect(PatientAccess)
        assert "user" in mapper.relationships

    async def test_repr(self):
        pa = PatientAccess(user_id=7, patient_id="sid-42", access_type="write")
        r = repr(pa)
        assert "7" in r
        assert "sid-42" in r
        assert "write" in r

    async def test_persist_with_parent(self, db):
        user = AuthUser(
            username="accessowner",
            email="access@test.com",
            role="user",
            is_superuser=False,
            is_active=True,
            auth_provider="local",
        )
        db.add(user)
        await db.flush()

        pa = PatientAccess(
            user_id=user.id,
            patient_id="sid-pa",
            access_type="read",
        )
        db.add(pa)
        await db.commit()

        result = await db.execute(
            select(PatientAccess).where(PatientAccess.patient_id == "sid-pa")
        )
        row = result.scalar_one()
        assert row.user_id == user.id

    async def test_tablename(self):
        assert PatientAccess.__tablename__ == "patient_access"

    async def test_shares_base_with_main_models(self):
        assert issubclass(PatientAccess, Base)


# ── Cascade: AuthUser -> AuthAPIKey ───────────────────────────────────────


class TestAuthCascades:
    """Verify cascade delete from AuthUser to children."""

    async def test_delete_user_cascades_to_api_keys(self, db):
        """Deleting an AuthUser should cascade-delete its AuthAPIKey rows."""
        user = AuthUser(
            username="cascade-user",
            email="cascade@test.com",
            role="user",
            is_superuser=False,
            is_active=True,
            auth_provider="local",
        )
        db.add(user)
        await db.flush()

        key = AuthAPIKey(user_id=user.id, key_hash="todelete", is_active=True)
        db.add(key)
        await db.commit()

        # Delete user
        await db.delete(user)
        await db.commit()

        result = await db.execute(
            select(AuthAPIKey).where(AuthAPIKey.key_hash == "todelete")
        )
        assert result.scalar_one_or_none() is None

    async def test_delete_user_cascades_to_patient_access(self, db):
        """Deleting an AuthUser should cascade-delete its PatientAccess rows."""
        user = AuthUser(
            username="cascade-pa-user",
            email="cascadepa@test.com",
            role="user",
            is_superuser=False,
            is_active=True,
            auth_provider="local",
        )
        db.add(user)
        await db.flush()

        pa = PatientAccess(
            user_id=user.id, patient_id="sid-del", access_type="read"
        )
        db.add(pa)
        await db.commit()

        await db.delete(user)
        await db.commit()

        result = await db.execute(
            select(PatientAccess).where(PatientAccess.patient_id == "sid-del")
        )
        assert result.scalar_one_or_none() is None
