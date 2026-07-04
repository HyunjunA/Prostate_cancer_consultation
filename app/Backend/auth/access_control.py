"""Patient-level access control — independent of the auth backend.

Usage in route handlers::

    from auth.access_control import check_patient_access

    @router.get("/download/{patient_id}")
    async def download(
        patient_id: str,
        user: AuthUser = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        await check_patient_access(patient_id, user, db)
        ...

Only superusers (admin + the API-key system user) access patient data in the
current deployment, so this is a superuser gate.
"""

import logging

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.base import AuthUser

logger = logging.getLogger(__name__)


async def check_patient_access(
    patient_id: str,
    user: AuthUser,
    db: AsyncSession,
    *,
    required_type: str = "read",
) -> None:
    """Raise 403 unless ``user`` is a superuser.

    Superusers (admin + the API-key system user) pass unconditionally; every
    other caller is denied. `db`/`required_type` are kept in the signature so
    call sites don't change.
    """
    if user.is_superuser:
        return
    logger.warning("Access denied: user=%s patient=%s (not a superuser)", user.user_id, patient_id)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this patient's data",
    )
