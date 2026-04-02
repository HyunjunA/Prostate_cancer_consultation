# #!/usr/bin/env python3
# """
# FastAPI Main Application - SARS-CoV Research API (Async)
# Provides filtering and analysis API for SARS-CoV research data
# """

# from typing import List, Optional, Dict, Any, Callable
# import datetime
# from uuid import UUID
# import os
# import json
# import hashlib
# import inspect

# from fastapi import FastAPI, Depends, HTTPException, Query, Request
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse

# from fastapi_limiter import FastAPILimiter
# from fastapi_limiter.depends import RateLimiter

# from sqlalchemy import func, text, select, Integer as SAInteger
# from sqlalchemy.ext.asyncio import AsyncSession

# import pandas as pd
# from dotenv import load_dotenv

# from db import get_db, db_ready_ping
# from models import (
#     Study,
#     StudyResponse,
#     StudyFilter,
#     PaginatedStudyResponse,
#     StudyAggregation,
#     DashboardStats,
# )

# load_dotenv()

# # ──────────────────────────────────────────────────────────────────────────────
# # Redis & Rate Limiter
# # ──────────────────────────────────────────────────────────────────────────────
# from redis.asyncio import Redis
# from fastapi_limiter import FastAPILimiter
# from fastapi_limiter.depends import RateLimiter
# import jwt  # PyJWT

# JWT_SECRET = os.getenv("JWT_SECRET", "change_me")
# JWT_ALG = os.getenv("JWT_ALG", "HS256")
# REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# RATE_LIMIT_NAMESPACE = os.getenv("RATE_LIMIT_NS", "sarscov")

# redis: Optional[Redis] = None
# rate_limit_enabled = True

# CACHE_VERSION_KEY = "cache:studies:version"
# DEFAULT_CACHE_VERSION = "1"

# # ──────────────────────────────────────────────────────────────────────────────
# # FastAPI App & CORS
# # ──────────────────────────────────────────────────────────────────────────────
# app = FastAPI(
#     title="SARS-CoV Research API",
#     description="API for filtering and analyzing SARS-CoV research data",
#     version="1.0.0",
#     docs_url="/docs",
#     redoc_url="/redoc",
# )

# cors_origins = os.getenv(
#     "CORS_ORIGINS", '["http://localhost:3000","http://localhost:5173","http://localhost:8080"]'
# )
# if isinstance(cors_origins, str):
#     cors_origins = json.loads(cors_origins)

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=cors_origins,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # ──────────────────────────────────────────────────────────────────────────────
# # Client Identifier for Rate Limiting
# # ──────────────────────────────────────────────────────────────────────────────
# from fastapi import Request

# async def _client_ip(request: Request) -> str:
#     for header in ("CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"):
#         if header in request.headers:
#             return request.headers[header].split(",")[0].strip()
#     return request.client.host

# async def user_or_ip_identifier(request: Request) -> str:
#     auth = request.headers.get("Authorization", "")
#     if auth.startswith("Bearer "):
#         token = auth[len("Bearer "):].strip()
#         try:
#             payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
#             uid = payload.get("sub")
#             if uid:
#                 return f"{RATE_LIMIT_NAMESPACE}:user:{uid}"
#         except Exception:
#             pass
#     ip = await _client_ip(request)
#     return f"{RATE_LIMIT_NAMESPACE}:ip:{ip}"

# # ──────────────────────────────────────────────────────────────────────────────
# # Redis/RateLimiter init & shutdown
# # ──────────────────────────────────────────────────────────────────────────────
# @app.on_event("startup")
# async def on_startup():
#     global redis, rate_limit_enabled
#     try:
#         redis = Redis.from_url(
#             REDIS_URL,
#             encoding="utf-8",
#             decode_responses=True,
#             max_connections=20,
#         )
#         await redis.ping()
#         await FastAPILimiter.init(
#             redis,
#             identifier=user_or_ip_identifier,
#             prefix=f"{RATE_LIMIT_NAMESPACE}:rl"
#         )
#         rate_limit_enabled = True
#         print("[INIT] Redis & RateLimiter ready.")
#     except Exception as e:
#         print(f"[WARN] Redis/RateLimiter disabled: {e}")
#         redis = None
#         rate_limit_enabled = False

# @app.on_event("shutdown")
# async def on_shutdown():
#     if redis:
#         await redis.close()

# # ──────────────────────────────────────────────────────────────────────────────
# # Caching helpers
# # ──────────────────────────────────────────────────────────────────────────────
# def _safe_json_dumps(obj: Any) -> str:
#     return json.dumps(obj, default=str, separators=(",", ":"), ensure_ascii=False)

# def _make_cache_key(namespace: str, payload: dict) -> str:
#     digest = hashlib.sha256(_safe_json_dumps(payload).encode()).hexdigest()[:32]
#     return f"cache:{namespace}:{digest}"

# async def cache_json(
#     *,
#     request: Request,
#     namespace: str,
#     ttl_seconds: int,
#     compute: Callable[[], Any],
#     body_for_key: Optional[dict] = None
# ) -> JSONResponse:
#     if redis is None:
#         result = await compute() if inspect.iscoroutinefunction(compute) else compute()
#         return JSONResponse(content=result)

#     version = await redis.get(CACHE_VERSION_KEY) or DEFAULT_CACHE_VERSION
#     key_payload = {
#         "v": version,
#         "path": str(request.url.path),
#         "query": sorted(list(request.query_params.multi_items())),
#         "body": body_for_key or {},
#     }
#     key = _make_cache_key(namespace, key_payload)
#     cached = await redis.get(key)
#     if cached:
#         return JSONResponse(content=json.loads(cached))

#     result = await compute() if inspect.iscoroutinefunction(compute) else compute()
#     try:
#         await redis.setex(key, ttl_seconds, _safe_json_dumps(result))
#     except Exception:
#         pass
#     return JSONResponse(content=result)

# # ──────────────────────────────────────────────────────────────────────────────
# # Helpers
# # ──────────────────────────────────────────────────────────────────────────────
# def yesno(v) -> Optional[bool]:
#     s = str(v).strip().lower()
#     if s in ("yes", "true", "1"):
#         return True
#     if s in ("no", "false", "0"):
#         return False
#     return None

# def build_filter_conditions(filters: StudyFilter) -> list:
#     conds = []
#     if getattr(filters, "year_list", None):
#         conds.append(Study.publication_year.in_(filters.year_list))
#     if getattr(filters, "countries", None):
#         conds.append(Study.study_location_1.in_(filters.countries))
#     if getattr(filters, "repositories", None):
#         conds.append(Study.repository.in_(filters.repositories))
#     if getattr(filters, "pmid", None):
#         conds.append(Study.pmid == filters.pmid)
#     for field_name in [
#         'age_reported',
#         'gender_reported',
#         'race_ethnicity_nationality_reported',
#         'comorbidities_reported',
#         'inpatient_outpatient_reported',
#         'outcomes_reported',
#         'severity_reported',
#         'signs_symptoms_reported',
#         'treatment_reported',
#         'vaccination_status_reported',
#         'sequence_ids_reported',
#     ]:
#         value = getattr(filters, field_name, None)
#         if value is not None:
#             conds.append(getattr(Study, field_name) == value)
#     if getattr(filters, "search_title", None):
#         conds.append(Study.title.ilike(f"%{filters.search_title}%"))
#     if getattr(filters, "search_pmid", None):
#         conds.append(Study.pmid.ilike(f"%{filters.search_pmid}%"))
#     return conds

# def to_dict(obj: Any) -> Dict[str, Any]:
#     out = {}
#     for c in obj.__table__.columns:
#         value = getattr(obj, c.name)
#         if isinstance(value, UUID):
#             out[c.name] = str(value)
#         elif isinstance(value, datetime.datetime):
#             out[c.name] = value.isoformat()
#         else:
#             out[c.name] = value
#     return out

# # ──────────────────────────────────────────────────────────────────────────────
# # Basic routes
# # ──────────────────────────────────────────────────────────────────────────────
# @app.get("/")
# async def root():
#     return {"message": "SARS-CoV Research API", "version": "1.0.0", "docs": "/docs", "health": "/health"}

# @app.get("/health")
# async def health_check(db: AsyncSession = Depends(get_db)):
#     try:
#         await db.execute(text("SELECT 1"))
#         return {"status": "healthy"}
#     except Exception:
#         raise HTTPException(status_code=503, detail="unhealthy")

# @app.get("/ready")
# async def ready():
#     return {"ready": await db_ready_ping()}

# # ──────────────────────────────────────────────────────────────────────────────
# # Dashboard Statistics
# # ──────────────────────────────────────────────────────────────────────────────
# @app.get(
#     "/api/dashboard/stats",
#     response_model=DashboardStats,
#     dependencies=[Depends(RateLimiter(times=120, seconds=60))]
# )
# async def get_dashboard_stats(request: Request, db: AsyncSession = Depends(get_db)):
#     async def compute():
#         stmt = select(
#             func.count(Study.id).label('total_studies'),
#             func.count(func.distinct(Study.study_location_1)).label('unique_countries'),
#             func.count(func.distinct(Study.repository)).label('unique_repositories'),
#             func.coalesce(func.sum(Study.number_of_samples_sequenced), 0).label('total_samples'),
#             func.coalesce(func.sum(func.cast(Study.sequence_ids_reported, SAInteger)), 0).label('studies_with_sequence_ids'),
#             func.min(Study.publication_year).label('earliest_year'),
#             func.max(Study.publication_year).label('latest_year')
#         )
#         row = (await db.execute(stmt)).one()
#         return DashboardStats(
#             total_studies=row.total_studies or 0,
#             unique_countries=row.unique_countries or 0,
#             unique_repositories=row.unique_repositories or 0,
#             total_samples=row.total_samples or 0,
#             studies_with_sequence_ids=row.studies_with_sequence_ids or 0,
#             earliest_year=row.earliest_year,
#             latest_year=row.latest_year
#         ).model_dump()
#     return await cache_json(request=request, namespace="dashboard:stats", ttl_seconds=180, compute=compute)

# # ──────────────────────────────────────────────────────────────────────────────
# # Filter Options (Dropdown)
# # ──────────────────────────────────────────────────────────────────────────────
# @app.get(
#     "/api/studies/filter-options",
#     dependencies=[Depends(RateLimiter(times=120, seconds=60))]
# )
# async def get_filter_options(request: Request, db: AsyncSession = Depends(get_db)):
#     async def compute():
#         countries_stmt = (
#             select(Study.study_location_1)
#             .where(Study.study_location_1.is_not(None))
#             .where(Study.study_location_1 != '')
#             .distinct()
#             .order_by(Study.study_location_1)
#         )
#         repositories_stmt = (
#             select(Study.repository)
#             .where(Study.repository.is_not(None))
#             .where(Study.repository != '')
#             .distinct()
#             .order_by(Study.repository)
#         )
#         years_stmt = (
#             select(Study.publication_year)
#             .where(Study.publication_year.is_not(None))
#             .distinct()
#             .order_by(Study.publication_year.desc())
#         )

#         countries = [r[0] for r in (await db.execute(countries_stmt)).all() if r[0]]
#         repositories = [r[0] for r in (await db.execute(repositories_stmt)).all() if r[0]]
#         years = [r[0] for r in (await db.execute(years_stmt)).all() if r[0]]
#         return {"countries": countries, "repositories": repositories, "years": years}
#     return await cache_json(request=request, namespace="studies:filter-options", ttl_seconds=600, compute=compute)

# # ──────────────────────────────────────────────────────────────────────────────
# # List + Filter + Paging
# # ──────────────────────────────────────────────────────────────────────────────
# @app.post(
#     "/api/studies/filter",
#     dependencies=[Depends(RateLimiter(times=60, seconds=60))]
# )
# async def filter_studies(
#     request: Request,
#     filters: StudyFilter,
#     page: int = Query(1, ge=1),
#     size: int = Query(50, ge=1, le=1000),
#     db: AsyncSession = Depends(get_db),
# ):
#     async def compute():
#         conds = build_filter_conditions(filters)
#         total = (await db.execute(select(func.count()).select_from(Study).where(*conds))).scalar_one()

#         offset = (page - 1) * size
#         stmt = (
#             select(Study)
#             .where(*conds)
#             .order_by(Study.publication_year.desc(), Study.created_at.desc())
#             .offset(offset)
#             .limit(size)
#         )
#         studies = (await db.execute(stmt)).scalars().all()

