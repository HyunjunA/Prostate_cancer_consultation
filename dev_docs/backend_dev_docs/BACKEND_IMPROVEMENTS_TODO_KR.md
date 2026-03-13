# Backend 추가/보완 가능 항목

> Last updated: 2026-02-26
>
> 현재 Backend 구현(`Prostate_cancer_consultation_dashboard/app/Backend/`) 기준.
> Michael의 신규 파일에서 발견된 수정 사항은 별도 문서 참조:
> [NLP_PIPELINE_UPDATE_MICHAELS_CLASSIFIERS_KR.md](../ml_pipeline_dev_docs/NLP_PIPELINE_UPDATE_MICHAELS_CLASSIFIERS_KR.md)

---

## 1. File Management — 보완 가능 항목

| # | 현재 상태 | 보완 가능 |
|---|---|---|
| 1 | TurboScribe CSV → xlsx 변환 자동화 코드 없음 | **자동 변환 모듈** 구현 (유일한 주요 gap) |
| 2 | ~~`download-batch`는 디스크만 확인, DB fallback 없음~~ | ~~단일 `download`처럼 **DB fallback 추가**~~ ✅ **해결 (2026-02-19)** |
| 3 | 같은 patient_id 재분석 시 디스크 파일이 **조용히 덮어쓰기** | 기존 파일 버전 관리 또는 덮어쓰기 전 경고 |
| 4 | 업로드 디렉토리(`/app/uploads/`) 크기 관리 없음 | 오래된 파일 정리 정책 또는 모니터링 |

### 1.1 TurboScribe CSV → xlsx 자동 변환 (주요 gap)

현재 Ella의 TurboScribe CSV (`SID 33 (8).csv`, 컬럼: `start,end,text,Speaker 1`)를
NLP 입력 형식 (`processed_transcripts_sid-01.xlsx`, 컬럼: `speaker,text`)으로 변환하는 자동화 코드가 없음.

**미확인 사항:**
- 현재 수동 작업인가? 별도 스크립트가 존재하는가?
- `Speaker 1` → `Interviewer` 매핑 규칙은 무엇인가?
- 타임스탬프(`start`, `end`) 제거만 하면 되는가?

이 부분이 해결되지 않으면, 새 환자 전사록이 들어올 때마다 수동 변환이 필요하며, 재현성과 확장성을 심각하게 저해함.

### 1.2 `download-batch` DB fallback ~~누락~~ ✅ 해결 (2026-02-19)

> **해결됨:** 배치 다운로드에도 디스크 → DB fallback → 자동 디스크 복원 로직이 추가되었습니다.
> 응답 헤더에 `X-Found-Patients` / `X-Missing-Patients`가 포함됩니다.

---

## 2. State Management (DB) — 보완 가능 항목

| # | 현재 상태 | 보완 가능 |
|---|---|---|
| 5 | 분석 결과 삭제 API 없음 | **DELETE 엔드포인트** 추가 (테스트/잘못된 분석 정리) |
| 6 | `/history`가 메타데이터만 반환 (점수 요약 없음) | 모델별 **평균/최고 점수 요약** 포함 |
| 7 | 전체 환자 목록 조회 API 없음 | **`GET /api/transcript/patients`** — 분석된 환자 전체 목록 |
| 8 | 배치 분석 시 그룹 추적 불가 (각 파일이 개별 row) | `batch_id` 컬럼 추가로 같은 배치 그룹 조회 |
| 9 | `manual_scoring_ground_truth` 데이터가 DB에 없음 | Ground truth 테이블 + NLP 예측 vs 수동 채점 비교 API |
| 10 | 전체 통계/집계 API 없음 | 분석 횟수, 모델별 통계, 환자 수 등 대시보드용 집계 |

### 2.1 분석 결과 삭제 API

현재 테스트/잘못된 분석 결과를 정리하려면 직접 DB에 접근해야 함.
`DELETE /api/transcript/analysis/{analysis_id}` 엔드포인트를 추가하면
`transcript_analysis_log` + `sentence_prediction` (CASCADE)이 함께 삭제됨.

### 2.2 `/history` 점수 요약 포함

