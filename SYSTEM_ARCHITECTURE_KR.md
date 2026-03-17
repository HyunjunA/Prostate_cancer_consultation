# 전립선암 상담 대시보드 — 통합 시스템 아키텍처

> **버전:** 2.0
> **날짜:** 2026-03-16
> **범위:** AI_physician_patient_communication + Dashboard Backend + Dashboard Webapp
> **대상:** 개발자, 연구자, 리뷰어

---

## 1. 시스템 개요

본 시스템은 의사-환자 상담 전사본(transcript)을 NLP 모델로 분석하고, 5개 임상 커뮤니케이션 영역에 대한 의사소통 품질을 점수화하며, 의사 및 환자 대시보드를 통해 결과를 제공합니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          임상 데이터 수집 (INGESTION)                         │
│                                                                             │
│   진료 녹음 → TurboScribe / Keystroke 전사 → 비식별화(De-ID) → xlsx/csv     │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
  ┌──────────────────────────┐   ┌──────────────────────────────────────────┐
  │   CLI 파이프라인           │   │   대시보드 플랫폼                         │
  │   (독립 실행 분석 도구)     │   │   (웹 애플리케이션)                       │
  │                           │   │                                          │
  │   AI_physician_patient_   │   │   Backend ──→ Webapp                     │
  │   communication/          │   │   (FastAPI)    (Next.js)                 │
  └──────────────────────────┘   └──────────────────────────────────────────┘
                    │                              │
                    └──────────┬───────────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │   r01-nlp-classifiers    │
                  │   (NLP Docker × 3)       │
                  │   5개 Random Forest 모델  │
                  └──────────────────────────┘
```

---

## 2. 두 개의 파이프라인

시스템에는 동일한 NLP Docker 서비스를 공유하는 **두 개의 독립적인 파이프라인**이 있습니다.

### 2.1 비교

```
┌────────────────────────────┬──────────────────────────────────────────────┐
│  CLI 파이프라인              │  Backend 파이프라인                           │
│  (AI_physician_patient_    │  (Prostate_cancer_consultation_dashboard/    │
│   communication/)          │   app/Backend/)                              │
├────────────────────────────┼──────────────────────────────────────────────┤
│  형태: CLI                  │  형태: REST API                              │
│  (python main_pipeline.py) │  (POST /api/transcript/analyze)              │
│                            │                                              │
│  문장 분할: R stringi       │  문장 분할: regex 토크나이저                   │
│  via rpy2 (50/50 일치)     │                                              │
│                            │                                              │
│  출력: 파일만                │  출력: DB (transcript_analysis_log +          │
│  (data/output/)            │  sentence_prediction) + 파일 (uploads/)      │
│                            │                                              │
│  단계: 1-5 완료,            │  단계: 1-7 완료 (Backend 변형)                │
│        6-10 TODO (AI)      │                                              │
│                            │                                              │
│  용도: 연구, 배치 분석,      │  용도: 대시보드 실시간 연동                    │
│  Ground Truth 검증          │                                              │
└────────────────────────────┴──────────────────────────────────────────────┘
```

### 2.2 공유 NLP 서비스

두 파이프라인 모두 동일한 Docker 컨테이너를 호출하여 문장을 분류합니다:

```
                    ┌─────────────────────────────────┐
                    │    r01-nlp-classifiers:latest    │
                    │    (R + plumber, 3개 복제본)      │
                    │    메모리: 각 2GB                  │
                    ├─────────────────────────────────┤
                    │  POST /predict/{model}           │
                    │                                  │
                    │  모델:                            │
                    │    cp  — 암 예후 (Cancer Prog.)   │
                    │    le  — 기대수명 (Life Expect.)  │
                    │    ed  — 발기부전 (Erectile Dys.) │
                    │    inc — 요실금 (Incontinence)    │
                    │    ius — 배뇨자극증상 (Irr. Uri.) │
                    │                                  │
                    │  입력:  [{"text": "..."}]         │
                    │  출력: [{".pred_1": 0.95}]        │
                    │                                  │
                    │  GET /ping → "online"            │
                    └─────────────────────────────────┘
```

---

## 3. CLI 파이프라인 아키텍처 (AI_physician_patient_communication)

```
  입력: xlsx/csv (data/input/)
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  main_pipeline.py (CLI 오케스트레이터)                            │
│                                                                 │
│  ┌───────────┐  ┌──────────────┐  ┌────────────────┐          │
│  │  Step 1   │→│   Step 2     │→│    Step 3      │          │
│  │  전처리    │  │  문장 분할    │  │  분류           │          │
│  │           │  │              │  │                │          │
│  │ 의사 식별  │  │ R stringi   │  │ NLP Docker    │          │
│  │ + 필터링  │  │ via rpy2    │  │ (5개 모델)     │          │
│  └───────────┘  └──────────────┘  └───────┬────────┘          │
│                                            │                   │
│  ┌───────────┐  ┌──────────────┐          │                   │
│  │  Step 5   │←│   Step 4     │←─────────┘                   │
│  │  맥락 추출 │  │  문장 선택    │                               │
│  │           │  │              │                               │
│  │ ±3 윈도우  │  │ 도메인별     │                               │
│  │ <main>태그 │  │ Top-K 선택   │                               │
│  └─────┬─────┘  └──────────────┘                               │
│        │                                                        │
│        ▼                                                        │
│  data/output/{file}/final/ (5개 csv 파일)                       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Steps 6-10 (TODO — AI 하위 파이프라인)                   │   │
│  │                                                         │   │
│  │  Step 6: AI 점수화      Step 8: AI 대표문장 선택         │   │
│  │  Step 7: AI 핵심 추출   Step 9: AI 환자용 변환           │   │
│  │                         Step 10: DB 저장                │   │
│  │                                                         │   │
│  │  출력: 4개 DataFrame (physician, rewrite,               │   │
│  │        patient, patient_scoring)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**단계별 상세:**

