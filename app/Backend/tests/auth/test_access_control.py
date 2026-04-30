"""Tests for patient-level access control.

Covers auth/access_control.py — check_patient_access() and
get_accessible_patient_ids().

Test categories:
  - Superuser bypass: superusers pass all checks unconditionally
  - Access granted: user has the required access level
  - Access denied: user has no access record
  - Insufficient access: user has lower access than required
  - Access hierarchy: read < write < admin
  - get_accessible_patient_ids() for different user types
  - Edge cases: unknown access types, user_id conversions
"""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from auth.access_control import check_patient_access, get_accessible_patient_ids
from auth.base import AuthUser
from auth.models import PatientAccess, AuthUser as AuthUserDB


# ── Helpers ───────────────────────────────────────────────────────────────

def _superuser(user_id: str = "1") -> AuthUser:
    """Create a superuser AuthUser DTO."""
    return AuthUser(
        user_id=user_id,
        username="superadmin",
        role="admin",
        is_superuser=True,
    )


def _regular_user(user_id: str = "10") -> AuthUser:
    """Create a regular (non-superuser) AuthUser DTO."""
    return AuthUser(
        user_id=user_id,
        username="regularuser",
        role="user",
        is_superuser=False,
    )


def _admin_user(user_id: str = "5") -> AuthUser:
    """Create an admin (non-superuser) AuthUser DTO."""
    return AuthUser(
        user_id=user_id,
        username="adminuser",
        role="admin",
        is_superuser=False,
    )


async def _create_auth_user(db: AsyncSession, user_id: int, username: str = "testuser") -> AuthUserDB:
    """Insert an AuthUser into the test DB."""
    user = AuthUserDB(
        id=user_id,
        username=username,
        role="user",
        is_superuser=False,
    )
    db.add(user)
    await db.flush()
    return user


async def _grant_access(
    db: AsyncSession,
    user_id: int,
    patient_id: str,
    access_type: str = "read",
) -> PatientAccess:
    """Insert a PatientAccess record into the test DB."""
    access = PatientAccess(
        user_id=user_id,
        patient_id=patient_id,
        access_type=access_type,
    )
    db.add(access)
    await db.flush()
    return access


# ── Superuser Bypass ──────────────────────────────────────────────────────

class TestSuperuserBypass:
    """Superusers should pass all access checks unconditionally."""

    async def test_superuser_passes_read_check(self, db):
        """Superuser should pass check_patient_access with required_type='read'."""
        user = _superuser()
        # No DB records needed — superuser bypasses everything
        await check_patient_access("PAT-001", user, db, required_type="read")

    async def test_superuser_passes_write_check(self, db):
        """Superuser should pass check_patient_access with required_type='write'."""
        user = _superuser()
        await check_patient_access("PAT-001", user, db, required_type="write")

    async def test_superuser_passes_admin_check(self, db):
        """Superuser should pass check_patient_access with required_type='admin'."""
        user = _superuser()
        await check_patient_access("PAT-001", user, db, required_type="admin")

    async def test_superuser_passes_for_any_patient(self, db):
        """Superuser should pass for any patient_id, even nonexistent."""
        user = _superuser()
        await check_patient_access("NONEXISTENT-999", user, db)

    async def test_superuser_no_db_query_needed(self, db):
        """Superuser check returns immediately — no DB query performed."""
        user = _superuser()
        # This should succeed even without any PatientAccess records
        await check_patient_access("PAT-XYZ", user, db)


# ── Access Denied — No Record ────────────────────────────────────────────

class TestAccessDeniedNoRecord:
    """Non-superuser with no PatientAccess record should be denied."""

    async def test_no_record_raises_403(self, db):
        """User with no access record for the patient should get 403."""
        await _create_auth_user(db, user_id=10, username="norecord")
        user = _regular_user(user_id="10")

        with pytest.raises(HTTPException) as exc_info:
            await check_patient_access("PAT-001", user, db)
        assert exc_info.value.status_code == 403
        assert "do not have access" in exc_info.value.detail.lower()

    async def test_no_record_for_different_patient(self, db):
        """Access to patient A should not grant access to patient B."""
        await _create_auth_user(db, user_id=10, username="partial")
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="read")

        user = _regular_user(user_id="10")

        # Has access to PAT-001 but not PAT-002
        await check_patient_access("PAT-001", user, db)  # Should pass

        with pytest.raises(HTTPException) as exc_info:
            await check_patient_access("PAT-002", user, db)
        assert exc_info.value.status_code == 403

    async def test_no_record_for_different_user(self, db):
        """Access for user 10 should not apply to user 20."""
        await _create_auth_user(db, user_id=10, username="user10")
        await _create_auth_user(db, user_id=20, username="user20")
        await _grant_access(db, user_id=10, patient_id="PAT-001")

        user20 = _regular_user(user_id="20")

        with pytest.raises(HTTPException) as exc_info:
            await check_patient_access("PAT-001", user20, db)
        assert exc_info.value.status_code == 403


# ── Access Granted — Sufficient Level ─────────────────────────────────────

