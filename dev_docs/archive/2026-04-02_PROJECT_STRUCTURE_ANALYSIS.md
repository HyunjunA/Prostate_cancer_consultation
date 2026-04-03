# Prostate Cancer Consultation Dashboard — 프로젝트 구조 분석

> **Date:** 2026-04-02
> **Scope:** 전체 프로젝트 구조, 모듈 구성, 데이터 흐름, 배포 아키텍처

---

## 프로젝트 규모

| 항목 | 수치 |
|------|------|
| Backend Python 코드 | 19,601줄 |
| Webapp TypeScript/JSX 코드 | 184,625줄 |
| API 엔드포인트 | 74개 |
| 데이터베이스 테이블 | 12개 |
| Docker 서비스 | 8개 (5 named + NLP ×3) |
| Backend 테스트 파일 | 23개 |
| Webapp 테스트 파일 | 27개 (unit) + 7개 (e2e) |
| 컴포넌트 파일 (.tsx) | 160개 (활성 ~10개) |
| 일일 작업 로그 | 23개 |
| 개발 문서 (dev_docs) | 18개 .md 파일 |

---

## 디렉토리 구조

```
Prostate_cancer_consultation_dashboard/
│
├── app/                          ← 메인 애플리케이션
│   ├── Backend/                  ← FastAPI 백엔드 (Python)
│   └── Webapp/                   ← Next.js 프론트엔드 (React/TypeScript)
│
├── archive/                      ← 이전 버전 보관
│   ├── Backend_origin/           ← 원본 백엔드 (SARS-CoV 프로젝트)
│   └── Webapp_development/       ← 개발 단계 웹앱
│
├── daily_control_logs/           ← 일일 작업 로그 (23개)
├── data/                         ← 참조 데이터 (CSV, xlsx)
├── dev_docs/                     ← 개발 문서
│   ├── backend_dev_docs/         ← Backend 관련 문서 (DB 스키마, 최적화 보고서)
│   ├── ml_pipeline_dev_docs/     ← ML 파이프라인 문서 (아키텍처, 스펙)
│   └── webapp_dev_docs/          ← Webapp 최적화 보고서
│
├── docs/                         ← 프로젝트 문서 (PDF, pptx)
├── examples/                     ← 예제 코드
├── playground/                   ← 실험용 코드
│
├── SYSTEM_ARCHITECTURE.md        ← 통합 시스템 아키텍처 (EN)
├── SYSTEM_ARCHITECTURE_KR.md     ← 통합 시스템 아키텍처 (KR)
├── README.md                     ← 프로젝트 소개
└── .gitignore
```

---

## Backend 구조 (`app/Backend/`)

### 핵심 파일

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `main.py` | 143 | FastAPI app 설정, CORS, lifespan, health/ready 엔드포인트 |
| `routes_doctor.py` | 1,421 | 의사 대시보드 API (15개 엔드포인트) |
| `routes_patient.py` | 636 | 환자 인터페이스 API (8개) + stats + REDCap |
| `routes_transcript.py` | ~730 | ML 파이프라인 분석 API (6개) |
| `routes_surveys.py` | 1,757 | 설문 제출/조회 API (~10개) |
| `routes_tracking.py` | ~460 | 사용자 행동 추적 API (5개) |
| `routes_nlp.py` | 207 | NLP 모델 프록시 API (5개) |
| `models.py` | 246 | SQLAlchemy ORM 모델 (12 테이블) |
| `db.py` | 44 | 비동기 DB 엔진 + 세션 팩토리 |
| `nlp_service.py` | 297 | NLP Docker 호출 클라이언트 (캐시, 재시도) |
| `transcript_service.py` | 404 | 7-step 분석 파이프라인 |
| `redis_client.py` | 58 | Redis 캐시 클라이언트 |
| `init_db.py` | 806 | CSV → DB 시드 마이그레이션 |
| `wait_for_db.py` | ~30 | DB 연결 대기 스크립트 |

### 인증 모듈 (`auth/`)