| 단계 | 모듈 | 알고리즘 | 주요 파라미터 |
|------|------|---------|-------------|
| **Step 1** | `preprocessing.py` | 전체 텍스트 길이가 가장 긴 화자 = 의사로 자동 식별. 빈 값(`""`, `nan`, `None`) 필터링 후 의사 발화만 추출 | 하드코딩된 ID 없음 (텍스트 길이 기반 동적 식별) |
| **Step 2** | `segmentation.py` | R `stringi::stri_split_boundaries(text, type="sentence")` via `rpy2` 호출. NLP 모델 학습 시 사용된 것과 동일한 토크나이저. 소문자 변환 적용 | NLTK 폴백 없음 (rpy2 필수). 3단계 인덱싱: `index`(전역), `i`(발화번호), `i2`(발화 내 문장번호), 모두 1-based |
| **Step 3** | `classification.py` | 5개 모델에 대해 전체 문장을 일괄 전송. `POST /predict/{model}` | 타임아웃: **30초**, 재시도: **3회** (지수 백오프 1초→2초) |
| **Step 4** | `selection.py` | `.pred_1` 점수 내림차순 정렬 후 상위 K개 선택. 동점 시 `index/i/i2` 오름차순(안정 정렬). **동점 포함** — N번째 위치 점수와 같은 문장 모두 포함 (R `slice_max` 방식) | **K = 10** (기본값). K=0이면 전체 문장 (정렬만) |
| **Step 5** | `context.py` | 대상 문장 전후 ±W개 문장 추출. 대상 문장을 `<main>{text}</main>` 태그로 감싼 뒤 `"."` 구분자로 결합 | **윈도우 크기 = ±3** (기본값) |

**출력 포맷:**

```
data/output/{filename}/
├── step2_segmentation/segmented_sentences.csv
├── step3_classification/predictions_long.csv
├── step4_selection/top10_by_outcome.xlsx    (5개 시트)
├── step5_context/top10_with_context.xlsx    (5개 시트)
└── final/
    ├── cp.csv    (Cancer Prognosis)
    ├── inc.csv   (Incontinence)
    ├── ed.csv    (Erectile Dysfunction)
    ├── ius.csv   (Irritative Urinary Symptoms)
    └── le.csv    (Life Expectancy)

최종 CSV 컬럼 (7개):
  index, i, i2, speaker, text, .pred_1, context
```

**Excel 시트 순서:** `cp` → `inc` → `ed` → `ius` → `le`

**설정 파일 (`config.yaml`) 전체:**

```yaml
input_path: ./data/input          # 입력 파일 경로
output_path: ./data/output        # 출력 결과 경로
archive_path: ./data/archive      # 처리 완료 파일 이동 경로
error_path: ./data/error          # 실패 파일 이동 경로
text_column_name: text            # 텍스트 컬럼명
speaker_column_name: speaker      # 화자 컬럼명
sid_column_name: ""               # SID 컬럼명 (비어있으면 파일명에서 추출)
file_patterns: ["*.xlsx", "*.csv"] # 입력 파일 패턴
poll_interval_sec: 5              # 폴더 감시 간격 (초)
model_uri: "http://nlp-classifiers:8000"  # NLP Docker URL
outcomes: ["cp", "le", "ed", "inc", "ius"] # 분류 대상 도메인
top_k: 10                         # 도메인별 선택할 상위 문장 수
context_window: 3                 # 맥락 윈도우 크기 (±)
```

**주요 파일:**

| 파일 | 역할 |
|------|------|
| `main_pipeline.py` | CLI 진입점 (단건 파일 / 폴더 감시 모드) |
| `config.yaml` | 14개 설정 키 |
| `config.py` | 설정 로더 + 상수 정의 (MODEL_TO_FULL, SHEET_ORDER 등) |
| `sentence_classification/preprocessing.py` | Step 1: 의사 식별 + 필터링 |
| `sentence_classification/segmentation.py` | Step 2: R stringi 문장 토크나이제이션 |
| `sentence_classification/classification.py` | Step 3: NLP Docker API 호출 |
| `sentence_classification/selection.py` | Step 4: Top-K 문장 선택 |
| `sentence_classification/context.py` | Step 5: 맥락 윈도우 추출 |
| `sentence_classification/export.py` | 중간/최종 파일 내보내기 |
| `utils/file_manager.py` | 파일 감시, archive/error 이동, 환자ID 추출 |

**의존성:** `pandas`, `openpyxl`, `httpx`, `rpy2`, `pyyaml`

---

## 4. 대시보드 플랫폼 아키텍처

### 4.1 Docker Compose 서비스

```
                         localhost:3000
                              │
                    ┌─────────▼──────────┐
                    │      Nginx         │
                    │   (리버스 프록시)    │
                    │   nginx:alpine     │
                    └────┬──────────┬────┘
                         │          │
              /api/*     │          │     /*
                         ▼          ▼
               ┌──────────┐  ┌──────────┐
               │ Backend  │  │ Webapp   │
               │ FastAPI  │  │ Next.js  │
               │ :8000    │  │ :3000    │
               └──┬───┬───┘  └──────────┘
                  │   │
         ┌────────┘   └────────┐
         ▼                     ▼
  ┌────────────┐     ┌──────────────┐     ┌──────────────────┐
  │ PostgreSQL │     │    Redis     │     │ nlp-classifiers  │
  │   :5432    │     │   :6379     │     │    :8000 (×3)    │
  │ (13)       │     │   (7)       │     │  (R + plumber)   │
  └────────────┘     └──────────────┘     └──────────────────┘

  네트워크: prostatecancer-network (bridge)
  모든 포트는 127.0.0.1에 바인딩 (localhost 전용)
```

### 4.2 서비스 상세

| 서비스 | 이미지 | 포트 | 헬스체크 | 역할 |
|--------|--------|------|---------|------|
| **nginx** | nginx:alpine | 127.0.0.1:3000→80 | curl /nginx-health | 리버스 프록시, `/api/*` → backend, `/*` → webapp |
| **backend** | Dockerfile (Python 3.10) | 127.0.0.1:8000 | curl /health | FastAPI 앱, 모든 비즈니스 로직 |
| **webapp** | Dockerfile (Node 18) | 내부:3000 | wget :3000 | Next.js 프론트엔드 |
| **postgres** | postgres:13 | 내부:5432 | pg_isready | 기본 데이터베이스 |
| **redis** | redis:7 | 내부:6379 | redis-cli PING | 캐시 + 속도 제한 |
| **nlp-classifiers** | r01-nlp-classifiers | 내부:8000 | Rscript health | 5개 NLP 모델 (×3 복제본, 각 2GB) |