class TestAccessGranted:
    """User with sufficient access level should pass the check."""

    async def test_read_access_for_read_requirement(self, db):
        """User with 'read' access passes when required_type='read'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="read")

        user = _regular_user(user_id="10")
        await check_patient_access("PAT-001", user, db, required_type="read")

    async def test_write_access_for_read_requirement(self, db):
        """User with 'write' access passes when required_type='read' (write > read)."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="write")

        user = _regular_user(user_id="10")
        await check_patient_access("PAT-001", user, db, required_type="read")

    async def test_admin_access_for_read_requirement(self, db):
        """User with 'admin' access passes when required_type='read'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="admin")

        user = _regular_user(user_id="10")
        await check_patient_access("PAT-001", user, db, required_type="read")

    async def test_write_access_for_write_requirement(self, db):
        """User with 'write' access passes when required_type='write'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="write")

        user = _regular_user(user_id="10")
        await check_patient_access("PAT-001", user, db, required_type="write")

    async def test_admin_access_for_write_requirement(self, db):
        """User with 'admin' access passes when required_type='write'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="admin")

        user = _regular_user(user_id="10")
        await check_patient_access("PAT-001", user, db, required_type="write")

    async def test_admin_access_for_admin_requirement(self, db):
        """User with 'admin' access passes when required_type='admin'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="admin")

        user = _regular_user(user_id="10")
        await check_patient_access("PAT-001", user, db, required_type="admin")


# ── Insufficient Access Level ─────────────────────────────────────────────

class TestInsufficientAccess:
    """User with lower access than required should be denied."""

    async def test_read_insufficient_for_write(self, db):
        """User with 'read' cannot pass when required_type='write'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="read")

        user = _regular_user(user_id="10")
        with pytest.raises(HTTPException) as exc_info:
            await check_patient_access("PAT-001", user, db, required_type="write")
        assert exc_info.value.status_code == 403
        assert "Insufficient access" in exc_info.value.detail
        assert "read" in exc_info.value.detail
        assert "write" in exc_info.value.detail

    async def test_read_insufficient_for_admin(self, db):
        """User with 'read' cannot pass when required_type='admin'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="read")

        user = _regular_user(user_id="10")
        with pytest.raises(HTTPException) as exc_info:
            await check_patient_access("PAT-001", user, db, required_type="admin")
        assert exc_info.value.status_code == 403

    async def test_write_insufficient_for_admin(self, db):
        """User with 'write' cannot pass when required_type='admin'."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="write")

        user = _regular_user(user_id="10")
        with pytest.raises(HTTPException) as exc_info:
            await check_patient_access("PAT-001", user, db, required_type="admin")
        assert exc_info.value.status_code == 403
        assert "Insufficient access" in exc_info.value.detail


# ── Default required_type ─────────────────────────────────────────────────

class TestDefaultRequiredType:
    """The default required_type is 'read'."""

    async def test_default_required_type_is_read(self, db):
        """Calling without required_type should require 'read' access."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="read")

        user = _regular_user(user_id="10")
        # Should pass with default (read)
        await check_patient_access("PAT-001", user, db)


# ── Unknown Access Types ──────────────────────────────────────────────────

class TestUnknownAccessTypes:
    """Edge cases for unrecognized access type strings."""

    async def test_unknown_required_type_defaults_to_read_level(self, db):
        """Unknown required_type should default to level 0 (same as read)."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001", access_type="read")

        user = _regular_user(user_id="10")
        # Unknown type maps to level 0, read also maps to 0
        await check_patient_access("PAT-001", user, db, required_type="unknown")


# ── get_accessible_patient_ids() ──────────────────────────────────────────

class TestGetAccessiblePatientIds:
    """Tests for get_accessible_patient_ids()."""

    async def test_superuser_returns_empty_list(self, db):
        """Superuser should get empty list (meaning 'all patients')."""
        user = _superuser()
        result = await get_accessible_patient_ids(user, db)
        assert result == []

    async def test_regular_user_with_no_access(self, db):
        """User with no access records should get empty list."""
        await _create_auth_user(db, user_id=10)
        user = _regular_user(user_id="10")
        result = await get_accessible_patient_ids(user, db)
        assert result == []

    async def test_regular_user_with_one_patient(self, db):
        """User with access to one patient should get list with one ID."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001")

        user = _regular_user(user_id="10")
        result = await get_accessible_patient_ids(user, db)
        assert result == ["PAT-001"]

    async def test_regular_user_with_multiple_patients(self, db):
        """User with access to multiple patients should get all IDs."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-001")
        await _grant_access(db, user_id=10, patient_id="PAT-002")
        await _grant_access(db, user_id=10, patient_id="PAT-003")

        user = _regular_user(user_id="10")
        result = await get_accessible_patient_ids(user, db)
        assert sorted(result) == ["PAT-001", "PAT-002", "PAT-003"]

    async def test_only_returns_own_patient_ids(self, db):
        """Should only return patient IDs for the requesting user."""
        await _create_auth_user(db, user_id=10, username="user10")
        await _create_auth_user(db, user_id=20, username="user20")
        await _grant_access(db, user_id=10, patient_id="PAT-001")
        await _grant_access(db, user_id=20, patient_id="PAT-002")

        user10 = _regular_user(user_id="10")
        result = await get_accessible_patient_ids(user10, db)
        assert result == ["PAT-001"]

    async def test_different_access_types_all_returned(self, db):
        """Patients with different access types should all be returned."""
        await _create_auth_user(db, user_id=10)
        await _grant_access(db, user_id=10, patient_id="PAT-R", access_type="read")
        await _grant_access(db, user_id=10, patient_id="PAT-W", access_type="write")
        await _grant_access(db, user_id=10, patient_id="PAT-A", access_type="admin")

        user = _regular_user(user_id="10")
        result = await get_accessible_patient_ids(user, db)
        assert sorted(result) == ["PAT-A", "PAT-R", "PAT-W"]
