# Webapp (Next.js/React) 최적화 분석 보고서

> **Date:** 2026-04-02
> **Scope:** Frontend webapp — performance, dependencies, tech debt, Docker
> **Tools used:** performance-profiler, dependency-auditor, tech-debt-tracker, docker-development
> **Path:** `app/Webapp/`

---

## 현재 상태 요약

| 항목 | 값 | 평가 |
|------|---|------|
| Docker 이미지 | **1.25GB** | 심각 — 목표 200-300MB |
| node_modules | **888MB** | 매우 큼 |
| First Load JS (/) | **272KB** | 개선 필요 (목표 <150KB) |
| 총 컴포넌트 파일 (.tsx) | **160개** | 많음 |
| 활성 컴포넌트 | **~10개** | 160개 중 10개만 page.tsx에서 import |
| 레거시 버전 파일 | **76개** (64,112줄) | 전체 172,674줄의 37% |
| 차트 라이브러리 | **4개** 동시 사용 | plotly + d3 + chart.js + recharts |

---

## A. 의존성 문제 (Dependency)

### A-1. 미사용 대형 패키지 (HIGH)

코드에서 **전혀 import되지 않거나 주석에서만 참조**되는 패키지:

| 패키지 | node_modules 크기 | 코드 사용 | 상태 |
|--------|-------------------|----------|------|
| `plotly.js` | **97MB** | `notused/` 폴더에서만 (주석) | **미사용** — 제거 가능 |
| `plotly.js-dist` | 10MB | 동일 | **미사용** |
| `plotly.js-dist-min` | 4.4MB | 동일 | **미사용** |
| `react-plotly.js` | 240KB | mock 파일에서만 | **미사용** |
| `maplibre-gl` | **41MB** | 코드에서 import 없음 | **미사용** — plotly 의존성 |
| `mapbox-gl` | **31MB** | 코드에서 import 없음 | **미사용** — plotly 의존성 |
| `@knight-lab/timelinejs` | **26MB** | 코드에서 import 없음 | **미사용** |
| `timeline-js` | 소량 | 코드에서 import 없음 | **미사용** |
| `timelinejs3` | 소량 | 코드에서 import 없음 | **미사용** |
| `react-dnd` + `react-dnd-html5-backend` | 소량 | `notused/` 에서만 | **미사용** |
| `immutability-helper` | 소량 | 코드에서 import 없음 | **미사용** |
| `encoding` | 소량 | 코드에서 import 없음 | **미사용** |
| `react-grid-layout` | 소량 | 코드에서 import 없음 | **미사용** |

**미사용 패키지 합계: ~210MB+ (node_modules의 24%)**

### A-2. 중복 차트 라이브러리 (HIGH)

현재 **4개의 차트 라이브러리**가 동시에 설치됨:

| 라이브러리 | 크기 | 실제 사용 |
|-----------|------|----------|
| `plotly.js` + `react-plotly.js` | ~112MB | ❌ 미사용 (notused 폴더) |
| `d3` | 868KB | ✅ 활성 — charts/ 폴더의 5개 컴포넌트 |
| `chart.js` + `react-chartjs-2` | 6.2MB | ❓ chartOptions.tsx에 설정만 있음 |
| `recharts` | 소량 | ✅ 활성 — AdminTrackingDashboard |

**권장:** plotly 전체 제거, chart.js 사용 여부 확인 후 제거 가능

### A-3. 프로덕션에 불필요한 패키지 (MEDIUM)

| 패키지 | 크기 | 이유 |
|--------|------|------|
| `openai` | 7.2MB | 주석 처리됨 (ReportDownload.tsx에서 commented out) |
| `posthog-js` | **25MB** | PostHogProvider.tsx에서 모두 주석 처리됨 |
| `@types/d3`, `@types/plotly.js`, `@types/papaparse` | 11MB | `dependencies`에 있으나 `devDependencies`에 있어야 함 |

### A-4. 버전 고정 안 됨 (MEDIUM)

대부분 `^` (caret) 범위로 선언:
```json
"next": "13.5.6",          // ✅ 고정
"react": "^18.2.0",        // ⚠️ 18.x 아무 버전
"plotly.js-dist": "^2.35.2"  // ⚠️ 2.x 아무 버전
```

