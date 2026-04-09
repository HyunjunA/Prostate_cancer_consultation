# Technical Report: April 2–3, 2026

**Project:** Prostate Cancer Consultation Dashboard
**Period:** April 2–3, 2026
**Commits:** 39 (Apr 2) + 6 (Apr 3) = 45 total
**Scope:** 101 files changed, +8,949 / -10,725 lines (net -1,776 lines)

---

## 1. DB Schema & ORM Synchronization

DDL(`database_schema.sql`)과 ORM(`models.py`) 사이의 불일치를 수정했습니다.

- **컬럼명 동기화**: `sentences`→`sentence`, `original_sentences`→`original_sentence`, `revised_sentences`→`revised_sentence`
- **타입 통일**: `TIMESTAMP` → `TIMESTAMP WITH TIME ZONE` (doctor_sentence_view, doctor_rewrite_log)
- **불필요 컬럼 제거**: `doctor_rewrite_log.original_score` (FK JOIN으로 대체 가능), `doctor_rewrite_log.selected` (미사용 boolean)
- **TEXT→JSONB 전환** (4개 컬럼): `model_results`, `answers`, `extra_data`, `event_data`
  - `json.dumps()` 4곳, `json.loads()` 7곳 제거 → PostgreSQL 네이티브 JSON 처리

> Commits: `acf9aa7`, `fcc3489`, `69752e7`

---

## 2. Patient Summary Table Normalization

고정 5-slot 구조를 정규화된 도메인 행 구조로 변경했습니다.

**Before (3 tables):**
```
patient_summary       → class_1~5, summary_class_1~5 (고정 10 컬럼)
patient_summary_scoring → class_1_score~class_5_score
patient_responses     → class_1_response~class_5_response
```

**After (2 tables):**
```
patient_summary        → file, speaker, entire_summary
patient_summary_domain → file, speaker, domain, display_order, summary_text, patient_scoring, patient_response
```

- NLP 도메인 추가 시 DDL 변경 불필요 (행 추가만으로 확장)
- `routes_patient.py`: 7개 엔드포인트 전면 재작성
- `usePatientData.tsx`: slot 번호 기반 → 도메인 이름 기반 인터페이스로 전환

> Commit: `c1ae718`

---

## 3. Index Optimization

주요 쿼리 패턴 분석 후 인덱스를 재설계했습니다.

**Added (12):**
| Index | Type | Target Query |
|-------|------|-------------|
| `idx_dsv_file_speaker_class_i` | Partial + Composite | scores/average 3-stage subquery |
| `idx_uil_client_ts_hour` | Expression | Analytics timeline GROUP BY |
| `idx_uil_client_ts_hour_of_day` | Expression | Hourly heatmap |
| `idx_transcript_log_patient_xlsx` | Partial | Download (xlsx IS NOT NULL only) |
| `idx_transcript_log_history` | Covering (INCLUDE) | History index-only scan |
| `idx_survey_speaker_submitted` | Composite + WHERE | Survey query |
| `idx_survey_redcap_pending` | Partial | Unsynced rows only |
| + 5 basic indexes | B-tree | patient_id, analysis_id, client_timestamp, file, username |

**Removed (6):**
- PK first column과 중복: `idx_doctor_render_file`
- Composite index와 중복: `idx_transcript_log_patient_id`, `idx_sp_analysis_id`
- user_interaction_log 단일 컬럼 3개 (role, file, speaker) — 저빈도 + full scan 대비 이점 없음

> Commits: `acf9aa7`, `99e1321`

---

## 4. Query Performance

**Analytics 병렬화:**
- 6개 순차 쿼리 → `asyncio.gather` + 독립 세션으로 병렬 실행
- 각 쿼리가 독립 `AsyncSessionLocal`을 사용하여 true parallel execution

**Batch 최적화:**
- download-batch: N개 개별 쿼리 → 단일 `DISTINCT ON` 쿼리
- predictions top_n: Python-side slice → DB-level `ROW_NUMBER()` window function