### 4.3 시작 순서

```
  postgres ─────► (healthy)
  redis ─────────► (healthy)     ──► backend ─► (healthy) ──► webapp ──► nginx
  nlp-classifiers ► (healthy)
                    (90초 대기)
```

---

## 5. Backend 아키텍처 (FastAPI)

### 5.1 API 라우트 구조

```
  /api/
  ├── /health                          GET   헬스체크
  │
  ├── /doctor/                         의사 대시보드 엔드포인트
  │   ├── /files                       GET   환자 파일 목록
  │   ├── /sentences                   GET   점수화된 문장
  │   ├── /scores/average              GET   도메인별 마지막 문장 점수
  │   ├── /scores/summary              GET   클래스별 점수 요약
  │   ├── /scores/distribution         GET   클래스 분포
  │   ├── /score-sentence              POST  단일 문장 점수화 (NLP)
  │   ├── /ai-rewrite                  POST  AI 재작성 생성
  │   └── /rewrites                    PUT   재작성 저장
  │
  ├── /patient/                        환자 대시보드 엔드포인트
  │   ├── /files                       GET   환자 파일
  │   ├── /summaries                   GET   클래스별 AI 요약
  │   ├── /summaries/:file/:speaker    GET   상세 요약
  │   ├── /scoring                     GET/PUT  환자 점수
  │   └── /responses                   GET/PUT  환자 응답
  │
  ├── /surveys/                        설문 & REDCap 엔드포인트
  │   └── /submit                      POST  설문 제출 (→ REDCap 동기화)
  │
  ├── /transcript/                     전사본 분석 (ML 파이프라인)
  │   ├── /analyze                     POST  단건 파일 분석
  │   ├── /analyze-batch               POST  배치 파일 분석
  │   ├── /download/:patient_id        GET   xlsx 다운로드 (디스크 → DB 폴백)
  │   ├── /download-batch              GET   ZIP 다운로드 (복수 환자)
  │   ├── /history/:patient_id         GET   분석 이력 (페이지네이션)
  │   └── /predictions/:patient_id     GET   문장 단위 예측 결과
  │
  └── /nlp/                            NLP 분류기 프록시
      ├── /predict                     POST  단일 문장 → 하나의 모델
      ├── /predict-batch               POST  복수 문장 → 하나의 모델
      ├── /predict-all-models          POST  하나의 문장 → 전체 5개 모델
      ├── /predict-by-class            POST  클래스 번호로 예측
      └── /health                      GET   NLP 서비스 상태
```

### 5.2 Backend 파이프라인 상세 (transcript_service.py)

Backend에 내장된 파이프라인은 CLI 파이프라인과 유사하지만 차이가 있습니다:

**의사 식별 방식 (CLI vs Backend):**

```
CLI 파이프라인:  텍스트 길이 기반 동적 식별 (하드코딩 없음)
Backend:        화자 ID 목록 하드코딩 (8개):
                 "INTERVIEWER", "INTERVIEWER 1", "INTERVIEWER 2",
                 "Interviewer", "Q", "Q1", "Q2", "Q:"
```

**파이프라인 파라미터:**

| 파라미터 | CLI 파이프라인 | Backend 파이프라인 |
|---------|--------------|-------------------|
| 문장 분할 | R `stringi` via `rpy2` | 정규식 `(?<=[.!?])\s+` |
| Top-N 기본값 | **10** | **0** (전체 문장, API에서 0~1000 지정 가능) |
| 맥락 윈도우 | **±3** | **±3** (API에서 0~10 지정 가능) |
| NLP 배치 크기 | 전체 일괄 전송 | **50문장씩** 분할 전송 |
| 타임아웃 | 30초 | 30초 (환경변수 `NLP_TIMEOUT`) |
| 재시도 | 3회 | 3회 (환경변수 `NLP_RETRIES`) |
| 결과 캐시 | 없음 | Redis **1시간** TTL (`NLP_CACHE_TTL=3600`) |
| 출력 | 파일만 (csv/xlsx) | DB + 파일 (xlsx) |

**NLP 서비스 (nlp_service.py) 상세:**

```
HTTP 커넥션 풀:
  max_connections: 20
  max_keepalive_connections: 10

캐시 키 형식: "nlp:{model}:{SHA256(payload)[:32]}"

재시도 백오프: 2^attempt 초 (1초 → 2초)
```

**클래스 번호 ↔ 모델 매핑:**

```
  클래스 1 ↔ cp  (Cancer Prognosis)
  클래스 2 ↔ le  (Life Expectancy)
  클래스 3 ↔ ed  (Erectile Dysfunction)
  클래스 4 ↔ inc (Incontinence)
  클래스 5 ↔ ius (Irritative Urinary Symptoms)
```

**마지막 문장 점수 조회 (scores/average API):**

```sql
-- 1단계: 파일/화자/클래스별 마지막 발화 번호 (max i)
-- 2단계: 해당 발화 내 마지막 문장 번호 (max i2)
-- 3단계: 해당 문장의 실제 점수를 반환
-- → 평균이 아닌 "마지막 문장 점수"를 사용
```

### 5.3 주요 Backend 파일

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `main.py` | ~3,500 | FastAPI 앱 정의, 미들웨어, CORS |
| `routes_surveys.py` | ~2,500 | 의사/환자/설문/REDCap 엔드포인트 |
| `routes_transcript.py` | ~800 | 전사본 분석 API |
| `routes_nlp.py` | ~240 | NLP 분류기 프록시 |
| `transcript_service.py` | ~80 | 7단계 파이프라인 로직 |
| `nlp_service.py` | ~80 | NLP Docker HTTP 클라이언트 (httpx, 재시도, 캐시) |
| `models.py` | ~410 | SQLAlchemy 모델 + Pydantic 스키마 |
| `db.py` | ~44 | 데이터베이스 엔진, 세션 팩토리, 커넥션 풀링 |
| `auth/` | 12개 파일 | 모듈형 인증 (api_key, multi_key, jwt, oauth2) |

