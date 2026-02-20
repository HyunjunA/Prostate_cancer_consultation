# NLP 분류 파이프라인 개요

> 전립선암 상담 녹취록 → NLP 주제 분류
>
> Last updated: 2026-02-10

---

## Pipeline 전체 흐름

```
┌─────────────────────────────┐      ┌──────────────────────────────┐      ┌─────────────────────────────────┐
│         Stage 1             │      │          Stage 2             │      │           Stage 3               │
│   Ella의 TurboScribe 전사   │      │   NLP 모델 입력 형식         │      │       NLP 분류 결과             │
│      (raw transcript)       │      │      (preprocessed)          │      │       (predictions)             │
│                             │      │                              │      │                                 │
│  SID 33 (8).csv             │      │  processed_transcripts_      │      │  {patient_id}_predictions.xlsx  │
│  [start, end, text,         │─────▶│  sid-01.xlsx                 │─────▶│  [5시트: cp, inc, ed, ius, le]  │
│   speaker]                  │      │  [speaker, text]             │      │  [name, index, i, i2, speaker,  │
│                             │      │                              │      │   text, .pred_1, context]       │
│  489 utterances             │      │  192 utterances              │      │  모델당 Top N 문장 + Context    │
└─────────────────────────────┘      └──────────────────────────────┘      └─────────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌─────────────────────────────┐      ┌──────────────────────────────────────────────────────────┐
│    ⚠️ Stage 1 → 2 변환     │      │              ✅ Stage 2 → 3 분석 (구현 완료)             │
│    (미구현 — 최우선 과제)    │      │                                                          │
│                             │      │  [R 경로 — 레거시]       [Backend 경로 — 신규 ✅]         │
│  • Speaker 1 → Interviewer  │      │  process-data-guille.R   POST /api/transcript/analyze     │
│  • Speaker 2 → Patient      │      │                          POST /api/transcript/analyze-batch│
│  • 타임스탬프 제거           │      │                                                          │
│  • 파일명 표준화             │      │  두 경로의 출력이 동일함을 검증 완료                      │
│  • CSV → xlsx 변환           │      │  (.pred_1 차이 < 0.00005)                                │
└─────────────────────────────┘      └──────────────────────────────────────────────────────────┘
```

### Backend 분석 파이프라인 상세 흐름 (Stage 2 → 3)

```
┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐    ┌──────────────────────────────┐
│   Step 1     │    │     Step 2       │    │      Step 3        │    │          Step 4              │
│  xlsx 읽기   │───▶│ Interviewer 필터  │───▶│    문장 분리       │───▶│      5모델 NLP 예측          │
│              │    │                  │    │                    │    │                              │
│ [speaker,    │    │ Interviewer,     │    │ i = 발화 번호      │    │ r01-nlp-classifiers:8000     │
│  text]       │    │ Q, Q1, Q2 등    │    │ i2 = 문장 번호     │    │ cp, le, ed, inc, ius         │
│              │    │ 만 남김          │    │ index = 전체 순서   │    │ → .pred_1 (0~1)             │
└──────────────┘    └──────────────────┘    └────────────────────┘    └──────────────────────────────┘
                                                                                   │
                    ┌──────────────────────────────────────────────────────────────────┘
                    ▼
┌──────────────────────┐    ┌──────────────────────────────┐    ┌──────────────────────────┐
│       Step 5         │    │          Step 6              │    │        Step 7            │
│  Top N 문장 선별     │───▶│    Context 생성              │───▶│     xlsx 출력             │
│                      │    │                              │    │                          │
│ 모델별 .pred_1       │    │ 전후 ±window 문장            │    │ 5개 시트                 │
│ 상위 N개 선택        │    │ 대상 문장: <main>태그        │    │ (cp, inc, ed, ius, le)   │
│ (동점 시 초과 포함)  │    │ 기본 window = 3              │    │ + JSON API 응답          │
└──────────────────────┘    └──────────────────────────────┘    └──────────────────────────┘
```

---

## Stage 1: 원본 전사 파일 (TurboScribe 출력)

- **출처:** Ella가 TurboScribe로 상담 녹음을 전사
- **위치:** `prostate_cancer_R01_raw_transcripts_Ella/`
- **예시 파일:** `SID 33 (8).csv`

