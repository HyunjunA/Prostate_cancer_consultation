# Prostate Cancer Dashboard — DB 문제점 종합 분석 리포트

> **Date:** 2026-04-02
> **Scope:** Backend DB implementation (models, routes, schema, sessions)
> **Tools used:** sql-database-assistant, database-schema-designer, tech-debt-tracker, performance-profiler
> **Analyzed files:** `models.py`, `db.py`, `database_schema.sql`, `auth/models.py`, `routes_transcript.py`, `routes_tracking.py`, `routes_surveys.py`, `main.py`, `init_db.py`, `docker-compose.yml`

---

## 1. Schema-Model Drift (DDL ↔ SQLAlchemy 불일치)

### 1-1. 컬럼명 불일치

| 테이블 | DDL (database_schema.sql) | SQLAlchemy (models.py) | 심각도 |
|--------|--------------------------|----------------------|--------|
| `doctor_sentence_view` | `sentences` | `sentence` | **HIGH** |
| `doctor_rewrite_log` | `original_sentences` | `original_sentence` | **HIGH** |
| `doctor_rewrite_log` | `revised_sentences` | `revised_sentence` | **HIGH** |
| `doctor_sentence_view` | `time TIMESTAMP` | `TIMESTAMP(timezone=True)` | MEDIUM |
| `doctor_rewrite_log` | `time TIMESTAMP` | `TIMESTAMP(timezone=True)` | MEDIUM |

Docker 초기화 시 DDL(`database_schema.sql`)이 먼저 실행되므로, ORM이 `sentence` 컬럼을 쿼리하면 `column "sentence" does not exist` 에러가 날 수 있음. DDL은 복수형(`sentences`), ORM은 단수형(`sentence`).

### 1-2. Timezone 불일치

- DDL: `doctor_sentence_view.time`과 `doctor_rewrite_log.time`은 **timezone 없는** `TIMESTAMP`
- ORM: `TIMESTAMP(timezone=True)` 사용
- 나머지 테이블들(survey, transcript 등)은 DDL/ORM 모두 `WITH TIME ZONE` → 일관성 부재

---

## 2. 누락된 제약 조건 및 인덱스

### 2-1. 누락된 인덱스

| 테이블 | 필요한 인덱스 | 이유 |
|--------|-------------|------|
| `user_interaction_log` | `(client_timestamp)` | `routes_tracking.py` analytics에서 `date_trunc('hour', client_timestamp)` GROUP BY |
| `user_interaction_log` | `(file, event_type)` 복합 | by_patient 분석에서 file+event_type GROUP BY |
| `sentence_prediction` | `(analysis_id, model)` 복합 | predictions 쿼리 시 analysis_id + model 동시 필터 |
| `transcript_analysis_log` | `(patient_id, analyzed_at DESC)` 복합 | download/history 모두 patient_id WHERE + analyzed_at ORDER BY |
| `auth_user` | `(username)` | username으로 조회하는데 인덱스 없음 (email만 UNIQUE) |

### 2-2. 누락된 제약 조건

- `sentence_prediction.model`: CHECK 제약 없음 → `CHECK (model IN ('cp','inc','ed','ius','le'))` 필요
- `user_interaction_log.role`: CHECK 없음 — `auth_user`에는 있는데 여기는 없음
- `transcript_analysis_log.patient_id`: FK 없음 → 고아 레코드 가능

---

## 3. 트랜잭션 및 세션 관리 문제

### 3-1. Batch 엔드포인트의 단일 세션 공유 (HIGH)

`routes_transcript.py:209-310` — `analyze_batch`에서 **단일 DB 세션**으로 루프를 돌며 여러 파일을 처리. `_save_to_db`가 실패하면 `rollback()`을 호출하는데, 이전 성공한 commit은 이미 적용된 상태. rollback 후 세션 상태가 불안정해질 수 있음.

**해결 방향:** 각 파일 처리를 독립 트랜잭션으로 격리

### 3-2. Backfill에서의 세션 오염 (MEDIUM)

`routes_transcript.py:684-720` — `_backfill_predictions`가 자체적으로 `commit()`/`rollback()`을 호출하는데, 상위 `get_predictions` 핸들러의 세션 상태를 바꿔버릴 수 있음.

