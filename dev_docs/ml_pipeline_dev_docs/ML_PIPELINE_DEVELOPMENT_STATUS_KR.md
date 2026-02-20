# Pipeline 현재 구현 상태 분석 (Implementation Status)

> Last updated: 2026-02-19

---

## 현재 존재하는 것 vs 아직 없는 것

### 1. File Management — "fetch, prepare, archive"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **Fetch** | `prostate_cancer_R01_raw_transcripts_Ella/`에서 `SID 33 (8).csv` 가져오기 | 수동 (파일이 그냥 놓여있음) |
| **Prepare** | TurboScribe 형식 (`start,end,text,Speaker 1`) → NLP 입력 형식 (`speaker,text,Interviewer`) 변환 | **자동화 코드 없음** |
| **Archive** | 처리 완료 파일을 `processed/`로 이동 | **없음** |

`process-data-guille.R`이 부분적으로 prepare를 하지만, 이 스크립트는 이미 변환된 `processed_transcripts_sid-01.xlsx`를 입력으로 받습니다. **TurboScribe CSV → 이 xlsx로 변환하는 코드가 없습니다.**

> **⚠️ 중요 — 미확인 사항 (Critical Unknown)**
>
> TurboScribe CSV (`SID 33 (8).csv`, 컬럼: `start,end,text,Speaker 1`) →
> NLP 입력 xlsx (`processed_transcripts_sid-01.xlsx`, 컬럼: `speaker,text`) 변환 과정이
> **현재 어떻게 수행되는지 확인되지 않았습니다.**
>
> - **수동 작업인가?** — 누군가 Excel에서 직접 컬럼을 정리하고, Speaker를 `Interviewer`/`Patient`로 매핑하는가?
> - **별도 스크립트가 존재하는가?** — 이 레포 외부에 변환 스크립트가 있는가?
> - **변환 규칙이 문서화되어 있는가?** — `Speaker 1` → `Interviewer` 매핑 기준은 무엇인가?
>
> **이 변환 과정의 확인 및 자동화는 아직 미완성 상태입니다.**
> 이 부분이 해결되지 않으면, 새로운 환자 녹취록이 들어올 때마다 누군가가 수동으로 파일을 변환해야 하며, 이는 재현성과 확장성을 심각하게 저해합니다.

---

### 2. Process Manager — "calls the AI modules one by one, Michael's for now"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **AI 호출** | Backend의 `nlp_service.py` → `nlp-classifiers:8000/predict/{model}` | **✅ 구현 완료** |
| **5모델 순차 호출** | `routes_nlp.py`의 `/predict/all` 엔드포인트 | **✅ 구현 완료** |
| **전처리 (Step 1-3)** | `transcript_service.py`: xlsx 읽기 → Interviewer 필터링 → 문장 분리 | **✅ 구현 완료** (R 파이프라인 대체) |
| **NLP 예측 (Step 4)** | `transcript_service.py` → `nlp_service.predict_batch()` → `r01-nlp-classifiers:8000` | **✅ 구현 완료** (5모델 × 배치 호출) |
| **후처리 (Step 5-7)** | `transcript_service.py`: Top N 선별 → Context 생성 → xlsx 출력 | **✅ 구현 완료** (R 파이프라인 대체) |
| **단일 파일 분석** | `routes_transcript.py` → `POST /api/transcript/analyze` | **✅ 구현 완료** |
| **배치 분석** | `routes_transcript.py` → `POST /api/transcript/analyze-batch` | **✅ 구현 완료** |
| **결과 다운로드** | `routes_transcript.py` → `GET /download/{patient_id}`, `GET /download-batch` | **✅ 구현 완료** |

