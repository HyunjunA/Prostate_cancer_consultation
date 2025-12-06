#!/usr/bin/env python3
"""
FastAPI Main Application - SARS-CoV Research API (Async)
Provides filtering and analysis API for SARS-CoV research data
"""

from typing import List, Optional, Dict, Any, Callable
import datetime
from uuid import UUID
import os
import json
import hashlib
import inspect

from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

from sqlalchemy import func, text, select, Integer as SAInteger
from sqlalchemy.ext.asyncio import AsyncSession

import pandas as pd
from dotenv import load_dotenv

from db import get_db, db_ready_ping
from models import (
    Study,
    StudyResponse,
    StudyFilter,
    PaginatedStudyResponse,
    StudyAggregation,
    DashboardStats,
)

load_dotenv()

# ──────────────────────────────────────────────────────────────────────────────
# Redis & Rate Limiter
# ──────────────────────────────────────────────────────────────────────────────
from redis.asyncio import Redis
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
import jwt  # PyJWT

JWT_SECRET = os.getenv("JWT_SECRET", "change_me")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RATE_LIMIT_NAMESPACE = os.getenv("RATE_LIMIT_NS", "sarscov")

redis: Optional[Redis] = None
rate_limit_enabled = True

CACHE_VERSION_KEY = "cache:studies:version"
DEFAULT_CACHE_VERSION = "1"

# ──────────────────────────────────────────────────────────────────────────────
# FastAPI App & CORS
# ──────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SARS-CoV Research API",
    description="API for filtering and analyzing SARS-CoV research data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

