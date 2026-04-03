# 전체 파이프라인 상세 가이드

> **Updated:** 2026-04-02 | 실제 트랜스크립트 → NLP → Scorer → Rewriter → DB → Dashboard

---

## 시작점: Docker 시작

```
./run_all.sh 실행
  → docker compose up -d --build
    → 10개 컨테이너 시작
    → Backend 컨테이너의 prestart.sh 실행:
        1. wait_for_db.py     — PostgreSQL 연결 대기
        2. init_db.py         — 12개 테이블 생성 (이미 있으면 스킵)
        3. alembic stamp/upgrade — 마이그레이션 마킹
        4. pipeline_runner.py — 실제 트랜스크립트 처리 시작
```

---

## 입력 데이터

```
AI_physician_patient_communication/data/input/
├── Input_Keystrokes REC 001 (SID 10).xlsx    ← 수동 키스트로크 트랜스크립트
├── Input_Keystrokes REC001 (SID 14).xlsx
├── Input_Keystrokes REC001 (SID 15).xlsx
├── Input_Keystrokes REC001 (SID 18).xlsx
├── Input_TurboScribe SID 33.csv              ← 자동 트랜스크립션 (TurboScribe)
└── processed_transcripts_sid-01.xlsx
```

Docker에서 이 폴더가 `/app/data/transcripts/`로 마운트됩니다.

각 파일의 구조 (2개 컬럼):

| speaker | text |
|---------|------|
| Interviewer: | so it sounds like in july you had a psa check... |
| Patient: | yes, that's right. |
| Interviewer: | and since you're 52 years old... |

---

## pipeline_runner.py (Thin Main)

`config.yaml`에서 설정을 읽고, 각 파일을 순차 처리합니다:

```python
for filepath in files:
    result = await process_single_file(filepath, Session, cfg)
```

각 파일에 대해 Step 1~10을 실행합니다. 각 Step은 **한 줄의 함수 호출**입니다 (Ivan의 Thin Main 원칙).

---

## Step 1: Read Transcript

**함수:** `transcript_service.read_transcript(file_bytes, filename)`

**하는 일:**
- xlsx 파일을 pandas DataFrame으로 읽기
- `speaker`, `text` 컬럼 확인
- 파일명에서 patient_id 추출: `Input_Keystrokes REC001 (SID 14).xlsx` → `Input_Keystrokes REC001 (SID 14)`
- 1-based index 추가

**결과 DataFrame:**

| index | speaker | text |
|-------|---------|------|
| 1 | Interviewer: | so it sounds like in july... |
| 2 | Patient: | yes, that's right. |
| 3 | Interviewer: | and since you're 52 years old... |
| ... | ... | ... |

SID 14의 경우: **344행**

---

## Step 2: Identify Doctor & Filter

**함수:** `transcript_service.filter_interviewer(df_raw)`

**하는 일 (Ivan의 규칙: 텍스트 양으로 의사 식별):**

1. 각 speaker의 총 텍스트 길이를 합산:
   ```
   Interviewer:    → 28,115 chars (가장 많음 = 의사!)
   Patient:        → 3,200 chars
   Patient's Wife: → 850 chars
   [END FILE]      → 제외
   ```

2. 가장 많이 말한 speaker = 의사 (`Interviewer:`)

3. 의사 행만 필터 + 재인덱싱

**결과 DataFrame:**

| index | speaker | text |
|-------|---------|------|
| 1 | Interviewer: | so it sounds like in july... |
| 2 | Interviewer: | and since you're 52 years old... |
| ... | ... | ... |

SID 14의 경우: 344행 → **161행** (의사 발화만)

---

## Step 3: Split into Sentences

**함수:** `transcript_service.split_sentences(df_filtered)`

**하는 일:**
- 각 발화(utterance)를 개별 문장으로 분리
- regex 토크나이저: `.!?` 뒤의 공백에서 분리
- 소문자 변환 (NLP 모델 입력 형식)
- `i` (발화 번호), `i2` (발화 내 문장 번호), `index` (전역 번호) 부여

**예시:**

원본 발화 (i=20):
```
"You're a 56-year-old patient. The cancer is slow-growing. We need to plan."
```

분리 결과:

| index | i | i2 | speaker | text |
|-------|---|----|---------|----- |
| 45 | 20 | 1 | Interviewer: | you're a 56-year-old patient. |
| 46 | 20 | 2 | Interviewer: | the cancer is slow-growing. |
| 47 | 20 | 3 | Interviewer: | we need to plan. |

SID 14의 경우: 161 발화 → **423 문장**

---

## Step 4: NLP Prediction (5 models, parallel)

**함수:** `transcript_service.run_predictions(df_sentences)`

**하는 일:**
- 423개 문장을 50개씩 배치로 나눔 (`config.yaml`의 `batch_size: 50`)
- 각 배치에서 **5개 모델을 동시에** 호출 (`asyncio.gather`)
- NLP Docker 컨테이너 (3 replicas, 로드밸런싱)에 HTTP POST