> **✅ Process Manager는 완전히 구현되었습니다.**
>
> `transcript_service.py`가 `process-data-guille.R`의 전체 파이프라인(Step 1~7)을 Python으로 재구현하였으며,
> 결과가 원본 R 파이프라인 출력과 동일함을 검증 완료했습니다 (`.pred_1` 차이 < 0.00005, text/context 동일).
>
> **파이프라인 흐름:**
> ```
> xlsx 업로드 → Step 1: 읽기 → Step 2: Interviewer 필터
>             → Step 3: 문장 분리 → Step 4: 5모델 NLP 예측 (Docker)
>             → Step 5: Top N 선별 → Step 6: Context 생성 (±window, <main>태그)
>             → Step 7: xlsx 출력 (5시트: cp, inc, ed, ius, le)
> ```
>
> **핵심 파일:**
> | 파일 | 역할 |
> |------|------|
> | `transcript_service.py` | 전체 파이프라인 오케스트레이터 (Step 1~7) |
> | `routes_transcript.py` | API 엔드포인트 (단일/배치 분석, 다운로드, 이력 조회, DB 저장) |
> | `nlp_service.py` | NLP Docker 컨테이너 호출 + Redis 캐시 + 재시도 |
>
> **API 파라미터:**
> - `top_n`: 모델별 상위 N개 문장 선택 (0 = 전체, 기본값: 0)
> - `context_window`: 전후 문맥 문장 수 (기본값: 3)

---

### 3. State Manager — "insert and read from the database"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **DB 인프라** | Docker Compose의 PostgreSQL (`prostatecancer-postgres`) | **✅ 구현 완료** |
| **결과 저장 (파일)** | `routes_transcript.py` → `/app/uploads/{patient_id}_predictions.xlsx` | **✅ 구현 완료** (기존 파일 시스템 저장 유지) |
| **결과 저장 (DB)** | `routes_transcript.py` → `_save_to_db()` → `transcript_analysis_log` 테이블 | **✅ 구현 완료** (메타데이터 + JSON 결과 + xlsx 바이너리) |
| **분석 이력 추적** | `GET /api/transcript/history/{patient_id}` → 페이지네이션 조회 | **✅ 구현 완료** |
| **DB fallback 다운로드** | `GET /download/{patient_id}`: 디스크에 파일 없으면 DB에서 서빙 | **✅ 구현 완료** (컨테이너 재시작 복원력) |
| **문장별 예측 저장 (DB)** | `routes_transcript.py` → `_save_to_db()` → `sentence_prediction` 테이블 | **✅ 구현 완료** (문장별·모델별 SQL 쿼리 가능) |
| **예측 쿼리** | `GET /api/transcript/predictions/{patient_id}` → 모델, 점수, 분석 run별 필터 | **✅ 구현 완료** |
| **Legacy backfill** | `_backfill_predictions()`: 기존 분석 run의 `model_results` JSON에서 `sentence_prediction` 행 자동 복원 | **✅ 구현 완료** |

> **✅ State Manager는 완전히 구현되었습니다.**
>
> **2개의 DB 테이블**이 분석 결과를 영구 저장합니다:
>
> **테이블 1: `transcript_analysis_log`** — 분석 run당 1행:
> - 메타데이터 (patient_id, total_sentences, top_n, context_window, source_filename, analyzed_at)
> - JSON 결과 (model_results TEXT — 5모델 전체 점수)
> - xlsx 바이너리 (xlsx_data BYTEA — 다운로드 fallback용)
>
> **테이블 2: `sentence_prediction`** — 문장당·모델당 1행:
> - 부모 분석에 `analysis_id` FK로 연결 (CASCADE 삭제)
> - 컬럼: patient_id, model, sentence_index, utterance_index, sentence_in_utterance, speaker, sentence_text, pred_score, context
> - SQL 수준 필터링/집계 가능 (예: "cp 모델에서 pred_score >= 0.8인 모든 문장")
> - `_save_to_db()`에서 `flush()`로 `analysis_id` 확보 후 bulk insert
> - Legacy backfill: `_backfill_predictions()`가 이 기능 이전에 생성된 분석 run의 `model_results` JSON에서 행을 자동 복원
>
> **설계 결정:**
> - DB 실패 시에도 기존 응답 차단 없음 (`try/except` + `rollback`)
> - 동일 patient_id 재분석 시 새 row 삽입 (upsert 아닌 이력 보존)
> - 다운로드 시 디스크에 파일 없으면 DB에서 서빙 (컨테이너 재시작 복원력)
> - `init_db.py`가 `database_schema.sql`로 신규 배포 시 자동 테이블 생성
>
> **관련 파일:**
> | 파일 | 역할 |
> |------|------|
> | `models.py` | `TranscriptAnalysisLog` + `SentencePrediction` SQLAlchemy 모델 |
> | `database_schema.sql` | DDL: `transcript_analysis_log` + `sentence_prediction` 테이블 + 인덱스 |
> | `routes_transcript.py` | `_save_to_db()` 헬퍼 + DB fallback + `/history` + `/predictions` 엔드포인트 |
> | `patient_doctor_interface_erd.mmd` | ERD 다이어그램에 테이블 반영 |

