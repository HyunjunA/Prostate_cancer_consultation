# COMPASS 대시보드 — 개발자 README

전립선암 대시보드 데이터를 필터링하고 분석하기 위한 종합 웹 애플리케이션으로, **FastAPI** 백엔드, **PostgreSQL** 데이터베이스, **Redis** 응답 캐싱 및 요청 속도 제한 기능을 갖추고 있다.
이 문서는 서비스를 **빌드, 실행, 확장, 운영**하는 개발자를 위한 것이다.

---

## 운영 빠른 가이드

### 1) 스택 시작 (및 로그 캡처)

**중요**: 적절한 초기화를 위해 `-f docker-compose.yml` 플래그를 사용할 것:

```bash
cd ./Backend
docker compose -f docker-compose.yml up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**`-f docker-compose.yml` 사용 이유:**

- `docker-compose.override.yml`이 시작 스크립트를 방해하지 않도록 보장
- 첫 시작 시 `init_db.py`가 자동으로 실행되도록 보장
- CSV 데이터가 데이터베이스에 자동으로 로드됨

**시작 시 동작:**

```
🚀 Starting COMPASS Backend...
🔄 Running prestart tasks...
⏳ Waiting for database...
🗄️  Initializing database and loading CSV...
✅ Found 216 records in CSV
✅ Migration completed! Created: 216, Updated: 0, Errors: 0
✅ Prestart tasks completed successfully!
🔧 Starting in DEVELOPMENT mode...
INFO: Uvicorn running on http://0.0.0.0:8000
```

### 2) Postgres 접속 (컨테이너 내부)

```bash
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db
```

### 3) 빠른 DB 정상 확인 (SQL)

```sql
SELECT COUNT(*) FROM studies;
SELECT DISTINCT age_reported FROM studies;
```

### 4) API 직접 호출

예시: 선택된 플래그로 2023년 미국 연구에 대한 동적 필터 옵션.

```bash
curl -X POST http://localhost:8000/api/studies/filter-options-dynamic \
  -H "Content-Type: application/json" \
  -d '{
    "countries": ["United States"],
    "year_list": [2023],
    "age_reported": true,
    "gender_reported": true,
    "race_ethnicity_nationality_reported": true
  }'
```

## 목차

- [개요](#개요)
- [아키텍처](#아키텍처)
- [사용 가능한 서비스](#사용-가능한-서비스)
- [프로젝트 구조](#프로젝트-구조)
- [Docker로 빠른 시작](#docker로-빠른-시작)
- [구성](#구성)
- [런타임 라이프사이클](#런타임-라이프사이클)
- [API 엔드포인트](#api-엔드포인트)
- [캐싱 및 속도 제한](#캐싱-및-속도-제한)
- [테스트 및 검증](#테스트-및-검증)
- [보안 고려사항](#보안-고려사항)
- [관측성 및 운영](#관측성-및-운영)
- [문제 해결](#문제-해결)
- [개발](#개발)
- [라이선스](#라이선스)
- [기여](#기여)
- [지원](#지원)

## 개요

COMPASS 대시보드는 큐레이션된 연구 메타데이터 데이터셋을 필터링, 집계, 분석하는 엔드포인트를 제공한다.
PostgreSQL을 시스템 오브 레코드로, Redis를 짧은 TTL 캐싱 및 클라이언트별 속도 제한에 사용한다.

### 주요 특징

- **자동 데이터베이스 초기화**: 첫 시작 시 CSV 데이터가 자동으로 로드됨
- 다양한 필터링 (연도, 국가, 리포지토리, PMID, 다수의 불리언, 텍스트 검색)
- 차트용 집계 (건수 + 백분율)
- 정적 및 동적 필터 옵션
- Redis 기반 짧은 TTL 응답 캐시, 한 줄로 전역 무효화 가능
- IP별 요청 속도 제한

## 아키텍처

```bash
┌──────────────────────────┐      ┌──────────────────┐
│  프론트엔드 / 클라이언트    │─────▶│  FastAPI (app)   │
└──────────────────────────┘      │  - main.py       │
                                  │  - cache_json()  │
                                  │  - RateLimiter   │
                                  └───────┬──────────┘
                                          │ SQLAlchemy (async)
                                   ┌──────▼─────┐
                                   │ Postgres   │
                                   │ (studies)  │
                                   └──────┬─────┘
                                          │ Redis (async)
                                  ┌───────▼────────┐
                                  │ Redis          │
                                  │ - cache:*      │
                                  │ - sarscov:rl:* │
                                  └────────────────┘