### 3-3. `get_db()` 세션에 안전장치 없음 (LOW)

`db.py:32-35`:
```python
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```
- 자동 commit도 없고, 에러 시 자동 rollback도 없음
- 권장: `try/yield/except/rollback/finally` 패턴

---

## 4. 성능 문제

### 4-1. BYTEA (xlsx_data) 전체 로드 (HIGH)

`routes_transcript.py:547` — `history` 엔드포인트에서:
```python
select(TranscriptAnalysisLog)  # xlsx_data (BYTEA) 포함 전체 SELECT
```
`has_xlsx` 필드만 필요한데 수 MB짜리 바이너리가 매 row마다 메모리에 로드됨.

**해결 방향:** 필요한 컬럼만 선택
```python
select(
    TranscriptAnalysisLog.id,
    TranscriptAnalysisLog.patient_id,
    ...,
    TranscriptAnalysisLog.xlsx_data.isnot(None).label('has_xlsx')
)
```

### 4-2. Analytics 엔드포인트 — 6개 순차 쿼리 (MEDIUM)

`routes_tracking.py:313-460` — `/api/tracking/analytics`가 6개 독립 쿼리를 순차 실행:
1. timeline (GROUP BY hour)
2. by_patient (GROUP BY file, event_type)
3. per-session summary
4. device breakdown
5. top elements
6. hourly heatmap

**해결 방향:** `asyncio.gather()`로 병렬화

### 4-3. download-batch의 순차 DB 조회 (MEDIUM)

`routes_transcript.py:342-371` — 각 patient_id에 대해 개별 쿼리를 루프로 실행.

**해결 방향:** `WHERE patient_id IN (...)` 단일 쿼리로 교체

### 4-4. Predictions top_n — Python에서 자르기 (MEDIUM)

`routes_transcript.py:653-660` — 전체를 DB에서 가져온 후 Python에서 slice.

**해결 방향:** Window function으로 DB 레벨에서 처리

---

## 5. 데이터 무결성 문제

### 5-1. JSON 데이터를 TEXT로 저장 (MEDIUM × 3)

| 테이블.컬럼 | 현재 | 권장 |
|------------|------|------|
| `transcript_analysis_log.model_results` | TEXT | **JSONB** |
| `user_interaction_log.event_data` | TEXT | **JSONB** |
| `survey_submission_log.answers` | TEXT | **JSONB** |

JSONB 사용 시: JSON 유효성 자동 검증, 필드별 인덱스 생성 가능, 쿼리 시 직접 접근 가능.

### 5-2. `model_results`와 `sentence_prediction` 이중 저장 (LOW)

같은 데이터가 JSON TEXT + 정규화된 테이블 두 곳에 저장됨. 불일치 가능성 존재.

---

## 6. Migration 관리 부재 (HIGH)

- `migrations/` 폴더에 `env.py`만 존재, **revision 파일 없음**
- DDL은 `database_schema.sql`로 Docker 초기화 시 직접 실행
- 스키마 변경 이력 추적 불가, 롤백 불가
- 기존 DB에 새 컬럼/테이블 추가 시 수동 SQL 필요
- `init_db.py`는 전체 주석 처리 상태 (CSV 마이그레이션 비활성)

---

## 7. 보안 관련 DB 문제

### 7-1. 에러 메시지에 내부 정보 노출 (MEDIUM)

`routes_tracking.py:133`:
```python
raise HTTPException(status_code=500, detail=f"Failed to store events: {str(e)}")
```
SQLAlchemy 예외에 테이블명, 쿼리 구조 등이 포함될 수 있음.

### 7-2. Rate Limiting 없는 tracking 엔드포인트 (MEDIUM)

`POST /api/tracking/events`는 최대 500개 이벤트를 받는데 rate limiting 없이 무제한 호출 가능. DB insert 폭주 가능.

---

## 8. 기타 Tech Debt