---

### 4. Main Pipeline — "calling these modules"

| 기능 | 해당하는 부분 | 현재 상태 |
|------|-------------|----------|
| **오케스트레이션** | `run_all.sh` (Docker 시작 + 테스트) | 인프라 실행만, 데이터 처리 파이프라인 아님 |
| **전체 흐름 자동화** | `process-data-guille.R` (한 스크립트에 모두 섞여있음) | 모듈 분리 안 됨 |

---

## Gap 분석 요약

```
                        존재함                    없음
                        ──────                    ────
File Management:                                 ✗ TurboScribe CSV → NLP 입력 변환
                                                 ✗ 파일 자동 검색 (fetch)
                                                 ✗ 처리 후 archive

Process Manager:        ✅ 전체 구현 완료
                        ✓ Backend NLP 호출
                        ✓ 5모델 예측
                        ✓ Top N 선별 + Context
                        ✓ 단일/배치 API

State Manager:          ✅ 전체 구현 완료
                        ✓ PostgreSQL 인프라
                        ✓ NLP 결과 → DB 저장 (transcript_analysis_log)
                        ✓ 문장별 예측 → DB 저장 (sentence_prediction)
                        ✓ 분석 이력 추적 (/history)
                        ✓ 예측 쿼리 (/predictions) + 필터
                        ✓ Legacy backfill (JSON에서 자동 복원)
                        ✓ DB fallback 다운로드

Main Pipeline:                                   ✗ 전체 오케스트레이터
                                                 (Process Manager + State Manager는
                                                  각각 완료, 통합 오케스트레이션 미구현)

Testing:                ✓ test_transcript_pipeline.sh
                        (파이프라인 자동 테스트: 10/10 통과)
```

**결론:** Process Manager(`transcript_service.py` + `routes_transcript.py`)와 State Manager(`transcript_analysis_log` 테이블 + DB 저장/조회/fallback)가 **모두 구현 완료**되었습니다. `process-data-guille.R`의 전체 기능이 Backend API로 이관되었으며, 분석 결과는 파일 시스템과 DB에 이중 저장됩니다. **남은 유일한 주요 gap은 File Management** (TurboScribe CSV → NLP 입력 형식 변환 자동화)입니다.

---

## Backend NLP 호출 구조 (현재 구현)

현재 Backend가 NLP를 호출하는 방식:

```
클라이언트 (curl/Frontend)
    │
    │  POST /api/nlp/predict  +  X-API-Key 헤더
    ▼
Backend (FastAPI - routes_nlp.py)
    │  API Key 검증 → 모델명 검증
    ▼
nlp_service.py
    │  1) Redis 캐시 확인 (key = model + text SHA256)
    │  2) 캐시 miss → NLP 컨테이너 호출 (최대 3회 재시도)
    ▼
nlp-classifiers:8000 (Docker 내부 네트워크)
    │  POST /predict/{model}  →  [{"text": "..."}]
    │  응답: [{".pred_1": 0.87, ".pred_0": 0.13}]
    ▼
Backend가 응답 정규화 → Redis 캐시 저장 (TTL 1시간) → 클라이언트에 반환
```