### 파일 구조

| 컬럼 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `start` | int | 발화 시작 시간 (ms) | `1430` |
| `end` | int | 발화 종료 시간 (ms) | `2890` |
| `text` | str | 발화 텍스트 | `"Yeah, great doctor."` |
| `speaker` | str | 화자 | `"Speaker 1"`, `"Speaker 2"` |

### 특징
- 데이터 단위: **발화(utterance)** — 한 발화에 여러 문장 포함 가능
- 화자 표기: `Speaker 1` (의사), `Speaker 2` (환자) — 익명화된 상태
- 타임스탬프 포함 (밀리초 단위)
- `SID 33 (8).csv` 기준: 489개 발화, Speaker 1 = 453개(92.6%), Speaker 2 = 36개(7.4%)

---

## Stage 2: NLP 모델 입력 형식 (전처리 후)

- **출처:** Michael이 keystroke 데이터로부터 가공한 형식
- **위치:** `prostate_cancer_R01_NLP_classifiers_Michael/prediction_pipeline_and_results/`
- **예시 파일:** `processed_transcripts_sid-01.xlsx`

### 파일 구조

| 컬럼 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `speaker` | str | 화자 | `"Interviewer"`, `"Patient"` |
| `text` | str | 발화 텍스트 (여러 문장 포함 가능) | `"Here we are. So the one thing..."` |

### 특징
- 데이터 단위: **발화(utterance)**
- 화자 표기: `Interviewer`, `Patient` — 역할이 명시된 상태
- 타임스탬프 없음
- `processed_transcripts_sid-01.xlsx` 기준: 192개 발화

---

## Stage 1 → Stage 2 변환 (미구현)

TurboScribe 출력을 NLP 입력 형식으로 변환하는 전처리가 필요합니다.

### 필요한 변환 작업

| 항목 | Stage 1 (TurboScribe) | Stage 2 (NLP Input) | 변환 |
|------|----------------------|---------------------|------|
| 화자 표기 | `Speaker 1`, `Speaker 2` | `Interviewer`, `Patient` | 매핑 |
| 타임스탬프 | `start`, `end` (ms) | 없음 | 제거 |
| 파일명 | `SID 33 (8).csv` | `processed_transcripts_sid-33.xlsx` | 표준화 |

### Michael의 코멘트 (readme.txt)

> *"The data from TurboScribe will look slightly different — since the code that I wrote was meant for keystrokes. The initial parts will need to be changed to pre-process the TurboScribe input."*

---

## Stage 2 → Stage 3: NLP 분류 (Michael의 파이프라인)

### 처리 과정 (process-data-guille.R)

1. **Interviewer 발화만 필터링**
   - 대상 화자 ID: `INTERVIEWER`, `Interviewer`, `Q`, `Q1`, `Q2`, `Q:` 등
2. **발화 → 문장 분리** (`unnest_tokens('sentences')`)
   - 한 발화가 여러 문장으로 분리됨
   - 각 문장에 `i` (발화 번호), `i2` (문장 번호) 부여
3. **5개 NLP 모델로 예측**
   - 모든 문장을 5개 모델에 각각 통과
   - 각 모델이 0~1 사이의 확률값(`.pred_1`) 반환
4. **모델당 Top 5 문장 선별** (`slice_max`)
5. **Context 추가** (선별된 문장의 전후 ±3문장, `<main>` 태그로 표시)
6. **Excel 출력** (모델별 시트)

### NLP 모델 (5개)

| 모델 | 엔드포인트 | 분류 주제 | Class |
|------|-----------|----------|-------|
| Cancer Prognosis | `/predict/cp` | 암 예후 | 1 |
| Life Expectancy | `/predict/le` | 기대 수명 | 2 |
| Erectile Dysfunction | `/predict/ed` | 발기 부전 | 3 |
| Incontinence | `/predict/inc` | 요실금 | 4 |
| Irritative Urinary Symptoms | `/predict/ius` | 자극성 비뇨기 증상 | 5 |

### 실행 환경
- **Docker 이미지:** `r01-nlp-classifiers:latest`
- **프레임워크:** R 4.5.1 + vetiver + plumber
- **모델 알고리즘:** ranger (Random Forest)
- **API 포트:** 8000 (컨테이너 내부)