```

## 사용 가능한 서비스

| 서비스 | 이미지 / 빌드 | 호스트→컨테이너 | 용도 |
| -------- | -------------------- | -------------- | ------------------------ |
| postgres | postgres:13          | 5433 → 5432    | 주 데이터베이스 |
| backend  | Dockerfile (FastAPI) | 8000 → 8000    | API 서버 (Uvicorn) |
| redis    | redis:7              | 6379 → 6379    | 캐시 및 속도 제한 저장소 |
| nlp-classifiers | r01-nlp-classifiers:latest (로컬 이미지) | 내부 8000 | NLP 문장 분류 (3 replicas) |
| webapp   | ../Webapp/Dockerfile (Next.js) | 내부 3000 | 프론트엔드 |
| nginx    | nginx:alpine         | 3000 → 80     | 리버스 프록시 |

Compose 네트워크: `prostatecancer-network`. 명명된 볼륨: `postgres_data`, `redis_data`.

### nlp-classifiers 이미지

`nlp-classifiers` 서비스는 `r01-nlp-classifiers:latest` 로컬 Docker 이미지를 사용한다.
이 이미지는 Docker Hub에 없으며, 아래 경로의 OCI 이미지 디렉토리에서 로드해야 한다:

```
~/Downloads/r01-nlp-classifiers-docker-image (2)/
```

로드 방법:
```bash
cd ~/Downloads/r01-nlp-classifiers-docker-image\ \(2\)/
tar -cf /tmp/r01-nlp-classifiers.tar .
docker load -i /tmp/r01-nlp-classifiers.tar
# → Loaded image: r01-nlp-classifiers:latest
```

원본 R 코드/모델은 별도 폴더에 위치:
```
prostate_cancer_project/prostate_cancer_R01_NLP_classifiers_Michael/
```

## 프로젝트 구조

```
COMPASS-dashboard/
├── docker-compose.yml            # 메인 Compose 서비스 및 헬스체크
├── docker-compose.override.yml   # 개발 오버라이드 (자동 로드)
├── Dockerfile                    # 백엔드 컨테이너 이미지
├── requirements.txt              # Python 의존성 (redis, fastapi-limiter, ...)
├── .dockerignore                 # Docker 빌드 제외 항목
├── .env.example                  # 환경 변수 템플릿
├── main.py                       # FastAPI 앱, 라우트, Redis 초기화, 캐시 및 RL
├── models.py                     # SQLAlchemy 모델 + Pydantic 스키마
├── db.py                         # DB 엔진/세션 + 의존성
├── init_db.py                    # 자동 CSV 임포트 + 테이블 생성 (시작 시 실행)
├── wait_for_db.py                # DB 준비 상태 확인 (init_db.py 전에 실행)
├── database_schema.sql           # Postgres init에 마운트되는 초기 DDL
├── test_redis.sh                 # Redis/캐시/속도 제한 엔드투엔드 검증기
├── logs/                         # 수집된 로그
├── uploads/                      # 업로드된 파일 (향후)
├── data/                         # 데이터 파일
└── Processed_Data_DB.csv  # 초기 데이터 (첫 시작 시 자동 로드)
```

## Docker로 빠른 시작

### 사전 요구사항

- Docker ≥ 20.10
- Docker Compose ≥ 1.29 (또는 docker compose 플러그인)
- Git

### 1) 클론 및 설정

```bash
git clone <repository-url>
cd backend  # 백엔드 디렉토리로 이동

# logs 디렉토리 존재 확인
mkdir -p logs

# CSV 파일을 백엔드 디렉토리에 배치 (정확한 이름):
# Processed_Data_DB.csv (이미 존재해야 함)
```

### 2) 애플리케이션 시작

**방법 1: 명시적 플래그 사용 (권장)**

```bash
# 모든 서비스 시작 및 타임스탬프 로그 캡처
docker compose -f docker-compose.yml up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**방법 2: 개발용 (override 파일 사용)**