### A-5. Next.js 버전 오래됨 (MEDIUM)

```json
"next": "13.5.6"   // 2023년 10월 릴리스, 현재 15.x
```

Next.js 14+에서 App Router 안정화, Turbopack, Server Actions 등 성능 개선. 단, 메이저 업그레이드는 breaking change 위험.

---

## B. 성능 문제 (Performance)

### B-1. 번들 크기 (HIGH)

빌드 출력:
```
Route (app)                         Size     First Load JS
┌ ○ /                               88.3 kB         272 kB
├ ○ /_not-found                     875 B          81.5 kB
└ ○ /admin/tracking                 15.7 kB         199 kB
+ First Load JS shared by all       80.6 kB
```

`/` 페이지가 **272KB** First Load JS — 이 안에 Doctor Dashboard + Patient Reports + 모든 차트 코드가 포함.

**원인:** page.tsx가 모든 컴포넌트를 static import:
```tsx
import PhysicianReports from "@/components/PhysicianReportsModifiedV41Timothy";
import PatientReportFirstVisit from "@/components/PatientInitialVisitReportV35";
import PatientFollowUpReport from "@/components/PatientFollowUpReportV31Re";
// ... 등 10개 컴포넌트 모두 static import
```

사용자가 Doctor 페이지를 볼 때 Patient 코드도 로드되고, Patient 페이지를 볼 때 Doctor 코드도 로드됨.

**개선 방향:** `next/dynamic`으로 lazy loading
```tsx
const PhysicianReports = dynamic(() => import("@/components/PhysicianReportsModifiedV41Timothy"));
```

### B-2. 거대 단일 컴포넌트 (MEDIUM)

| 컴포넌트 | 줄 수 | 역할 |
|---------|-------|------|
| `ReportDownload.tsx` | **8,178줄** | PDF/이미지 다운로드 |
| `PhysicianReportsModifiedV41Timothy.tsx` | **4,031줄** | Doctor Dashboard |
| `PatientFollowUpReportV35.tsx` | **3,030줄** | Patient Follow-up (비활성) |

4,000줄짜리 컴포넌트는 한 번에 전체가 파싱+컴파일됨. 내부 서브 컴포넌트로 분리하면 tree-shaking + lazy loading 가능.

### B-3. `output: "standalone"` 미활용 (HIGH)

`next.config.js`에 `output: "standalone"`이 설정되어 있지만, Dockerfile에서 **활용하지 않음**:

```dockerfile
# 현재: .next 전체 + node_modules 전체를 복사
COPY --from=builder /app/.next ./.next
RUN npm ci --omit=dev           # production node_modules 재설치 (~500MB+)
```

standalone 모드를 제대로 활용하면:
```dockerfile
# 개선: standalone 출력물만 복사 (node_modules 불필요)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
```

standalone은 필요한 node_modules만 자동으로 `.next/standalone/node_modules`에 포함. **전체 node_modules 설치 불필요.**

---

## C. Docker 문제

### C-1. 이미지 크기 1.25GB (CRITICAL)

**원인 분석:**

```
node:18-alpine base                     ~170MB
+ npm ci --omit=dev (production deps)   ~500MB  ← standalone 쓰면 불필요
+ .next 빌드 출력                        ~150MB
+ public 에셋                            ~20MB
+ express + server.js                    ~10MB
= 총 ~850MB (압축 후 1.25GB 추정)
```

### C-2. standalone 미활용으로 인한 낭비 (CRITICAL)

`next.config.js`에 `output: "standalone"`이 이미 설정됨. 하지만 Dockerfile이 이를 무시하고 `npm ci --omit=dev`로 전체 production dependencies를 다시 설치.

standalone 활용 시 예상:
```
node:18-alpine base                     ~170MB
+ .next/standalone (필요한 deps만)       ~50MB
+ .next/static                          ~10MB
+ public                                ~20MB
= 총 ~250MB (현재의 20%)
```

### C-3. 커스텀 Express server 사용 (MEDIUM)

```dockerfile
CMD ["node", "server.js"]   # Express 서버
```

Next.js standalone은 자체 서버(`server.js`)를 `.next/standalone/`에 생성함. 커스텀 Express가 필요한 이유 확인 필요 — 프록시 미들웨어 등이 없으면 standalone 기본 서버로 교체 가능.