### 5.3 인증 체계

```
  .env: AUTH_MODE = api_key | multi_key | jwt | oauth2
                       │
            ┌──────────┼──────────┬──────────┐
            ▼          ▼          ▼          ▼
       ┌─────────┐ ┌────────┐ ┌──────┐ ┌────────┐
       │ API Key │ │ Multi  │ │ JWT  │ │ OAuth2 │
       │ (정적)  │ │ Key    │ │      │ │        │
       │ X-API-  │ │(사용자 │ │Bearer│ │외부 IdP│
       │ Key 헤더│ │ 별)    │ │토큰  │ │        │
       └─────────┘ └────────┘ └──────┘ └────────┘

  접근 제어:
    auth_user (역할: admin|user|readonly)
      └── auth_api_key (사용자별, 키 순환 지원)
      └── patient_access (환자별 read|write|admin)
```

---

## 6. 데이터베이스 스키마

### 6.1 엔티티 관계 다이어그램

```
  ┌─────────────────────────┐        ┌─────────────────────────────┐
  │   doctor_sentence_view  │        │  transcript_analysis_log    │
  │─────────────────────────│        │─────────────────────────────│
  │ PK: file, i, i2        │        │ PK: id (SERIAL)             │
  │    speaker              │        │    patient_id               │
  │    class_               │        │    total_sentences          │
  │    sentence             │        │    model_results (JSON)     │
  │    score                │        │    xlsx_data (BYTEA)        │
  │    context              │        │    analyzed_at              │
  └────────┬────────────────┘        └────────────┬────────────────┘
           │ FK (file, i, i2)                     │ FK (analysis_id)
           ▼                                      ▼
  ┌─────────────────────────┐        ┌─────────────────────────────┐
  │   doctor_rewrite_log    │        │    sentence_prediction      │
  │─────────────────────────│        │─────────────────────────────│
  │ PK: file, i, i2, time  │        │ PK: id (SERIAL)             │
  │    original_sentence    │        │    analysis_id (FK)         │
  │    rewritten_sentence   │        │    patient_id, model        │
  │    original_score       │        │    sentence_text            │
  │    rewritten_score      │        │    pred_score, context      │
  └─────────────────────────┘        └─────────────────────────────┘


  ┌─────────────────────────┐
  │    patient_summary      │
  │─────────────────────────│
  │ PK: file, speaker       │
  │    class_ (1~5)         │
  │    summary_text         │
  └────────┬────────────────┘
           │ FK (file, speaker)
           ├──────────────────────────┐──────────────────────┐
           ▼                          ▼                      ▼
  ┌──────────────────┐  ┌──────────────────────┐  ┌───────────────────────┐
  │ patient_summary_ │  │  patient_responses   │  │ survey_submission_log │
  │ scoring          │  │──────────────────────│  │───────────────────────│
  │──────────────────│  │ PK: file, speaker    │  │ PK: id (SERIAL)       │
  │ PK: file, speaker│  │    question_id       │  │    file, speaker      │
  │    score (0-10)  │  │    response_text     │  │    survey_type        │
  │    클래스별       │  └──────────────────────┘  │    answers (JSON)     │
  └──────────────────┘                             │    redcap_synced      │
                                                   └───────────────────────┘

  ┌─────────────────────────┐
  │      auth_user          │
  │─────────────────────────│
  │ PK: id (SERIAL)         │
  │    username, role        │
  │    is_superuser          │
  └────────┬────────────────┘
           ├─────────────────────┐
           ▼                     ▼
  ┌──────────────────┐  ┌──────────────────────┐
  │  auth_api_key    │  │   patient_access     │
  │──────────────────│  │──────────────────────│
  │ PK: id           │  │ PK: id               │
  │    user_id (FK)  │  │    user_id (FK)      │
  │    key_hash      │  │    patient_id        │
  │    expires_at    │  │    access_type       │
  └──────────────────┘  └──────────────────────┘
```

### 6.2 주요 테이블 컬럼 상세

**doctor_sentence_view** (의사 대시보드 핵심 테이블):

```
  PK: (file, i, i2) — 파일 + 발화번호 + 발화 내 문장번호
  ┌───────────┬────────────┬──────────────────────────────┐
  │ 컬럼       │ 타입        │ 설명                          │
  ├───────────┼────────────┼──────────────────────────────┤
  │ file      │ VARCHAR    │ 환자/파일 식별자                │
  │ i         │ INT        │ 원본 발화 행 번호 (1-based)     │
  │ i2        │ INT        │ 발화 내 문장 위치 (1-based)     │
  │ speaker   │ VARCHAR    │ 화자 라벨                      │
  │ class_    │ VARCHAR    │ 도메인 (1~5, -1=해당없음)       │
  │ sentence  │ TEXT       │ 소문자 변환된 문장 텍스트        │
  │ score     │ FLOAT      │ NLP 예측 점수 (0.0~1.0)        │
  │ context   │ TEXT       │ ±3 맥락 (<main>태그 포함)       │
  │ time      │ TIMESTAMP  │ 레코드 시간                    │
  └───────────┴────────────┴──────────────────────────────┘
```

**sentence_prediction** (ML 파이프라인 결과):

```
  PK: id (SERIAL)
  FK: analysis_id → transcript_analysis_log
  ┌──────────────────────┬────────────┬──────────────────────────┐
  │ 컬럼                  │ 타입        │ 설명                      │
  ├──────────────────────┼────────────┼──────────────────────────┤
  │ analysis_id          │ INT (FK)   │ 분석 실행 ID               │
  │ patient_id           │ VARCHAR    │ 환자 ID                   │
  │ model                │ VARCHAR(10)│ 모델명 (cp,le,ed,inc,ius) │
  │ sentence_index       │ INT        │ 전역 문장 번호 (1-based)   │
  │ utterance_index      │ INT        │ 원본 발화 번호             │
  │ sentence_in_utterance│ INT        │ 발화 내 문장 위치          │
  │ speaker              │ VARCHAR    │ 화자                      │
  │ sentence_text        │ TEXT       │ 문장 텍스트               │
  │ pred_score           │ FLOAT      │ 예측 점수 (0.0~1.0)       │
  │ context              │ TEXT       │ 맥락 텍스트               │
  └──────────────────────┴────────────┴──────────────────────────┘
  인덱스: analysis_id, (patient_id, model), pred_score DESC
```