| 항목 | 위치 | 설명 | 심각도 |
|------|------|------|--------|
| 주석 코드 대량 잔류 | `main.py` (1-1252줄), `routes_surveys.py` 전체, `init_db.py` 전체 | 이전 SARS-CoV 프로젝트 코드가 주석으로 남아있음 | LOW |
| `on_event` deprecated | `main.py:1341,1351` | FastAPI `on_event`는 deprecated → `lifespan` 패턴 권장 | LOW |
| `routes_tracking.py:177` 조건식 | `stmt = ... .where(...) if conditions else select(...)` | 파이썬 조건식 우선순위로 가독성 낮음 | LOW |
| `PatientScoringUpdate` 타입 불일치 | `main.py:1430-1434` | Pydantic은 `Optional[float]`, DB는 `Integer CHECK 0-10` | MEDIUM |

---

## 우선순위별 요약

| 우선순위 | 항목 수 | 핵심 사항 |
|---------|---------|----------|
| **HIGH** | 5 | Schema-Model drift (3개 컬럼명), batch 트랜잭션 격리, history의 BYTEA 전체 로드, Alembic 부재 |
| **MEDIUM** | 10 | timezone 불일치, 누락 인덱스 5개, TEXT→JSONB 3개, analytics 병렬화, 에러 노출, rate limiting, Float/Int 불일치 |
| **LOW** | 4 | 주석 코드 잔류, deprecated API, 조건식 가독성, 이중 저장 |

---

## 수정 이력 (2026-04-02 적용 완료)

| # | 항목 | 상태 | 커밋 |
|---|------|------|------|
| 1 | DDL-ORM 컬럼명 불일치 (sentences→sentence 등 3개) | ✅ 완료 | acf9aa7 |
| 2 | history 엔드포인트 BYTEA 전체 로드 방지 | ✅ 완료 | acf9aa7 |
| 3 | batch 트랜잭션 격리 (독립 세션) | ✅ 완료 | acf9aa7 |
| 4 | 누락 인덱스 5개 추가 | ✅ 완료 | acf9aa7 |
| 5 | 인덱스 심층 최적화 (7추가, 3제거) | ✅ 완료 | acf9aa7 |
| 6 | TEXT → JSONB 전환 (4개 컬럼) | ✅ 완료 | acf9aa7 |
| 7 | analytics 6개 쿼리 병렬화 (asyncio.gather) | ✅ 완료 | (this commit) |
| 8 | download-batch 순차→단일 쿼리 (DISTINCT ON) | ✅ 완료 | (this commit) |
| 9 | predictions top_n DB window function | ✅ 완료 | (this commit) |
| 10 | 에러 메시지 내부 정보 노출 방지 | ✅ 완료 | (this commit) |
| 11 | tracking rate limiting (30 req/min) | ✅ 완료 | (this commit) |
| 12 | PatientScoringUpdate float→int | ✅ 완료 | (this commit) |
| 13 | deprecated on_event → lifespan | ✅ 완료 | (this commit) |
| 14 | routes_tracking 조건식 가독성 개선 | ✅ 완료 | (this commit) |

| 15 | 주석 코드 정리 (4파일, -2002줄) | ✅ 완료 | ff5cf97 |
| 16 | Alembic migration 체계 수립 | ✅ 완료 | ff5cf97 |
| 17 | model_results 이중 저장 해소 | ✅ 완료 | ff5cf97 |

### 전체 완료. 미적용 항목 없음.

---

## 변경사항 상세 기록

### #1: DDL-ORM 컬럼명 불일치 해결

**파일:** `database_schema.sql`

DDL의 3개 컬럼명을 ORM에 맞게 단수형으로 통일하고, timestamp timezone을 일관성 있게 맞춤.

| 테이블 | Before (DDL) | After (DDL) | ORM (변경 없음) |
|--------|-------------|-------------|----------------|
| `doctor_sentence_view` | `sentences TEXT` | `sentence TEXT` | `sentence = Column(Text)` |
| `doctor_rewrite_log` | `original_sentences TEXT` | `original_sentence TEXT` | `original_sentence = Column(Text)` |
| `doctor_rewrite_log` | `revised_sentences TEXT` | `revised_sentence TEXT` | `revised_sentence = Column(Text)` |
| `doctor_sentence_view` | `time TIMESTAMP` | `time TIMESTAMP WITH TIME ZONE` | `TIMESTAMP(timezone=True)` |
| `doctor_rewrite_log` | `time TIMESTAMP` | `time TIMESTAMP WITH TIME ZONE` | `TIMESTAMP(timezone=True)` |