```bash
# docker-compose.yml과 docker-compose.override.yml을 모두 사용
# override 파일은 Dockerfile CMD가 올바르게 실행되도록 command를 제거
docker compose up --no-color 2>&1 | tee "logs/compose-$(date +'%Y%m%d-%H%M%S').log"
```

**방법 3: 백그라운드 모드**

```bash
docker compose -f docker-compose.yml up -d

# 로그 확인
docker compose logs -f backend
```

### 3) 최초 시작

**최초 실행** 시 자동 초기화를 볼 수 있다:

```
🚀 Starting COMPASS Backend...
🔄 Running prestart tasks...
========================================
⏳ Waiting for database...
✅ Database connection successful!

🗄️  Initializing database and loading CSV...
----------------------------------------
🚀 Starting database initialization...
Connecting to database: postgresql+asyncpg://sarscov_user@***
✅ Database connection successful!
Creating database tables...
✅ Database tables created successfully!
Reading CSV file: Processed_Data_DB.csv
✅ Found 216 records in CSV
CSV columns:
  - CovidenceID
  - PMID
  - Study ID
  - Title
  - publication.year
  ...
Created 50 records...
Created 100 records...
Created 150 records...
Created 200 records...
✅ Migration completed! Created: 216, Updated: 0, Errors: 0
----------------------------------------
========================================
✅ Prestart tasks completed successfully!

🔧 Starting in DEVELOPMENT mode...
INFO: Uvicorn running on http://0.0.0.0:8000
```

**이후 재시작** 시 데이터가 이미 존재하면 데이터 로드를 건너뛴다.

### 4) 애플리케이션 접속

- **API 문서**: http://localhost:8000/docs
- **API 헬스체크**: http://localhost:8000/health
- **API 루트**: http://localhost:8000/

### 5) 애플리케이션 중지

```bash
# 모든 서비스 중지
docker compose down

# 중지 및 볼륨 제거 (초기 상태로)
docker compose down -v
```

## 구성

### 환경 변수 (앱 및 compose)

```yaml
# 데이터베이스
DATABASE_URL: postgresql+asyncpg://sarscov_user:secure_password_123@postgres:5432/sarscov_db
DB_HOST: postgres
DB_PORT: 5432
DB_NAME: sarscov_db
DB_USER: sarscov_user
DB_PASSWORD: secure_password_123

# API
API_HOST: 0.0.0.0
API_PORT: 8000
DEBUG: true

# CORS
CORS_ORIGINS:
  ["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]

# Redis
REDIS_URL: redis://redis:6379/0
RATE_LIMIT_NS: sarscov

# 런타임
RUN_ENV: prod # dev 또는 prod (Dockerfile이 uvicorn --reload 또는 gunicorn 선택)
WEB_CONCURRENCY: 1 # 워커 프로세스 수
```

**프로덕션 팁**: Redis나 Postgres를 공개적으로 노출하지 말 것; Redis에 AUTH/TLS 활성화; 데이터베이스 자격 증명은 시크릿 매니저에 저장; CORS 오리진 제한; 환경별 구성 사용.

### 프론트엔드 환경 변수 (NEXT_PUBLIC_*)

Next.js `NEXT_PUBLIC_*` 변수는 **빌드 타임**에 주입되며, 런타임이 아니다. `docker build` 시 `--build-arg`로 전달해야 한다:

```yaml
# docker-compose.yml
webapp:
  build:
    args:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
      - NEXT_PUBLIC_API_KEY=${API_KEY}
```

이 값을 변경하면 webapp 이미지를 다시 빌드해야 한다:

```bash
docker compose build webapp && docker compose up -d webapp
```

## 런타임 라이프사이클

### 시작 순서