**NLP 예측 병렬화:**
- 5개 모델 순차 호출 → `asyncio.gather`로 동시 호출 (~5x speedup)
- 검증: 15/15 predictions 동일 (diff=0.00000000)

> Commits: `b64e51a`, `e1fbe2e`

---

## 5. Pipeline Restructuring — Fake CSV Elimination

기존 CSV 기반 seed data를 전면 제거하고 실제 파이프라인 출력으로 전환했습니다.

**제거 항목:**
- `fake_csv_files/` 디렉토리 전체 삭제 (8 CSV + 5 Python generators + 2 mapping docs, -958 lines)
- `generate_real_scores.py` 삭제 (.pred_1을 score로 잘못 사용하던 스크립트)

**새 파이프라인 (`pipeline_runner.py`):**
```
Step 1: Read transcript (xlsx/csv)
Step 2: Identify doctor speaker (dynamic — text length rule)
Step 3: Split into sentences
Step 4: NLP 5-model prediction (asyncio.gather parallel)
Steps 5-7: Top-N selection, context generation, xlsx export
Step 8: Consultation scorer → 0-5 quality score
Step 9: Patient summary rewriter → domain summaries
Step 10: persistence.save_all() → single-transaction DB write
```

- Docker prestart에서 자동 실행: transcript 파일 존재 시 전체 파이프라인 수행
- 6개 transcript 파일 모두 정상 처리 (TurboScribe 포함)

> Commits: `6b24d6c`, `d23dcae`, `42810b1`, `4f37548`, `5eb5255`

---

## 6. Dynamic Doctor Speaker Identification

하드코딩된 `PHYSICIAN_IDS` 리스트를 동적 식별 로직으로 교체했습니다.

**Ivan's rule:** "group by speaker, sum text length, the bigger is the doctor"

- Keystrokes 형식 (`Interviewer:`), processed 형식 (`Interviewer`), TurboScribe 형식 (`Speaker 1/Speaker 2`) 모두 처리
- Backend `/api/doctor/files`: 파일별 speaker 정보 반환
- Frontend: `fileSpeakerMap`으로 파일별 speaker 자동 매핑, `doctorid=auto` 지원

> Commits: `fed885a`, `1b769ab`, `0fac8e4`, `65102c9`

---

## 7. Doctor Demo — Placeholder 제거, API Direct

프론트엔드에서 placeholder/계산 로직을 제거하고 모든 데이터를 API에서 직접 사용하도록 변경했습니다.

- `getPlaceholderScore()` 제거 → `scores/summary` API 응답 직접 사용
- `overallScore`: 프론트엔드 평균 계산 → API `overall.score` 직접 사용
- Representative sentence: 마지막/정렬 기준 → API가 반환하는 `(i, i2)` 기준
- Patient First Visit: quality score top-7 → pred_score top-10, `is_in_summary` 플래그 추가

> Commits: `59f3f2c`, `527ffdd`

---

## 8. Security & Stability

- **에러 메시지 hardening**: `HTTPException(detail=str(e))` → 고정 메시지로 교체. SQLAlchemy 내부 정보(테이블명, 쿼리 구조) 클라이언트 노출 차단
- **Rate limiting**: `POST /api/tracking/events`에 30 req/min 적용 (Redis 기반, 미가용 시 graceful disable)
- **Batch 트랜잭션 격리**: `analyze-batch`에서 파일별 독립 `AsyncSessionLocal` 사용. 한 파일 rollback이 다른 파일에 영향 주지 않음

> Commit: `b64e51a`

---

## 9. Backend Architecture Cleanup

**main.py 분리:**
- 3,421 lines → 143 lines (-96%)
- 추출: `routes_doctor.py` (1,382 lines), `routes_patient.py` (586 lines)

**Legacy 코드 제거:**
- main.py: -1,247 lines (SARS-CoV project code)
- routes_surveys.py: -380 lines
- init_db.py: -201 lines (fake CSV seed 로직)
- models.py: -174 lines
- 총 -2,002 lines