**transcript_analysis_log** (분석 이력):

```
  PK: id (SERIAL)
  ┌──────────────────┬──────────────┬──────────────────────────────┐
  │ 컬럼              │ 타입          │ 설명                          │
  ├──────────────────┼──────────────┼──────────────────────────────┤
  │ patient_id       │ VARCHAR(255) │ 환자 ID (NOT NULL)            │
  │ total_sentences  │ INT          │ 총 문장 수 (기본값 0)          │
  │ top_n            │ INT          │ 선택된 Top-N (기본값 0)        │
  │ context_window   │ INT          │ 맥락 윈도우 크기 (기본값 3)     │
  │ model_results    │ TEXT         │ 모델별 결과 (JSON)             │
  │ xlsx_data        │ BYTEA        │ 결과 xlsx 바이너리             │
  │ source_filename  │ VARCHAR(500) │ 원본 파일명                    │
  │ analyzed_at      │ TIMESTAMPTZ  │ 분석 시각 (기본값 NOW())       │
  └──────────────────┴──────────────┴──────────────────────────────┘
```

**patient_summary_scoring** (환자 자가 평가):

```
  PK: (file, speaker)
  FK: → patient_summary
  ┌──────────────────────────┬──────┬────────────────────────────┐
  │ 컬럼                      │ 타입  │ 제약조건                    │
  ├──────────────────────────┼──────┼────────────────────────────┤
  │ class_1_patient_scoring  │ INT  │ CHECK (0 ≤ 값 ≤ 10)       │
  │ class_2_patient_scoring  │ INT  │ CHECK (0 ≤ 값 ≤ 10)       │
  │ class_3_patient_scoring  │ INT  │ CHECK (0 ≤ 값 ≤ 10)       │
  │ class_4_patient_scoring  │ INT  │ CHECK (0 ≤ 값 ≤ 10)       │
  │ class_5_patient_scoring  │ INT  │ CHECK (0 ≤ 값 ≤ 10)       │
  └──────────────────────────┴──────┴────────────────────────────┘
```

### 6.3 테이블 그룹

| 그룹 | 테이블 | 역할 |
|------|--------|------|
| **의사 인터페이스** | `doctor_sentence_view`, `doctor_rewrite_log` | NLP 점수화 문장 + 재작성 이력 |
| **환자 인터페이스** | `patient_summary`, `patient_summary_scoring`, `patient_responses` | AI 요약 + 환자 평가 + Q&A |
| **설문** | `survey_submission_log` | 설문 답변 + REDCap 동기화 상태 |
| **ML 파이프라인** | `transcript_analysis_log`, `sentence_prediction` | 파이프라인 결과 + 문장별 점수 |
| **인증** | `auth_user`, `auth_api_key`, `patient_access` | 사용자, API 키, 환자 수준 RBAC |

---

## 7. Webapp 아키텍처 (Next.js)

### 7.1 뷰 라우팅

```
  URL: localhost:3000
    │
    ├── ?doctorid=X&fileid=Y
    │   └──► PhysicianReportsModifiedV41Timothy
    │        (의사 대시보드)
    │
    ├── ?patid=X&fileid=Y&visit=first
    │   └──► PatientInitialVisitReportV33
    │        (환자 초진 — 요약만)
    │
    ├── ?patid=X&fileid=Y&visit=followup
    │   └──► PatientFollowUpReportV31Re
    │        (환자 재진 — 설문 포함)
    │
    └── (파라미터 없음)
        └──► 선택 화면
```