#         data = []
#         for s in studies:
#             data.append({
#                 'id': str(s.id),
#                 'covidence_id': s.covidence_id,
#                 'pmid': s.pmid,
#                 'study_id': s.study_id,
#                 'title': s.title,
#                 'publication_year': s.publication_year,
#                 'study_location_1': s.study_location_1,
#                 'study_location_2': s.study_location_2,
#                 'number_of_samples_sequenced': s.number_of_samples_sequenced,
#                 'repository': s.repository,
#                 'sequence_ids_reported': s.sequence_ids_reported,
#                 'sequence_id_article_location': s.sequence_id_article_location,
#                 'age_reported': s.age_reported,
#                 'gender_reported': s.gender_reported,
#                 'race_ethnicity_nationality_reported': s.race_ethnicity_nationality_reported,
#                 'demographic_article_location': s.demographic_article_location,
#                 'comorbidities_reported': s.comorbidities_reported,
#                 'inpatient_outpatient_reported': s.inpatient_outpatient_reported,
#                 'outcomes_reported': s.outcomes_reported,
#                 'severity_reported': s.severity_reported,
#                 'signs_symptoms_reported': s.signs_symptoms_reported,
#                 'treatment_reported': s.treatment_reported,
#                 'vaccination_status_reported': s.vaccination_status_reported,
#                 'clinical_article_location': s.clinical_article_location,
#                 'created_at': s.created_at.isoformat() if s.created_at else None,
#                 'updated_at': s.updated_at.isoformat() if s.updated_at else None,
#             })
#         pages = (total + size - 1) // size
#         return {"data": data, "total": total, "page": page, "size": size,
#                 "pages": pages, "has_next": page < pages, "has_prev": page > 1}

#     body_for_key = filters.model_dump() if hasattr(filters, "model_dump") else filters.dict()
#     return await cache_json(
#         request=request,
#         namespace="studies:filter",
#         ttl_seconds=120,
#         compute=compute,
#         body_for_key={"page": page, "size": size, **body_for_key}
#     )

# # ──────────────────────────────────────────────────────────────────────────────
# # Dynamic Filter Options
# # ──────────────────────────────────────────────────────────────────────────────
# @app.post(
#     "/api/studies/filter-options-dynamic",
#     dependencies=[Depends(RateLimiter(times=60, seconds=60))]
# )
# async def get_dynamic_filter_options(request: Request, filters: StudyFilter, db: AsyncSession = Depends(get_db)):
#     async def compute():
#         conds = build_filter_conditions(filters)
#         stmt = select(Study).where(*conds)
#         studies = (await db.execute(stmt)).scalars().all()
#         result = [{
#             "covidence_id": s.covidence_id,
#             "pmid": s.pmid,
#             "study_id": s.study_id,
#             "title": s.title,
#             "publication_year": s.publication_year,
#             "study_location_1": s.study_location_1,
#             "study_location_2": s.study_location_2,
#             "number_of_samples_sequenced": s.number_of_samples_sequenced,
#             "repository": s.repository,
#             "sequence_ids_reported": s.sequence_ids_reported,
#             "sequence_id_article_location": s.sequence_id_article_location,
#             "age_reported": s.age_reported,
#             "gender_reported": s.gender_reported,
#             "race_ethnicity_nationality_reported": s.race_ethnicity_nationality_reported,
#             "demographic_article_location": s.demographic_article_location,
#             "comorbidities_reported": s.comorbidities_reported,
#             "inpatient_outpatient_reported": s.inpatient_outpatient_reported,
#             "outcomes_reported": s.outcomes_reported,
#             "severity_reported": s.severity_reported,
#             "signs_symptoms_reported": s.signs_symptoms_reported,
#             "treatment_reported": s.treatment_reported,
#             "vaccination_status_reported": s.vaccination_status_reported,
#             "clinical_article_location": s.clinical_article_location
#         } for s in studies]
#         return {"total_count": len(result), "studies": result}

#     body_for_key = filters.model_dump() if hasattr(filters, "model_dump") else filters.dict()
#     return await cache_json(
#         request=request,
#         namespace="studies:filter-options-dynamic",
#         ttl_seconds=120,
#         compute=compute,
#         body_for_key=body_for_key
#     )

# # ──────────────────────────────────────────────────────────────────────────────
# # DISTINCT
# # ──────────────────────────────────────────────────────────────────────────────
# @app.get(
#     "/api/studies/distinct",
#     dependencies=[Depends(RateLimiter(times=120, seconds=60))]
# )
# async def distinct(request: Request, field: str = Query(..., pattern=r"^[A-Za-z0-9_]+$"), db: AsyncSession = Depends(get_db)):
#     allowed = {
#         "covidence_id","pmid","study_id","title","publication_year",
#         "study_location_1","study_location_2","repository",
#         "age_reported","gender_reported","race_ethnicity_nationality_reported",
#         "comorbidities_reported","inpatient_outpatient_reported","outcomes_reported",
#         "severity_reported","signs_symptoms_reported","treatment_reported",
#         "vaccination_status_reported","sequence_ids_reported"
#     }
#     if field not in allowed:
#         raise HTTPException(400, f"field must be one of {sorted(allowed)}")

#     async def compute():
#         column = getattr(Study, field)
#         stmt = select(column).distinct().order_by(column)
#         values = [r[0] for r in (await db.execute(stmt)).all()]
#         return [v for v in values if v is not None and v != ""]

#     return await cache_json(
#         request=request,
#         namespace="studies:distinct",
#         ttl_seconds=300,
#         compute=compute,
#         body_for_key={"field": field}
#     )

# # ──────────────────────────────────────────────────────────────────────────────
# # Boolean distribution
# # ──────────────────────────────────────────────────────────────────────────────
# @app.get(
#     "/api/studies/boolean-stats",
#     dependencies=[Depends(RateLimiter(times=60, seconds=60))]
# )
# async def boolean_stats(request: Request, field: str, db: AsyncSession = Depends(get_db)):
#     allowed = {
#         "age_reported","gender_reported","race_ethnicity_nationality_reported",
#         "comorbidities_reported","inpatient_outpatient_reported","outcomes_reported",
#         "severity_reported","signs_symptoms_reported","treatment_reported",
#         "vaccination_status_reported","sequence_ids_reported"
#     }
#     if field not in allowed:
#         raise HTTPException(400, f"field must be one of {sorted(allowed)}")

#     async def compute():
#         sql = text(f"""
#           SELECT
#             COUNT(*) FILTER (WHERE {field} IN ('Yes','yes','TRUE','true','1', TRUE))  AS yes_count,
#             COUNT(*) FILTER (WHERE {field} IN ('No','no','FALSE','false','0',  FALSE)) AS no_count,
#             COUNT(*) FILTER (WHERE {field} IS NULL)                                    AS null_count
#           FROM studies;
#         """)
#         row = (await db.execute(sql)).one()
#         if hasattr(row, "_mapping"):
#             m = row._mapping
#             return {"yes_count": m["yes_count"], "no_count": m["no_count"], "null_count": m["null_count"]}
#         return {"yes_count": row[0], "no_count": row[1], "null_count": row[2]}

#     return await cache_json(
#         request=request,
#         namespace="studies:boolean-stats",
#         ttl_seconds=180,
#         compute=compute,
#         body_for_key={"field": field}
#     )



# @app.post(
#     "/api/studies/aggregation/{field}",
#     dependencies=[Depends(RateLimiter(times=60, seconds=60))]
# )
# async def get_aggregation(request: Request, field: str, filters: StudyFilter, db: AsyncSession = Depends(get_db)):
#     async def compute():
#         valid_fields = {
#             'study_location_1': Study.study_location_1,
#             'repository': Study.repository,
#             'publication_year': Study.publication_year,
#             'age_reported': Study.age_reported,
#             'gender_reported': Study.gender_reported,
#             'sequence_ids_reported': Study.sequence_ids_reported,
#         }
#         if field not in valid_fields:
#             raise HTTPException(400, f"Invalid aggregation field: {field}")

#         col = valid_fields[field]
#         stmt = (
#             select(col, func.count().label('count'))
#             .where(col.is_not(None))
#             .group_by(col)
#             .order_by(func.count().desc())
#         )
#         rows = (await db.execute(stmt)).all()

#         total = sum(r.count for r in rows) or 0
#         values = [{
#             "category": str(r[0]) if r[0] is not None else "Unknown",
#             "value": r.count,
#             "count": r.count,
#             "percentage": round((r.count / total) * 100, 1) if total else 0
#         } for r in rows]

#         return StudyAggregation(field=field, values=values).model_dump()

#     body_for_key = (filters.model_dump() if hasattr(filters, "model_dump") else filters.dict()) | {"field": field}
#     return await cache_json(
#         request=request,
#         namespace=f"studies:agg:{field}",
#         ttl_seconds=180,
#         compute=compute,
#         body_for_key=body_for_key
#     )



# # Entrypoint (dev only)
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host=os.getenv("API_HOST", "0.0.0.0"), port=int(os.getenv("API_PORT", "8000")), reload=True)



# #!/usr/bin/env python3
# """
# FastAPI Main Application - "Prostate Cancer Doctor–Patient Conversation Archive API (Async)
# Provides API for doctor-patient consultation interface data
# """

# from typing import List, Optional, Dict, Any
# import os
# import json

# from fastapi import FastAPI, Depends, HTTPException, Query, Request
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse

# from sqlalchemy import select, func, text
# from sqlalchemy.ext.asyncio import AsyncSession

# from dotenv import load_dotenv

# from pydantic import BaseModel, ConfigDict
# from typing import Optional
# from datetime import datetime

# from db import get_db, db_ready_ping
# from models import (
#     DoctorSentenceView,
#     DoctorRewriteLog,
#     PatientSummary,
#     PatientSummaryScoring,
#     PatientResponses,
# )

# load_dotenv()

# # ──────────────────────────────────────────────────────────────────────────────
# # FastAPI App & CORS
# # ──────────────────────────────────────────────────────────────────────────────
# # http://localhost:8000/docs#/
# app = FastAPI(
#     title=""Prostate Cancer Doctor–Patient Conversation Archive API",
#     description="API for doctor-patient consultation interface data",
#     version="1.0.0",
#     docs_url="/docs",
#     redoc_url="/redoc",
# )

# cors_origins = os.getenv(
#     "CORS_ORIGINS", '["http://localhost:3000","http://localhost:5173","http://localhost:8080"]'
# )
# if isinstance(cors_origins, str):
#     cors_origins = json.loads(cors_origins)

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=cors_origins,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # ──────────────────────────────────────────────────────────────────────────────
# # Basic routes
# # ──────────────────────────────────────────────────────────────────────────────
# @app.get("/")
# async def root():
#     return {
#         "message": ""Prostate Cancer Doctor–Patient Conversation Archive API",
#         "version": "1.0.0",
#         "docs": "/docs",
#         "health": "/health"
#     }

# @app.get("/health")
# async def health_check(db: AsyncSession = Depends(get_db)):
#     try:
#         await db.execute(text("SELECT 1"))
#         return {"status": "healthy"}
#     except Exception:
#         raise HTTPException(status_code=503, detail="unhealthy")

# @app.get("/ready")
# async def ready():
#     return {"ready": await db_ready_ping()}



# # ──────────────────────────────────────────────────────────────────────────────
# # Doctor Interface APIs
# # ──────────────────────────────────────────────────────────────────────────────

# class DoctorRewriteUpdateFull(BaseModel):
#     model_config = ConfigDict(populate_by_name=True)
   
#     file: str
#     i: int
#     i2: int
#     speaker: str
#     time: Optional[datetime] = None
#     original_sentence: str
#     revised_sentence: str
#     score: Optional[float] = None
#     class_: str
#     selected: bool


# class PatientScoringUpdate(BaseModel):
#     file: str
#     speaker: str
#     class_1_patient_scoring: Optional[float] = None
#     class_2_patient_scoring: Optional[float] = None
#     class_3_patient_scoring: Optional[float] = None
#     class_4_patient_scoring: Optional[float] = None
#     class_5_patient_scoring: Optional[float] = None

# @app.get("/api/doctor/sentences/{file}/{speaker}")
# async def get_doctor_sentences(
#     file: str,
#     speaker: str,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get doctor sentence view data for specific file and speaker where class != -1"""
    
#     # 🔍 Debug 1: Verify input values
#     print("=" * 80)
#     print("🔍 DEBUG - Input Parameters:")
#     print(f"   file: '{file}'")
#     print(f"   speaker: '{speaker}'")
#     print(f"   speaker length: {len(speaker)}")
#     print(f"   speaker repr: {repr(speaker)}")
    
#     # 🔍 Debug 2: Check all speakers in the given file
#     all_speakers_stmt = select(DoctorSentenceView.speaker).distinct().where(
#         DoctorSentenceView.file == file
#     )
#     all_speakers = (await db.execute(all_speakers_stmt)).scalars().all()
#     print(f"\n📋 Available speakers in file '{file}':")
#     for s in all_speakers:
#         print(f"   - '{s}' (len: {len(s)}, repr: {repr(s)})")
    
#     # 🔍 Debug 3: Check without the class != '-1' condition first
#     test_stmt = select(DoctorSentenceView).where(
#         DoctorSentenceView.file == file,
#         DoctorSentenceView.speaker == speaker
#     ).limit(5)
#     test_results = (await db.execute(test_stmt)).scalars().all()
#     print(f"\n🧪 Test query (without class filter): found {len(test_results)} rows")
#     for r in test_results[:3]:
#         print(f"   - i={r.i}, i2={r.i2}, class='{r.class_}', sentence='{r.sentence[:50] if r.sentence else None}'")
    
#     # 🔍 Debug 4: Execute the actual query
#     stmt = select(DoctorSentenceView).where(
#         DoctorSentenceView.file == file,
#         DoctorSentenceView.speaker == speaker,
#         DoctorSentenceView.class_ != '-1'
#     ).order_by(DoctorSentenceView.i, DoctorSentenceView.i2)
    