**Ivan Code Review Standards 적용:**
- Thin Main: 모든 Step이 단일 함수 호출 (inline 로직 없음)
- Config-driven: 모든 서비스 URL/timeout을 `config.yaml`에서 로드 (`os.getenv()` → `config.get()`)
- Readable imports: `from nlp_service import X` → `import nlp_classifier_client` (module.function() 스타일)
- `nlp_service.py` → `nlp_classifier_client.py` 이름 변경 (역할 기반)

**Alembic migration 설정:**
- `alembic.ini`: 하드코딩된 DB URL → 환경변수 기반
- `migrations/env.py`: async 프로젝트용 재작성
- `001_baseline.py`: 현재 스키마를 baseline으로 기록
- Dockerfile prestart: `alembic stamp head` + `alembic upgrade head` 활성화

> Commits: `d617b89`, `ff5cf97`, `5d4045c`, `527ffdd`, `99e1321`

---

## 10. Docker Optimization

| Component | Before | After | Change |
|-----------|--------|-------|--------|
| Backend image | 522MB | 428MB | -18% (multi-stage build) |
| Webapp image | 1.25GB | 860MB | -31% (17 unused npm packages 제거) |
| Webapp build warnings | 4 | 0 | surveysSecondVersion export 수정 |
| Container resource limits | 없음 | 설정됨 | backend 1G/2CPU, postgres 512M, redis 256M |

- Backend `.dockerignore` 생성
- Webapp `.dockerignore` 정리 (중복 제거, test/doc 제외)
- Pagination safety: `/api/doctor/files`, `/api/patient/files`에 `limit` 파라미터 추가 (default 500)

> Commits: `54b0b52`, `c210e0b`

---

## 11. DB Persistence Layer (Ivan Directive)

Ivan의 지시사항에 따라 DB persistence 구조를 구성했습니다.

**`Backend/persistence.py`:**
- `save_all()`: 4개 use case를 단일 트랜잭션으로 처리
  1. `transcript_analysis_log` — 분석 실행 메타데이터
  2. `sentence_prediction` — 문장별 NLP 예측 결과
  3. `doctor_sentence_view` — 의사 대시보드용 문장 + quality score
  4. `patient_summary` + `patient_summary_domain` — 환자 대시보드용 요약문
- `file_already_processed()`: 중복 처리 방지
- Non-blocking: DB 장애 시 파이프라인 정상 완료

**Connection 설정 분리:**
- DB 연결: `.env`의 `DATABASE_URL` 환경변수
- 파이프라인 파라미터: `Backend/config.yaml`
- 스크립트 내 하드코딩 없음

> Commits: `5d4045c`, `6b24d6c`

---

## 12. Validation

**run_all.sh 실행 결과 (Apr 3):**
- 10개 컨테이너 전체 healthy
- 5-model NLP 분석 정상 (8 sentences × 5 models)
- 1000-request 스트레스 테스트: **1000/1000 성공 (100.0%), 0 실패**
- Throughput: 11.4 req/s, Median latency: 4ms
- Dashboard: http://localhost:3000, API docs: http://localhost:8000/docs

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Backend main.py | 3,421 lines | 143 lines |
| Legacy commented code | ~2,000 lines | 0 |
| Backend Docker image | 522MB | 428MB |
| Webapp Docker image | 1.25GB | 860MB |
| Fake CSV files | 15 files | 0 |
| DB indexes | basic only | +12 optimized, -6 redundant |
| json.dumps/loads | 11 calls | 0 |
| NLP prediction | sequential | parallel (asyncio.gather) |
| Doctor identification | hardcoded IDs | dynamic (text length) |
| patient_summary tables | 3 (fixed 5-slot) | 2 (normalized) |
| Pipeline data flow | CSV intermediate | direct DB write |
| Docker services | 8 | 10 (+scorer, +rewriter) |
| Transcript files processed | 1 | 6 (all) |
| Total lines | +8,949 / -10,725 | net -1,776 |
