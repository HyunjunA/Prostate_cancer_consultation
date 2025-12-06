# routers/studies.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from db import get_db
from models import Study

router = APIRouter(prefix="/api/studies", tags=["studies"])

@router.get("", summary="List studies (paginated)")
async def list_studies(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    sort: str = Query("id"),
    order: str = Query("asc"),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size

    # 정렬 컬럼 가드
    sort_col = getattr(Study, sort, Study.id)
    sort_expr = sort_col.asc() if order == "asc" else sort_col.desc()

    stmt = (
        select(Study)
        .order_by(sort_expr)
        .limit(size)
        .offset(offset)
        # 관계 미리 로딩 예시 (필요 시)
        # .options(selectinload(Study.children))
    )

    result = await db.execute(stmt)
    items = result.scalars().all()

    # 전체 개수 구하기 (카운트가 필요하면)
    # from sqlalchemy import func
    # total = (await db.execute(select(func.count()).select_from(Study))).scalar_one()

    return {"page": page, "size": size, "items": items}  # , "total": total
