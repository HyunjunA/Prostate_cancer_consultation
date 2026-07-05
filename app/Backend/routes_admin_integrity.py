"""Admin data-integrity endpoint — HTTP surface for the integrity_checks verifiers.

GET /api/admin/integrity runs the DB / REDCap / activity checks and returns the
report. Returns HTTP 503 when any check fails (so bots / CI / managers can poll a
single URL), 200 otherwise. Read-only. Mirrors routes_admin_pipeline.pipeline_status.
"""
import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from auth.admin_session import require_admin_user
from auth.base import AuthUser
from core.settings import get_settings
from db import get_db
from integrity_checks import run_all_checks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin Integrity"])


@router.get("/integrity", dependencies=[Depends(require_admin_user)])
async def integrity_status(
    skip_redcap: bool = Query(False, description="Skip the DB↔REDCap reconciliation (C2)"),
    user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run all integrity checks. 503 if any check FAILs (warn/pass → 200)."""
    settings = get_settings()
    try:
        report = await run_all_checks(
            db,
            redcap_url=settings.redcap_api_url,
            redcap_token=settings.redcap_api_token,
            skip_redcap=skip_redcap,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("integrity check crashed")
        return JSONResponse(status_code=503, content={"overall": "fail", "error": str(exc), "results": []})

    status_code = 503 if report["overall"] == "fail" else 200
    return JSONResponse(status_code=status_code, content=report)