```
auth/
├── __init__.py          ← get_current_user() — 인증 의존성
├── base.py              ← AuthBackend 프로토콜, AuthUser 데이터클래스
├── registry.py          ← AUTH_MODE에 따라 백엔드 선택
├── models.py            ← AuthUser, AuthAPIKey, PatientAccess ORM 모델
├── schemas.py           ← Pydantic 요청/응답 스키마
├── access_control.py    ← check_patient_access() — 환자별 접근 제어
├── admin_routes.py      ← /api/auth/* 관리 엔드포인트 (8개)
└── backends/
    ├── api_key.py       ← X-API-Key 헤더 인증 (현재 활성)
    ├── jwt_auth.py      ← JWT 토큰 인증
    ├── multi_key.py     ← DB 기반 다중 API 키
    └── oauth2.py        ← OAuth2 인증
```

### 테스트 구조 (`tests/`)

```
tests/
├── conftest.py                    ← pytest 설정 (async DB 세션, httpx 클라이언트)
├── factories.py                   ← 테스트 데이터 팩토리
├── auth/                          ← 인증 테스트 (6파일)
│   ├── test_api_key.py
│   ├── test_jwt.py
│   ├── test_multi_key.py
│   ├── test_oauth2.py
│   ├── test_access_control.py
│   └── test_admin_routes.py
├── models/                        ← ORM 모델 테스트
│   ├── test_models.py
│   └── test_auth_models.py
├── services/                      ← 서비스 레이어 테스트
│   ├── test_nlp_service.py
│   └── test_transcript_service.py
├── integration/                   ← 통합 테스트
│   ├── test_transcript_db.py
│   ├── test_batch_flow.py
│   └── test_auth_mode_switch.py
├── e2e/                           ← E2E 테스트
│   └── test_full_flow.py
└── test_*.py                      ← 엔드포인트별 테스트 (7파일)
```

### 데이터 파일 (`fake_csv_files/`)

| CSV 파일 | 대상 테이블 | 설명 |
|----------|------------|------|
| `docter_interface_render.csv` | `doctor_sentence_view` | NLP 점수 문장 |
| `docter_interface_render_processed.csv` | `doctor_sentence_view` | 처리된 문장 (대안 파일) |
| `docter_interface_ai_rewriting_history.csv` | `doctor_rewrite_log` | 재작성 이력 |
| `Patient_interface_class_summary.csv` | `patient_summary` | AI 요약 카드 |
| `Patient_interface_class_summary_scoring.csv` | `patient_summary_scoring` | 환자 평가 |
| `Patient_interface_questions_responses.csv` | `patient_responses` | 환자 응답 |
| `transcript_analysis_log.csv` | `transcript_analysis_log` | 분석 실행 기록 |
| `sentence_prediction.csv` | `sentence_prediction` | 문장별 NLP 점수 |

---

## Webapp 구조 (`app/Webapp/`)

### 페이지 라우팅 (Next.js App Router)

```
src/app/
├── layout.tsx                     ← 루트 레이아웃 (다크 모드, 프로바이더)
├── page.tsx                       ← 메인 페이지 (/, 모든 뷰 포함)
├── admin/tracking/page.tsx        ← 관리자 추적 대시보드 (/admin/tracking)
└── providers/PostHogProvider.tsx   ← PostHog 분석 (현재 비활성)
```

### 활성 컴포넌트 (page.tsx에서 import)

| 컴포넌트 | 역할 |
|---------|------|
| `PhysicianReportsModifiedV41Timothy` | 의사 대시보드 (4,031줄) — Grid/Detail/Dashboard 3단 뷰 |
| `PatientInitialVisitReportV35` | 환자 첫 방문 리포트 — AI 요약 카드 + 별점 평가 |
| `PatientFollowUpReportV31Re` | 환자 후속 방문 — 4개 설문 (SDM, DCS, 위험, 만족도) |
| `PatientConsultationReports` | 환자 상담 리포트 래퍼 |
| `FilterSidebarV3` | 필터 사이드바 |
| `Dashboard` | 메인 대시보드 |
| `ThemeToggle` | 다크/라이트 모드 토글 |
| `DashboardFooter` | 푸터 |
| `ReportDownloadNonAIAPI` | PDF/이미지 다운로드 |
| `ApiTestDashboard` | API 테스트 도구 |

### 상태 관리 (Zustand)

| Store | 역할 |
|-------|------|
| `useFileId` | 현재 선택된 환자 파일 ID |
| `usePatientId` | 현재 선택된 환자 ID |
| `useDoctorId` | 현재 선택된 의사 ID |
| `useThemeStore` | 다크/라이트 모드 |
| `useFilterStore` | 필터 상태 |
| `useWindowSizeStore` | 윈도우 크기 (반응형) |
| `useXAxisSelectionStore` | X축 선택 (차트) |
| `useXAxisDragSelectionStore` | X축 드래그 선택 |