### NLP 저수준 API — 6개 엔드포인트

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /api/nlp/health` | NLP 서비스 상태 확인 |
| `GET /api/nlp/models` | 5개 모델 목록 |
| `POST /api/nlp/predict` | 단일 문장 + 단일 모델 |
| `POST /api/nlp/predict/batch` | 다중 문장 + 단일 모델 (최대 50개) |
| `POST /api/nlp/predict/all` | 단일 문장 + 전체 5모델 |
| `POST /api/nlp/predict/by-class` | 단일 문장 + 클래스번호(1-5) |

### Transcript Analysis API — 6개 엔드포인트

| 엔드포인트 | 용도 |
|-----------|------|
| `POST /api/transcript/analyze` | 단일 xlsx 파일 → 전체 파이프라인 (Step 1~7) 실행 → 파일 + DB 이중 저장 |
| `POST /api/transcript/analyze-batch` | 다중 xlsx 파일 → 각 파일별 독립 분석 → 파일 + DB 이중 저장 |
| `GET /api/transcript/download/{patient_id}` | 분석 결과 xlsx 다운로드 (디스크 우선, DB fallback) |
| `GET /api/transcript/download-batch` | 다중 patient_id 결과를 zip으로 다운로드 |
| `GET /api/transcript/history/{patient_id}` | 분석 이력 조회 (페이지네이션, DB에서 조회) |
| `GET /api/transcript/predictions/{patient_id}` | 문장별 예측 쿼리 (모델, min_score, top_n, analysis_id별 필터) |

### 핵심 파일 8개

| 파일 | 역할 |
|------|------|
| `routes_nlp.py` | NLP 저수준 API 엔드포인트 정의 + 요청 검증 |
| `routes_transcript.py` | Transcript Analysis API (단일/배치 분석 + 다운로드 + 이력 조회 + DB 저장) |
| `transcript_service.py` | 전체 파이프라인 오케스트레이터 (Step 1~7, R 스크립트 대체) |
| `nlp_service.py` | NLP 컨테이너 HTTP 호출 + 재시도 로직 |
| `redis_client.py` | 캐시 관리 (text SHA256 키, 1시간 TTL) |
| `models.py` | SQLAlchemy 모델 (`TranscriptAnalysisLog` + `SentencePrediction`) |
| `database_schema.sql` | DDL: 모든 테이블 정의 (`transcript_analysis_log` + `sentence_prediction`) |
| `test_transcript_pipeline.sh` | 전체 파이프라인 자동화 테스트 (DB 저장 + fallback 포함, 10/10 통과) |

### 모델 매핑

```
Class 1 → cp  (Cancer Prognosis)
Class 2 → le  (Life Expectancy)
Class 3 → ed  (Erectile Dysfunction)
Class 4 → inc (Incontinence)
Class 5 → ius (Irritative Urinary Symptoms)
```

---

## 파일 Input/Output 관계

### 1. Raw Input (Ella의 원본 녹취록)

**`prostate_cancer_R01_raw_transcripts_Ella/SID 33 (8).csv`**

- TurboScribe에서 생성된 원본 상담 녹음 CSV
- 컬럼: `start`, `end`, `text`, `speaker`
- Speaker: `Speaker 1`, `Speaker 2` (역할 구분 없음)
- 타임스탬프 포함 (밀리초)

### 2. 전처리된 Input (Michael의 NLP 입력 형식)

**`prediction_pipeline_and_results/processed_transcripts_sid-01.xlsx`**

- 컬럼: `speaker`, `text` (2개만)
- Speaker: `Interviewer`, `Patient` (역할 명시됨)
- 타임스탬프 제거됨
- 192행

### 3. R 파이프라인 (`process-data-guille.R`)

```
입력: processed_transcripts_sid-01.xlsx
  │
  ├─ Interviewer 문장만 필터링
  ├─ 문장 단위로 분리 (unnest_tokens)
  ├─ 5개 NLP 모델 예측 (cp, le, ed, inc, ius)
  ├─ 모델별 Top 5 문장 선별
  ├─ 전후 3문장 Context 생성 (<main>태그)
  │
  출력: original-study-physician-predictions-top-context.xlsx