1. **Docker Compose가 Postgres와 Redis를 시작**하고 헬스체크를 대기
2. **백엔드 컨테이너가 시작**되고 시작 스크립트를 실행:
   - Dockerfile이 자동으로 생성한 `prestart.sh` 실행
   - `wait_for_db.py`를 실행하여 데이터베이스 준비 확인
   - `init_db.py`를 실행하여 데이터베이스 테이블 생성 (멱등성)
   - `pipeline_runner.py`를 실행하여 실제 트랜스크립트 파일 처리:
     - `/app/data/transcripts/`에서 xlsx 파일 읽기 (`AI_physician_patient_communication/data/input/`에서 마운트)
     - Steps 1-7 (NLP 파이프라인), Step 8 (consultation-scorer → 0-5 점수), Step 9 (patient-summary-rewriter) 실행
     - DB에 직접 저장 (CSV 중간 파일 없음)
     - 이미 DB에 있는 파일은 건너뜀
   - Uvicorn 서버 시작 (개발 모드) 또는 Gunicorn (프로덕션 모드)
3. **앱 시작 시**, `main.py`에서:
   - 비동기 Redis 클라이언트 생성
   - 클라이언트 IP를 식별자로 fastapi-limiter 초기화
   - 짧은 TTL 캐시 헬퍼 준비 (`cache_json`)
4. **종료 시**, Redis 연결 종료

### 핵심 사항

- **수동 CSV 로드 불필요**: `init_db.py`가 컨테이너 시작 시 자동으로 실행
- **멱등성**: 컨테이너 재시작해도 안전 - 데이터가 중복되지 않음
- **개발 친화적**: 개발 모드에서 소스 코드 마운트로 핫 리로드 활성화

## API 엔드포인트

### 핵심

- `GET /` — API 배너
- `GET /health` — `{ "status": "healthy" }` 또는 503
- `GET /ready` — 컨테이너 오케스트레이션용 준비 상태 확인
- `GET /docs` — Swagger UI (OpenAPI)

### 읽기 전용 (캐시 + 속도 제한 적용)

- `GET /api/studies?limit=&offset=` — 연구 목록 조회
- `POST /api/studies/filter?page=&size=` — 페이지네이션 필터
  - 필터: `year_list`, `countries`, `repositories`, `pmid`, 다수의 불리언, `search_title`, `search_pmid`.
- `POST /api/studies/aggregation/{field}` — 차트용 집계 (`study_location_1`, `repository`, `publication_year`, `age_reported`, `gender_reported`, `sequence_ids_reported`)
- `GET /api/studies/distinct?field=` — 허용된 컬럼의 DISTINCT 값
- `GET /api/studies/boolean-stats?field=` — Yes/No/NULL 분포
- `GET /api/studies/filter-options` — 정적 드롭다운 옵션
- `POST /api/studies/filter-options-dynamic` — 현재 필터에 매칭되는 연구
- `GET /api/dashboard/stats` — 합계 및 연도 범위

### API 사용 예시

```bash
# 헬스체크
curl -s http://localhost:8000/health

# 대시보드 통계
curl -s http://localhost:8000/api/dashboard/stats | jq

# 필터 옵션
curl -s http://localhost:8000/api/studies/filter-options | jq

# 필터 (POST, 쿼리 스트링에 페이지네이션)
curl -s -X POST "http://localhost:8000/api/studies/filter?page=1&size=10" \
  -H "Content-Type: application/json" \
  -d '{
    "countries": ["Ethiopia", "South Africa"],
    "age_reported": true
  }' | jq
```

## 캐싱 및 속도 제한

### 응답 캐싱 (`cache_json()`)

- **키 형식**: `cache:{namespace}:{sha256(path+query+body+version)}`
- **버전 키**: `cache:studies:version` (기본값 1)
- **일반적인 TTL**:
  - list/filter: 120초
  - aggregations: 180초
  - filter-options: 600초
  - distinct: 300초
  - dashboard: 180초
- **전역 무효화** (데이터 업데이트 후):
  ```python
  if redis:
      await redis.incr("cache:studies:version")
  ```

### 속도 제한 (fastapi-limiter)

- **식별자**: 클라이언트 IP 주소
- **키 접두사**: `${RATE_LIMIT_NS}:rl:*` (예: `sarscov:rl:*`)
- **기본값**: GET 120회/60초, 무거운 POST 60회/60초