### 7.2 컴포넌트 & 데이터 흐름

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  page.tsx (메인 진입점)                                          │
  │  URL 파라미터 → 뷰 라우팅                                        │
  └──────┬──────────────────────────┬───────────────────────────────┘
         │                          │
         ▼                          ▼
  ┌──────────────────┐     ┌──────────────────────────┐
  │  의사 뷰          │     │  환자 뷰                  │
  │  (V41Timothy)    │     │  (V33 / V31Re)            │
  └──────┬───────────┘     └──────┬───────────────────┘
         │                        │
         ▼                        ▼
  ┌──────────────────┐     ┌──────────────────────────┐
  │ useDoctorData()  │     │  usePatientData()         │
  │ (커스텀 훅)       │     │  (커스텀 훅)               │
  │                  │     │                           │
  │ 상태:            │     │  상태:                     │
  │  patients        │     │   files, summaries        │
  │  selectedTopic   │     │   scoring, responses      │
  │  scoreSummary    │     │                           │
  │  trajectoryData  │     │  API 호출:                 │
  │                  │     │   GET /api/patient/*       │
  │ API 호출:        │     │   PUT /api/patient/*       │
  │  GET /api/doctor/*│    └──────────────────────────┘
  │  POST /api/doctor/*│
  └──────┬───────────┘
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │  ConsultationScoringV7Timothy7               │
  │  (공유 점수 시각화 컴포넌트)                    │
  │                                              │
  │  기능:                                        │
  │   • 1-5 스케일 바 + 화살표 인디케이터           │
  │   • 점수 말풍선 (중앙 정렬, 마지막 문장)        │
  │   • 호버 툴팁 (루브릭 가이드)                   │
  │   • Re-write Practice (상태 비저장 피드백)      │
  └──────────────────────────────────────────────┘


  Zustand 전역 스토어 (9개):
  ┌───────────┬───────────┬────────────┬──────────────┐
  │ patientId │  fileId   │  doctorId  │  themeStore  │
  ├───────────┼───────────┼────────────┼──────────────┤
  │ filterStr │ circleIdx │ xAxisSel   │ xAxisDragSel │
  ├───────────┴───────────┴────────────┴──────────────┤
  │ windowSizeStore (메모리만, localStorage 미사용)     │
  └───────────────────────────────────────────────────┘
  windowSize 제외 전부 localStorage에 영속
```

### 7.3 주요 의존성

| 카테고리 | 패키지 |
|---------|--------|
| **프레임워크** | Next.js 13.5, React 18, TypeScript 5 |
| **상태 관리** | Zustand 5.0 |
| **스타일링** | Tailwind CSS 3.4, Radix-UI |
| **차트** | D3.js 7.9, Recharts 2.13, Plotly.js 2.35 |
| **분석** | PostHog 1.288 (HIPAA 준수, 수동 이벤트만) |
| **파일 I/O** | xlsx 0.18, PapaParse 5.5, jsPDF 2.5 |
| **아이콘** | Lucide React, Heroicons |

---

## 8. 종단 간 데이터 흐름 (End-to-End)

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  1. 데이터 수집                                                      │
  │                                                                      │
  │  진료 상담 녹음                                                       │
  │       │                                                              │
  │       ▼                                                              │
  │  TurboScribe (csv) 또는 Keystroke Logger (xlsx)                      │
  │       │                                                              │
  │       ▼                                                              │
  │  비식별화된 전사 파일                                                  │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                      ▼
  ┌────────────────────────┐           ┌────────────────────────────────┐
  │  2a. CLI 분석           │           │  2b. API 분석                   │
  │                        │           │                                │
  │  python main_pipeline  │           │  POST /api/transcript/analyze  │
  │  --file transcript.xlsx│           │  (xlsx 업로드)                  │
  │                        │           │                                │
  │  Steps 1→5:            │           │  Steps 1→7:                    │
  │   전처리                │           │   전처리                        │
  │   분할 (R stringi)     │           │   분할 (regex)                  │
  │   분류 (NLP Docker)    │           │   분류 (NLP Docker)             │
  │   Top-K 선택           │           │   Top-N 선택                    │
  │   맥락 윈도우           │           │   맥락 윈도우                    │
  │                        │           │   xlsx 내보내기                  │
  │  출력:                  │           │   DB 저장                       │
  │   data/output/final/   │           │                                │
  │   (5개 csv 파일)       │           │  출력:                          │
  └────────────────────────┘           │   uploads/{id}_predictions.xlsx│
                                       │   transcript_analysis_log (DB) │
                                       │   sentence_prediction (DB)     │
                                       └───────────────┬────────────────┘
                                                       │
                                                       ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │  3. 데이터베이스 적재                                                │
  │                                                                    │
  │  doctor_sentence_view ← 문장별 NLP 점수 (file, i, i2)              │
  │  patient_summary ← AI 생성 클래스별 요약                             │
  └───────────────────────────────┬────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
  ┌──────────────────────────┐   ┌──────────────────────────────────┐
  │  4a. 의사 대시보드        │   │  4b. 환자 대시보드                 │
  │                          │   │                                   │
  │  랜딩 페이지:             │   │  초진:                             │
  │   • 환자 목록 그리드      │   │   • 상담 요약                      │
  │   • 전체 궤적 차트        │   │   • 5개 도메인 예시 문장            │
  │                          │   │   • 주제 드롭다운                   │
  │  상세 뷰:                │   │                                   │
  │   • 마지막 문장 점수      │   │  재진:                             │
  │   • 1-5 스케일 + 화살표  │   │   • 요약 + 점수                    │
  │   • 궤적 차트            │   │   • 설문:                          │
  │   • Re-write Practice   │   │     - SDM (공유의사결정)            │
  │     (상태 비저장 피드백)  │   │     - DCS (의사결정 갈등)          │
  │   • 루브릭 호버 툴팁     │   │     - 위험인식 (Risk Perception)   │
  │                          │   │     - 만족도 (Satisfaction)        │
  │  점수 = 도메인별          │   │                                   │
  │  마지막 문장 (max i,     │   │  설문 → REDCap 동기화              │
  │  then max i2)            │   │                                   │
  └──────────────────────────┘   └──────────────────────────────────┘
```

---

## 9. 5개 NLP 도메인

모든 점수화, 시각화, 분석은 아래 5개 임상 커뮤니케이션 도메인을 중심으로 구성됩니다:

```
  ┌─────┬────────────────────────┬───────────────────────────────────────┐
  │ 약어 │ 전체 이름               │ 측정 내용                              │
  ├─────┼────────────────────────┼───────────────────────────────────────┤
  │ cp  │ Cancer Prognosis       │ 암 병기, 등급, 예후에 대한              │
  │     │ (암 예후)               │ 의사의 설명 품질                        │
  ├─────┼────────────────────────┼───────────────────────────────────────┤
  │ le  │ Life Expectancy        │ 기대수명 및 생존 통계에 대한             │
  │     │ (기대수명)              │ 논의                                   │
  ├─────┼────────────────────────┼───────────────────────────────────────┤
  │ ed  │ Erectile Dysfunction   │ 치료 부작용으로서의 발기부전에            │
  │     │ (발기부전)              │ 대한 논의                               │
  ├─────┼────────────────────────┼───────────────────────────────────────┤
  │ inc │ Incontinence           │ 요실금 위험에 대한 논의                  │
  │     │ (요실금)                │                                        │
  ├─────┼────────────────────────┼───────────────────────────────────────┤
  │ ius │ Irritative Urinary Sx  │ 배뇨자극증상에 대한 논의                 │
  │     │ (배뇨자극증상)          │                                        │
  └─────┴────────────────────────┴───────────────────────────────────────┘

  NLP 모델 출력: .pred_1 (확률 0.0~1.0)
  대시보드 표시: 0~5 정수 스케일 (DB에 저장된 값 그대로 사용)
```

### 9.2 점수 스케일 (0-5)

대시보드에서 사용하는 커뮤니케이션 품질 스케일:

```
  점수 │ 라벨                        │ 의미                              │ 색상
  ─────┼────────────────────────────┼──────────────────────────────────┼──────────
   0   │ No mention                 │ 해당 주제를 전혀 언급하지 않음       │ slate
   1   │ Name Only                  │ 주제 이름만 언급                    │ red
   2   │ Generalization ("High/Low")│ 높다/낮다 수준의 일반적 표현         │ pink
   3   │ Imprecise Quantification   │ 부정확한 수치 ("꽤 많이" 등)        │ yellow
   4   │ Specific Quantification    │ 구체적 수치 ("90%" 등)             │ green
   5   │ Patient-centered Estimate  │ 환자 맞춤형 구체 설명               │ emerald
```

### 9.3 이름 규칙 차이 (모듈별)

```
  ┌──────────┬────────────────────────┬──────────────────────────────┐
  │ 위치      │ 이름 형식               │ 예시                          │
  ├──────────┼────────────────────────┼──────────────────────────────┤
  │ NLP 모델  │ 약어 (2~3자)            │ cp, le, ed, inc, ius         │
  │ Backend  │ 약어 + 클래스 번호       │ "1"↔cp, "2"↔le, ...         │
  │ DB 시트   │ 전체 결과명              │ cancer_prognosis,            │
  │          │                        │ life_expectancy, ...         │
  │ 환자 UI  │ 사용자 친화적 전체 이름   │ Cancer Prognosis,            │
  │          │                        │ Urinary Incontinence, ...    │
  │ 의사 UI  │ 약간 축약된 이름         │ Irritative Symptoms          │
  │          │                        │ (= Irritative Urinary Sx)    │
  └──────────┴────────────────────────┴──────────────────────────────┘
```

### 9.4 환자 평가 점수 (별도)

환자가 대시보드에서 직접 매기는 평가 점수는 NLP 점수와 **별개**입니다:

```
  환자 별점 평가 (Star Rating):
    1점: "Confusing" (혼란스러움)
    2점: "Not helpful" (도움 안 됨)
    3점: "Neutral" (보통)
    4점: "Helpful" (도움됨)
    5점: "Very helpful" (매우 도움됨)

  환자 점수 (patient_summary_scoring):
    범위: 0~10 (정수, DB CHECK 제약조건)
    클래스별 개별 저장 (class_1 ~ class_5)
```

---

## 10. 외부 연동

```
  ┌──────────────────────────────────────────────────────┐
  │  REDCap (Research Data Capture — 연구 데이터 수집)     │
  │                                                      │
  │  대시보드 ──POST /api/surveys/submit──► Backend       │
  │                                            │         │
  │                          survey_submission_log (DB)   │
  │                                            │         │
  │                              ┌─────────────▼───────┐ │
  │                              │ REDCap API 동기화    │ │
  │                              │ (redcap_synced 플래그)│ │
  │                              └─────────────────────┘ │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  PostHog (분석 — HIPAA 준수)                          │
  │                                                      │
  │  Webapp ──커스텀 이벤트──► PostHog Cloud               │
  │                                                      │
  │  이벤트: page_view, component_view, button_click,    │
  │          scroll_depth, time_on_component,            │
  │          cursor_proximity, session_start/end         │
  │                                                      │
  │  개인정보: 자동캡처 OFF, 세션녹화 OFF,                  │
  │           입력 마스킹 ON, .sensitive 클래스 마스킹       │
  └──────────────────────────────────────────────────────┘
```

---

## 11. 보안 아키텍처

```
  ┌───────────────────── 보안 경계 ─────────────────────────────┐
  │                                                              │
  │  인터넷 / 사용자 브라우저                                      │
  │       │                                                      │
  │       ▼                                                      │
  │  ┌─────────────────────────────────────────┐                │
  │  │  Nginx (localhost:3000)                  │                │
  │  │  • 리버스 프록시                          │                │
  │  │  • (TODO) 보안 헤더                       │                │
  │  │  • (TODO) 속도 제한                       │                │
  │  └────────────────┬────────────────────────┘                │
  │                   │                                          │
  │  ┌────────────────▼────────────────────────┐                │
  │  │  Backend (FastAPI)                       │                │
  │  │  • 인증: X-API-Key / JWT / OAuth2       │                │
  │  │  • CORS 화이트리스트                     │                │
  │  │  • 경로 순회(Path Traversal) 방지        │                │
  │  │  • 타이밍 공격 방지 비교                  │                │
  │  │  • (TODO) 속도 제한 미들웨어             │                │
  │  └─────────────────────────────────────────┘                │
  │                                                              │
  │  내부 네트워크 (prostatecancer-network):                      │
  │    PostgreSQL, Redis, NLP — 외부 포트 없음                    │
  │    모든 Docker 포트는 127.0.0.1에 바인딩                      │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  보안 현황 (2026-02-20 기준):
    6건 수정 완료 (타이밍 공격, 기본 키, 포트 노출,
       localhost 바인딩, 경로 순회, .gitignore)
    14건 미해결 (SECURITY_AUDIT_REPORT.md 참조)
```

---

## 12. 디렉토리 구조 (프로젝트 전체)

```
prostate_cancer_project/
│
├── SYSTEM_ARCHITECTURE.md                 ← 영문 버전
├── SYSTEM_ARCHITECTURE_KR.md              ← 본 문서 (한글)
├── README.md / README_KR.md              개요
├── Clinical_AI_Document_Intelligence_*    상위 설계 문서 (v1.2)
│
├── AI_physician_patient_communication/    ─── CLI 파이프라인 ───
│   ├── main_pipeline.py                   진입점
│   ├── config.yaml                        설정
│   ├── sentence_classification/           Steps 1-5 모듈
│   ├── utils/                             파일 관리, 헬퍼
│   ├── tests/                             49개 테스트
│   ├── data/                              input/ output/ archive/ reference/
│   ├── docs/                              아키텍처 문서 (EN/KR)
│   └── meeting_notes/                     요구사항, AI 점수화 계획
│
├── Prostate_cancer_consultation_dashboard/ ─── 대시보드 플랫폼 ───
│   ├── README.md                          프로젝트 개요
│   ├── app/
│   │   ├── Backend/                       ─── FastAPI 백엔드 ───
│   │   │   ├── main.py                    FastAPI 앱
│   │   │   ├── routes_surveys.py          의사/환자/설문 API
│   │   │   ├── routes_transcript.py       전사본 분석 API
│   │   │   ├── routes_nlp.py              NLP 프록시 API
│   │   │   ├── models.py                  SQLAlchemy + Pydantic
│   │   │   ├── auth/                      인증 (4가지 백엔드)
│   │   │   ├── docker-compose.yml         6개 서비스
│   │   │   ├── database_schema.sql        11개 테이블
│   │   │   ├── tests/                     559+ 테스트
│   │   │   └── README_V5.md              개발자 가이드 (27KB)
│   │   │
│   │   ├── Webapp/                        ─── Next.js 프론트엔드 ───
│   │   │   ├── src/app/page.tsx           메인 진입점 (뷰 라우팅)
│   │   │   ├── src/components/            82+ 컴포넌트 (버전별)
│   │   │   ├── src/hooks/                 useDoctorData, usePatientData
│   │   │   ├── src/stores/               9개 Zustand 스토어
│   │   │   ├── src/api/                   API 클라이언트
│   │   │   ├── src/tracking/             PostHog 분석
│   │   │   └── COMPONENT_STATE_MAP.md    컴포넌트 문서
│   │   │
│   │   └── Pipeline/                      Backend 내장 파이프라인
│   │
│   ├── dev_docs/
│   │   ├── ml_pipeline_dev_docs/          12개 파이프라인 문서 (EN/KR)
│   │   └── backend_dev_docs/              Backend 개선 TODO
│   │
│   └── docs/md/                           REDCap, 컴플라이언스 명세
│
├── prostate_cancer_R01_Guille/            Guille의 R 파이프라인 (참조용)
├── prostate_cancer_R01_NLP_classifiers_Michael/  Michael의 NLP 모델
└── prostate_cancer_R01_raw_transcripts_Ella/     원본 전사 데이터
```

---

## 13. 기존 문서 색인

| 문서 | 위치 | 내용 |
|------|------|------|
| **본 문서** | `SYSTEM_ARCHITECTURE_KR.md` | 통합 시스템 아키텍처 (한글) |
| **영문 버전** | `SYSTEM_ARCHITECTURE.md` | 통합 시스템 아키텍처 (영문) |
| **상위 설계** | `Clinical_AI_Document_Intelligence_Platform_Architecture_with_Image_v1.2.md` | 개념 아키텍처 (계층, 역할, 보안 경계) |
| **CLI 파이프라인 아키텍처** | `AI_physician_patient_communication/docs/PIPELINE_ARCHITECTURE_EN.md` | 5단계 파이프라인 + Mermaid 다이어그램 |
| **CLI 파이프라인 단계 상세** | `AI_physician_patient_communication/docs/PIPELINE_STEPS_DETAIL_EN.md` | 알고리즘, 데이터 예시, 검증 |
| **CLI 실행 가이드** | `AI_physician_patient_communication/docs/PIPELINE_EXECUTION_GUIDE_EN.md` | 설치 및 실행 방법 |
| **AI 점수화 계획** | `AI_physician_patient_communication/meeting_notes/MEETING_FEEDBACK_2026-03-05_AI_SCORING_PLAN.md` | Steps 6-10 설계 (superset mock 전략) |
| **Backend 개발자 가이드** | `Prostate_cancer_consultation_dashboard/app/Backend/README_V5.md` | 운영, API, 테스트, 보안 |
| **Backend 보안 감사** | `Prostate_cancer_consultation_dashboard/app/Backend/SECURITY_AUDIT_REPORT.md` | 20개 취약점, 6건 수정 |
| **Webapp 컴포넌트 맵** | `Prostate_cancer_consultation_dashboard/app/Webapp/COMPONENT_STATE_MAP.md` | 활성 컴포넌트, 상태, 라우팅 |
| **DB 스키마** | `Prostate_cancer_consultation_dashboard/app/Backend/database_schema.sql` | 전체 11개 테이블 DDL |
| **ML 파이프라인 사양** | `dev_docs/ml_pipeline_dev_docs/NLP_PIPELINE_SPEC_FINAL.md` | 상세 기술 사양 (45KB) |
| **R vs Python 비교** | `dev_docs/ml_pipeline_dev_docs/COMPARISON_AND_PLAN_*.md` | 라인별 파이프라인 비교 |

---

## 14. 기술 스택 요약

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  프론트엔드         │  백엔드              │  CLI 파이프라인       │
  ├─────────────────────────────────────────────────────────────────┤
  │  Next.js 13.5      │  FastAPI             │  Python 3.9+        │
  │  React 18          │  SQLAlchemy 2.0      │  pandas, openpyxl   │
  │  TypeScript 5      │  PostgreSQL 13       │  httpx              │
  │  Zustand 5.0       │  Redis 7             │  rpy2 (R stringi)   │
  │  Tailwind CSS 3.4  │  asyncpg             │  PyYAML             │
  │  D3.js / Recharts  │  httpx               │                     │
  │  PostHog           │  Alembic             │                     │
  │  Radix-UI          │  PyJWT               │                     │
  ├─────────────────────────────────────────────────────────────────┤
  │  인프라                                                         │
  ├─────────────────────────────────────────────────────────────────┤
  │  Docker Compose (6개 서비스)                                     │
  │  Nginx (리버스 프록시)                                           │
  │  r01-nlp-classifiers (R + plumber, ×3 복제본)                   │
  │  REDCap (외부, API 동기화)                                       │
  │  PostHog (외부, HIPAA 분석)                                      │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 15. 알려진 미비 사항 & 향후 작업

| 영역 | 상태 | 설명 |
|------|------|------|
| AI 하위 파이프라인 (Steps 6-10) | TODO | AI 점수화, 핵심 추출, 대표 선택, 환자용 변환, DB 저장 |
| 환자 대시보드 ↔ 파이프라인 연결 | TODO | 현재 예시 문장 표시 중; 실제 파이프라인 연결 필요 |
| HTTPS 전환 | TODO | 현재 HTTP만 사용 (localhost 개발 환경) |
| 속도 제한 (Rate Limiting) | TODO | Nginx 설정 주석 처리됨, FastAPI 미들웨어 미활성 |
| 설문 인증 | TODO | 설문 엔드포인트에 사용자별 인증 미적용 |
| NLP Docker 이미지 | 위험 | 로컬 빌드만 존재, 레지스트리 없음 — `docker system prune`으로 삭제될 수 있음 |
| Guille 퇴사 | 위험 | ~2026-03-20경, AI 모듈 인수인계 필요 |

---

**문서 버전:** 1.0
**최종 업데이트:** 2026-03-16