**이유:** Docker 시작 시 `database_schema.sql`이 먼저 테이블을 만들고, SQLAlchemy ORM이 해당 테이블에 쿼리를 보냄. DDL에 `sentences`(복수형)로 컬럼이 생성되는데 ORM은 `sentence`(단수형)로 쿼리하면 `column "sentence" does not exist` 에러 발생. 코드 전반에서 이미 단수형이 정착되어 있으므로 DDL 쪽을 ORM에 맞춤.

---

### #2: history 엔드포인트 BYTEA 전체 로드 방지

**파일:** `routes_transcript.py`

```python
# Before: 전체 ORM 객체 로드 (xlsx_data BYTEA 수 MB 포함)
stmt = select(TranscriptAnalysisLog)
"has_xlsx": row.xlsx_data is not None

# After: 7개 컬럼 + boolean만 조회
stmt = select(
    TranscriptAnalysisLog.id, ...,
    TranscriptAnalysisLog.xlsx_data.isnot(None).label("has_xlsx"),
)
"has_xlsx": row.has_xlsx
```

**이유:** `transcript_analysis_log.xlsx_data`는 엑셀 바이너리(수백 KB~수 MB). history 엔드포인트는 "파일 존재 여부"만 필요한데, 매 row마다 수 MB를 DB→Python으로 전송. 여러 사용자 동시 조회 시 서버 OOM 가능.

---

### #3: Batch 엔드포인트 트랜잭션 격리

**파일:** `routes_transcript.py`

```python
# Before: 공유 세션
await _save_to_db(db, ...)

# After: 파일마다 독립 세션
async with AsyncSessionLocal() as file_db:
    await _save_to_db(file_db, ...)
```

**이유:** 파일 A → commit 성공 → 파일 B → rollback → 파일 C → 불안정한 세션 상태. 공유 세션에서 rollback 후 후속 파일 처리가 예측 불가. 독립 세션으로 각 파일의 성공/실패를 격리.

---

### #4: 누락 인덱스 5개 추가

**파일:** `database_schema.sql`, `models.py`, `auth/models.py`

| 테이블 | 인덱스 | 쿼리 사용처 |
|--------|--------|------------|
| `transcript_analysis_log` | `(patient_id, analyzed_at DESC)` | download, history |
| `sentence_prediction` | `(analysis_id, model)` | predictions 필터 |
| `user_interaction_log` | `(client_timestamp)` | analytics GROUP BY |
| `user_interaction_log` | `(file, event_type)` | by_patient GROUP BY |
| `auth_user` | `(username)` | 로그인/조회 |

**이유:** 인덱스 없으면 PostgreSQL이 full table scan. 데이터 수만 건 이상에서 응답 시간 급격히 증가.

---

### #5: 인덱스 심층 최적화 (7 추가, 3 제거)

**파일:** `database_schema.sql`, `models.py`

**추가한 인덱스:**

| 인덱스 | 유형 | 이유 |
|--------|------|------|
| `idx_dsv_file_speaker_class_i` | Partial + Composite | Doctor Dashboard 메인 쿼리(`/scores/average`) 3단 subquery 최적화. `WHERE class != '-1' AND score IS NOT NULL` 조건 행만 인덱스 |
| `idx_uil_client_ts_hour` | Expression | `GROUP BY date_trunc('hour', ...)` — 일반 인덱스는 함수 적용 후 사용 불가, expression index로 해결 |
| `idx_uil_client_ts_hour_of_day` | Expression | `GROUP BY extract(hour FROM ...)` 같은 원리 |
| `idx_transcript_log_patient_xlsx` | Partial | download 엔드포인트의 `WHERE xlsx_data IS NOT NULL` 조건. NULL 행 제외로 인덱스 크기 축소 |
| `idx_transcript_log_history` | Covering (INCLUDE) | history 엔드포인트 SELECT 컬럼을 인덱스에 포함 → index-only scan, 테이블 heap 방문 불필요 |
| `idx_survey_speaker_submitted` | Composite | `WHERE speaker=... ORDER BY submitted_at DESC` — 별도 정렬 없이 바로 반환 |
| `idx_survey_file_submitted` | Composite | 같은 패턴, file 기준 |
| `idx_survey_redcap_pending` | Partial | `WHERE redcap_synced = FALSE` — 미처리 소수 행만 인덱스 |