## 테스트 및 검증

### 종합 테스트 스위트 (894개 테스트)

이 프로젝트에는 백엔드와 프론트엔드를 포괄하는 종합 자동화 테스트 스위트가 있다:

| 영역 | 프레임워크 | 테스트 수 | Docker 필요 여부 |
|------|-----------|-------|----------------|
| 백엔드 유닛/통합 | pytest + pytest-asyncio + aiosqlite | 559 | 아니오 |
| 백엔드 E2E | pytest + httpx | 24 | 예 |
| 프론트엔드 유닛/통합 | Jest + React Testing Library + MSW | 279 | 아니오 |
| 프론트엔드 E2E | Playwright (Chromium) | 32 | 예 |
| **합계** | | **894** | |

### 백엔드 테스트 실행

```bash
cd app/Backend

# 모든 유닛/통합 테스트 (Docker 불필요 — 인메모리 SQLite 사용)
python -m pytest tests/ -v --tb=short --ignore=tests/e2e

# 특정 테스트 카테고리 실행
python -m pytest tests/test_health.py -v              # 헬스 엔드포인트
python -m pytest tests/auth/ -v                        # 인증 모듈
python -m pytest tests/test_transcript.py -v           # 트랜스크립트 파이프라인
python -m pytest tests/test_surveys.py -v              # 설문 + REDCap

# 커버리지 리포트
python -m pytest tests/ --cov=. --cov-report=html --ignore=tests/e2e

# E2E 테스트 (모든 Docker 컨테이너 실행 필요)
python -m pytest tests/e2e/ -v -m e2e
```

### 프론트엔드 테스트 실행

```bash
cd app/Webapp

# 모든 유닛/통합 테스트 (Docker 불필요)
npm test

# 특정 영역
npm run test:stores       # Zustand 스토어 (9개 스토어, 35개 테스트)
npm run test:hooks        # 커스텀 hooks (6개 hooks, 50개 테스트)
npm run test:coverage     # 커버리지 리포트

# Playwright E2E (Docker 필요 — webapp + backend 실행 중이어야 함)
npx playwright test --config=e2e/playwright.config.ts

# 특정 E2E 스위트
npx playwright test e2e/selection-screen.spec.ts --config=e2e/playwright.config.ts
npx playwright test e2e/survey-submit-flow.spec.ts --config=e2e/playwright.config.ts
```

### 시작 후 빠른 검증

```bash
# 1. 백엔드 헬스체크
curl -s http://localhost:8000/health

# 2. 데이터 로드 확인
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db -c "SELECT COUNT(*) FROM studies;"

# 예상 출력: 216 (또는 CSV 행 수)
```

### Redis 엔드투엔드 스크립트

PING → 캐시 생성 → TTL → 전역 무효화 → 429 → RL 키를 검증한다:

```bash
chmod +x test_redis.sh
./test_redis.sh
```

### DB 정상 확인

```bash
docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db
```

```sql
-- 전체 레코드 수 확인
SELECT COUNT(*) FROM studies;

-- 고유 값 확인
SELECT DISTINCT age_reported FROM studies;

-- 샘플 데이터 조회
SELECT covidence_id, title, publication_year FROM studies LIMIT 5;
```

### API 직접 호출

```bash
curl -X POST http://localhost:8000/api/studies/filter-options-dynamic \
  -H "Content-Type: application/json" \
  -d '{
    "countries": ["United States"],
    "year_list": [2023],
    "age_reported": true,
    "gender_reported": true,
    "race_ethnicity_nationality_reported": true
  }'
```

## 트랜스크립트 분석 API

`process-data-guille.R` 파이프라인을 Python으로 재구현한 것이다. 트랜스크립트 xlsx 파일을 5개 NLP 모델로 처리하고 컨텍스트가 포함된 상위 점수 문장을 반환한다.

### 파이프라인 개요

