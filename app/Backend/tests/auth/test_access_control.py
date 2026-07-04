"""Tests for auth/access_control.py — check_patient_access().

Access control is a superuser gate: superusers (admin + the API-key system user)
pass; everyone else is denied. There is no per-patient ACL.
"""
import pytest
from fastapi import HTTPException

from auth.access_control import check_patient_access
from auth.base import AuthUser

pytestmark = pytest.mark.asyncio


def _user(is_superuser: bool) -> AuthUser:
    return AuthUser(user_id="1", username="u", role="admin" if is_superuser else "user",
                    is_superuser=is_superuser)


class TestSuperuserPasses:
    """Superusers pass check_patient_access for any patient / required_type."""

    async def test_superuser_passes_read(self, db):
        await check_patient_access("PAT-001", _user(True), db, required_type="read")

    async def test_superuser_passes_write(self, db):
        await check_patient_access("PAT-001", _user(True), db, required_type="write")

    async def test_superuser_passes_any_patient(self, db):
        await check_patient_access("NONEXISTENT-999", _user(True), db)


class TestNonSuperuserDenied:
    """Non-superusers are denied (403) — there is no ACL to grant access."""

    async def test_non_superuser_raises_403(self, db):
        with pytest.raises(HTTPException) as exc:
            await check_patient_access("PAT-001", _user(False), db)
        assert exc.value.status_code == 403

    async def test_non_superuser_denied_for_write(self, db):
        with pytest.raises(HTTPException) as exc:
            await check_patient_access("PAT-001", _user(False), db, required_type="write")
        assert exc.value.status_code == 403
