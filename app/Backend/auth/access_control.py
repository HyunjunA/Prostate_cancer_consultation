"""Patient-level access control — independent of the auth backend.

Usage in route handlers::

    from auth.access_control import check_patient_access, get_accessible_patient_ids

    @router.get("/download/{patient_id}")
    async def download(
        patient_id: str,
        user: AuthUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        await check_patient_access(patient_id, user, db)
        ...
"""

import logging
from typing import List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.base import AuthUser
from auth.models import PatientAccess

logger = logging.getLogger(__name__)


async def check_patient_access(
    patient_id: str,
    user: AuthUser,
    db: AsyncSession,
    *,
    required_type: str = "read",
) -> None:
    """Raise 403 if ``user`` may not access ``patient_id``.

    Superusers (including Module-A system user) pass unconditionally.
    """
    if user.is_superuser:
        return  # Module A always hits this path — zero overhead

    _ACCESS_HIERARCHY = {"read": 0, "write": 1, "admin": 2}
    required_level = _ACCESS_HIERARCHY.get(required_type, 0)

    stmt = select(PatientAccess).where(
        PatientAccess.user_id == int(user.user_id),
        PatientAccess.patient_id == patient_id,
    )
    result = await db.execute(stmt)
    access = result.scalar_one_or_none()

    if access is None:
        logger.warning(
            "Access denied: user=%s patient=%s (no record)",
            user.user_id,
            patient_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this patient's data",
        )

    granted_level = _ACCESS_HIERARCHY.get(access.access_type, 0)
    if granted_level < required_level:
        logger.warning(
            "Access denied: user=%s patient=%s (has %s, needs %s)",
            user.user_id,
            patient_id,
            access.access_type,
            required_type,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient access (has '{access.access_type}', needs '{required_type}')",
        )


async def get_accessible_patient_ids(
    user: AuthUser,
    db: AsyncSession,
) -> List[str]:
    """Return the list of patient_ids the user may access.

    Returns an empty list for superusers (meaning "all" — the caller should
    treat an empty list from a superuser as "unfiltered").
    """
    if user.is_superuser:
        return []  # convention: empty = all

    stmt = (
        select(PatientAccess.patient_id)
        .where(PatientAccess.user_id == int(user.user_id))
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]