```
입력: processed_transcripts_sid-XX.xlsx (speaker, text)
  → Step 1: xlsx 읽기, 환자 ID 추출
  → Step 2: 인터뷰어 발화만 필터링
  → Step 3: 문장 분리 (소문자 변환)
  → Step 4: r01-nlp-classifiers Docker를 통해 5개 NLP 모델 실행
  → Step 5: 모델별 상위 N개 선택 (동점 처리 포함)
  → Step 6: ±3 문장 컨텍스트 생성 (<main> 태그 포함)
  → Step 7: xlsx로 내보내기 (5개 시트: cp, inc, ed, ius, le)
출력: {patient_id}_predictions.xlsx
```

### 엔드포인트

| 메서드 | 엔드포인트 | 설명 |
|--------|----------|------|
| POST | `/api/transcript/analyze` | 단일 xlsx 업로드 → 파이프라인 실행 → JSON 결과 반환 |
| GET | `/api/transcript/download/{patient_id}` | 생성된 xlsx 결과 파일 다운로드 |
| POST | `/api/transcript/analyze-batch` | 다수 xlsx 파일 업로드 → 각각 파이프라인 실행 → JSON 요약 반환 |
| GET | `/api/transcript/download-batch?patient_ids=` | 다수 결과를 단일 zip 파일로 다운로드 |

### 사용법

#### 단일 파일 분석

**Step 1: 분석 실행**

```bash
curl -s -X POST "http://localhost:8000/api/transcript/analyze" \
  -H "X-API-Key: <YOUR_API_KEY>" \
  -F "file=@/path/to/processed_transcripts_sid-01.xlsx" \
  -F "top_n=5" \
  -F "context_window=3" | python3 -m json.tool
```

**Step 2: 결과 xlsx 다운로드**

```bash
curl -s -X GET "http://localhost:8000/api/transcript/download/sid-01" \
  -H "X-API-Key: <YOUR_API_KEY>" \
  -o sid-01_predictions.xlsx
```

#### 배치 분석 (다수 파일)

**Step 1: 여러 파일을 한 번에 업로드**

```bash
curl -X POST http://localhost:8000/api/transcript/analyze-batch \
  -H "X-API-Key: <YOUR_API_KEY>" \
  -F "files=@processed_transcripts_sid-01.xlsx" \
  -F "files=@processed_transcripts_sid-02.xlsx" \
  -F "files=@processed_transcripts_sid-03.xlsx" \
  -F "top_n=5" \
  -F "context_window=3"
```

**응답:**

```json
{
  "total_files": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    {
      "filename": "processed_transcripts_sid-01.xlsx",
      "status": "success",
      "patient_id": "sid-01",
      "total_sentences": 341,
      "output_file": "sid-01_predictions.xlsx"
    },
    {
      "filename": "processed_transcripts_sid-02.xlsx",
      "status": "success",
      "patient_id": "sid-02",
      "total_sentences": 200,
      "output_file": "sid-02_predictions.xlsx"
    },
    {
      "filename": "bad_file.xlsx",
      "status": "error",
      "detail": "xlsx must have columns {'speaker', 'text'}"
    }
  ]
}
```

**Step 2: 모든 결과를 zip으로 다운로드**

```bash
curl -X GET "http://localhost:8000/api/transcript/download-batch?patient_ids=sid-01,sid-02" \
  -H "X-API-Key: <YOUR_API_KEY>" \
  --output batch_results.zip
```

**배치 에러 처리:**
- 각 파일은 독립적으로 처리되며, 하나의 실패가 다른 파일을 중단시키지 않음
- 파일별 `status` 필드가 `"success"` 또는 `"error"`와 `detail`을 표시
- 모든 파일이 실패한 경우에만 HTTP 500 반환

### 파라미터

#### `/api/transcript/analyze` (단일 파일)

| 파라미터 | 기본값 | 설명 |
|-----------|---------|------|
| `file` | (필수) | `speaker`와 `text` 컬럼이 있는 xlsx 파일 |
| `top_n` | 5 | 모델별 상위 N개 문장 (0 = 전체, 확률순 정렬) |
| `context_window` | 3 | 컨텍스트용 주변 문장 수 (±N) |

#### `/api/transcript/analyze-batch` (다수 파일)