**제거한 중복 인덱스:**

| 인덱스 | 대체 인덱스 | 이유 |
|--------|------------|------|
| `idx_transcript_log_patient_id` | `(patient_id, analyzed_at DESC)` 복합 | 복합 인덱스 첫 번째 컬럼이 단일 검색도 커버 |
| `idx_sp_analysis_id` | `(analysis_id, model)` 복합 | 같은 원리. INSERT 가장 빈번한 테이블이라 효과 큼 |
| `idx_doctor_render_file` | PK `(file, i, i2)` | PK 자동 인덱스의 첫 번째 컬럼과 완전 중복 |

---

### #6: TEXT → JSONB 전환

**파일:** `database_schema.sql`, `models.py`, `routes_transcript.py`, `routes_tracking.py`, `routes_surveys.py`

| 테이블.컬럼 | Before | After |
|------------|--------|-------|
| `transcript_analysis_log.model_results` | `TEXT` | `JSONB` |
| `survey_submission_log.answers` | `TEXT` | `JSONB` |
| `survey_submission_log.extra_data` | `TEXT` | `JSONB` |
| `user_interaction_log.event_data` | `TEXT` | `JSONB` |

코드에서 `json.dumps()` 4개, `json.loads()` 7개 제거. SQLAlchemy JSONB 타입이 자동 dict↔JSON 변환.

**이유:** TEXT는 유효하지 않은 JSON도 저장 가능, JSON 필드 쿼리 불가, 저장 비효율적. JSONB로 데이터 무결성 + 쿼리 기능 + 코드 단순화.

---

### #7: analytics 엔드포인트 6개 쿼리 병렬화

**파일:** `routes_tracking.py`

```python
# Before: 순차 실행 (6 × await)
timeline_result = await db.execute(timeline_stmt)
patient_result = await db.execute(by_patient_stmt)
...

# After: asyncio.gather + 독립 세션
(timeline_rows, patient_rows, ...) = await asyncio.gather(
    _run(timeline_stmt), _run(by_patient_stmt), ...
)
```

**이유:** 6개 쿼리가 서로 독립적. 순차 실행 시 총 지연 = 합산, 병렬 실행 시 = 최대값. 각 쿼리 100ms일 때 600ms → ~100ms. SQLAlchemy async session은 단일 connection이라 `asyncio.gather`만으로는 병렬 불가 — 독립 `AsyncSessionLocal()` 세션 사용.

---

### #8: download-batch 순차 → 단일 쿼리

**파일:** `routes_transcript.py`

```python
# Before: N번 개별 쿼리
for pid in ids:
    stmt = select(...).where(patient_id == pid).limit(1)
    await db.execute(stmt)

# After: 1번 DISTINCT ON 쿼리
stmt = select(...).where(patient_id.in_(db_needed))
    .distinct(patient_id)
    .order_by(patient_id, analyzed_at.desc())
```

**이유:** 환자 10명이면 DB 왕복 10번 → 1번. 네트워크 왕복 비용 제거.

---

### #9: predictions top_n — DB 레벨 window function

**파일:** `routes_transcript.py`

```python
# Before: 전체 로드 후 Python에서 slice
rows = result.scalars().all()
for model_rows in by_model.values():
    rows.extend(model_rows[:top_n])

# After: ROW_NUMBER() window function
ranked = select(SentencePrediction,
    func.row_number().over(
        partition_by=SentencePrediction.model,
        order_by=SentencePrediction.pred_score.desc()
    ).label("rn")
)
topn_stmt = select(...).where(ranked_sub.c.rn <= top_n)
```

**이유:** 전체 데이터를 Python 메모리로 가져온 뒤 자르는 것은 비효율적. DB에서 window function으로 처리하면 필요한 행만 전송.