---

## Stage 3: 최종 결과물

- **위치:** `prostate_cancer_R01_NLP_classifiers_Michael/prediction_pipeline_and_results/`
- **예시 파일:** `original-study-physician-predictions-top-context.xlsx`

### 파일 구조 (5개 시트: cp, le, ed, inc, ius)

| 컬럼 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `name` | str | 환자 ID | `"sid-01"` |
| `index` | int | 전체 문장 순서 번호 | `21` |
| `i` | int | 발화 번호 | `5` |
| `i2` | int | 발화 내 문장 번호 | `3` |
| `speaker` | str | 화자 (Interviewer만) | `"Interviewer"` |
| `text` | str | 문장 텍스트 | `"and it's actually the best predictor..."` |
| `.pred_1` | float | 모델 예측 확률 (0~1) | `0.9138` |
| `context` | str | 전후 ±3문장 (대상 문장은 `<main>` 태그) | `"so your biopsy...<main>and it's...</main>..."` |

### 특징
- 각 시트에 모델별 **Top 5 문장**만 포함 (높은 확률순)
- 의사(Interviewer) 문장만 대상
- Context로 해당 문장의 맥락 파악 가능

---

## 파일 위치 요약

```
Graciela_Lab_Collab/
│
├── prostate_cancer_R01_raw_transcripts_Ella/                          ← [Stage 1] Ella의 TurboScribe 전사
│   └── SID 33 (8).csv                               489 utterances, 4 columns
│
├── prostate_cancer_R01_NLP_classifiers_Michael/   ← [Stage 2 & 3] Michael의 NLP 파이프라인
│   ├── README.md                                     Docker 이미지 & API 문서
│   │
│   ├── prediction_pipeline_and_results/
│   │   ├── readme.txt                                Michael의 설명 (이메일)
│   │   ├── process-data-guille.R                     R 스크립트 (기존 파이프라인)
│   │   ├── processed_transcripts_sid-01.xlsx         [Stage 2] NLP 입력 예시 (192 utterances)
│   │   └── original-study-physician-predictions-     [Stage 3] NLP 출력 예시 (5 sheets, top 5 per model)
│   │       top-context.xlsx
│   │
│   ├── manual_scoring_ground_truth/
│   │   └── nlp-pilot-manual-scores(cp).csv           수동 채점 정답지 (9,543 sentences, 20 patients)
│   │
│   └── r01-nlp-classifiers-docker-image/             Docker 이미지 파일 (660 MB)
│
└── Prostate_cancer_consultation_dashboard/         ← 웹 대시보드 앱 (Backend + Webapp)
    └── app/Backend/                                  FastAPI + NLP API 프록시 (이번에 구현)
```

---

## 구현 현황

| 단계 | 상태 | 설명 |
|------|------|------|
| **Stage 1 → 2 변환** | ⚠️ 미구현 | TurboScribe CSV → NLP 입력 xlsx 자동 변환 |
| **Stage 2 → 3 분석** | ✅ 구현 완료 | `transcript_service.py` + `routes_transcript.py` (R 스크립트 대체) |

### 남은 작업: Stage 1 → 2 전처리 자동화

TurboScribe CSV를 NLP 입력 형식으로 변환하는 전처리 스크립트가 필요합니다.

1. **Speaker 매핑** — `Speaker 1` / `Speaker 2` → `Interviewer` / `Patient`
2. **타임스탬프 제거** — `start`, `end` 컬럼 삭제
3. **파일명 표준화** — `SID 33 (8).csv` → `processed_transcripts_sid-33.xlsx`
4. **형식 변환** — CSV → xlsx

---

## 관련 문서

- [ML_PIPELINE_ARCHITECTURE_KR.md](./ML_PIPELINE_ARCHITECTURE_KR.md) / [EN](./ML_PIPELINE_ARCHITECTURE_EN.md) — ML 파이프라인 아키텍처 설계 문서
- [ML_PIPELINE_DEVELOPMENT_STATUS_KR.md](./ML_PIPELINE_DEVELOPMENT_STATUS_KR.md) / [EN](./ML_PIPELINE_DEVELOPMENT_STATUS_EN.md) — ML 파이프라인 구현 상태 분석 및 Gap 분석