| 파라미터 | 기본값 | 설명 |
|-----------|---------|------|
| `files` | (필수) | `speaker`와 `text` 컬럼이 있는 하나 이상의 xlsx 파일 |
| `top_n` | 5 | 모델별 상위 N개 문장 (0 = 전체, 확률순 정렬) |
| `context_window` | 3 | 컨텍스트용 주변 문장 수 (±N) |

#### `/api/transcript/download-batch`

| 파라미터 | 설명 |
|-----------|------|
| `patient_ids` | 쉼표로 구분된 환자 ID 목록 (예: `sid-01,sid-02,sid-03`) |

### 출력 형식

5개 시트 (cp, inc, ed, ius, le), 각각 다음 컬럼을 포함:

| 컬럼 | 설명 |
|--------|------|
| `name` | 환자 ID (예: sid-01) |
| `index` | 전체 문장 순번 |
| `i` | 원본 발화 번호 |
| `i2` | 발화 내 문장 번호 |
| `speaker` | 항상 "Interviewer" |
| `text` | 문장 텍스트 (소문자) |
| `.pred_1` | 모델 예측 확률 (0.0~1.0) |
| `context` | ±3 주변 문장, 대상 문장에 `<main>` 태그 포함 |

### 5개 NLP 모델

| 시트 | 모델 | 전체 이름 |
|-------|-------|-----------|
| cp | Cancer Prognosis | `cancer_prognosis` |
| inc | Continence | `continence` |
| ed | Erectile Dysfunction | `erectile_dysfunction_potency` |
| ius | Irritative Urinary Symptoms | `irritative_urinary_symptoms_frequency_urgency_nocturnia` |
| le | Life Expectancy | `life_expectancy` |

### 테스트 스크립트

```bash
cd prostate_cancer_project
chmod +x test_transcript_pipeline.sh
./test_transcript_pipeline.sh
```

### 관련 파일

| 파일 | 설명 |
|------|------|
| `transcript_service.py` | 파이프라인 로직 (Steps 1,2,3,5,6,7) |
| `routes_transcript.py` | API 엔드포인트 (단일 + 배치 분석/다운로드) |
| `nlp_service.py` | r01-nlp-classifiers Docker에 대한 NLP 모델 호출 (Step 4) |

## 보안 고려사항

### 현재 구현

- **속도 제한**: 남용 방지를 위한 IP 기반 요청 스로틀링
- **CORS**: 구성 가능한 오리진 제한
- **데이터베이스**: 구성 가능한 제한이 있는 커넥션 풀링
- **Redis**: 일시적 캐시 데이터에만 사용 (민감 정보 저장 안 함)

### 프로덕션 권장사항

- **네트워크 격리**: Redis나 Postgres 포트를 공개적으로 노출하지 말 것
- **Redis 보안**: 프로덕션에서 Redis AUTH 활성화 및 TLS 사용
- **데이터베이스 자격 증명**: 시크릿 매니저 사용 (예: AWS Secrets Manager, HashiCorp Vault)
- **CORS**: 특정 프론트엔드 오리진만으로 제한
- **HTTPS**: TLS 종료를 위한 리버스 프록시 뒤에 배포 (예: nginx, Traefik)
- **환경 분리**: dev/staging/prod별 별도 구성 사용
- **데이터베이스 백업**: 정기적인 자동 백업 구현
- **모니터링**: 비정상적인 트래픽 패턴이나 오류에 대한 알림 설정

## 관측성 및 운영

### 로깅

- **구조화된 로그**: 모든 시작 및 초기화 단계가 이모지로 로그되어 쉽게 스캔 가능
- **요청 로그**: Uvicorn/Gunicorn의 접근 및 에러 로그
- **로그 지속성**: 제공된 명령어로 파일에 로그 캡처 가능

### 모니터링 권장사항

- **에러 캡처**: 에러 추적을 위한 Sentry 통합 고려
- **메트릭**: 지연시간, 에러율, 캐시 적중률, Redis 연결성, 429 카운트를 위한 Prometheus exporter
- **트레이싱**: 분산 트레이싱을 위한 선택적 OpenTelemetry → Jaeger/Tempo
- **헬스체크**: 오케스트레이션을 위한 `/health` 및 `/ready` 엔드포인트 활용

### 운영 팁