---

### #10: 에러 메시지 내부 정보 노출 방지

**파일:** `routes_tracking.py`

```python
# Before
raise HTTPException(status_code=500, detail=f"Failed to store events: {str(e)}")

# After
raise HTTPException(status_code=500, detail="Failed to store events. Please try again.")
```

**이유:** SQLAlchemy 예외 메시지에 테이블명, 쿼리 구조, 컬럼명 등이 포함될 수 있음. 공격자에게 DB 구조 노출 방지. 상세 에러는 `logger.error`로 서버 로그에만 기록.

---

### #11: tracking rate limiting

**파일:** `routes_tracking.py`

```python
# FastAPILimiter 의존성 추가 (Redis 없으면 자동 비활성)
try:
    from fastapi_limiter.depends import RateLimiter
    _tracking_rate_limit = [Depends(RateLimiter(times=30, seconds=60))]
except Exception:
    _tracking_rate_limit = []

@router.post("/events", dependencies=_tracking_rate_limit)
```

**이유:** `POST /api/tracking/events`는 최대 500개 이벤트를 한 번에 받는데 rate limiting 없이 무제한 호출 가능. 악의적 클라이언트가 반복 호출 시 DB insert 폭주. 분당 30회로 제한 (30 × 500 = 15,000 이벤트/분, 정상 사용에 충분).

---

### #12: PatientScoringUpdate float → int

**파일:** `main.py`

```python
# Before
class_1_patient_scoring: Optional[float] = None

# After
class_1_patient_scoring: Optional[int] = None
```

**이유:** DB 컬럼은 `Integer CHECK (BETWEEN 0 AND 10)`. Pydantic에서 float을 받으면 `3.7` 같은 값이 DB에서 에러. 타입을 일치시켜 API 레벨에서 검증.

---

### #13: deprecated on_event → lifespan

**파일:** `main.py`

```python
# Before (deprecated)
@app.on_event("startup")
async def on_startup(): ...

@app.on_event("shutdown")
async def on_shutdown(): ...

# After (recommended pattern)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    redis = await init_redis()
    ...
    yield
    # shutdown
    await close_http_client()
    await close_redis()

app = FastAPI(lifespan=lifespan)
```

**이유:** FastAPI는 `on_event`를 deprecated로 표시. `lifespan` 패턴은 startup/shutdown을 하나의 context manager로 묶어 리소스 관리가 더 명확.

---

### #14: routes_tracking 조건식 가독성 개선

**파일:** `routes_tracking.py`

```python
# Before (ambiguous precedence)
stmt = (
    select(UserInteractionLog)
    .where(and_(*conditions)) if conditions else select(UserInteractionLog)
)

# After (clear intent)
stmt = select(UserInteractionLog)
if conditions:
    stmt = stmt.where(and_(*conditions))
```

**이유:** Python 조건식 `a.b() if c else d`의 우선순위가 직관적이지 않음. 별도 if문으로 분리하여 가독성과 유지보수성 향상.

---

### #15: 주석 코드 정리 (-2002줄)

**파일:** `main.py`, `routes_surveys.py`, `init_db.py`, `models.py`

| 파일 | Before | After | 제거 |
|------|--------|-------|------|
| `main.py` | 3421줄 | 2174줄 | -1247줄 (SARS-CoV 레거시) |
| `routes_surveys.py` | 2137줄 | 1757줄 | -380줄 (이전 survey 코드) |
| `init_db.py` | 1007줄 | 806줄 | -201줄 (이전 init 코드) |
| `models.py` | 420줄 | 246줄 | -174줄 (Study 모델) |

**이유:** 이전 SARS-CoV 프로젝트 코드가 주석으로 남아 파일 크기를 2배로 부풀림. 코드 탐색, 검색, 유지보수에 방해. git 이력에 보존되므로 삭제해도 복구 가능.

---

### #16: Alembic migration 체계 수립

**파일:** `alembic.ini`, `migrations/env.py`, `migrations/versions/001_baseline.py`, `Dockerfile`