### API 클라이언트

| 파일 | 역할 |
|------|------|
| `surveyApi.tsx` | 설문 제출/조회 API 호출 |
| `trackingApi.ts` | 사용자 행동 추적 이벤트 전송 |
| `demographicData.tsx` | 인구통계 데이터 (레거시) |

### 사용자 행동 추적 시스템 (`tracking/`)

```
tracking/
├── config/tracking.config.ts      ← 추적 설정
├── lib/TrackingEventManager.ts    ← 이벤트 배치 수집 + 전송
├── hooks/                         ← 7개 추적 훅
│   ├── useClickPath.ts            ← 클릭 경로 추적
│   ├── useCursorProximity.ts      ← 커서 근접 추적
│   ├── useNavigationTracking.ts   ← 페이지 이동 추적
│   ├── useScrollDepth.ts          ← 스크롤 깊이 추적
│   ├── useTimeOnComponent.ts      ← 컴포넌트 체류 시간
│   └── useViewportTracking.ts     ← 뷰포트 추적
├── types/                         ← 추적 타입 정의
└── utils/session.utils.ts         ← 세션 유틸리티
```

### 설문 시스템 (`surveysSecondVersion/`)

| 컴포넌트 | 설문 도구 |
|---------|----------|
| `SDMQuestions.tsx` | 공유 의사결정 (SDM) |
| `DecisionalConflictSurvey.tsx` | 의사결정 갈등 척도 (DCS) |
| `RiskPerceptionSurvey.tsx` | 위험 인식 |
| `PatientSatisfactionSurvey.tsx` | 환자 만족도 |
| `BaselineQuestions.tsx` | 기본 인구통계 |

---

## Docker 배포 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Network                       │
│                  (prostatecancer-network)                        │
│                                                                 │
│  ┌──────────┐     ┌──────────┐     ┌────────────────────────┐  │
│  │  Nginx   │────▶│  Webapp  │     │  NLP Classifiers (R)   │  │
│  │ :3001→80 │     │  :3000   │     │  ×3 replicas           │  │
│  │  Alpine  │     │ Next.js  │     │  r01-nlp-classifiers   │  │
│  └────┬─────┘     │ Express  │     │  :8000 (internal)      │  │
│       │           └──────────┘     │  2GB each              │  │
│       │                            └───────────┬────────────┘  │
│       │                                        │               │
│       ▼                                        ▼               │
│  ┌──────────┐     ┌──────────┐     ┌──────────────────────┐   │
│  │ Backend  │────▶│ Postgres │     │       Redis          │   │
│  │  :8000   │     │  :5432   │     │      :6379           │   │
│  │ FastAPI  │     │  13      │     │  캐시 + Rate Limit   │   │
│  │ Gunicorn │     │  512M    │     │  256M LRU            │   │
│  │  1G/2CPU │     └──────────┘     └──────────────────────┘   │
│  └──────────┘                                                  │
│                                                                 │
│  외부 포트: Nginx 127.0.0.1:3001, Backend 127.0.0.1:8000,     │
│            Postgres 127.0.0.1:5433                              │
└─────────────────────────────────────────────────────────────────┘
```

### 서비스별 상세

| 서비스 | 이미지 | 메모리 | CPU | 포트 | 헬스체크 |
|--------|--------|--------|-----|------|---------|
| postgres | postgres:13 | 512M | 1.0 | 127.0.0.1:5433 | pg_isready 15s |
| redis | redis:7 | 256M | 0.5 | (내부) | redis-cli ping 5s |
| nlp-classifiers | r01-nlp-classifiers | 2G ×3 | - | (내부) :8000 | Rscript /ping 15s |
| backend | backend-backend (428MB) | 1G | 2.0 | 127.0.0.1:8000 | curl /health 15s |
| webapp | backend-webapp (860MB) | - | - | (내부) :3000 | wget / 15s |
| nginx | nginx:alpine | - | - | 127.0.0.1:3001 | curl /nginx-health 15s |

---

## 데이터 흐름

### 1. 파이프라인 → DB → 대시보드

```
[트랜스크립트 xlsx]
    │
    ▼