**호출 흐름 (배치 1개):**

```
Backend → asyncio.gather([
    predict_batch(chunk, "cp"),   → NLP replica 1
    predict_batch(chunk, "le"),   → NLP replica 2
    predict_batch(chunk, "ed"),   → NLP replica 3
    predict_batch(chunk, "inc"),  → NLP replica 1 (재사용)
    predict_batch(chunk, "ius"),  → NLP replica 2 (재사용)
])
```

**NLP Docker 내부 (R plumber):**
```
문장 텍스트 → textrecipes (토큰화 → 스테밍 → 불용어 제거 → TF-IDF) → ranger Random Forest → .pred_1 확률
```

**결과 DataFrame (423행 × 5개 새 컬럼 추가):**

| index | i | i2 | text | cancer_prognosis | life_expectancy | erectile_dysfunction_potency | continence | irritative_urinary_symptoms... |
|-------|---|----|----|---|---|---|---|---|
| 45 | 20 | 1 | you're a 56-year-old patient. | 0.8503 | 0.6445 | 0.1429 | 0.2157 | 0.0669 |
| 46 | 20 | 2 | the cancer is slow-growing. | 0.9488 | 0.9297 | 0.0349 | 0.4565 | 0.1280 |

각 값은 **`.pred_1` 확률 (0.0~1.0)** — "이 문장이 해당 도메인에 관련될 확률"

SID 14: 423문장 × 9배치 × 5모델 = **45번의 HTTP 호출** (병렬이라 실제 9라운드)

---

## Step 5: Select Top-N

**함수:** `transcript_service.select_top_n(df_predicted, n=10)`

**하는 일:**
- 각 도메인별로 `.pred_1` 내림차순 정렬
- 상위 10개 문장 선택 (동점이면 포함 — R의 `slice_max` 동작)

**결과: dictionary of DataFrames**

```python
{
    "cancer_prognosis": DataFrame (10행),
    "life_expectancy": DataFrame (10행),
    "erectile_dysfunction_potency": DataFrame (10행),
    "continence": DataFrame (10행),
    "irritative_urinary_symptoms_...": DataFrame (10행),
}
```

cancer_prognosis Top-3 예:

| index | i | i2 | text | .pred_1 |
|-------|---|----|----|---------|
| 46 | 20 | 2 | the cancer is slow-growing. | 0.9488 |
| 135 | 48 | 3 | reducing your risk of death from 50 to 18 percent. | 0.9297 |
| 78 | 27 | 4 | you can control this cancer for ten years. | 0.8503 |

---

## Step 6: Generate Context

**함수:** `transcript_service.generate_context(df_sentences, top_df, window=3)`

**하는 일:**
- 각 Top 문장에 대해 ±3 문장의 컨텍스트를 추출
- 대상 문장을 `<main>` 태그로 감쌈

**예시 (index=46, window=3):**

```
index 43: "and none of us live forever."
index 44: "so, this is a little bit different."
index 45: "you're a 56-year-old patient."
index 46: <main>the cancer is slow-growing.</main>      ← 대상 문장
index 47: "we need to plan."
index 48: "so the question is what happens."
index 49: "if you do absolutely nothing."
```

결합 결과:
```
"and none of us live forever..so, this is a little bit different..
you're a 56-year-old patient..<main>the cancer is slow-growing.</main>.
we need to plan..so the question is what happens..if you do absolutely nothing."
```

---

## Step 7: Export xlsx

**함수:** `transcript_service.export_to_xlsx(final_results, patient_id)`

**하는 일:**
- 5개 시트(cp, inc, ed, ius, le)를 가진 xlsx 파일을 메모리에 생성
- 각 시트: name, index, i, i2, speaker, text, .pred_1, context 컬럼

이 xlsx는 나중에 `transcript_analysis_log.xlsx_data`에 바이너리로 저장됩니다.

---

## Step 8: Score Sentences (Consultation Quality 0-5)

**함수:** `scorer_service.score_batch(scorer_input)`

**하는 일:**
1. Top-N 결과에서 중복 제거 (같은 문장이 여러 도메인에 있으면 가장 높은 확률의 도메인만)
2. 각 문장을 `consultation-scorer` Docker 서비스에 전송
3. 0-5 정수 품질 점수를 받음

**호출:**
```
POST http://consultation-scorer:8001/score/batch
Body: {"sentences": [
    {"text": "the cancer is slow-growing.", "domain": "cp"},
    {"text": "reducing your risk of death...", "domain": "cp"},
    ...
]}
```

**응답:**
```json
{"scores": [
    {"text": "the cancer is slow-growing.", "domain": "cp", "score": 4},
    {"text": "reducing your risk of death...", "domain": "cp", "score": 2},
    ...
]}
```

현재 placeholder: deterministic pseudo-random (hash 기반). 향후 Guillermo의 AI 모델로 교체 예정.