#     results = (await db.execute(stmt)).scalars().all()
#     print(f"\n✅ Final query (with class != '-1'): found {len(results)} rows")
#     print("=" * 80)
    
#     if not results:
#         raise HTTPException(
#             status_code=404, 
#             detail=f"No data found for file='{file}' and speaker='{speaker}'. Available speakers: {all_speakers}"
#         )
    
#     return {
#         "file": file,
#         "speaker": speaker,
#         "total": len(results),
#         "data": [
#             {
#                 "i": r.i,
#                 "i2": r.i2,
#                 "sentence": r.sentence,
#                 "score": r.score,
#                 "class": r.class_,
#                 "time": r.time.isoformat() if r.time else None
#             }
#             for r in results
#         ]
#     }

# @app.get("/api/doctor/rewrites")
# async def get_doctor_rewrites(
#     file: Optional[str] = None,
#     speaker: Optional[str] = None,
#     selected: Optional[bool] = None,
#     skip: int = Query(0, ge=0),
#     limit: int = Query(100, ge=1, le=1000),
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get doctor rewrite history with optional filters"""
#     stmt = select(DoctorRewriteLog)
    
#     if file:
#         stmt = stmt.where(DoctorRewriteLog.file == file)
#     if speaker:
#         stmt = stmt.where(DoctorRewriteLog.speaker == speaker)
#     if selected is not None:
#         stmt = stmt.where(DoctorRewriteLog.selected == selected)
    
#     # Get total count
#     count_stmt = select(func.count()).select_from(stmt.subquery())
#     total = (await db.execute(count_stmt)).scalar_one()
    
#     # Get paginated results
#     stmt = stmt.order_by(DoctorRewriteLog.time.desc()).offset(skip).limit(limit)
#     results = (await db.execute(stmt)).scalars().all()
    
#     return {
#         "total": total,
#         "skip": skip,
#         "limit": limit,
#         "data": [
#             {
#                 "file": r.file,
#                 "i": r.i,
#                 "i2": r.i2,
#                 "speaker": r.speaker,
#                 "time": r.time.isoformat() if r.time else None,
#                 "original_sentence": r.original_sentence,
#                 "revised_sentence": r.revised_sentence,
#                 "score": r.score,
#                 "class": r.class_,
#                 "selected": r.selected
#             }
#             for r in results
#         ]
#     }


# @app.put("/api/doctor/rewrites")
# async def update_doctor_rewrite(
#     update_data: DoctorRewriteUpdateFull,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Insert new doctor rewrite log record with full data"""
    
#     # Create new record (always INSERT as new record)
#     new_record = DoctorRewriteLog(
#         file=update_data.file,
#         i=update_data.i,
#         i2=update_data.i2,
#         speaker=update_data.speaker,
#         time=update_data.time,
#         original_sentence=update_data.original_sentence,
#         revised_sentence=update_data.revised_sentence,
#         score=update_data.score,
#         class_=update_data.class_,
#         selected=update_data.selected
#     )
    
#     db.add(new_record)
#     await db.commit()
#     await db.refresh(new_record)
    
#     return {
#         "file": new_record.file,
#         "i": new_record.i,
#         "i2": new_record.i2,
#         "speaker": new_record.speaker,
#         "time": new_record.time.isoformat() if new_record.time else None,
#         "original_sentence": new_record.original_sentence,
#         "revised_sentence": new_record.revised_sentence,
#         "score": new_record.score,
#         "class": new_record.class_,
#         "selected": new_record.selected
#     }


# @app.get("/api/doctor/rewrites/{file}/{i}/{i2}/{class_}")
# async def get_doctor_rewrite_by_key(
#     file: str,
#     i: int,
#     i2: int,
#     class_: str,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get specific doctor rewrite record by composite key (file, i, i2, class)"""
    
#     stmt = select(DoctorRewriteLog).where(
#         (DoctorRewriteLog.file == file) &
#         (DoctorRewriteLog.i == i) &
#         (DoctorRewriteLog.i2 == i2) &
#         (DoctorRewriteLog.class_ == class_)
#     )
#     result = (await db.execute(stmt)).scalars().first()
    
#     if not result:
#         raise HTTPException(
#             status_code=404,
#             detail=f"Record not found for file='{file}', i={i}, i2={i2}, class='{class_}'"
#         )
    
#     return {
#         "file": result.file,
#         "i": result.i,
#         "i2": result.i2,
#         "speaker": result.speaker,
#         "time": result.time.isoformat() if result.time else None,
#         "original_sentence": result.original_sentence,
#         "revised_sentence": result.revised_sentence,
#         "score": result.score,
#         "class": result.class_,
#         "selected": result.selected
#     }

# @app.get("/api/doctor/files")
# async def get_doctor_files(db: AsyncSession = Depends(get_db)):
#     """Get list of unique files in doctor interface"""
#     stmt = select(DoctorSentenceView.file).distinct().order_by(DoctorSentenceView.file)
#     files = (await db.execute(stmt)).scalars().all()
#     return {"files": files}




# # ──────────────────────────────────────────────────────────────────────────────
# # Patient Interface APIs
# # ──────────────────────────────────────────────────────────────────────────────

# @app.get("/api/patient/summaries")
# async def get_patient_summaries(
#     file: Optional[str] = None,
#     speaker: Optional[str] = None,
#     skip: int = Query(0, ge=0),
#     limit: int = Query(100, ge=1, le=1000),
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get patient summaries with optional filters"""
#     stmt = select(PatientSummary)
    
#     if file:
#         stmt = stmt.where(PatientSummary.file == file)
#     if speaker:
#         stmt = stmt.where(PatientSummary.speaker == speaker)
    
#     # Get total count
#     count_stmt = select(func.count()).select_from(stmt.subquery())
#     total = (await db.execute(count_stmt)).scalar_one()
    
#     # Get paginated results
#     stmt = stmt.offset(skip).limit(limit)
#     results = (await db.execute(stmt)).scalars().all()
    
#     return {
#         "total": total,
#         "skip": skip,
#         "limit": limit,
#         "data": [
#             {
#                 "file": r.file,
#                 "speaker": r.speaker,
#                 "entire_summary": r.entire_summary,
#                 "classes": [
#                     {
#                         "class_name": r.class_1,
#                         "summary": r.summary_class_1
#                     },
#                     {
#                         "class_name": r.class_2,
#                         "summary": r.summary_class_2
#                     },
#                     {
#                         "class_name": r.class_3,
#                         "summary": r.summary_class_3
#                     },
#                     {
#                         "class_name": r.class_4,
#                         "summary": r.summary_class_4
#                     },
#                     {
#                         "class_name": r.class_5,
#                         "summary": r.summary_class_5
#                     }
#                 ]
#             }
#             for r in results
#         ]
#     }

# @app.get("/api/patient/summaries/{file}/{speaker}")
# async def get_patient_summary_detail(
#     file: str,
#     speaker: str,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get detailed patient summary for specific file and speaker"""
#     # Get summary
#     summary_stmt = select(PatientSummary).where(
#         PatientSummary.file == file,
#         PatientSummary.speaker == speaker
#     )
#     summary = (await db.execute(summary_stmt)).scalar_one_or_none()
    
#     if not summary:
#         raise HTTPException(status_code=404, detail="Summary not found")
    
#     # Get scoring
#     scoring_stmt = select(PatientSummaryScoring).where(
#         PatientSummaryScoring.file == file,
#         PatientSummaryScoring.speaker == speaker
#     )
#     scoring = (await db.execute(scoring_stmt)).scalar_one_or_none()
    
#     # Get responses
#     responses_stmt = select(PatientResponses).where(
#         PatientResponses.file == file,
#         PatientResponses.speaker == speaker
#     )
#     responses = (await db.execute(responses_stmt)).scalar_one_or_none()
    
#     return {
#         "file": file,
#         "speaker": speaker,
#         "summary": {
#             "entire_summary": summary.entire_summary,
#             "classes": [
#                 {
#                     "class_name": summary.class_1,
#                     "summary": summary.summary_class_1,
#                     "score": scoring.class_1_patient_scoring if scoring else None
#                 },
#                 {
#                     "class_name": summary.class_2,
#                     "summary": summary.summary_class_2,
#                     "score": scoring.class_2_patient_scoring if scoring else None
#                 },
#                 {
#                     "class_name": summary.class_3,
#                     "summary": summary.summary_class_3,
#                     "score": scoring.class_3_patient_scoring if scoring else None
#                 },
#                 {
#                     "class_name": summary.class_4,
#                     "summary": summary.summary_class_4,
#                     "score": scoring.class_4_patient_scoring if scoring else None
#                 },
#                 {
#                     "class_name": summary.class_5,
#                     "summary": summary.summary_class_5,
#                     "score": scoring.class_5_patient_scoring if scoring else None
#                 }
#             ]
#         },
#         "responses": {
#             "answer_1": responses.answer_1 if responses else None,
#             "answer_2": responses.answer_2 if responses else None,
#             "answer_3": responses.answer_3 if responses else None,
#             "answer_4": responses.answer_4 if responses else None,
#             "answer_5": responses.answer_5 if responses else None
#         } if responses else None
#     }

# @app.get("/api/patient/scoring")
# async def get_patient_scoring(
#     file: Optional[str] = None,
#     speaker: Optional[str] = None,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get patient scoring data"""
#     stmt = select(PatientSummaryScoring)
    
#     if file:
#         stmt = stmt.where(PatientSummaryScoring.file == file)
#     if speaker:
#         stmt = stmt.where(PatientSummaryScoring.speaker == speaker)
    
#     results = (await db.execute(stmt)).scalars().all()
    
#     return {
#         "total": len(results),
#         "data": [
#             {
#                 "file": r.file,
#                 "speaker": r.speaker,
#                 "scores": {
#                     "class_1": r.class_1_patient_scoring,
#                     "class_2": r.class_2_patient_scoring,
#                     "class_3": r.class_3_patient_scoring,
#                     "class_4": r.class_4_patient_scoring,
#                     "class_5": r.class_5_patient_scoring
#                 },
#                 "average": round(sum(filter(None, [
#                     r.class_1_patient_scoring,
#                     r.class_2_patient_scoring,
#                     r.class_3_patient_scoring,
#                     r.class_4_patient_scoring,
#                     r.class_5_patient_scoring
#                 ])) / len(list(filter(None, [
#                     r.class_1_patient_scoring,
#                     r.class_2_patient_scoring,
#                     r.class_3_patient_scoring,
#                     r.class_4_patient_scoring,
#                     r.class_5_patient_scoring
#                 ]))), 2) if any([
#                     r.class_1_patient_scoring,
#                     r.class_2_patient_scoring,
#                     r.class_3_patient_scoring,
#                     r.class_4_patient_scoring,
#                     r.class_5_patient_scoring
#                 ]) else None
#             }
#             for r in results
#         ]
#     }

# @app.put("/api/patient/scoring")
# async def update_patient_scoring(
#     update_data: PatientScoringUpdate,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Update or create patient scoring record"""
    
#     # Find existing record by file and speaker
#     stmt = select(PatientSummaryScoring).where(
#         (PatientSummaryScoring.file == update_data.file) &
#         (PatientSummaryScoring.speaker == update_data.speaker)
#     )
#     existing_record = (await db.execute(stmt)).scalars().first()
    
#     # If exists, update; if not, create new
#     if existing_record:
#         record = existing_record
#     else:
#         record = PatientSummaryScoring(
#             file=update_data.file,
#             speaker=update_data.speaker
#         )
    
#     # Update only provided fields
#     if update_data.class_1_patient_scoring is not None:
#         record.class_1_patient_scoring = update_data.class_1_patient_scoring
#     if update_data.class_2_patient_scoring is not None:
#         record.class_2_patient_scoring = update_data.class_2_patient_scoring
#     if update_data.class_3_patient_scoring is not None:
#         record.class_3_patient_scoring = update_data.class_3_patient_scoring
#     if update_data.class_4_patient_scoring is not None:
#         record.class_4_patient_scoring = update_data.class_4_patient_scoring
#     if update_data.class_5_patient_scoring is not None:
#         record.class_5_patient_scoring = update_data.class_5_patient_scoring
    
#     db.add(record)
#     await db.commit()
#     await db.refresh(record)
    
#     # Calculate average
#     scores = [
#         record.class_1_patient_scoring,
#         record.class_2_patient_scoring,
#         record.class_3_patient_scoring,
#         record.class_4_patient_scoring,
#         record.class_5_patient_scoring
#     ]
#     valid_scores = [s for s in scores if s is not None]
#     average = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else None
    
#     return {
#         "file": record.file,
#         "speaker": record.speaker,
#         "scores": {
#             "class_1": record.class_1_patient_scoring,
#             "class_2": record.class_2_patient_scoring,
#             "class_3": record.class_3_patient_scoring,
#             "class_4": record.class_4_patient_scoring,
#             "class_5": record.class_5_patient_scoring
#         },
#         "average": average
#     }