[Pipeline: 전처리 → 문장 분리 → NLP 5모델 분류 → Top-K 선택 → 컨텍스트]
    │
    ├──▶ transcript_analysis_log    (실행 기록)
    ├──▶ sentence_prediction        (문장별 5도메인 점수)
    ├──▶ doctor_sentence_view       (대시보드용 중복제거 문장)
    └──▶ patient_summary            (AI 요약 카드)
              │
              ▼
         [Frontend]
         ├── 의사: 문장 목록 + 점수 + 재작성 도구
         └── 환자: AI 요약 + 별점 + 설문
```

### 2. 사용자 인터랙션 → DB → 분석

```
[Frontend 사용자 행동]
    │
    ▼
[TrackingEventManager: 배치 수집 (최대 500이벤트)]
    │
    ▼
POST /api/tracking/events
    │
    ▼
user_interaction_log (세션별, 이벤트 유형별 추적)
    │
    ▼
GET /api/tracking/analytics (6개 병렬 쿼리 → 타임라인, 환자별, 세션별, 기기별, 히트맵)
```

### 3. 설문 흐름

```
[환자 후속 방문 페이지]
    │
    ├── SDM (공유 의사결정) ──▶ POST /api/surveys/submit
    ├── DCS (의사결정 갈등)  ──▶ POST /api/surveys/submit
    ├── Risk Perception     ──▶ POST /api/surveys/submit
    └── Satisfaction        ──▶ POST /api/surveys/submit
                                      │
                                      ▼
                              survey_submission_log (JSONB)
                                      │
                                      ▼ (선택적)
                              REDCap API 동기화
```

---

## API 엔드포인트 전체 목록 (74개)

### 시스템 (3개) — `main.py`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | API 정보 |
| GET | `/health` | DB + Redis + NLP 헬스체크 |
| GET | `/ready` | DB 연결 확인 |

### 의사 대시보드 (15개) — `routes_doctor.py`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/doctor/sentences/{file}/{speaker}` | 문장 목록 |
| GET | `/api/doctor/rewrites` | 재작성 이력 |
| PUT | `/api/doctor/rewrites` | 재작성 저장 |
| GET | `/api/doctor/rewrites/{file}/{i}/{i2}/history` | 문장별 수정 이력 |
| GET | `/api/doctor/rewrites/{file}/{i}/{i2}/{class_}` | 특정 재작성 조회 |
| GET | `/api/doctor/rewrites/stats` | 재작성 통계 |
| GET | `/api/doctor/files` | 환자 파일 목록 |
| GET | `/api/doctor/scores/average` | 도메인별 평균 점수 |
| GET | `/api/doctor/scores/summary/{file}/{speaker}` | 점수 요약 |
| GET | `/api/doctor/scores/trajectory` | 점수 궤적 |
| POST | `/api/doctor/score-sentence` | 문장 채점 (임시) |
| GET | `/api/doctor/class-distribution` | 클래스 분포 |
| GET | `/api/doctor/class-distribution/{file}` | 파일별 클래스 분포 |
| POST | `/api/doctor/ai-rewrite` | AI 재작성 (임시) |
| GET/POST | `/api/doctor/improvement-suggestions` | 개선 제안 |

### 환자 인터페이스 (10개) — `routes_patient.py`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/patient/summaries` | 요약 목록 |
| GET | `/api/patient/summaries/{file}/{speaker}` | 특정 환자 요약 |
| GET | `/api/patient/scoring` | 평가 점수 |
| PUT | `/api/patient/scoring` | 평가 저장 |
| GET | `/api/patient/responses` | 자유 텍스트 응답 |
| PUT | `/api/patient/responses` | 응답 저장 |
| GET | `/api/patient/files` | 환자 파일 목록 |
| GET | `/api/patient/sentences/{file}` | 근거 문장 |
| GET | `/api/stats/dashboard` | 대시보드 통계 |
| POST | `/api/redcap/import` | REDCap 데이터 가져오기 |

### ML 파이프라인 (6개) — `routes_transcript.py`
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/transcript/analyze` | 단일 파일 분석 |
| POST | `/api/transcript/analyze-batch` | 다중 파일 분석 |
| GET | `/api/transcript/download/{patient_id}` | 결과 xlsx 다운로드 |
| GET | `/api/transcript/download-batch` | 다중 결과 zip 다운로드 |
| GET | `/api/transcript/history/{patient_id}` | 분석 이력 |
| GET | `/api/transcript/predictions/{patient_id}` | 문장별 예측 쿼리 |

### NLP 프록시 (6개) — `routes_nlp.py`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/nlp/health` | NLP 서비스 헬스체크 |
| POST | `/api/nlp/predict` | 단일 문장 예측 |
| POST | `/api/nlp/predict/batch` | 배치 예측 (최대 50) |
| POST | `/api/nlp/predict/by-class` | 클래스 번호로 예측 |
| POST | `/api/nlp/predict/all` | 5모델 동시 예측 |
| GET | `/api/nlp/models` | 모델 목록 |