```

### 4. 최종 Output

**`prediction_pipeline_and_results/original-study-physician-predictions-top-context.xlsx`**

- 5개 시트: `cp`, `inc`, `ed`, `ius`, `le`
- 각 시트 컬럼: `name`, `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- `.pred_1`: 모델 예측 확률 (0~1)
- `context`: 전후 문맥과 함께 `<main>...</main>` 태그로 대상 문장 표시

### 5. Ground Truth (수동 채점)

**`manual_scoring_ground_truth/nlp-pilot-manual-scores(cp).csv`**

- 컬럼: `file`, `i`, `i2`, `speaker`, `sentences`, `score`
- 사람이 수동으로 매긴 점수 (`score`: 0 또는 1)
- 현재 `cp` (Cancer Prognosis) 모델 하나만 있음

### 데이터 흐름 요약

```
Ella (TurboScribe)          Michael (NLP)              Ground Truth
─────────────────          ──────────────              ────────────
SID 33 (8).csv     ──→    processed_transcripts       manual_scores(cp).csv
[start,end,text,        _sid-01.xlsx               [file,i,i2,speaker,
 speaker]               [speaker, text]              sentences, score]
      ⚠️ 변환 자동화 없음       │                            │
                    ┌─────────┼─────────┐                  │
                    ▼                   ▼                   ▼
           [R 경로 — 레거시]     [Backend 경로 — 현재]     모델 성능 검증용
           process-data-        POST /api/transcript/
           guille.R             analyze (또는 analyze-batch)
                    │                   │
                    ▼                   ├──→ 파일 시스템: /app/uploads/
                    │                   │    {patient_id}_predictions.xlsx
                    │                   │
                    │                   └──→ PostgreSQL DB:
                    │                        transcript_analysis_log
                    │                        (메타데이터 + JSON + xlsx BYTEA)
                    │                        │
                    ▼                        ▼
           original-study-      GET /download/{patient_id}
           physician-             (디스크 우선, DB fallback)
           predictions-         GET /history/{patient_id}
           top-context.xlsx       (분석 이력 페이지네이션 조회)
           [5시트: cp,inc,
            ed,ius,le]
```

> **R 경로와 Backend 경로의 출력이 동일함을 검증 완료** (`.pred_1` 차이 < 0.00005, text/indices/context 동일).
> 향후 새로운 transcript 분석은 Backend API를 사용하면 됩니다.

**현재 빠져있는 부분:** Ella의 TurboScribe CSV (`SID 33 (8).csv`) → Michael의 입력 형식 (`processed_transcripts_sid-01.xlsx`)으로 변환하는 자동화 코드가 아직 없습니다. 이것이 바로 Pipeline Architecture의 **File Management** 모듈이 해야 할 일입니다.

---

## 관련 문서

- [ML_PIPELINE_ARCHITECTURE_KR.md](./ML_PIPELINE_ARCHITECTURE_KR.md) / [EN](./ML_PIPELINE_ARCHITECTURE_EN.md) — ML 파이프라인 아키텍처 설계 문서
- [ML_PIPELINE_OVERVIEW_KR.md](./ML_PIPELINE_OVERVIEW_KR.md) / [EN](./ML_PIPELINE_OVERVIEW_EN.md) — 데이터 파일 간 관계 및 Stage별 상세 설명
- [COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md) / [EN](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_EN.md) — R 스크립트와 Docker 이미지 비교 + Backend 구현 계획