현재 `/history/{patient_id}` 응답:
```json
{
  "id": 5,
  "patient_id": "sid-01",
  "total_sentences": 120,
  "top_n": 5,
  "context_window": 3,
  "source_filename": "processed_transcripts_sid-01.xlsx",
  "analyzed_at": "2026-02-12T10:30:00",
  "has_xlsx": true
}
```

보완 시 추가 가능:
```json
{
  ...
  "score_summary": {
    "cp": {"count": 5, "max": 0.987, "avg": 0.891},
    "inc": {"count": 5, "max": 0.945, "avg": 0.823},
    ...
  }
}
```

### 2.3 전체 환자 목록 API

현재 특정 환자의 이력만 조회 가능. 분석된 환자 전체 목록을 반환하는 엔드포인트가 없음.

```
GET /api/transcript/patients
→ [{"patient_id": "sid-01", "analysis_count": 3, "last_analyzed": "..."}, ...]
```

### 2.4 Ground Truth 연동

`manual_scoring_ground_truth/nlp-pilot-manual-scores(cp).csv`가 존재하나 Backend과 미연동.
- Ground truth 데이터를 DB 테이블에 저장
- NLP 예측과 수동 채점 비교 API 제공
- 현재 `cp` 모델만 있음

---

## 3. DB 및 보안 — 보완 필요 항목

### 3.1 인증 정보 관리

| # | 현재 상태 | 위험도 | 보완 필요 |
|---|---|---|---|
| 11 | ~~DB 비밀번호 하드코딩~~ | ~~심각~~ | ✅ **해결 (2026-02-20)** — 환경 변수 참조로 변경 |
| 12 | ~~REDCap API 토큰 git 노출~~ | ~~심각~~ | ✅ **해결 (2026-02-20)** — `.env` → `.gitignore`, git 이력에서 제거 |
| 13 | ~~API Key 하드코딩~~ | ~~높음~~ | ✅ **해결 (2026-02-20)** — 환경 변수로 분리, `.env.example`에 CHANGE_ME 플레이스홀더 |
| 14 | Frontend에 `NEXT_PUBLIC_API_KEY`로 API 키 노출 | **높음** | 프록시 패턴 또는 세션 기반 인증으로 변경 |

### 3.2 Path Traversal (경로 순회 공격)

**파일:** `routes_transcript.py:370-371`

```python
def _xlsx_path(patient_id: str) -> Path:
    return _UPLOAD_DIR / f"{patient_id}_predictions.xlsx"
```

`patient_id`에 대한 검증 없음 — `../../etc/passwd` 같은 값이 들어오면 임의 경로에 파일 쓰기/읽기 가능.

**✅ 해결 (2026-02-20):** 정규식 + `resolve()` 검증이 적용되었습니다.
```python
import re
def _validate_patient_id(patient_id: str) -> str:
    if not re.match(r'^[a-zA-Z0-9_-]+$', patient_id):
        raise HTTPException(400, "Invalid patient_id format")
    return patient_id
```

### 3.3 API 인증 강화

| # | 현재 상태 | 보완 필요 |
|---|---|---|
| 15 | 단일 API 키로 모든 클라이언트 인증 | 사용자별 JWT 토큰 + 만료 시간 |
| 16 | ~~Timing attack 취약 (`==` 비교)~~ | ✅ **해결 (2026-02-20)** — `hmac.compare_digest()` 적용 |
| 17 | Rate limiting 없음 | API 키별 요청 제한 (예: 100 req/min) |
| 18 | 누가 어떤 데이터에 접근했는지 기록 없음 | Audit log 테이블 추가 |

### 3.4 환자 데이터 보호 (PHI)

| # | 현재 상태 | 보완 필요 |
|---|---|---|
| 19 | `sentence_text`, `context` 등 환자 발화가 DB에 평문 저장 | 저장 시 암호화 (pgcrypto 또는 앱 레벨) |
| 20 | xlsx 파일이 디스크에 암호화 없이 저장 | 파일 암호화 또는 접근 권한 관리 |
| 21 | DB 연결에 SSL 미적용 | `?sslmode=require` 추가 |
| 22 | 로그에 patient_id가 평문으로 기록 | 로그에서 PII 마스킹 또는 해싱 |