# @app.get("/api/patient/responses")
# async def get_patient_responses(
#     file: Optional[str] = None,
#     speaker: Optional[str] = None,
#     db: AsyncSession = Depends(get_db)
# ):
#     """Get patient question responses"""
#     stmt = select(PatientResponses)
    
#     if file:
#         stmt = stmt.where(PatientResponses.file == file)
#     if speaker:
#         stmt = stmt.where(PatientResponses.speaker == speaker)
    
#     results = (await db.execute(stmt)).scalars().all()
    
#     return {
#         "total": len(results),
#         "data": [
#             {
#                 "file": r.file,
#                 "speaker": r.speaker,
#                 "answers": {
#                     "answer_1": r.answer_1,
#                     "answer_2": r.answer_2,
#                     "answer_3": r.answer_3,
#                     "answer_4": r.answer_4,
#                     "answer_5": r.answer_5
#                 }
#             }
#             for r in results
#         ]
#     }

# @app.get("/api/patient/files")
# async def get_patient_files(db: AsyncSession = Depends(get_db)):
#     """Get list of unique files in patient interface"""
#     stmt = select(PatientSummary.file).distinct().order_by(PatientSummary.file)
#     files = (await db.execute(stmt)).scalars().all()
#     return {"files": files}

# # ──────────────────────────────────────────────────────────────────────────────
# # Dashboard/Stats APIs
# # ──────────────────────────────────────────────────────────────────────────────

# @app.get("/api/stats/dashboard")
# async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
#     """Get overall dashboard statistics"""
#     # Doctor stats
#     doctor_sentences_count = (await db.execute(
#         select(func.count()).select_from(DoctorSentenceView)
#     )).scalar_one()
    
#     doctor_rewrites_count = (await db.execute(
#         select(func.count()).select_from(DoctorRewriteLog)
#     )).scalar_one()
    
#     doctor_files_count = (await db.execute(
#         select(func.count(func.distinct(DoctorSentenceView.file)))
#     )).scalar_one()
    
#     # Patient stats
#     patient_summaries_count = (await db.execute(
#         select(func.count()).select_from(PatientSummary)
#     )).scalar_one()
    
#     patient_files_count = (await db.execute(
#         select(func.count(func.distinct(PatientSummary.file)))
#     )).scalar_one()
    
#     # Average patient scoring
#     avg_scores_stmt = select(
#         func.avg(PatientSummaryScoring.class_1_patient_scoring).label('avg_class_1'),
#         func.avg(PatientSummaryScoring.class_2_patient_scoring).label('avg_class_2'),
#         func.avg(PatientSummaryScoring.class_3_patient_scoring).label('avg_class_3'),
#         func.avg(PatientSummaryScoring.class_4_patient_scoring).label('avg_class_4'),
#         func.avg(PatientSummaryScoring.class_5_patient_scoring).label('avg_class_5')
#     )
#     avg_scores = (await db.execute(avg_scores_stmt)).one()
    
#     return {
#         "doctor_interface": {
#             "total_sentences": doctor_sentences_count,
#             "total_rewrites": doctor_rewrites_count,
#             "unique_files": doctor_files_count
#         },
#         "patient_interface": {
#             "total_summaries": patient_summaries_count,
#             "unique_files": patient_files_count,
#             "average_scores": {
#                 "class_1": round(avg_scores.avg_class_1, 2) if avg_scores.avg_class_1 else None,
#                 "class_2": round(avg_scores.avg_class_2, 2) if avg_scores.avg_class_2 else None,
#                 "class_3": round(avg_scores.avg_class_3, 2) if avg_scores.avg_class_3 else None,
#                 "class_4": round(avg_scores.avg_class_4, 2) if avg_scores.avg_class_4 else None,
#                 "class_5": round(avg_scores.avg_class_5, 2) if avg_scores.avg_class_5 else None
#             }
#         }
#     }