### C-4. .dockerignore 중복 (LOW)

같은 패턴이 두 번 선언:
```
node_modules    ← 1번째
...
node_modules    ← 2번째 (중복)
```

### C-5. 빌드 시 API 키 노출 (MEDIUM)

```dockerfile
ARG NEXT_PUBLIC_API_KEY
ENV NEXT_PUBLIC_API_KEY=$NEXT_PUBLIC_API_KEY
```

`NEXT_PUBLIC_*` 변수는 JS 번들에 하드코딩됨. Docker 이미지 layer에도 남음. 프론트엔드에서 API 키가 노출되는 것은 설계상 의도적이지만, 이미지를 공유하면 키도 공유됨.

---

## D. Tech Debt

### D-1. 레거시 버전 파일 76개, 64,112줄 (HIGH)

```
PatientReportModifiedV2.tsx   ~ V29  (18개 파일)
PhysicianReportsModified.tsx  ~ V41  (24개 파일)
PatientFollowUpReport.tsx     ~ V35  (6개 파일)
notused/ 폴더                        (19개 파일)
기타 레거시                           (9개 파일)
```

**활성 파일은 10개**이고 나머지 150개는 레거시. 전체 172,674줄 중 64,112줄(37%)이 사용되지 않는 이전 버전.

**영향:**
- 빌드 시간 증가 (TypeScript 컴파일 대상)
- 검색 노이즈 (코드 검색 시 레거시 결과 다수)
- 신규 개발자 혼란 (어느 파일이 활성인지 불명확)
- Docker 이미지 크기 증가 (불필요한 파일 포함)

### D-2. `@types/*`가 dependencies에 있음 (MEDIUM)

```json
"dependencies": {
    "@types/d3": "^7.4.3",          // devDependencies에 있어야 함
    "@types/papaparse": "^5.3.16",  // devDependencies에 있어야 함
    "@types/plotly.js": "^2.35.0",  // devDependencies에 있어야 함 (plotly 자체도 미사용)
}
```

production 빌드에 타입 정의가 포함됨.

### D-3. 빌드 경고 (LOW)

빌드 시 경고 4개:
```
export 'QuestionGroup' was not found in './DecisionalConflictSurvey'
export 'SatisfactionRatingInput' was not found in './PatientSatisfactionSurvey'
export 'StarRatingInput' was not found in './PatientSatisfactionSurvey'
export 'SATISFACTION_QUESTIONS' was not found in './PatientSatisfactionSurvey'
```

`surveysSecondVersion/index.tsx`에서 존재하지 않는 export를 re-export.

### D-4. ESLint + TypeScript 검사 비활성 (LOW)

```javascript
// next.config.js
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```

타입 에러와 린트 에러가 빌드를 통과함. 런타임 에러 가능성 증가.

---

## 우선순위 요약

| 순위 | 항목 | 카테고리 | 심각도 | 예상 효과 |
|------|------|---------|--------|----------|
| **1** | Docker standalone 활용 | Docker | **CRITICAL** | 1.25GB → ~250MB (**80% 감소**) |
| **2** | 미사용 패키지 제거 (plotly, maplibre 등) | Dependency | **HIGH** | node_modules 888MB → ~650MB |
| **3** | 레거시 컴포넌트 정리 (76파일, 64K줄) | Tech Debt | **HIGH** | 빌드 시간 + 이미지 크기 감소 |
| **4** | 동적 import (next/dynamic) | Performance | **HIGH** | First Load JS 272KB → ~150KB |
| **5** | 중복 차트 라이브러리 정리 | Dependency | **HIGH** | plotly+chart.js 제거 → ~120MB 절약 |
| **6** | @types를 devDependencies로 이동 | Dependency | MEDIUM | production deps 크기 감소 |
| **7** | posthog-js, openai 제거 (미사용) | Dependency | MEDIUM | ~32MB 절약 |
| **8** | 빌드 경고 수정 | Tech Debt | LOW | 클린 빌드 |
| **9** | .dockerignore 중복 정리 | Docker | LOW | 가독성 |
| **10** | ESLint/TypeScript 검사 활성화 | Tech Debt | LOW | 코드 품질 |