SID 14: **47개 문장에 0-5 점수 부여**

---

## Step 9: Rewrite Patient Summaries

**함수:** `rewriter_service.rewrite_batch(domains_for_rewrite)`

**하는 일:**
1. 각 도메인의 Top-3 문장을 추출 (`config.yaml`의 `summary_top_k: 3`)
2. `patient-summary-rewriter` Docker 서비스에 전송
3. 환자 친화적 요약 텍스트를 받음

**호출:**
```
POST http://patient-summary-rewriter:8002/rewrite/batch
Body: {"domains": [
    {"sentences": ["sentence1", "sentence2", "sentence3"], "domain": "cp"},
    {"sentences": [...], "domain": "le"},
    {"sentences": [...], "domain": "ed"},
    {"sentences": [...], "domain": "inc"},
    {"sentences": [...], "domain": "ius"}
]}
```

**응답:**
```json
{"summaries": [
    {"domain": "cp", "summary": "sentence1 sentence2 sentence3"},
    {"domain": "le", "summary": "..."},
    ...
]}
```

현재 placeholder: pass-through (입력 문장을 그대로 합침). 향후 Guillermo의 AI 모델로 교체 예정.

---

## Step 10: Save to DB

**함수:** `persistence.save_all(Session, ...)`

**하는 일 (단일 트랜잭션):**

| 순서 | 테이블 | 행 수 | 내용 |
|------|--------|-------|------|
| 1 | `transcript_analysis_log` | 1 | 실행 기록 (patient_id, top_n, context_window, xlsx 바이너리) |
| 2 | `sentence_prediction` | 50 | 5도메인 × 10문장, `.pred_1` 확률 + context |
| 3 | `doctor_sentence_view` | 47 | 중복 제거된 문장 + **0-5 품질 점수** + 도메인 이름 |
| 4 | `patient_summary` | 1 | 5개 도메인 AI 요약 텍스트 (class_1~5, summary_class_1~5) |
| 5 | `patient_summary_scoring` | 1 | 5개 도메인 환자 평가 (초기 NULL — 환자가 나중에 입력) |
| 6 | `patient_responses` | 1 | 5개 도메인 자유 텍스트 응답 (초기 NULL) |

+ 출력 폴더에 xlsx 파일 저장:
```
/app/data/output/Input_Keystrokes REC001 (SID 14)/
  └── Input_Keystrokes REC001 (SID 14)_predictions.xlsx
```

---

## 전체 파일 처리 결과 (6개 파일)

| 파일 | Doctor Speaker | 문장 수 | 소요 시간 |
|------|---------------|---------|----------|
| SID 10 | `Interviewer:` (28,115 chars) | 44 | ~60s |
| SID 14 | `Interviewer:` (32,400 chars) | 47 | ~50s |
| SID 15 | `Interviewer:` (8,200 chars) | 38 | ~12s |
| SID 18 | `Interviewer:` (30,100 chars) | 46 | ~40s |
| SID 33 | `Speaker 1` (25,000 chars) | 46 | ~40s |
| sid-01 | `Interviewer` (18,500 chars) | 45 | ~35s |

**총: 266개 doctor 문장, 300개 predictions, 6개 patient summaries**

---

## 그 후: 대시보드가 DB에서 읽기

### Doctor Demo (`PhysicianReportsModifiedV41Timothy.tsx`)
```
GET /api/doctor/files → file_details (파일 + speaker 매핑)
GET /api/doctor/sentences/{file}/{speaker} → doctor_sentence_view에서 읽기
GET /api/doctor/scores/average → 도메인별 평균 점수
GET /api/doctor/scores/trajectory → 시간별 점수 추이
```

### Patient First Visit (`PatientInitialVisitReportV35.tsx`)
```
GET /api/patient/summaries/{file}/{speaker} → patient_summary + patient_summary_scoring
GET /api/patient/sentences/{file} → doctor_sentence_view에서 도메인별 상위 7문장
```

### Patient Follow-Up (`PatientFollowUpReportV31Re.tsx`)
```
GET /api/patient/summaries/{file}/{speaker} → AI 요약 카드
POST /api/surveys/submit → SDM, DCS, Risk Perception, Satisfaction 저장
GET /api/surveys/by-speaker/{speaker} → 이전 응답 복원
```

---

## 두 종류의 Score 구분

| | `sentence_prediction.pred_score` | `doctor_sentence_view.score` |
|---|---|---|
| **범위** | 0.0 ~ 1.0 | 0 ~ 5 |
| **의미** | NLP 모델이 판단한 "이 문장이 해당 도메인에 관련될 **확률**" | 의사의 상담 **품질** 점수 |
| **생성** | Step 4 (NLP Docker) | Step 8 (consultation-scorer) |
| **용도** | Top-N 문장 선택 기준 | 대시보드에 표시되는 점수 |
| **이름 규칙** | `.pred_1`은 "확률" (probability) | score는 "점수" (score) |