# # Entrypoint (dev only)
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(
#         app,
#         host=os.getenv("API_HOST", "0.0.0.0"),
#         port=int(os.getenv("API_PORT", "8000")),
#         reload=True
#     )




#!/usr/bin/env python3
"""
FastAPI Main Application - Prostate Cancer Doctor-Patient Conversation Archive API" (Async)
Provides API for doctor-patient consultation interface data
"""

from typing import List, Optional, Dict, Any
import logging
import os
import json

from fastapi import FastAPI, Depends, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from dotenv import load_dotenv

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

from auth import get_current_user
from auth.access_control import check_patient_access
from auth.base import AuthUser
from db import get_db, db_ready_ping
from models import (
    DoctorSentenceView,
    DoctorRewriteLog,
    PatientSummary,
    PatientSummaryScoring,
    PatientResponses,
)


from sqlalchemy import func, select, and_
from sqlalchemy.orm import aliased

load_dotenv()
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# FastAPI App & CORS
# ──────────────────────────────────────────────────────────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

app = FastAPI(
    title="Prostate Cancer Doctor-Patient Conversation Archive API",
    description="API for doctor-patient consultation interface data",
    version="1.0.0",
    docs_url="/docs" if ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if ENVIRONMENT == "development" else None,
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



from routes_surveys import router as surveys_router
from routes_nlp import router as nlp_router
from routes_transcript import router as transcript_router
from routes_tracking import router as tracking_router
from auth.admin_routes import router as auth_router
from redis_client import init_redis, close_redis, get_redis
from nlp_service import close_http_client, nlp_health_check, predict_single, CLASS_TO_MODEL, NLPServiceError

app.include_router(surveys_router)
app.include_router(nlp_router)
app.include_router(transcript_router)
app.include_router(tracking_router)
app.include_router(auth_router)

# ──────────────────────────────────────────────────────────────────────────────
# App lifecycle events (Redis + NLP HTTP client)
# ──────────────────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    redis = await init_redis()
    if redis:
        try:
            from fastapi_limiter import FastAPILimiter
            await FastAPILimiter.init(redis, prefix="prostate:rl")
        except Exception:
            pass  # rate-limiting disabled if init fails

@app.on_event("shutdown")
async def on_shutdown():
    await close_http_client()
    await close_redis()

# ──────────────────────────────────────────────────────────────────────────────
# Basic routes
# ──────────────────────────────────────────────────────────────────────────────
@app.get("/")
async def root(user: AuthUser = Depends(get_current_user)):
    return {
        "message": "Prostate Cancer Doctor-Patient Conversation Archive API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint - No API Key required. Checks DB, Redis, NLP."""
    components: Dict[str, str] = {}

    # DB check
    try:
        await db.execute(text("SELECT 1"))
        components["database"] = "healthy"
    except Exception:
        components["database"] = "unhealthy"

    # Redis check
    redis = get_redis()
    if redis is not None:
        try:
            await redis.ping()
            components["redis"] = "healthy"
        except Exception:
            components["redis"] = "unhealthy"
    else:
        components["redis"] = "disabled"

    # NLP check
    nlp_status = await nlp_health_check()
    components["nlp"] = nlp_status["status"]

    overall = "healthy" if components["database"] == "healthy" else "unhealthy"
    status_code = 200 if overall == "healthy" else 503
    if status_code == 503:
        raise HTTPException(status_code=503, detail={"status": overall, "components": components})
    return {"status": overall, "components": components}

@app.get("/ready")
async def ready():
    """Readiness check endpoint - No API Key required"""
    return {"ready": await db_ready_ping()}



# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface APIs
# ──────────────────────────────────────────────────────────────────────────────

class DoctorRewriteUpdateFull(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
   
    file: str
    i: int
    i2: int
    speaker: str
    time: Optional[datetime] = None
    original_sentence: str
    revised_sentence: str
    score: Optional[float] = None
    class_: str
    selected: bool


class PatientScoringUpdate(BaseModel):
    file: str
    speaker: str
    class_1_patient_scoring: Optional[float] = None
    class_2_patient_scoring: Optional[float] = None
    class_3_patient_scoring: Optional[float] = None
    class_4_patient_scoring: Optional[float] = None
    class_5_patient_scoring: Optional[float] = None

@app.get("/api/doctor/sentences/{file}/{speaker}")
async def get_doctor_sentences(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get doctor sentence view data for specific file and speaker where class != -1"""
    await check_patient_access(file, user, db)

    # Get speakers for the file
    all_speakers_stmt = select(DoctorSentenceView.speaker).distinct().where(
        DoctorSentenceView.file == file
    )
    all_speakers_raw = (await db.execute(all_speakers_stmt)).scalars().all()

    # Filter out None values to prevent TypeError
    all_speakers = [s for s in all_speakers_raw if s is not None]

    logger.debug("get_doctor_sentences: file=%s, speaker=%s, available_speakers=%d", file, speaker, len(all_speakers))

    # Execute actual query
    stmt = select(DoctorSentenceView).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.speaker == speaker,
        DoctorSentenceView.class_ != '-1'
    ).order_by(DoctorSentenceView.i, DoctorSentenceView.i2)
    
    results = (await db.execute(stmt)).scalars().all()
    logger.debug("get_doctor_sentences: found %d rows for file=%s, speaker=%s", len(results), file, speaker)

    if not results:
        raise HTTPException(
            status_code=404,
            detail="No data found for the specified file and speaker."
        )
    
    return {
        "file": file,
        "speaker": speaker,
        "total": len(results),
        "data": [
            {
                "i": r.i,
                "i2": r.i2,
                "sentence": r.sentence,
                "score": r.score,
                "class": r.class_,
                "time": r.time.isoformat() if r.time else None
            }
            for r in results
        ]
    }

@app.get("/api/doctor/rewrites")
async def get_doctor_rewrites(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    selected: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get doctor rewrite history with optional filters"""
    logger.debug("get_doctor_rewrites: file=%s, selected=%s, skip=%d, limit=%d", file, selected, skip, limit)

    stmt = select(DoctorRewriteLog)
    
    if file:
        stmt = stmt.where(DoctorRewriteLog.file == file)
    if speaker:
        stmt = stmt.where(DoctorRewriteLog.speaker == speaker)
    if selected is not None:
        stmt = stmt.where(DoctorRewriteLog.selected == selected)
    
    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()
    
    # Get paginated results
    stmt = stmt.order_by(DoctorRewriteLog.time.desc()).offset(skip).limit(limit)
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [
            {
                "file": r.file,
                "i": r.i,
                "i2": r.i2,
                "speaker": r.speaker,
                "time": r.time.isoformat() if r.time else None,
                "original_sentence": r.original_sentence,
                "revised_sentence": r.revised_sentence,
                "score": r.score,
                "class": r.class_,
                "selected": r.selected
            }
            for r in results
        ]
    }


@app.put("/api/doctor/rewrites")
async def update_doctor_rewrite(
    update_data: DoctorRewriteUpdateFull,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Insert new doctor rewrite log record with full data"""
    logger.debug("update_doctor_rewrite: file=%s, i=%d, i2=%d, class=%s", update_data.file, update_data.i, update_data.i2, update_data.class_)

    # Check if file exists in DoctorSentenceView
    file_exists_stmt = select(func.count()).select_from(DoctorSentenceView).where(
        DoctorSentenceView.file == update_data.file
    )
    file_exists = (await db.execute(file_exists_stmt)).scalar_one() > 0
    
    if not file_exists:
        raise HTTPException(
            status_code=404,
            detail="Specified file does not exist."
        )
    
    # Create new record in DoctorRewriteLog
    new_record = DoctorRewriteLog(
        file=update_data.file,
        i=update_data.i,
        i2=update_data.i2,
        speaker=update_data.speaker,
        time=update_data.time,
        original_sentence=update_data.original_sentence,
        revised_sentence=update_data.revised_sentence,
        score=update_data.score,
        class_=update_data.class_,
        selected=update_data.selected
    )
    
    db.add(new_record)
    await db.commit()
    await db.refresh(new_record)
    
    return {
        "file": new_record.file,
        "i": new_record.i,
        "i2": new_record.i2,
        "speaker": new_record.speaker,
        "time": new_record.time.isoformat() if new_record.time else None,
        "original_sentence": new_record.original_sentence,
        "revised_sentence": new_record.revised_sentence,
        "score": new_record.score,
        "class": new_record.class_,
        "selected": new_record.selected
    }

@app.get("/api/doctor/rewrites/{file}/{i}/{i2}/history")
async def get_doctor_rewrite_history(
    file: str,
    i: int,
    i2: int,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get revision history for a specific sentence (file, i, i2)
    
    Returns all revisions ordered by time (oldest to newest)
    Includes original_score from doctor_sentence_view
    """
    logger.debug("get_doctor_rewrite_history: file=%s, i=%d, i2=%d", file, i, i2)

    # Get all rewrites for this sentence, ordered by time ascending
    stmt = select(DoctorRewriteLog).where(
        DoctorRewriteLog.file == file,
        DoctorRewriteLog.i == i,
        DoctorRewriteLog.i2 == i2
    ).order_by(DoctorRewriteLog.time.asc())
    
    results = (await db.execute(stmt)).scalars().all()
    
    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"No rewrite history found for file='{file}', i={i}, i2={i2}"
        )
    
    # Get original sentence info from first record
    original_sentence = results[0].original_sentence
    speaker = results[0].speaker
    class_ = results[0].class_
    
    # ═══════════════════════════════════════════════════════════
    # NEW: Get original_score from doctor_sentence_view
    # ═══════════════════════════════════════════════════════════
    original_score = None
    try:
        # Query doctor_sentence_view to get the original score
        sentence_stmt = select(DoctorSentenceView).where(
            DoctorSentenceView.file == file,
            DoctorSentenceView.i == i,
            DoctorSentenceView.i2 == i2
        )
        sentence_result = (await db.execute(sentence_stmt)).scalars().first()
        
        if sentence_result:
            original_score = sentence_result.score
            print(f"   Original score from doctor_sentence_view: {original_score}")
        else:
            print(f"   ⚠️ No matching sentence found in doctor_sentence_view")
    except Exception as e:
        print(f"   ⚠️ Error fetching original score: {e}")
    
    print(f"   Found {len(results)} revisions")
    print("=" * 80)
    
    return {
        "file": file,
        "i": i,
        "i2": i2,
        "speaker": speaker,
        "class": class_,
        "original_sentence": original_sentence,
        "original_score": original_score,  
        "total_revisions": len(results),
        "history": [
            {
                "revision_number": idx + 1,
                "time": r.time.isoformat() if r.time else None,
                "revised_sentence": r.revised_sentence,
                "score": r.score,
                "class": r.class_,
                "selected": r.selected
            }
            for idx, r in enumerate(results)
        ]
    }


@app.get("/api/doctor/rewrites/{file}/{i}/{i2}/{class_}")
async def get_doctor_rewrite_by_key(
    file: str,
    i: int,
    i2: int,
    class_: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get specific doctor rewrite record by composite key (file, i, i2, class)"""
    
    stmt = select(DoctorRewriteLog).where(
        (DoctorRewriteLog.file == file) &
        (DoctorRewriteLog.i == i) &
        (DoctorRewriteLog.i2 == i2) &
        (DoctorRewriteLog.class_ == class_)
    )
    result = (await db.execute(stmt)).scalars().first()
    
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Record not found for file='{file}', i={i}, i2={i2}, class='{class_}'"
        )
    
    return {
        "file": result.file,
        "i": result.i,
        "i2": result.i2,
        "speaker": result.speaker,
        "time": result.time.isoformat() if result.time else None,
        "original_sentence": result.original_sentence,
        "revised_sentence": result.revised_sentence,
        "score": result.score,
        "class": result.class_,
        "selected": result.selected
    }

@app.get("/api/doctor/rewrites/stats")
async def get_doctor_rewrite_stats(
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get rewrite usage statistics per speaker/file for analytics.

    Returns total rewrite attempts, unique sentences rewritten, and per-file breakdown.
    Used to track physician engagement with the rewrite learning tool.
    """
    base_filter = []
    if speaker:
        base_filter.append(DoctorRewriteLog.speaker == speaker)

    # Total rewrite count
    total_stmt = select(func.count()).select_from(DoctorRewriteLog)
    for f in base_filter:
        total_stmt = total_stmt.where(f)
    total_rewrites = (await db.execute(total_stmt)).scalar() or 0

    # Unique sentences rewritten
    unique_stmt = select(
        func.count(func.distinct(
            func.concat(DoctorRewriteLog.file, ':', DoctorRewriteLog.i, ':', DoctorRewriteLog.i2)
        ))
    ).select_from(DoctorRewriteLog)
    for f in base_filter:
        unique_stmt = unique_stmt.where(f)
    unique_sentences = (await db.execute(unique_stmt)).scalar() or 0

    # Per-file breakdown
    file_stmt = select(
        DoctorRewriteLog.file,
        func.count().label('rewrite_count'),
        func.count(func.distinct(
            func.concat(DoctorRewriteLog.i, ':', DoctorRewriteLog.i2)
        )).label('unique_sentences'),
        func.min(DoctorRewriteLog.time).label('first_rewrite'),
        func.max(DoctorRewriteLog.time).label('last_rewrite'),
    ).group_by(DoctorRewriteLog.file)
    for f in base_filter:
        file_stmt = file_stmt.where(f)
    file_stmt = file_stmt.order_by(func.count().desc())

    file_results = (await db.execute(file_stmt)).all()

    return {
        "total_rewrites": total_rewrites,
        "unique_sentences_rewritten": unique_sentences,
        "per_file": [
            {
                "file": r.file,
                "rewrite_count": r.rewrite_count,
                "unique_sentences": r.unique_sentences,
                "first_rewrite": r.first_rewrite.isoformat() if r.first_rewrite else None,
                "last_rewrite": r.last_rewrite.isoformat() if r.last_rewrite else None,
            }
            for r in file_results
        ],
    }


@app.get("/api/doctor/files")
async def get_doctor_files(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get list of unique files in doctor interface"""
    print("=" * 80)
    print("🔍 DEBUG [get_doctor_files] - Querying distinct files")
    
    stmt = select(DoctorSentenceView.file).distinct().order_by(DoctorSentenceView.file)
    files_raw = (await db.execute(stmt)).scalars().all()
    
    # Filter out None values
    files = [f for f in files_raw if f is not None]
    none_count = len(files_raw) - len(files)
    
    print(f"   Found {len(files)} files ({none_count} NULL values filtered)")
    for idx, f in enumerate(files[:5]):
        print(f"   [{idx}] {f}")
    if len(files) > 5:
        print(f"   ... and {len(files) - 5} more")
    print("=" * 80)
    
    return {"files": files}




# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Score Average APIs (with Rewrite Log Priority)
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/doctor/scores/average")
async def get_doctor_score_average(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    class_: Optional[str] = Query(None, alias="class"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get average score grouped by file, speaker, class

    Uses ONLY original NLP scores from doctor_sentence_view.
    Rewrite scores (doctor_rewrite_log) are NOT used here — rewrites are
    purely a training/practice tool and do not affect score analysis.

    Filter options:
    - No filters: Average for all file/speaker/class combinations
    - file only: Average by speaker/class for the specified file
    - file + speaker: Average by class for the specified file and speaker
    - file + speaker + class: Single average value for the specific combination
    """
    print("=" * 80)
    print("DEBUG [get_doctor_score_average] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    print(f"   class: {class_}")

    # ⚠️ WARNING — TEMPORARY SCORING APPROACH (NOT PRODUCTION-READY)
    # Currently this endpoint returns the score of the LAST sentence (highest i, then i2)
    # per file/speaker/class group. This is a simplified placeholder used during development.
    # For production, this must be replaced with a proper scoring algorithm that aggregates
    # across all relevant sentences (e.g., weighted average, rubric-based composite, or
    # domain-specific scoring logic). The last-sentence score does NOT accurately represent
    # overall communication quality for a given domain.
    #
    # Step 2: Get the LAST sentence score (highest i, then i2) per file/speaker/class
    # Subquery to find the max (i, i2) per group
    last_sentence_subq = (
        select(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_,
            func.max(DoctorSentenceView.i).label('max_i')
        )
        .where(
            DoctorSentenceView.class_ != '-1',
            DoctorSentenceView.score.isnot(None)
        )
        .group_by(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_
        )
    ).subquery('last_sent')

    # Get the actual last sentence row (max i, then max i2 within that i)
    last_i2_subq = (
        select(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_,
            DoctorSentenceView.i,
            func.max(DoctorSentenceView.i2).label('max_i2')
        )
        .join(
            last_sentence_subq,
            and_(
                DoctorSentenceView.file == last_sentence_subq.c.file,
                DoctorSentenceView.speaker == last_sentence_subq.c.speaker,
                DoctorSentenceView.class_ == last_sentence_subq.c.class_,
                DoctorSentenceView.i == last_sentence_subq.c.max_i,
            )
        )
        .where(
            DoctorSentenceView.class_ != '-1',
            DoctorSentenceView.score.isnot(None)
        )
        .group_by(
            DoctorSentenceView.file,
            DoctorSentenceView.speaker,
            DoctorSentenceView.class_,
            DoctorSentenceView.i
        )
    ).subquery('last_i2')

    # Final query: join back to get the score of the last sentence
    stmt = select(
        DoctorSentenceView.file,
        DoctorSentenceView.speaker,
        DoctorSentenceView.class_,
        DoctorSentenceView.score.label('avg_score'),  # Named avg_score for frontend compatibility
        DoctorSentenceView.i,
        DoctorSentenceView.i2,
    ).join(
        last_i2_subq,
        and_(
            DoctorSentenceView.file == last_i2_subq.c.file,
            DoctorSentenceView.speaker == last_i2_subq.c.speaker,
            DoctorSentenceView.class_ == last_i2_subq.c.class_,
            DoctorSentenceView.i == last_i2_subq.c.i,
            DoctorSentenceView.i2 == last_i2_subq.c.max_i2,
        )
    ).where(
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None)
    )

    # Apply filters
    if file:
        stmt = stmt.where(DoctorSentenceView.file == file)
    if speaker:
        stmt = stmt.where(DoctorSentenceView.speaker == speaker)
    if class_:
        stmt = stmt.where(DoctorSentenceView.class_ == class_)

    stmt = stmt.order_by(
        DoctorSentenceView.file,
        DoctorSentenceView.speaker,
        DoctorSentenceView.class_
    )

    results = (await db.execute(stmt)).all()

    print(f"   Found {len(results)} groups")
    print("=" * 80)

    return {
        "total_groups": len(results),
        "filters": {
            "file": file,
            "speaker": speaker,
            "class": class_
        },
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "class": r.class_,
                "avg_score": round(r.avg_score, 2) if r.avg_score else None,
                "count": 1,
                "rewritten_count": 0,
                "original_count": 1,
                "min_score": r.avg_score,
                "max_score": r.avg_score
            }
            for r in results
        ]
    }


@app.get("/api/doctor/scores/summary/{file}/{speaker}")
async def get_doctor_score_summary_by_file_speaker(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get score summary for specific file and speaker (all classes)

    Uses ONLY original NLP scores from doctor_sentence_view.
    Rewrite scores (doctor_rewrite_log) are NOT used here — rewrites are
    purely a training/practice tool and do not affect score analysis.

    Returns:
    - Average, count, min/max for each class
    - Overall average across all classes
    """
    print("=" * 80)
    print("DEBUG [get_doctor_score_summary] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    # Statistics by class — original NLP scores only
    class_stats_stmt = select(
        DoctorSentenceView.class_,
        func.avg(DoctorSentenceView.score).label('avg_score'),
        func.count(DoctorSentenceView.score).label('count'),
        func.min(DoctorSentenceView.score).label('min_score'),
        func.max(DoctorSentenceView.score).label('max_score'),
    ).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.speaker == speaker,
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None)
    ).group_by(
        DoctorSentenceView.class_
    ).order_by(
        DoctorSentenceView.class_
    )

    class_results = (await db.execute(class_stats_stmt)).all()

    # Overall statistics — original NLP scores only
    overall_stmt = select(
        func.avg(DoctorSentenceView.score).label('avg_score'),
        func.count(DoctorSentenceView.score).label('count'),
        func.min(DoctorSentenceView.score).label('min_score'),
        func.max(DoctorSentenceView.score).label('max_score'),
    ).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.speaker == speaker,
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None)
    )

    overall = (await db.execute(overall_stmt)).one()

    print(f"   Found {len(class_results)} classes")
    print(f"   Total sentences: {overall.count}")
    print("=" * 80)

    return {
        "file": file,
        "speaker": speaker,
        "overall": {
            "avg_score": round(overall.avg_score, 2) if overall.avg_score else None,
            "count": overall.count,
            "min_score": overall.min_score,
            "max_score": overall.max_score
        },
        "by_class": [
            {
                "class": r.class_,
                "avg_score": round(r.avg_score, 2) if r.avg_score else None,
                "count": r.count,
                "min_score": r.min_score,
                "max_score": r.max_score
            }
            for r in class_results
        ]
    }


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Score Trajectory API (B-2 feedback)
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/doctor/scores/trajectory")
async def get_doctor_score_trajectory(
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get cumulative score trajectory over time (B-2 feedback).

    Uses ONLY original NLP scores from doctor_sentence_view.
    Rewrite scores (doctor_rewrite_log) are NOT used here — rewrites are
    purely a training/practice tool and do not affect score analysis.

    Each data point = a consultation event.
    Y-value = cumulative average of all patients seen so far,
              where each patient contributes 5 category averages,
              and the overall = average of 5 category averages.
    """
    logger.info("[trajectory] speaker=%s", speaker)

    # ── Step 1: Get all original sentences ──
    sent_stmt = select(
        DoctorSentenceView.file,
        DoctorSentenceView.i,
        DoctorSentenceView.i2,
        DoctorSentenceView.class_,
        DoctorSentenceView.score,
    ).where(
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None),
    )
    if speaker:
        sent_stmt = sent_stmt.where(DoctorSentenceView.speaker == speaker)

    sent_results = (await db.execute(sent_stmt)).all()

    # Build: file_sentences[file][class][(i,i2)] = original_score
    file_sentences: Dict[str, Dict[str, Dict[tuple, float]]] = {}
    for r in sent_results:
        file_sentences.setdefault(r.file, {}).setdefault(r.class_, {})[(r.i, r.i2)] = r.score

    # ── Step 2: Get consultation dates per file ──
    consult_stmt = select(
        DoctorSentenceView.file,
        func.min(DoctorSentenceView.time).label('consultation_date'),
    ).where(
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None),
    )
    if speaker:
        consult_stmt = consult_stmt.where(DoctorSentenceView.speaker == speaker)
    consult_stmt = consult_stmt.group_by(DoctorSentenceView.file)

    consult_results = (await db.execute(consult_stmt)).all()

    # ── Step 3: Build consultation timeline (sorted by date) ──
    events = []
    for r in consult_results:
        events.append({
            "time": r.consultation_date,
            "file": r.file,
        })
    events.sort(key=lambda x: x["time"])

    # ── Step 4: Process timeline → cumulative trajectory ──
    consulted_files: list = []
    trajectory = []

    for event in events:
        file = event["file"]
        consulted_files.append(file)

        # For each category, average across all consulted patients
        class_avgs: Dict[str, float] = {}
        patient_class_scores: Dict[str, Dict[str, float]] = {}
        for cls in ["1", "2", "3", "4", "5"]:
            patient_scores = []
            for f in consulted_files:
                if f in file_sentences and cls in file_sentences[f]:
                    scores = list(file_sentences[f][cls].values())
                    if scores:
                        avg = sum(scores) / len(scores)
                        patient_scores.append(avg)
                        patient_class_scores.setdefault(f, {})[cls] = avg
            if patient_scores:
                class_avgs[cls] = sum(patient_scores) / len(patient_scores)

        # Compute per-patient overall score (avg of their category avgs)
        patients_detail = []
        for f in consulted_files:
            if f in patient_class_scores and patient_class_scores[f]:
                p_avgs = patient_class_scores[f]
                p_overall = sum(p_avgs.values()) / len(p_avgs)
                patients_detail.append({
                    "file": f,
                    "overall_score": round(p_overall, 4),
                })

        # Overall = average of category averages
        overall = sum(class_avgs.values()) / len(class_avgs) if class_avgs else None

        trajectory.append({
            "timestamp": event["time"].isoformat(),
            "event_type": "consultation",
            "file": event["file"],
            "overall_score": round(overall, 4) if overall is not None else None,
            "by_class": {k: round(v, 4) for k, v in class_avgs.items()},
            "patients_count": len(consulted_files),
            "patients_detail": patients_detail,
        })

    logger.info("[trajectory] Returning %d events", len(trajectory))

    return {
        "total_events": len(trajectory),
        "speaker_filter": speaker,
        "trajectory": trajectory,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Sentence Scoring API
# ──────────────────────────────────────────────────────────────────────────────

class SentenceScoringRequest(BaseModel):
    sentence: str
    class_: Optional[str] = None

class SentenceScoringResponse(BaseModel):
    score: float
    sentence: str

@app.post("/api/doctor/score-sentence", response_model=SentenceScoringResponse)
async def score_sentence(
    request_data: SentenceScoringRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Score a sentence.

    Placeholder: always returns 5 until the communication quality
    scoring pipeline (Steps 6-9) is implemented.
    """
    return SentenceScoringResponse(
        score=5,
        sentence=request_data.sentence
    )

# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Class Distribution API
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/doctor/class-distribution")
async def get_doctor_class_distribution(
    file: Optional[str] = None,
    include_invalid: bool = Query(False, description="Include class=-1 (invalid) in results"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get class distribution per file in doctor_sentence_view
    
    Returns count of each class (1~5) for each file
    
    Parameters:
    - file: Optional filter for specific file
    - include_invalid: If True, include class=-1 in results (default: False)
    """
    print("=" * 80)
    print("DEBUG [get_doctor_class_distribution] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   include_invalid: {include_invalid}")
    
    # Base query
    stmt = select(
        DoctorSentenceView.file,
        DoctorSentenceView.class_,
        func.count().label('count')
    )
    
    # Exclude invalid class unless requested
    if not include_invalid:
        stmt = stmt.where(DoctorSentenceView.class_ != '-1')
    
    # Apply file filter if provided
    if file:
        stmt = stmt.where(DoctorSentenceView.file == file)
    
    # Group by file and class
    stmt = stmt.group_by(
        DoctorSentenceView.file,
        DoctorSentenceView.class_
    ).order_by(
        DoctorSentenceView.file,
        DoctorSentenceView.class_
    )
    
    results = (await db.execute(stmt)).all()
    
    # Organize results by file
    distribution = {}
    for r in results:
        if r.file not in distribution:
            distribution[r.file] = {
                "file": r.file,
                "classes": {},
                "total": 0
            }
        distribution[r.file]["classes"][r.class_] = r.count
        distribution[r.file]["total"] += r.count
    
    # Convert to list format
    data = list(distribution.values())
    
    print(f"   Found {len(data)} files")
    print("=" * 80)
    
    return {
        "total_files": len(data),
        "filters": {
            "file": file,
            "include_invalid": include_invalid
        },
        "data": data
    }


@app.get("/api/doctor/class-distribution/{file}")
async def get_doctor_class_distribution_by_file(
    file: str,
    include_invalid: bool = Query(False, description="Include class=-1 (invalid) in results"),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get detailed class distribution for a specific file
    
    Returns:
    - Count of each class
    - Percentage of each class
    - List of sentences per class (optional summary)
    """
    print("=" * 80)
    print("DEBUG [get_doctor_class_distribution_by_file] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   include_invalid: {include_invalid}")
    
    # Base query
    stmt = select(
        DoctorSentenceView.class_,
        func.count().label('count')
    ).where(
        DoctorSentenceView.file == file
    )
    
    # Exclude invalid class unless requested
    if not include_invalid:
        stmt = stmt.where(DoctorSentenceView.class_ != '-1')
    
    # Group by class
    stmt = stmt.group_by(
        DoctorSentenceView.class_
    ).order_by(
        DoctorSentenceView.class_
    )
    
    results = (await db.execute(stmt)).all()
    
    if not results:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for file: {file}"
        )
    
    # Calculate total and percentages
    total = sum(r.count for r in results)
    
    class_distribution = [
        {
            "class": r.class_,
            "count": r.count,
            "percentage": round((r.count / total) * 100, 2) if total > 0 else 0
        }
        for r in results
    ]
    
    print(f"   Found {len(class_distribution)} classes, total {total} sentences")
    print("=" * 80)
    
    return {
        "file": file,
        "total_sentences": total,
        "include_invalid": include_invalid,
        "distribution": class_distribution
    }

# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - AI Rewrite API
# Azure OpenAI Integration for sentence improvement
# ──────────────────────────────────────────────────────────────────────────────

from typing import Optional, Dict
from pydantic import BaseModel
from fastapi import Depends, HTTPException

# ═══════════════════════════════════════════════════════════
# Azure OpenAI Configuration (uncomment when ready to use)
# ═══════════════════════════════════════════════════════════
# import os
# from openai import AzureOpenAI
# 
# azure_client = AzureOpenAI(
#     api_key=os.getenv("AZURE_OPENAI_API_KEY"),
#     api_version="2024-02-15-preview",
#     azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT")
# )
# 
# AZURE_DEPLOYMENT_NAME = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")


# ═══════════════════════════════════════════════════════════
# Constants - Class Names and Improvement Suggestions
# ═══════════════════════════════════════════════════════════
CLASS_NAMES: Dict[str, str] = {
    "1": "Cancer Prognosis",
    "2": "Life Expectancy",
    "3": "Erectile Dysfunction",
    "4": "Urinary Incontinence",
    "5": "Irritative Symptoms",
}

IMPROVEMENT_SUGGESTIONS: Dict[str, Dict[int, str]] = {
    "1": {  # Cancer Prognosis
        1: "Discuss potential for risk of cancer death, metastasis, or progression",
        2: 'Provide a generalization of magnitude of risk ("high"/"low")',
        3: "Provide a quantified estimate of risk",
        4: "Provide a quantified estimate of risk both with treatment and without treatment at an arbitrary timepoint",
        5: "Provide a quantified estimates of risk both with and without treatment at the patient's life expectancy",
    },
    "2": {  # Life Expectancy
        1: "Discuss the concept of competing risks of mortality",
        2: 'Provide a generalization of duration of life expectancy (i.e., "long"/"short")',
        3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
        4: "Provide a probability of living to an arbitrary timepoint",
        5: "Provide a specific number of years and mention calculation based on the patient's age and health status",
    },
    "3": {  # Erectile Dysfunction
        1: "Discuss the potential risk of erectile dysfunction",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of ED without a time horizon (e.g., "45% risk of erectile dysfunction")',
        4: 'Provide an average probability of ED with a time horizon (e.g., "45% risk of erectile dysfunction at 1 year postop")',
        5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "4": {  # Urinary Incontinence
        1: "Discuss the potential risk of urinary incontinence",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of UI without a time horizon (e.g., "10% risk of needing pads")',
        4: 'Provide an average probability of UI with a time horizon (e.g., "10% risk of needing pads beyond 1 year postop")',
        5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "5": {  # Irritative Symptoms
        1: "Discuss the potential risk of irritative urinary symptoms",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of LUTS without a time horizon (e.g., "30% risk of developing irritative urinary symptoms")',
        4: 'Provide an average probability of LUTS with a time horizon (e.g., "30% risk of developing irritative urinary symptoms that may or may not resolve over the following year")',
        5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
}


# ═══════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════
class AIRewriteRequest(BaseModel):
    """Request model for AI Rewrite"""
    sentence: str
    class_: str
    target_score: Optional[int] = None
    context: Optional[str] = None


class AIRewriteResponse(BaseModel):
    """Response model for AI Rewrite"""
    original_sentence: str
    rewritten_sentence: str
    original_score: Optional[float] = None
    new_score: float
    class_: str
    improvement_applied: str


# ═══════════════════════════════════════════════════════════
# AI Rewrite Endpoint
# ═══════════════════════════════════════════════════════════
@app.post("/api/doctor/ai-rewrite", response_model=AIRewriteResponse)
async def generate_ai_rewrite(
    request_data: AIRewriteRequest,
    user: AuthUser = Depends(get_current_user)
):
    """
    Generate AI-powered rewrite of a sentence to improve communication quality.
    
    Parameters:
    - sentence: Original sentence to rewrite
    - class_: Topic class (1-5)
    - target_score: Optional target score to aim for (1-5), defaults to 5
    - context: Optional full context for better rewriting
    
    Returns:
    - original_sentence: The input sentence
    - rewritten_sentence: AI-generated improved sentence
    - original_score: Score of original sentence (if available)
    - new_score: Expected score of rewritten sentence
    - class_: Topic class
    - improvement_applied: Description of improvements made
    """
    print("=" * 80)
    print("AI REWRITE [generate_ai_rewrite] - Input:")
    print(f"   sentence: {request_data.sentence[:100]}...")
    print(f"   class_: {request_data.class_}")
    print(f"   target_score: {request_data.target_score}")
    print(f"   context provided: {bool(request_data.context)}")
    
    # Validate class
    if request_data.class_ not in IMPROVEMENT_SUGGESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid class. Must be one of: {list(IMPROVEMENT_SUGGESTIONS.keys())}"
        )
    
    # ═══════════════════════════════════════════════════════════
    # 1. Get improvement suggestion for target_score
    # ═══════════════════════════════════════════════════════════
    target_score = request_data.target_score if request_data.target_score else 5
    class_name = CLASS_NAMES.get(request_data.class_, "Unknown")
    
    # Get the suggestion for the target score
    improvement_suggestion = IMPROVEMENT_SUGGESTIONS[request_data.class_].get(
        target_score,
        IMPROVEMENT_SUGGESTIONS[request_data.class_].get(5, "")
    )
    
    # Get all suggestions for scores above current (for context)
    all_higher_suggestions = []
    for score in range(1, target_score + 1):
        if score in IMPROVEMENT_SUGGESTIONS[request_data.class_]:
            all_higher_suggestions.append(
                f"Score {score}: {IMPROVEMENT_SUGGESTIONS[request_data.class_][score]}"
            )
    
    print(f"   class_name: {class_name}")
    print(f"   target_score: {target_score}")
    print(f"   improvement_suggestion: {improvement_suggestion[:80]}...")
    
    # ═══════════════════════════════════════════════════════════
    # 2. Build LLM Prompt
    # ═══════════════════════════════════════════════════════════
    system_prompt = f"""You are a medical communication expert helping physicians improve their patient consultations about prostate cancer treatment.

Your task is to rewrite sentences to achieve better communication quality scores on a 1-5 scale.

Topic: {class_name}

Scoring criteria for this topic:
{chr(10).join(all_higher_suggestions)}

Guidelines:
- Maintain medical accuracy
- Use patient-friendly language
- Be specific and quantitative when appropriate
- Include relevant timeframes when discussing risks
- Consider patient-specific factors when applicable
"""

    user_prompt = f"""Please rewrite the following sentence to achieve a score of {target_score}.

Original sentence: "{request_data.sentence}"

Target score: {target_score}
Target criteria: {improvement_suggestion}

{f'Additional context: {request_data.context}' if request_data.context else ''}

Provide only the rewritten sentence without any explanation or additional text."""

    print("   LLM Prompt constructed successfully")
    print(f"   System prompt length: {len(system_prompt)} chars")
    print(f"   User prompt length: {len(user_prompt)} chars")
    
    # ═══════════════════════════════════════════════════════════
    # 3. Call Azure OpenAI API (COMMENTED OUT)
    # Uncomment when ready to integrate with actual LLM
    # ═══════════════════════════════════════════════════════════
    # try:
    #     response = azure_client.chat.completions.create(
    #         model=AZURE_DEPLOYMENT_NAME,
    #         messages=[
    #             {"role": "system", "content": system_prompt},
    #             {"role": "user", "content": user_prompt}
    #         ],
    #         temperature=0.7,
    #         max_tokens=500
    #     )
    #     
    #     rewritten_sentence = response.choices[0].message.content.strip()
    #     
    #     # Remove quotes if the model wrapped the response in quotes
    #     if rewritten_sentence.startswith('"') and rewritten_sentence.endswith('"'):
    #         rewritten_sentence = rewritten_sentence[1:-1]
    #     
    #     print(f"   Azure OpenAI response received")
    #     print(f"   rewritten_sentence: {rewritten_sentence[:100]}...")
    #     
    # except Exception as e:
    #     print(f"   ERROR calling Azure OpenAI: {str(e)}")
    #     raise HTTPException(
    #         status_code=500,
    #         detail=f"Failed to generate AI rewrite: {str(e)}"
    #     )
    
    # ═══════════════════════════════════════════════════════════
    # 4. Placeholder Response (remove when LLM is integrated)
    # ═══════════════════════════════════════════════════════════
    rewritten_sentence = "rewritten sentence"
    new_score = float(target_score)
    
    print(f"   [PLACEHOLDER] Returning placeholder response")
    print(f"   rewritten_sentence: {rewritten_sentence}")
    print(f"   new_score: {new_score}")
    print("=" * 80)
    
    return AIRewriteResponse(
        original_sentence=request_data.sentence,
        rewritten_sentence=rewritten_sentence,
        original_score=None,
        new_score=new_score,
        class_=request_data.class_,
        improvement_applied=improvement_suggestion
    )


# ──────────────────────────────────────────────────────────────────────────────
# Doctor Interface - Improvement Suggestions API
# Based on PDF pages 12-16 (exact wording)
# ──────────────────────────────────────────────────────────────────────────────

class ImprovementSuggestionItem(BaseModel):
    """Single improvement suggestion"""
    target_score: int
    suggestion: str

class ImprovementSuggestionsRequest(BaseModel):
    """Request model for improvement suggestions"""
    class_: str  # "1" | "2" | "3" | "4" | "5"
    current_score: Optional[float] = None  # If provided, filter suggestions above this score

class ImprovementSuggestionsResponse(BaseModel):
    """Response model for improvement suggestions"""
    class_: str
    class_name: str
    current_score: Optional[float]
    suggestions: List[ImprovementSuggestionItem]
    all_levels: Dict[int, str]  # All score level descriptions for reference

# ═══════════════════════════════════════════════════════════
# Improvement Suggestions Data (from PDF pages 12-16)
# ═══════════════════════════════════════════════════════════
IMPROVEMENT_SUGGESTIONS: Dict[str, Dict[int, str]] = {
    "1": {  # Cancer Prognosis (Page 12)
        1: "Discuss potential for risk of cancer death, metastasis, or progression",
        2: 'Provide a generalization of magnitude of risk ("high"/"low")',
        3: "Provide a quantified estimate of risk",
        4: "Provide a quantified estimate of risk both with treatment and without treatment at an arbitrary timepoint",
        5: "Provide a quantified estimates of risk both with and without treatment at the patient's life expectancy",
    },
    "2": {  # Life Expectancy (Page 13)
        1: "Discuss the concept of competing risks of mortality",
        2: 'Provide a generalization of duration of life expectancy (i.e., "long"/"short")',
        3: 'Provide a rough quantified estimate of life expectancy (e.g., "about 15-20 years")',
        4: "Provide a probability of living to an arbitrary timepoint",
        5: "Provide a specific number of years and mention calculation based on the patient's age and health status",
    },
    "3": {  # Erectile Dysfunction (Page 14)
        1: "Discuss the potential risk of erectile dysfunction",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of ED without a time horizon (e.g., "45% risk of erectile dysfunction")',
        4: 'Provide an average probability of ED with a time horizon (e.g., "45% risk of erectile dysfunction at 1 year postop")',
        5: "Provide a patient-specific probability of ED with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "4": {  # Urinary Incontinence (Page 15)
        1: "Discuss the potential risk of urinary incontinence",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of UI without a time horizon (e.g., "10% risk of needing pads")',
        4: 'Provide an average probability of UI with a time horizon (e.g., "10% risk of needing pads beyond 1 year postop")',
        5: "Provide a patient-specific probability of UI with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
    "5": {  # Irritative Symptoms (Page 16)
        1: "Discuss the potential risk of irritative urinary symptoms",
        2: 'Provide a generalization of risk (i.e., "high"/"low")',
        3: 'Provide an average probability of LUTS without a time horizon (e.g., "30% risk of developing irritative urinary symptoms")',
        4: 'Provide an average probability of LUTS with a time horizon (e.g., "30% risk of developing irritative urinary symptoms that may or may not resolve over the following year")',
        5: "Provide a patient-specific probability of LUTS with a time horizon, mentioning patient-specific factors such as age and baseline function that inform your estimate",
    },
}

CLASS_NAMES: Dict[str, str] = {
    "1": "Cancer Prognosis",
    "2": "Life Expectancy",
    "3": "Erectile Dysfunction",
    "4": "Urinary Incontinence",
    "5": "Irritative Symptoms",
}


@app.get("/api/doctor/improvement-suggestions/{class_}")
async def get_improvement_suggestions_by_class(
    class_: str,
    current_score: Optional[float] = Query(None, description="Current score to filter suggestions above this level"),
    user: AuthUser = Depends(get_current_user)
):
    """
    Get improvement suggestions for a specific class (topic).
    
    Parameters:
    - class_: Topic class ("1" to "5")
    - current_score: Optional current score. If provided, returns only suggestions for scores above this level.
    
    Returns:
    - class_: The requested class
    - class_name: Human-readable class name
    - current_score: The provided current score (if any)
    - suggestions: List of applicable improvement suggestions
    - all_levels: All score level descriptions for reference
    """
    print("=" * 80)
    print("📋 DEBUG [get_improvement_suggestions] - Input:")
    print(f"   class_: {class_}")
    print(f"   current_score: {current_score}")
    
    # Validate class
    if class_ not in IMPROVEMENT_SUGGESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid class. Must be one of: {list(IMPROVEMENT_SUGGESTIONS.keys())}"
        )
    
    class_name = CLASS_NAMES.get(class_, "Unknown")
    all_levels = IMPROVEMENT_SUGGESTIONS[class_]
    
    # Build suggestions list
    suggestions = []
    
    if current_score is not None:
        # Filter: only suggestions for scores above current_score
        score_floor = int(current_score)
        for score in range(score_floor + 1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))
    else:
        # Return all suggestions (scores 1-5)
        for score in range(1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))
    
    print(f"   class_name: {class_name}")
    print(f"   suggestions count: {len(suggestions)}")
    print("=" * 80)
    
    return ImprovementSuggestionsResponse(
        class_=class_,
        class_name=class_name,
        current_score=current_score,
        suggestions=suggestions,
        all_levels=all_levels
    )


@app.post("/api/doctor/improvement-suggestions")
async def get_improvement_suggestions(
    request_data: ImprovementSuggestionsRequest,
    user: AuthUser = Depends(get_current_user)
):
    """
    Get improvement suggestions for a specific class (POST version).
    
    Request body:
    - class_: Topic class ("1" to "5")
    - current_score: Optional current score. If provided, returns only suggestions for scores above this level.
    
    Returns same as GET version.
    """
    print("=" * 80)
    print("📋 DEBUG [get_improvement_suggestions POST] - Input:")
    print(f"   class_: {request_data.class_}")
    print(f"   current_score: {request_data.current_score}")
    
    # Validate class
    if request_data.class_ not in IMPROVEMENT_SUGGESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid class. Must be one of: {list(IMPROVEMENT_SUGGESTIONS.keys())}"
        )
    
    class_name = CLASS_NAMES.get(request_data.class_, "Unknown")
    all_levels = IMPROVEMENT_SUGGESTIONS[request_data.class_]
    
    # Build suggestions list
    suggestions = []
    
    if request_data.current_score is not None:
        # Filter: only suggestions for scores above current_score
        score_floor = int(request_data.current_score)
        for score in range(score_floor + 1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))
    else:
        # Return all suggestions (scores 1-5)
        for score in range(1, 6):
            if score in all_levels:
                suggestions.append(ImprovementSuggestionItem(
                    target_score=score,
                    suggestion=all_levels[score]
                ))
    
    print(f"   class_name: {class_name}")
    print(f"   suggestions count: {len(suggestions)}")
    print("=" * 80)
    
    return ImprovementSuggestionsResponse(
        class_=request_data.class_,
        class_name=class_name,
        current_score=request_data.current_score,
        suggestions=suggestions,
        all_levels=all_levels
    )


@app.get("/api/doctor/improvement-suggestions")
async def get_all_improvement_suggestions(
    user: AuthUser = Depends(get_current_user)
):
    """
    Get all improvement suggestions for all classes.
    
    Returns a dictionary of all classes with their suggestions.
    """
    print("=" * 80)
    print("📋 DEBUG [get_all_improvement_suggestions]")
    print("=" * 80)
    
    result = {}
    
    for class_ in IMPROVEMENT_SUGGESTIONS:
        result[class_] = {
            "class_name": CLASS_NAMES.get(class_, "Unknown"),
            "suggestions": IMPROVEMENT_SUGGESTIONS[class_]
        }
    
    return {
        "total_classes": len(result),
        "data": result
    }


# ──────────────────────────────────────────────────────────────────────────────
# Patient Interface APIs
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/patient/summaries")
async def get_patient_summaries(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient summaries with optional filters"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_summaries] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    print(f"   skip: {skip}, limit: {limit}")
    
    stmt = select(PatientSummary)
    
    if file:
        stmt = stmt.where(PatientSummary.file == file)
    if speaker:
        stmt = stmt.where(PatientSummary.speaker == speaker)
    
    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()
    
    # Get paginated results
    stmt = stmt.offset(skip).limit(limit)
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "entire_summary": r.entire_summary,
                "classes": [
                    {
                        "class_name": r.class_1,
                        "summary": r.summary_class_1
                    },
                    {
                        "class_name": r.class_2,
                        "summary": r.summary_class_2
                    },
                    {
                        "class_name": r.class_3,
                        "summary": r.summary_class_3
                    },
                    {
                        "class_name": r.class_4,
                        "summary": r.summary_class_4
                    },
                    {
                        "class_name": r.class_5,
                        "summary": r.summary_class_5
                    }
                ]
            }
            for r in results
        ]
    }

@app.get("/api/patient/summaries/{file}/{speaker}")
async def get_patient_summary_detail(
    file: str,
    speaker: str,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get detailed patient summary for specific file and speaker"""
    await check_patient_access(file, user, db)
    print("=" * 80)
    print("🔍 DEBUG [get_patient_summary_detail] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")

    # Get summary
    summary_stmt = select(PatientSummary).where(
        PatientSummary.file == file,
        PatientSummary.speaker == speaker
    )
    summary = (await db.execute(summary_stmt)).scalar_one_or_none()
    
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    
    # Get scoring
    scoring_stmt = select(PatientSummaryScoring).where(
        PatientSummaryScoring.file == file,
        PatientSummaryScoring.speaker == speaker
    )
    scoring = (await db.execute(scoring_stmt)).scalar_one_or_none()
    
    return {
        "file": file,
        "speaker": speaker,
        "summary": {
            "entire_summary": summary.entire_summary,
            "classes": [
                {
                    "class_name": summary.class_1,
                    "summary": summary.summary_class_1,
                    "score": scoring.class_1_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_2,
                    "summary": summary.summary_class_2,
                    "score": scoring.class_2_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_3,
                    "summary": summary.summary_class_3,
                    "score": scoring.class_3_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_4,
                    "summary": summary.summary_class_4,
                    "score": scoring.class_4_patient_scoring if scoring else None
                },
                {
                    "class_name": summary.class_5,
                    "summary": summary.summary_class_5,
                    "score": scoring.class_5_patient_scoring if scoring else None
                }
            ]
        }
    }


@app.get("/api/patient/scoring")
async def get_patient_scoring(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient scoring data"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_scoring] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    
    stmt = select(PatientSummaryScoring)
    
    if file:
        stmt = stmt.where(PatientSummaryScoring.file == file)
    if speaker:
        stmt = stmt.where(PatientSummaryScoring.speaker == speaker)
    
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": len(results),
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "scores": {
                    "class_1": r.class_1_patient_scoring,
                    "class_2": r.class_2_patient_scoring,
                    "class_3": r.class_3_patient_scoring,
                    "class_4": r.class_4_patient_scoring,
                    "class_5": r.class_5_patient_scoring
                },
                "average": round(sum(filter(None, [
                    r.class_1_patient_scoring,
                    r.class_2_patient_scoring,
                    r.class_3_patient_scoring,
                    r.class_4_patient_scoring,
                    r.class_5_patient_scoring
                ])) / len(list(filter(None, [
                    r.class_1_patient_scoring,
                    r.class_2_patient_scoring,
                    r.class_3_patient_scoring,
                    r.class_4_patient_scoring,
                    r.class_5_patient_scoring
                ]))), 2) if any([
                    r.class_1_patient_scoring,
                    r.class_2_patient_scoring,
                    r.class_3_patient_scoring,
                    r.class_4_patient_scoring,
                    r.class_5_patient_scoring
                ]) else None
            }
            for r in results
        ]
    }

@app.put("/api/patient/scoring")
async def update_patient_scoring(
    update_data: PatientScoringUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Update or create patient scoring record"""
    print("=" * 80)
    print("🔍 DEBUG [update_patient_scoring] - Input Data:")
    print(f"   file: {update_data.file}")
    print(f"   speaker: {update_data.speaker}")
    print(f"   class_1: {update_data.class_1_patient_scoring}")
    print(f"   class_2: {update_data.class_2_patient_scoring}")
    print(f"   class_3: {update_data.class_3_patient_scoring}")
    print(f"   class_4: {update_data.class_4_patient_scoring}")
    print(f"   class_5: {update_data.class_5_patient_scoring}")
    
    # Find existing record by file and speaker
    stmt = select(PatientSummaryScoring).where(
        (PatientSummaryScoring.file == update_data.file) &
        (PatientSummaryScoring.speaker == update_data.speaker)
    )
    existing_record = (await db.execute(stmt)).scalars().first()
    
    # If exists, update; if not, create new
    if existing_record:
        record = existing_record
    else:
        record = PatientSummaryScoring(
            file=update_data.file,
            speaker=update_data.speaker
        )
    
    # Update only provided fields
    if update_data.class_1_patient_scoring is not None:
        record.class_1_patient_scoring = update_data.class_1_patient_scoring
    if update_data.class_2_patient_scoring is not None:
        record.class_2_patient_scoring = update_data.class_2_patient_scoring
    if update_data.class_3_patient_scoring is not None:
        record.class_3_patient_scoring = update_data.class_3_patient_scoring
    if update_data.class_4_patient_scoring is not None:
        record.class_4_patient_scoring = update_data.class_4_patient_scoring
    if update_data.class_5_patient_scoring is not None:
        record.class_5_patient_scoring = update_data.class_5_patient_scoring
    
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    # Calculate average
    scores = [
        record.class_1_patient_scoring,
        record.class_2_patient_scoring,
        record.class_3_patient_scoring,
        record.class_4_patient_scoring,
        record.class_5_patient_scoring
    ]
    valid_scores = [s for s in scores if s is not None]
    average = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else None
    
    return {
        "file": record.file,
        "speaker": record.speaker,
        "scores": {
            "class_1": record.class_1_patient_scoring,
            "class_2": record.class_2_patient_scoring,
            "class_3": record.class_3_patient_scoring,
            "class_4": record.class_4_patient_scoring,
            "class_5": record.class_5_patient_scoring
        },
        "average": average
    }

@app.get("/api/patient/responses")
async def get_patient_responses(
    file: Optional[str] = None,
    speaker: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get patient question responses"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_responses] - Input Parameters:")
    print(f"   file: {file}")
    print(f"   speaker: {speaker}")
    
    stmt = select(PatientResponses)
    
    if file:
        stmt = stmt.where(PatientResponses.file == file)
    if speaker:
        stmt = stmt.where(PatientResponses.speaker == speaker)
    
    results = (await db.execute(stmt)).scalars().all()
    
    return {
        "total": len(results),
        "data": [
            {
                "file": r.file,
                "speaker": r.speaker,
                "answers": {
                    "answer_1": r.answer_1,
                    "answer_2": r.answer_2,
                    "answer_3": r.answer_3,
                    "answer_4": r.answer_4,
                    "answer_5": r.answer_5
                }
            }
            for r in results
        ]
    }

@app.get("/api/patient/files")
async def get_patient_files(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get list of unique files in patient interface"""
    print("=" * 80)
    print("🔍 DEBUG [get_patient_files] - Querying distinct files")
    
    stmt = select(PatientSummary.file).distinct().order_by(PatientSummary.file)
    files_raw = (await db.execute(stmt)).scalars().all()
    
    # Filter out None values
    files = [f for f in files_raw if f is not None]
    none_count = len(files_raw) - len(files)
    
    print(f"   Found {len(files)} files ({none_count} NULL values filtered)")
    print("=" * 80)
    
    return {"files": files}


@app.get("/api/patient/sentences/{file}")
async def get_patient_sentences_by_class(
    file: str,
    top_n: int = Query(7, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get top-scoring sentences from doctor_sentence_view grouped by class.

    Returns the highest-scoring sentences per class for the patient
    "View relevant sentences from your visit" feature.
    All speakers in the transcript are included (doctor, patient, etc.).
    """
    await check_patient_access(file, user, db)

    stmt = select(
        DoctorSentenceView.class_,
        DoctorSentenceView.sentence,
        DoctorSentenceView.score,
        DoctorSentenceView.speaker,
        DoctorSentenceView.i,
        DoctorSentenceView.i2,
    ).where(
        DoctorSentenceView.file == file,
        DoctorSentenceView.class_ != '-1',
        DoctorSentenceView.score.isnot(None),
    ).order_by(
        DoctorSentenceView.class_,
        DoctorSentenceView.score.desc(),
    )

    results = (await db.execute(stmt)).all()

    # Group by class, keep top_n per class
    by_class: dict[str, list[dict]] = {}
    for r in results:
        cls = r.class_
        if cls not in by_class:
            by_class[cls] = []
        if len(by_class[cls]) < top_n:
            by_class[cls].append({
                "sentence": r.sentence,
                "score": r.score,
                "speaker": r.speaker,
                "i": r.i,
                "i2": r.i2,
            })

    return {
        "file": file,
        "top_n": top_n,
        "by_class": by_class,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard/Stats APIs
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/stats/dashboard")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Get overall dashboard statistics"""
    print("=" * 80)
    print("🔍 DEBUG [get_dashboard_stats] - Querying statistics")
    
    # Doctor stats
    print("   Querying doctor interface stats...")
    doctor_sentences_count = (await db.execute(
        select(func.count()).select_from(DoctorSentenceView)
    )).scalar_one()
    print(f"   - doctor_sentences_count: {doctor_sentences_count}")
    
    doctor_rewrites_count = (await db.execute(
        select(func.count()).select_from(DoctorRewriteLog)
    )).scalar_one()
    
    doctor_files_count = (await db.execute(
        select(func.count(func.distinct(DoctorSentenceView.file)))
    )).scalar_one()
    
    # Patient stats
    patient_summaries_count = (await db.execute(
        select(func.count()).select_from(PatientSummary)
    )).scalar_one()
    
    patient_files_count = (await db.execute(
        select(func.count(func.distinct(PatientSummary.file)))
    )).scalar_one()
    
    # Average patient scoring
    avg_scores_stmt = select(
        func.avg(PatientSummaryScoring.class_1_patient_scoring).label('avg_class_1'),
        func.avg(PatientSummaryScoring.class_2_patient_scoring).label('avg_class_2'),
        func.avg(PatientSummaryScoring.class_3_patient_scoring).label('avg_class_3'),
        func.avg(PatientSummaryScoring.class_4_patient_scoring).label('avg_class_4'),
        func.avg(PatientSummaryScoring.class_5_patient_scoring).label('avg_class_5')
    )
    avg_scores = (await db.execute(avg_scores_stmt)).one()
    
    return {
        "doctor_interface": {
            "total_sentences": doctor_sentences_count,
            "total_rewrites": doctor_rewrites_count,
            "unique_files": doctor_files_count
        },
        "patient_interface": {
            "total_summaries": patient_summaries_count,
            "unique_files": patient_files_count,
            "average_scores": {
                "class_1": round(avg_scores.avg_class_1, 2) if avg_scores.avg_class_1 else None,
                "class_2": round(avg_scores.avg_class_2, 2) if avg_scores.avg_class_2 else None,
                "class_3": round(avg_scores.avg_class_3, 2) if avg_scores.avg_class_3 else None,
                "class_4": round(avg_scores.avg_class_4, 2) if avg_scores.avg_class_4 else None,
                "class_5": round(avg_scores.avg_class_5, 2) if avg_scores.avg_class_5 else None
            }
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Model for Patient Responses Update
# ──────────────────────────────────────────────────────────────────────────────

class PatientResponsesUpdate(BaseModel):
    file: str
    speaker: str
    answer_1: Optional[str] = None
    answer_2: Optional[str] = None
    answer_3: Optional[str] = None
    answer_4: Optional[str] = None
    answer_5: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# PUT endpoint for Patient Responses
# ──────────────────────────────────────────────────────────────────────────────

@app.put("/api/patient/responses")
async def update_patient_responses(
    update_data: PatientResponsesUpdate,
    db: AsyncSession = Depends(get_db),
    user: AuthUser = Depends(get_current_user)
):
    """Update or create patient question responses"""
    print("=" * 80)
    print("🔍 DEBUG [update_patient_responses] - Input Data:")
    print(f"   file: {update_data.file}")
    print(f"   speaker: {update_data.speaker}")
    print(f"   answer_1: {update_data.answer_1[:30] if update_data.answer_1 else None}...")
    print(f"   answer_2: {update_data.answer_2[:30] if update_data.answer_2 else None}...")
    print(f"   answer_3: {update_data.answer_3[:30] if update_data.answer_3 else None}...")
    print(f"   answer_4: {update_data.answer_4[:30] if update_data.answer_4 else None}...")
    print(f"   answer_5: {update_data.answer_5[:30] if update_data.answer_5 else None}...")
    
    # Find existing record by file and speaker
    stmt = select(PatientResponses).where(
        (PatientResponses.file == update_data.file) &
        (PatientResponses.speaker == update_data.speaker)
    )
    existing_record = (await db.execute(stmt)).scalars().first()
    
    # If exists, update; if not, create new
    if existing_record:
        record = existing_record
    else:
        record = PatientResponses(
            file=update_data.file,
            speaker=update_data.speaker
        )
    
    # Update only provided fields (partial update support)
    if update_data.answer_1 is not None:
        record.answer_1 = update_data.answer_1
    if update_data.answer_2 is not None:
        record.answer_2 = update_data.answer_2
    if update_data.answer_3 is not None:
        record.answer_3 = update_data.answer_3
    if update_data.answer_4 is not None:
        record.answer_4 = update_data.answer_4
    if update_data.answer_5 is not None:
        record.answer_5 = update_data.answer_5
    
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    return {
        "file": record.file,
        "speaker": record.speaker,
        "answers": {
            "answer_1": record.answer_1,
            "answer_2": record.answer_2,
            "answer_3": record.answer_3,
            "answer_4": record.answer_4,
            "answer_5": record.answer_5
        }
    }


# ──────────────────────────────────────────────────────────────────────────────
# REDCap Integration
# ──────────────────────────────────────────────────────────────────────────────
import httpx

# Load REDCap configuration from environment variables
REDCAP_API_URL = os.getenv("REDCAP_API_URL")  # e.g., https://redcap.csmc.edu/api/
REDCAP_API_TOKEN = os.getenv("REDCAP_API_TOKEN")  # 32-character token from REDCap

class RedcapImportRequest(BaseModel):
    """Records to import into REDCap"""
    records: List[Dict[str, Any]]  # List of records to import
    overwrite: Optional[str] = "normal"  # normal, overwrite
    return_content: Optional[str] = "count"  # count, ids, auto_ids

@app.post("/api/redcap/import")
async def import_to_redcap(
    request_data: RedcapImportRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Import records to REDCap project"""
    print("=" * 80)
    print("🔍 DEBUG [import_to_redcap] - Input Data:")
    print(f"   Number of records: {len(request_data.records)}")
    print(f"   overwrite: {request_data.overwrite}")
    print(f"   return_content: {request_data.return_content}")
    
    if not REDCAP_API_URL or not REDCAP_API_TOKEN:
        print("   ❌ ERROR: REDCap API configuration missing")
        print("=" * 80)
        raise HTTPException(
            status_code=500,
            detail="REDCap API configuration missing"
        )
    
    payload = {
        'token': REDCAP_API_TOKEN,
        'content': 'record',
        'format': 'json',
        'type': 'flat',
        'overwriteBehavior': request_data.overwrite,
        'returnContent': request_data.return_content,
        'returnFormat': 'json',
        'data': json.dumps(request_data.records)
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(REDCAP_API_URL, data=payload)
    
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"REDCap API error: {response.text}"
        )
    
    return {
        "status": "success",
        "redcap_response": response.json()
    }



# Entrypoint (dev only)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8000")),
        reload=True
    )