cors_origins = os.getenv(
    "CORS_ORIGINS", '["http://localhost:3000","http://localhost:5173","http://localhost:8080"]'
)
if isinstance(cors_origins, str):
    cors_origins = json.loads(cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# Client Identifier for Rate Limiting
# ──────────────────────────────────────────────────────────────────────────────
from fastapi import Request

async def _client_ip(request: Request) -> str:
    for header in ("CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"):
        if header in request.headers:
            return request.headers[header].split(",")[0].strip()
    return request.client.host

async def user_or_ip_identifier(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer "):].strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            uid = payload.get("sub")
            if uid:
                return f"{RATE_LIMIT_NAMESPACE}:user:{uid}"
        except Exception:
            pass
    ip = await _client_ip(request)
    return f"{RATE_LIMIT_NAMESPACE}:ip:{ip}"

# ──────────────────────────────────────────────────────────────────────────────
# Redis/RateLimiter init & shutdown
# ──────────────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    global redis, rate_limit_enabled
    try:
        redis = Redis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        await redis.ping()
        await FastAPILimiter.init(
            redis,
            identifier=user_or_ip_identifier,
            prefix=f"{RATE_LIMIT_NAMESPACE}:rl"
        )
        rate_limit_enabled = True
        print("[INIT] Redis & RateLimiter ready.")
    except Exception as e:
        print(f"[WARN] Redis/RateLimiter disabled: {e}")
        redis = None
        rate_limit_enabled = False

@app.on_event("shutdown")
async def on_shutdown():
    if redis:
        await redis.close()

# ──────────────────────────────────────────────────────────────────────────────
# Caching helpers
# ──────────────────────────────────────────────────────────────────────────────
def _safe_json_dumps(obj: Any) -> str:
    return json.dumps(obj, default=str, separators=(",", ":"), ensure_ascii=False)

def _make_cache_key(namespace: str, payload: dict) -> str:
    digest = hashlib.sha256(_safe_json_dumps(payload).encode()).hexdigest()[:32]
    return f"cache:{namespace}:{digest}"

async def cache_json(
    *,
    request: Request,
    namespace: str,
    ttl_seconds: int,
    compute: Callable[[], Any],
    body_for_key: Optional[dict] = None
) -> JSONResponse:
    if redis is None:
        result = await compute() if inspect.iscoroutinefunction(compute) else compute()
        return JSONResponse(content=result)

    version = await redis.get(CACHE_VERSION_KEY) or DEFAULT_CACHE_VERSION
    key_payload = {
        "v": version,
        "path": str(request.url.path),
        "query": sorted(list(request.query_params.multi_items())),
        "body": body_for_key or {},
    }
    key = _make_cache_key(namespace, key_payload)
    cached = await redis.get(key)
    if cached:
        return JSONResponse(content=json.loads(cached))

    result = await compute() if inspect.iscoroutinefunction(compute) else compute()
    try:
        await redis.setex(key, ttl_seconds, _safe_json_dumps(result))
    except Exception:
        pass
    return JSONResponse(content=result)

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def yesno(v) -> Optional[bool]:
    s = str(v).strip().lower()
    if s in ("yes", "true", "1"):
        return True
    if s in ("no", "false", "0"):
        return False
    return None

def build_filter_conditions(filters: StudyFilter) -> list:
    conds = []
    if getattr(filters, "year_list", None):
        conds.append(Study.publication_year.in_(filters.year_list))
    if getattr(filters, "countries", None):
        conds.append(Study.study_location_1.in_(filters.countries))
    if getattr(filters, "repositories", None):
        conds.append(Study.repository.in_(filters.repositories))
    if getattr(filters, "pmid", None):
        conds.append(Study.pmid == filters.pmid)
    for field_name in [
        'age_reported',
        'gender_reported',
        'race_ethnicity_nationality_reported',
        'comorbidities_reported',
        'inpatient_outpatient_reported',
        'outcomes_reported',
        'severity_reported',
        'signs_symptoms_reported',
        'treatment_reported',
        'vaccination_status_reported',
        'sequence_ids_reported',
    ]:
        value = getattr(filters, field_name, None)
        if value is not None:
            conds.append(getattr(Study, field_name) == value)
    if getattr(filters, "search_title", None):
        conds.append(Study.title.ilike(f"%{filters.search_title}%"))
    if getattr(filters, "search_pmid", None):
        conds.append(Study.pmid.ilike(f"%{filters.search_pmid}%"))
    return conds

def to_dict(obj: Any) -> Dict[str, Any]:
    out = {}
    for c in obj.__table__.columns:
        value = getattr(obj, c.name)
        if isinstance(value, UUID):
            out[c.name] = str(value)
        elif isinstance(value, datetime.datetime):
            out[c.name] = value.isoformat()
        else:
            out[c.name] = value
    return out

# ──────────────────────────────────────────────────────────────────────────────
# Basic routes
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "SARS-CoV Research API", "version": "1.0.0", "docs": "/docs", "health": "/health"}

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        raise HTTPException(status_code=503, detail="unhealthy")

@app.get("/ready")
async def ready():
    return {"ready": await db_ready_ping()}

# ──────────────────────────────────────────────────────────────────────────────
# Dashboard Statistics
# ──────────────────────────────────────────────────────────────────────────────
@app.get(
    "/api/dashboard/stats",
    response_model=DashboardStats,
    dependencies=[Depends(RateLimiter(times=120, seconds=60))]
)
async def get_dashboard_stats(request: Request, db: AsyncSession = Depends(get_db)):
    async def compute():
        stmt = select(
            func.count(Study.id).label('total_studies'),
            func.count(func.distinct(Study.study_location_1)).label('unique_countries'),
            func.count(func.distinct(Study.repository)).label('unique_repositories'),
            func.coalesce(func.sum(Study.number_of_samples_sequenced), 0).label('total_samples'),
            func.coalesce(func.sum(func.cast(Study.sequence_ids_reported, SAInteger)), 0).label('studies_with_sequence_ids'),
            func.min(Study.publication_year).label('earliest_year'),
            func.max(Study.publication_year).label('latest_year')
        )
        row = (await db.execute(stmt)).one()
        return DashboardStats(
            total_studies=row.total_studies or 0,
            unique_countries=row.unique_countries or 0,
            unique_repositories=row.unique_repositories or 0,
            total_samples=row.total_samples or 0,
            studies_with_sequence_ids=row.studies_with_sequence_ids or 0,
            earliest_year=row.earliest_year,
            latest_year=row.latest_year
        ).model_dump()
    return await cache_json(request=request, namespace="dashboard:stats", ttl_seconds=180, compute=compute)

# ──────────────────────────────────────────────────────────────────────────────
# Filter Options (Dropdown)
# ──────────────────────────────────────────────────────────────────────────────
@app.get(
    "/api/studies/filter-options",
    dependencies=[Depends(RateLimiter(times=120, seconds=60))]
)
async def get_filter_options(request: Request, db: AsyncSession = Depends(get_db)):
    async def compute():
        countries_stmt = (
            select(Study.study_location_1)
            .where(Study.study_location_1.is_not(None))
            .where(Study.study_location_1 != '')
            .distinct()
            .order_by(Study.study_location_1)
        )
        repositories_stmt = (
            select(Study.repository)
            .where(Study.repository.is_not(None))
            .where(Study.repository != '')
            .distinct()
            .order_by(Study.repository)
        )
        years_stmt = (
            select(Study.publication_year)
            .where(Study.publication_year.is_not(None))
            .distinct()
            .order_by(Study.publication_year.desc())
        )

        countries = [r[0] for r in (await db.execute(countries_stmt)).all() if r[0]]
        repositories = [r[0] for r in (await db.execute(repositories_stmt)).all() if r[0]]
        years = [r[0] for r in (await db.execute(years_stmt)).all() if r[0]]
        return {"countries": countries, "repositories": repositories, "years": years}
    return await cache_json(request=request, namespace="studies:filter-options", ttl_seconds=600, compute=compute)

# ──────────────────────────────────────────────────────────────────────────────
# List + Filter + Paging
# ──────────────────────────────────────────────────────────────────────────────
@app.post(
    "/api/studies/filter",
    dependencies=[Depends(RateLimiter(times=60, seconds=60))]
)
async def filter_studies(
    request: Request,
    filters: StudyFilter,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    async def compute():
        conds = build_filter_conditions(filters)
        total = (await db.execute(select(func.count()).select_from(Study).where(*conds))).scalar_one()

        offset = (page - 1) * size
        stmt = (
            select(Study)
            .where(*conds)
            .order_by(Study.publication_year.desc(), Study.created_at.desc())
            .offset(offset)
            .limit(size)
        )
        studies = (await db.execute(stmt)).scalars().all()

        data = []
        for s in studies:
            data.append({
                'id': str(s.id),
                'covidence_id': s.covidence_id,
                'pmid': s.pmid,
                'study_id': s.study_id,
                'title': s.title,
                'publication_year': s.publication_year,
                'study_location_1': s.study_location_1,
                'study_location_2': s.study_location_2,
                'number_of_samples_sequenced': s.number_of_samples_sequenced,
                'repository': s.repository,
                'sequence_ids_reported': s.sequence_ids_reported,
                'sequence_id_article_location': s.sequence_id_article_location,
                'age_reported': s.age_reported,
                'gender_reported': s.gender_reported,
                'race_ethnicity_nationality_reported': s.race_ethnicity_nationality_reported,
                'demographic_article_location': s.demographic_article_location,
                'comorbidities_reported': s.comorbidities_reported,
                'inpatient_outpatient_reported': s.inpatient_outpatient_reported,
                'outcomes_reported': s.outcomes_reported,
                'severity_reported': s.severity_reported,
                'signs_symptoms_reported': s.signs_symptoms_reported,
                'treatment_reported': s.treatment_reported,
                'vaccination_status_reported': s.vaccination_status_reported,
                'clinical_article_location': s.clinical_article_location,
                'created_at': s.created_at.isoformat() if s.created_at else None,
                'updated_at': s.updated_at.isoformat() if s.updated_at else None,
            })
        pages = (total + size - 1) // size
        return {"data": data, "total": total, "page": page, "size": size,
                "pages": pages, "has_next": page < pages, "has_prev": page > 1}

    body_for_key = filters.model_dump() if hasattr(filters, "model_dump") else filters.dict()
    return await cache_json(
        request=request,
        namespace="studies:filter",
        ttl_seconds=120,
        compute=compute,
        body_for_key={"page": page, "size": size, **body_for_key}
    )

# ──────────────────────────────────────────────────────────────────────────────
# Dynamic Filter Options
# ──────────────────────────────────────────────────────────────────────────────
@app.post(
    "/api/studies/filter-options-dynamic",
    dependencies=[Depends(RateLimiter(times=60, seconds=60))]
)
async def get_dynamic_filter_options(request: Request, filters: StudyFilter, db: AsyncSession = Depends(get_db)):
    async def compute():
        conds = build_filter_conditions(filters)
        stmt = select(Study).where(*conds)
        studies = (await db.execute(stmt)).scalars().all()
        result = [{
            "covidence_id": s.covidence_id,
            "pmid": s.pmid,
            "study_id": s.study_id,
            "title": s.title,
            "publication_year": s.publication_year,
            "study_location_1": s.study_location_1,
            "study_location_2": s.study_location_2,
            "number_of_samples_sequenced": s.number_of_samples_sequenced,
            "repository": s.repository,
            "sequence_ids_reported": s.sequence_ids_reported,
            "sequence_id_article_location": s.sequence_id_article_location,
            "age_reported": s.age_reported,
            "gender_reported": s.gender_reported,
            "race_ethnicity_nationality_reported": s.race_ethnicity_nationality_reported,
            "demographic_article_location": s.demographic_article_location,
            "comorbidities_reported": s.comorbidities_reported,
            "inpatient_outpatient_reported": s.inpatient_outpatient_reported,
            "outcomes_reported": s.outcomes_reported,
            "severity_reported": s.severity_reported,
            "signs_symptoms_reported": s.signs_symptoms_reported,
            "treatment_reported": s.treatment_reported,
            "vaccination_status_reported": s.vaccination_status_reported,
            "clinical_article_location": s.clinical_article_location
        } for s in studies]
        return {"total_count": len(result), "studies": result}

    body_for_key = filters.model_dump() if hasattr(filters, "model_dump") else filters.dict()
    return await cache_json(
        request=request,
        namespace="studies:filter-options-dynamic",
        ttl_seconds=120,
        compute=compute,
        body_for_key=body_for_key
    )

# ──────────────────────────────────────────────────────────────────────────────
# DISTINCT
# ──────────────────────────────────────────────────────────────────────────────
@app.get(
    "/api/studies/distinct",
    dependencies=[Depends(RateLimiter(times=120, seconds=60))]
)
async def distinct(request: Request, field: str = Query(..., pattern=r"^[A-Za-z0-9_]+$"), db: AsyncSession = Depends(get_db)):
    allowed = {
        "covidence_id","pmid","study_id","title","publication_year",
        "study_location_1","study_location_2","repository",
        "age_reported","gender_reported","race_ethnicity_nationality_reported",
        "comorbidities_reported","inpatient_outpatient_reported","outcomes_reported",
        "severity_reported","signs_symptoms_reported","treatment_reported",
        "vaccination_status_reported","sequence_ids_reported"
    }
    if field not in allowed:
        raise HTTPException(400, f"field must be one of {sorted(allowed)}")

    async def compute():
        column = getattr(Study, field)
        stmt = select(column).distinct().order_by(column)
        values = [r[0] for r in (await db.execute(stmt)).all()]
        return [v for v in values if v is not None and v != ""]

    return await cache_json(
        request=request,
        namespace="studies:distinct",
        ttl_seconds=300,
        compute=compute,
        body_for_key={"field": field}
    )

# ──────────────────────────────────────────────────────────────────────────────
# Boolean distribution
# ──────────────────────────────────────────────────────────────────────────────
@app.get(
    "/api/studies/boolean-stats",
    dependencies=[Depends(RateLimiter(times=60, seconds=60))]
)
async def boolean_stats(request: Request, field: str, db: AsyncSession = Depends(get_db)):
    allowed = {
        "age_reported","gender_reported","race_ethnicity_nationality_reported",
        "comorbidities_reported","inpatient_outpatient_reported","outcomes_reported",
        "severity_reported","signs_symptoms_reported","treatment_reported",
        "vaccination_status_reported","sequence_ids_reported"
    }
    if field not in allowed:
        raise HTTPException(400, f"field must be one of {sorted(allowed)}")

    async def compute():
        sql = text(f"""
          SELECT
            COUNT(*) FILTER (WHERE {field} IN ('Yes','yes','TRUE','true','1', TRUE))  AS yes_count,
            COUNT(*) FILTER (WHERE {field} IN ('No','no','FALSE','false','0',  FALSE)) AS no_count,
            COUNT(*) FILTER (WHERE {field} IS NULL)                                    AS null_count
          FROM studies;
        """)
        row = (await db.execute(sql)).one()
        if hasattr(row, "_mapping"):
            m = row._mapping
            return {"yes_count": m["yes_count"], "no_count": m["no_count"], "null_count": m["null_count"]}
        return {"yes_count": row[0], "no_count": row[1], "null_count": row[2]}

    return await cache_json(
        request=request,
        namespace="studies:boolean-stats",
        ttl_seconds=180,
        compute=compute,
        body_for_key={"field": field}
    )



@app.post(
    "/api/studies/aggregation/{field}",
    dependencies=[Depends(RateLimiter(times=60, seconds=60))]
)
async def get_aggregation(request: Request, field: str, filters: StudyFilter, db: AsyncSession = Depends(get_db)):
    async def compute():
        valid_fields = {
            'study_location_1': Study.study_location_1,
            'repository': Study.repository,
            'publication_year': Study.publication_year,
            'age_reported': Study.age_reported,
            'gender_reported': Study.gender_reported,
            'sequence_ids_reported': Study.sequence_ids_reported,
        }
        if field not in valid_fields:
            raise HTTPException(400, f"Invalid aggregation field: {field}")

        col = valid_fields[field]
        stmt = (
            select(col, func.count().label('count'))
            .where(col.is_not(None))
            .group_by(col)
            .order_by(func.count().desc())
        )
        rows = (await db.execute(stmt)).all()

        total = sum(r.count for r in rows) or 0
        values = [{
            "category": str(r[0]) if r[0] is not None else "Unknown",
            "value": r.count,
            "count": r.count,
            "percentage": round((r.count / total) * 100, 1) if total else 0
        } for r in rows]

        return StudyAggregation(field=field, values=values).model_dump()

    body_for_key = (filters.model_dump() if hasattr(filters, "model_dump") else filters.dict()) | {"field": field}
    return await cache_json(
        request=request,
        namespace=f"studies:agg:{field}",
        ttl_seconds=180,
        compute=compute,
        body_for_key=body_for_key
    )



# Entrypoint (dev only)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("API_HOST", "0.0.0.0"), port=int(os.getenv("API_PORT", "8000")), reload=True)