- **백엔드 로그 확인**: `docker compose logs -f backend`
- **Redis 검사**:
  ```bash
  docker exec -it prostatecancer-redis redis-cli
  SCAN 0 MATCH "cache:*"
  TTL <key>
  GET cache:studies:version
  SCAN 0 MATCH "sarscov:rl*"
  ```
- **DB 쉘**: `docker exec -it prostatecancer-postgres psql -U sarscov_user -d sarscov_db`
- **컨테이너 상태 확인**: `docker compose ps`
- **리소스 사용량 확인**: `docker stats`

## 문제 해결

### 일반적인 문제

**CSV 데이터가 로드되지 않음**

```bash
# 백엔드 로그에서 초기화 확인
docker compose logs backend | grep -i "init\|csv\|migration"

# 필요시 수동으로 init_db.py 실행
docker exec -it prostatecancer-backend python /app/init_db.py
```

**"docker-compose.override.yml이 시작을 방해함"**

→ override 파일을 우회하려면 명시적 `-f docker-compose.yml` 플래그를 사용:

```bash
docker compose -f docker-compose.yml up
```

**컨테이너가 시작되지만 데이터가 비어 있음**

→ 백엔드 디렉토리에 CSV 파일이 존재하는지 확인:

```bash
ls -la backend/Processed_Data_DB.csv
docker exec -it prostatecancer-backend ls -la /app/*.csv
```

**속도 제한 에러 `TypeError: object str can't be used in 'await' expression`**

→ limiter 식별자는 반드시 비동기여야 하며 함수 객체로 전달해야 한다. `--no-cache`로 다시 빌드할 것.

**`ModuleNotFoundError: No module named 'redis'`**

→ `requirements.txt`에 `redis>=5`를 추가. 다시 빌드:

```bash
docker compose build --no-cache backend
```

**부하 테스트에서 429가 발생하지 않음**

→ 데코레이터가 존재하고, Redis가 정상이며, 식별자가 안정적인 키를 반환하는지 확인.

**데이터 변경 후 캐시가 무효화되지 않음**

→ 성공적인 DB 커밋 후 `await redis.incr("cache:studies:version")`을 호출.

**CORS 차단**

→ `CORS_ORIGINS` 환경 변수에 프론트엔드 오리진을 포함.

**포트 충돌**

→ `docker-compose.yml`에서 호스트 포트를 변경 (예: `5434:5432`, `8001:8000`).

**백엔드가 계속 재시작됨**

→ 로그 확인: `docker compose logs backend`
→ `WEB_CONCURRENCY` 환경 변수가 설정되어 있는지 확인 (빈 문자열이 아닐 것)

**데이터베이스 연결 거부**

→ Postgres가 완전히 준비될 때까지 대기 (헬스체크가 처리해야 함)
→ DATABASE_URL이 올바른지 확인
→ 네트워크 연결 확인: `docker compose exec backend ping postgres`

## 개발

### 개발 모드

`docker-compose.override.yml` 사용 시 (자동으로 로드됨) 애플리케이션이 자동으로 개발 모드로 실행된다:

- 핫 리로드를 위한 소스 코드 볼륨 마운트
- `--reload` 플래그가 있는 Uvicorn
- 모든 초기화 스크립트가 여전히 실행됨
- Python 파일 변경 시 자동 재시작 트리거

### 로컬 개발 (Docker 없이)

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://sarscov_user:secure_password_123@localhost:5433/sarscov_db
export REDIS_URL=redis://localhost:6379/0
export RUN_ENV=dev

# 필요시 데이터베이스 초기화 실행
python init_db.py

# 서버 시작
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### DB만 Docker 사용

```bash
docker compose up -d postgres redis
python main.py
```

### 코드 변경 후 다시 빌드

```bash
# 백엔드 이미지 다시 빌드
docker compose build backend

# 또는 캐시 없이 다시 빌드
docker compose build --no-cache backend

# 그 후 재시작
docker compose up -d
```

### 새 의존성 추가

```bash
# requirements.txt에 추가
echo "new-package>=1.0.0" >> requirements.txt

# 다시 빌드
docker compose build --no-cache backend
docker compose up -d
```
