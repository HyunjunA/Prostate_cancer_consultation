# 미완료 개선 항목 (TODO)

> 5개 분석 리포트에서 추출한 미완료 항목을 우선순위별로 통합 정리.  
> 원본: BACKEND_IMPROVEMENTS_TODO_KR, DB_ISSUES_ANALYSIS, ML_MODEL_DEPLOYMENT_OPTIMIZATION, WEBAPP_OPTIMIZATION_ANALYSIS  
> Last consolidated: 2026-04-03

---

## CRITICAL

| # | 영역 | 항목 | 상세 | 예상 효과 |
|---|------|------|------|----------|
| 1 | ML 배포 | **NLP 모델 예측 병렬화** | 5개 모델 순차 호출 → `asyncio.gather()` 동시 호출 | 파이프라인 5배 속도 향상 |
| 2 | Webapp Docker | **standalone 출력 활용** | `next.config.js`에 설정됐지만 Dockerfile이 무시. node_modules 재설치 대신 standalone 복사 | 이미지 1.25GB → ~250MB (80% 감소) |

---

## HIGH

### Backend — 기능

| # | 항목 | 상세 |
|---|------|------|
| 3 | **TurboScribe CSV → xlsx 자동 변환** | Ella의 TurboScribe CSV를 NLP 입력 형식으로 변환하는 자동화 코드 없음 (유일한 주요 gap) |
| 4 | 분석 결과 삭제 API | `DELETE /api/transcript/analysis/{id}` — transcript_analysis_log + sentence_prediction CASCADE |
| 5 | 전체 환자 목록 API | `GET /api/transcript/patients` — 분석된 환자 전체 목록 + 분석 횟수 |
| 6 | `/history` 점수 요약 | 모델별 평균/최고 점수를 history 응답에 포함 |

### Backend — 보안

| # | 항목 | 상세 |
|---|------|------|
| 7 | **환자 데이터 암호화 (PHI)** | sentence_text, context 등 평문 저장 중. pgcrypto 또는 앱 레벨 암호화 필요 (HIPAA) |
| 8 | xlsx 파일 암호화 | 디스크에 암호화 없이 저장 중 |
| 9 | Frontend API 키 노출 | `NEXT_PUBLIC_API_KEY`로 클라이언트에 노출. 프록시 패턴 또는 세션 기반 인증으로 변경 |

### ML 배포

| # | 항목 | 상세 | 예상 효과 |
|---|------|------|----------|
| 10 | NLP 리플리카 수 조정 | 병렬화 후 3→5 replicas + CPU 제한 추가 | 동시 처리 용량 67% 증가 |
| 11 | 연결 풀 최적화 | httpx max=20→30, keepalive=10→20 | +15-20% 처리량 |
| 12 | 재시도 로직 개선 | jitter 추가 + 4xx/5xx 에러 분류 (permanent/transient) | thundering herd 방지 |

### Webapp

| # | 항목 | 상세 | 예상 효과 |
|---|------|------|----------|
| 13 | 미사용 패키지 제거 | plotly(112MB), maplibre(41MB), mapbox(31MB), timelinejs(26MB) 등 | node_modules ~210MB 절약 |
| 14 | 레거시 컴포넌트 정리 | 76파일, 64,112줄 — 160개 중 활성 10개만 | 빌드 시간 + 이미지 크기 감소 |
| 15 | 동적 import | page.tsx의 static import → `next/dynamic` lazy loading | First Load JS 272KB → ~150KB |
| 16 | 중복 차트 라이브러리 정리 | plotly + chart.js 제거 (d3 + recharts만 유지) | ~120MB 절약 |

---

## MEDIUM

### Backend

| # | 항목 | 상세 |
|---|------|------|
| 17 | JWT 인증 | 단일 API 키 → 사용자별 JWT + 만료 시간 |
| 18 | Audit log | 누가 어떤 데이터에 접근했는지 기록하는 테이블 |
| 19 | batch_id 추적 | 배치 분석 그룹 조회를 위한 컬럼 추가 |
| 20 | 전체 통계/집계 API | 분석 횟수, 모델별 통계, 환자 수 등 대시보드용 |
| 21 | Ground truth DB 연동 | nlp-pilot-manual-scores(cp).csv → DB 테이블 + 예측 vs 수동 비교 API |
| 22 | DB SSL 적용 | `?sslmode=require` 추가 |
| 23 | 로그 PII 마스킹 | patient_id 등 평문 기록 방지 |
| 24 | patient_id 재분석 시 파일 버전 관리 | 조용한 덮어쓰기 → 경고 또는 버전 관리 |
| 25 | 업로드 디렉토리 크기 관리 | 오래된 파일 정리 정책 또는 모니터링 |

### ML 배포

| # | 항목 | 상세 | 예상 효과 |
|---|------|------|----------|
| 26 | 적응형 타임아웃 | 30초 고정 → 페이로드 크기별 5/10/15초 | 불필요한 대기 제거 |
| 27 | 캐시 전략 개선 | TTL 1h→30m, 텍스트 정규화, hit/miss 통계 | +25-40% hit rate |
| 28 | 에러 분류 강화 | 단일 NLPServiceError → Transient/Permanent 분리 | 불필요한 재시도 제거 |

### Webapp

| # | 항목 | 상세 |
|---|------|------|
| 29 | @types를 devDependencies로 이동 | d3, papaparse, plotly.js 타입이 production deps에 있음 |
| 30 | posthog-js, openai 제거 | 둘 다 주석 처리 상태 (~32MB) |
| 31 | Next.js 13 → 14+ 업그레이드 | App Router 안정화, Turbopack 등 (breaking change 위험) |
| 32 | 빌드 시 API 키 레이어 노출 | Docker 이미지 layer에 NEXT_PUBLIC_API_KEY 남음 |

---

## LOW

| # | 영역 | 항목 | 상세 |
|---|------|------|------|
| 33 | Backend | 파일 업로드 검증 강화 | `.xlsx` 확장자만 확인 → Content-Type + 크기 제한 |
| 34 | ML 배포 | ONNX 변환 (장기) | R Docker 1.41GB → Python ~200MB. 연구 규모에서는 불필요 |
| 35 | Webapp | 빌드 경고 수정 | surveysSecondVersion/index.tsx 4개 export 누락 |
| 36 | Webapp | .dockerignore 중복 정리 | node_modules 2번 선언 |
| 37 | Webapp | ESLint/TypeScript 검사 활성화 | `ignoreBuildErrors: true` 제거 |

---

## 우선순위 요약

| 등급 | 개수 | 핵심 |
|------|------|------|
| **CRITICAL** | 2 | NLP 병렬화, Webapp Docker 80% 축소 |
| **HIGH** | 14 | TurboScribe 변환, PHI 암호화, API 개선, 패키지 정리, 레거시 제거 |
| **MEDIUM** | 16 | JWT, audit log, 캐시, 타임아웃, Next.js 업그레이드 |
| **LOW** | 5 | 파일 검증, ONNX, 빌드 경고 |
| **합계** | **37** | |