### 설문 (~15개) — `routes_surveys.py`
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/surveys/submit` | 설문 제출 |
| GET | `/api/surveys/submissions` | 제출 목록 (페이지네이션) |
| GET | `/api/surveys/submissions/{id}` | 특정 제출 |
| GET | `/api/surveys/by-speaker/{speaker}` | 화자별 제출 |
| GET | `/api/surveys/by-file/{file}` | 파일별 제출 |
| GET | `/api/surveys/by-type/{type}` | 유형별 제출 |
| GET | `/api/surveys/stats` | 설문 통계 |
| DELETE | `/api/surveys/submissions/{id}` | 제출 삭제 |
| GET/POST/DELETE | `/api/surveys/redcap/*` | REDCap 연동 |

### 사용자 추적 (5개) — `routes_tracking.py`
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/tracking/events` | 이벤트 배치 저장 (rate limited) |
| GET | `/api/tracking/events` | 이벤트 조회 |
| GET | `/api/tracking/stats` | 추적 통계 |
| GET | `/api/tracking/patients` | 추적된 환자 목록 |
| GET | `/api/tracking/analytics` | 분석 (6쿼리 병렬) |

### 인증 관리 (~8개) — `auth/admin_routes.py`
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/users` | 사용자 목록 |
| POST | `/api/auth/users` | 사용자 생성 |
| PATCH | `/api/auth/users/{id}` | 사용자 수정 |
| DELETE | `/api/auth/users/{id}` | 사용자 삭제 |
| GET/POST | `/api/auth/users/{id}/api-keys` | API 키 관리 |
| GET/POST/DELETE | `/api/auth/users/{id}/patient-access` | 환자 접근 관리 |

---

## 설정 파일

### Backend
| 파일 | 역할 |
|------|------|
| `docker-compose.yml` | 전체 서비스 오케스트레이션 |
| `Dockerfile` | 멀티 스테이지 빌드 (Python 3.10-slim) |
| `.env` | 시크릿 (DB 비밀번호, API 키, REDCap 토큰) |
| `.env.example` | 시크릿 템플릿 |
| `requirements.txt` | Python 의존성 (버전 고정) |
| `requirements-dev.txt` | 테스트 의존성 (프로덕션 미포함) |
| `alembic.ini` | DB 마이그레이션 설정 |
| `database_schema.sql` | DDL (Docker 초기화 시 실행) |
| `pytest.ini` | 테스트 설정 |
| `.dockerignore` | Docker 빌드 제외 파일 |

### Webapp
| 파일 | 역할 |
|------|------|
| `Dockerfile` | 멀티 스테이지 빌드 (Node 18-alpine) |
| `next.config.js` | Next.js 설정 (standalone, SWC) |
| `server.js` | 커스텀 Express 서버 (프록시, 헬스체크) |
| `package.json` | npm 의존성 |
| `tailwind.config.js` | Tailwind CSS 설정 |
| `tsconfig.json` | TypeScript 설정 |
| `jest.config.ts` | 단위 테스트 설정 |
| `.dockerignore` | Docker 빌드 제외 |
| `nginx_setup/default.conf` | Nginx 리버스 프록시 설정 |

---

## 레거시 코드

| 위치 | 파일 수 | 줄 수 | 설명 |
|------|---------|-------|------|
| `src/components/PatientReportModifiedV*` | 18 | ~45,000 | 환자 리포트 이전 버전 (V2~V29) |
| `src/components/PhysicianReportsModifiedV*` | 24 | ~55,000 | 의사 리포트 이전 버전 (V31~V39) |
| `src/components/PatientFollowUpReportV*` | 6 | ~15,000 | 후속 방문 이전 버전 |
| `src/components/notused/` | 19 | ~10,000 | 명시적으로 미사용 표시된 컴포넌트 |
| `archive/` | - | - | 전체 프로젝트 이전 버전 보관 |

**활성 코드 비율:** 전체 184,625줄 중 활성 ~30,000줄 (약 16%). 나머지는 이전 버전.
