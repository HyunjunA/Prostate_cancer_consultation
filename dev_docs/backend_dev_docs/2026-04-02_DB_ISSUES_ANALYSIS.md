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

### 미적용 항목
| 항목 | 상태 | 사유 |
|------|------|------|
| Alembic migration 체계 | 미적용 | 구조적 변경으로 별도 작업 필요 |
| 주석 코드 정리 (main.py 1-1252줄 등) | 미적용 | 대규모 삭제로 별도 커밋 권장 |
| model_results/sentence_prediction 이중 저장 | 미적용 | backfill 호환성 유지 필요 |