### 3.5 파일 업로드 검증

| # | 현재 상태 | 보완 필요 |
|---|---|---|
| 23 | `.xlsx` 확장자만 확인 | Content-Type 검증 + 파일 크기 제한 추가 |

### 3.6 보안 우선순위 요약

| 우선순위 | # | 항목 | 상태 |
|---|---|---|---|
| ~~즉시~~ | 12 | `.env`를 `.gitignore`에 추가, git 이력에서 제거 | ✅ 해결 (2026-02-20) |
| ~~즉시~~ | 11, 13 | 하드코딩된 인증 정보를 환경 변수/secrets로 분리 | ✅ 해결 (2026-02-20) |
| ~~높음~~ | 경로 순회 | `patient_id` 입력 검증 (화이트리스트 패턴) | ✅ 해결 (2026-02-20) |
| **높음** | 19, 20 | 환자 데이터 암호화 (HIPAA 준수) | 미해결 |
| **중간** | 15, 17, 18 | 인증 강화 (JWT, rate limiting, audit log) | 부분 해결 (#16 타이밍 공격 ✅) |
| **중간** | 21, 22 | DB SSL + 로그 PII 마스킹 | 미해결 |
| **낮음** | 23 | 파일 업로드 검증 강화 | 미해결 |

---

## 4. 테스트 인프라 — 구현 완료 (2026-02-26)

### 4.1 테스트 수량 요약

| 영역 | 프레임워크 | 테스트 수 | 상태 |
|------|-----------|----------|------|
| Backend Unit/Integration | pytest + pytest-asyncio + aiosqlite | 559 | ✅ 통과 |
| Backend E2E | pytest + httpx (Docker 필요) | 24 | ✅ 통과 |
| Frontend Unit/Integration | Jest + React Testing Library + MSW | 279 | ✅ 통과 |
| Frontend E2E | Playwright (Docker 필요) | 32 | ✅ 통과 |
| **합계** | | **894** | **✅ 전체 통과** |

### 4.2 테스트 실행 방법

**Backend:**
```bash
cd app/Backend

# 전체 단위/통합 테스트 (Docker 불필요)
python -m pytest tests/ -v --tb=short --ignore=tests/e2e

# E2E 테스트 (Docker 필요)
python -m pytest tests/e2e/ -v -m e2e

# 커버리지 리포트
python -m pytest tests/ --cov=. --cov-report=html --ignore=tests/e2e
```

**Frontend:**
```bash
cd app/Webapp

# 전체 단위/통합 테스트
npm test

# 특정 영역만
npm run test:stores       # Zustand 스토어
npm run test:hooks        # Custom hooks
npm run test:coverage     # 커버리지 리포트

# Playwright E2E (Docker 필요)
npx playwright test --config=e2e/playwright.config.ts
```

### 4.3 테스트 카테고리 상세

**Backend (583 tests):**
- Health & Ready (5), Auth 모듈 A/B/C/D (105), Access Control (30), Admin Routes (35)
- Doctor CRUD (45), Patient CRUD (40), Surveys + REDCap (65)
- Transcript Pipeline (60), NLP Proxy (30), Services unit (65)
- Models (45), Integration (37), E2E (24)

**Frontend (311 tests):**
- Zustand Stores 9개 (35), Custom Hooks 6개 (50), API Clients (18)
- Utilities (12), Survey Components 5개 (35), Page Routing (10)
- Integration (15), Playwright E2E: Selection Screen (5) + Survey Submit Flow (7) + 기타 (20)

### 4.4 발견된 이슈

- **NEXT_PUBLIC_* 환경 변수**: Docker 빌드 시 `--build-arg`로 주입 필요 (런타임 환경 변수 아님). `docker-compose.yml`의 `args:` 섹션에 `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_KEY` 등을 추가해야 함.
- **surveysSecondVersion/index.tsx**: 4개 export 누락 (`BaselineQuestions`, `RiskPerceptionSurvey`, `DecisionalConflictSurvey`, `PatientSatisfactionSurvey`) — 빌드 경고 발생하지만 런타임에는 영향 없음 (실제로는 `PatientFollowUpReportV31Re.tsx`에서 직접 import)