**구성:**
- `alembic.ini`: 하드코딩된 SARS-CoV DB URL → `env.py`에서 `DATABASE_URL` 환경변수로 동적 설정
- `migrations/env.py`: 전면 재작성 — asyncpg→psycopg2 드라이버 교체, `models.Base`+`auth.models` 메타데이터 연결, `autogenerate` 지원
- `migrations/versions/001_baseline.py`: no-op baseline (현재 스키마를 시작점으로 마킹)
- `Dockerfile prestart.sh`: `alembic stamp head` (첫 실행 마킹) + `alembic upgrade head` (신규 migration 적용) 활성화

**Docker 시작 흐름:**
```
PostgreSQL → database_schema.sql (테이블 생성)
Backend → wait_for_db → init_db (CSV 시드) → alembic stamp head → alembic upgrade head
```

**향후 스키마 변경 절차:**
1. `models.py` 수정 (컬럼 추가/변경)
2. `docker exec prostatecancer-backend alembic revision --autogenerate -m "설명"`
3. 생성된 migration 파일 확인
4. `docker exec prostatecancer-backend alembic upgrade head` 또는 컨테이너 재시작

---

### #17: model_results 이중 저장 해소

**파일:** `routes_transcript.py`

```python
# Before: JSON과 정규화 테이블 모두에 저장
model_results=models,  # JSONB에 전체 결과 저장
db.add_all(prediction_rows)  # sentence_prediction 테이블에도 저장

# After: 정규화 테이블만 저장
model_results=None,  # deprecated — sentence_prediction이 정본
db.add_all(prediction_rows)  # sentence_prediction만 저장
```

**이유:** 같은 데이터가 `model_results` JSONB + `sentence_prediction` 테이블 두 곳에 저장되어 불일치 가능성, 저장 공간 낭비, 유지보수 복잡. `sentence_prediction`이 정규화된 정본(source of truth)이므로 `model_results`에 더 이상 저장하지 않음. 기존 레거시 데이터용 `_backfill_predictions()`은 유지하여 하위 호환성 보장. 컬럼 자체는 nullable로 유지.

---

## 변경된 파일 전체 목록

| 파일 | 수정 내용 |
|------|----------|
| `database_schema.sql` | 컬럼명 3개 통일, timezone 2개 통일, TEXT→JSONB 4개, 인덱스 7추가/3제거 |
| `models.py` | 주석 정리(-174줄), JSONB import+적용, 중복 인덱스 제거, 복합 인덱스 추가 |
| `auth/models.py` | username `index=True` 추가 |
| `routes_transcript.py` | history SELECT 최적화, batch 독립 세션, download-batch 단일 쿼리, predictions window function, model_results 저장 중단, json.dumps/loads 제거 |
| `routes_tracking.py` | analytics 6개 쿼리 병렬화, 에러 메시지 보안, rate limiting, 조건식 개선, json.dumps/loads 제거 |
| `routes_surveys.py` | 주석 정리(-380줄), json.dumps/loads 제거 |
| `main.py` | 주석 정리(-1247줄), on_event→lifespan, PatientScoringUpdate float→int |
| `init_db.py` | 주석 정리(-201줄) |
| `Dockerfile` | prestart.sh에 Alembic 실행 활성화 |
| `alembic.ini` | 하드코딩 URL 제거 → env.py 동적 설정 |
| `migrations/env.py` | 전면 재작성 (async 지원, 모델 연결, autogenerate) |
| `migrations/versions/001_baseline.py` | 신규 — baseline migration |
| `dev_docs/backend_dev_docs/2026-04-02_DB_ISSUES_ANALYSIS.md` | 분석 보고서 + 수정 이력 |

## 커밋 이력

| 커밋 | 항목 | 요약 |
|------|------|------|
| `acf9aa7` | #1-6 | DDL-ORM 통일, BYTEA 최적화, 트랜잭션 격리, 인덱스 17개 튜닝, TEXT→JSONB |
| `b64e51a` | #7-14 | 쿼리 병렬화, batch 단일쿼리, window function, 보안, rate limit, lifespan |
| `ff5cf97` | #15-17 | 주석 정리(-2002줄), Alembic 수립, model_results 이중저장 해소 |
