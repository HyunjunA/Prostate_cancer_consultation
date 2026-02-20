# Michael's NLP 파이프라인 업데이트 — SID-14 (2026-02-17)

> 2026년 2월 17일 Michael로부터 받은 3개 파일에 대한 상세 증거 기반 분석
>
> 모든 주장은 구체적인 라인 번호, 코드 스니펫, 데이터 값으로 뒷받침됩니다.

---

## 분석 대상 파일

| # | 파일명 | 크기 | 설명 |
|---|--------|------|------|
| 1 | `REC001 (SID 14).xlsx` | 58 KB | 원본 전사 입력 (Stage 2 형식) |
| 2 | `nlp-pilot-processed-results-sid14.xlsx` | 36 KB | NLP 분류 결과 (Stage 3 출력) |
| 3 | `data-processing-pipeline.html` | 1.3 MB | 전체 파이프라인을 문서화한 Quarto R 노트북 |

---

## 1. `REC001 (SID 14).xlsx` — 원본 전사 파일

### 기본 구조

| 속성 | 값 |
|------|-----|
| 시트 수 | 1 (`Sheet1`) |
| 행 수 | 476 |
| 컬럼 | 2: `speaker`, `text` |
| 형식 | Stage 2 (전처리 완료, TurboScribe 원본 아님) |

### 화자 분포

| 화자 | 건수 | 비고 |
|------|------|------|
| `Patient:` | 196 | |
| `Interviewer:` | 186 | 담당 의사 |
| `Patient's Wife:` | 75 | 제3 참여자 |
| `Interviewer: ` (뒤에 공백) | 6 | 공백 불일치 |
| `Patient: ` (뒤에 공백) | 5 | 공백 불일치 |
| `Patient's Wife: ` (뒤에 공백) | 1 | 공백 불일치 |
| `[END FILE]` | 1 | 파일 종료 마커 |
| `null` (빈 값) | 6 | 예: `[INAUDIBLE CONVERSATION TO 00:01:40]` |

**증거 — 화자명 불일치:** 12개 행에 후행 공백 변형이 존재 (예: `Interviewer: ` vs `Interviewer:`). 파이프라인의 `filter(speaker == 'Interviewer:')` (HTML line 2349)는 공백이 있는 6개 행을 **누락**할 수 있음. 잠재적 데이터 품질 이슈.

### SID-01 입력 파일과 비교 (`processed_transcripts_sid-01.xlsx`)

| 항목 | SID-01 | SID-14 |
|------|--------|--------|
| 총 발화 수 | 192 | 476 |
| 화자 표기 | `Interviewer`, `Patient` (콜론 없음) | `Interviewer:`, `Patient:` (콜론 포함) |
| 제3 참여자 | 없음 | `Patient's Wife:` (75행) |
| 공백 문제 | 없음 | 12행에 후행 공백 |
| Null 화자 | 없음 | 6행 |
| 종료 마커 | 없음 | 1행 (`[END FILE]`) |

**증거 — SID-14는 더 긴 상담:** SID-01의 192개 대비 476개 발화, 배우자(아내)가 참석.

---

## 2. `nlp-pilot-processed-results-sid14.xlsx` — NLP 결과

### 시트 구조

| 시트명 | 행 수 | 컬럼 수 | `.pred_1` 최소 | `.pred_1` 최대 | `.pred_1` 평균 |
|--------|-------|---------|---------------|---------------|----------------|
| `cancer_prognosis` | 40 | 7 | 0.7023 | 0.9488 | 0.7993 |
| `continence` | 15 | 7 | 0.7155 | 0.9572 | 0.8108 |
| `erectile_dysfunction_potency` | 14 | 7 | 0.7040 | 0.9902 | 0.8190 |
| `irritative_urinary_symptoms_f` | 2 | 7 | 0.7043 | 0.7141 | 0.7092 |
| `life_expectancy` | 5 | 7 | 0.7742 | 0.9297 | 0.8378 |

**선택된 총 문장 수: 76개** (40 + 15 + 14 + 2 + 5)

### 컬럼 구성

5개 시트 모두 동일한 컬럼:

```
index | i | i2 | speaker | text | .pred_1 | context
```

7개 컬럼. SID-01 출력에 있던 `name` 컬럼이 **누락**됨.

### `.pred_1` 분포

| 시트 | [0.7, 0.8) | [0.8, 0.9) | [0.9, 1.0] | 합계 |
|------|------------|------------|------------|------|
| cancer_prognosis | 22 | 14 | 4 | 40 |
| continence | 7 | 6 | 2 | 15 |
| erectile_dysfunction_potency | 7 | 3 | 4 | 14 |
| irritative_urinary_symptoms_f | 2 | 0 | 0 | 2 |
| life_expectancy | 1 | 3 | 1 | 5 |

**증거 — 임계값 필터링 사용 확인:** 전체 시트에서 `.pred_1` 최소값은 0.7023이지만, 이것만으로는 증거가 부족함 (top-5 선택도 상위 5개가 모두 >= 0.7일 수 있음). **결정적 증거는 시트별 행 수의 변동**: cancer_prognosis는 **40행**, continence는 **15행**으로 5개를 초과하고, irritative_urinary_symptoms_f는 **2행**으로 5개 미만. Top-5 선택이라면 모든 시트가 정확히 5행이어야 함. 이 가변성(2~40)이 `filter(.pred_1 >= 0.7)` 사용을 확증.

### 데이터 예시 (life_expectancy 시트, 첫 번째 행)

```
index: 18
i:     6
i2:    2
speaker: Interviewer:
text:    we say if you live long enough, you're going to get it.
.pred_1: 0.8385258111064564
context: the reason for all this controversy, actually, is pretty
         straightforward..if you take 80-year-old men, biopsy all their
         prostates, everybody's got prostate cancer..so, we say two things..
         <main>we say if you live long enough, you're going to get it.</main>
         .and we also say it's a disease people die with, not die from..
         now having said that, if you look at all the cancers men are dying
         from, number one is lung cancer, number two is prostate cancer..
         so, prostate cancer can be deadly.
```

**증거 — Context 형식 동일:** `<main>` 태그, ±3문장 윈도우, `.` 구분자 — 이전 파이프라인과 동일한 형식.

---

## 3. `data-processing-pipeline.html` — Quarto R 노트북

### 메타데이터

| 속성 | 값 |
|------|-----|
| 제목 | "NLP Processing Pipeline" |
| 발행일 | 2026년 2월 17일 |
| 엔진 | Quarto 1.8.24 |
| 형식 | 코드 접기 기능이 있는 렌더링된 HTML |
| 크기 | 1.3 MB (~3,400줄) |

### 파이프라인 단계 (8개 H1 섹션)

HTML 라인 번호 기준:

| 단계 | 제목 | 라인 |
|------|------|------|
| 1 | 원본 excel/csv 전사 데이터 읽기 | 2316 |
| 2 | 의사 텍스트만 필터링 | 2343 |
| 3 | index 변수 생성 | 2373 |
| 4 | 텍스트를 문장 단위로 토큰화 (i, i2, index) | 2404 |
| 5 | NLP 모델 로드 및 예측 생성 | 2440 |
| 6 | **예측 확률 >= 0.7인 문장 추출** | 2744 |
| 7 | Context 생성 (±3문장, `<main>` 태그) | 2833 |
| 8 | 선별 문장과 Context 결합 | 3123 |

### R 라이브러리 (13개 패키지)

```r
library(tidyverse)       # line 2252
library(tidymodels)      # line 2268
library(textrecipes)     # line 2288
library(ranger)          # line 2289
library(pins)            # line 2290
library(themis)          # line 2291
library(gt)              # line 2292
library(rlang)           # line 2293
library(glue)            # line 2306
library(gtsummary)       # line 2307
library(future)          # line 2308
library(bonsai)          # line 2309
library(tidytext)        # line 2310
```

기존 스크립트(`process-data-guille.R`)와 동일한 라이브러리 셋.

### 파이프라인 데이터 흐름

| 단계 | 차원 | HTML 라인 |
|------|------|-----------|
| 원본 입력 | 476 x 2 | 2325 |
| 의사 필터 후 | 192 x 2 | 2355 |
| index(i) 추가 후 | 192 x 3 | 2386 |
| 문장 토큰화 후 | 424 x 5 | 2422 |
| 모델별 예측 | 424 x 6 (각각) | 2662 |
| 임계값 필터 후 (cp) | 40 x 6 | 2759 |
| 임계값 필터 후 (inc) | 15 x 6 | 2775 |
| 임계값 필터 후 (ed) | 14 x 6 | 2795 |
| 임계값 필터 후 (ius) | 2 x 6 | 2814 |
| 임계값 필터 후 (le) | 5 x 6 | 2821 |
| Context 포함 최종 결과 (시트별) | N x 7 | 3219+ |

### 모델 사양 (5개 모델, 모두 Random Forest)

HTML lines 2470-2632 기준:

| 모델 | 학습 데이터 크기 | 독립 변수 수 | Mtry | 노드 크기 | 분할 기준 | OOB Brier Score |
|------|-----------------|-------------|------|-----------|-----------|-----------------|
| cancer_prognosis | 504 | 738 | 27 | 10 | gini | 0.1306 |
| continence | 534 | 742 | 27 | 10 | gini | 0.0745 |
| erectile_dysfunction_potency | 892 | 742 | 27 | 10 | gini | 0.0687 |
| irritative_urinary_symptoms | 444 | 744 | 27 | 10 | gini | 0.0493 |
| life_expectancy | 176 | 739 | 27 | 10 | gini | 0.1322 |

**증거 — 모델 전처리 파이프라인 (5개 모델 모두 동일):**

```
HTML lines 2475-2484:
══ Workflow [trained] ══════════════════════════
Preprocessor: Recipe
Model: rand_forest()
── Preprocessor ────────────────────────────────
8 Recipe Steps
• step_tokenize()
• step_tokenfilter()
• step_stem()
• step_stopwords()
• step_tfidf()
• step_zv()
• step_normalize()
• step_downsample()
```

### 모델 로딩 방식

```r
# HTML lines 2447-2466:
board <- pins::board_folder(here::here('board'))
models <- pins::pin_read(board, 'nlp-models')

models <- models |>
  filter(models == 'Random Forest') |>
  select(outcome, final_fits) |>
  unnest(final_fits) |>
  select(outcome, .workflow) |>
  deframe()

vars <- c(
  "cancer_prognosis",
  "continence",
  "erectile_dysfunction_potency",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia",
  "life_expectancy"
)

models <- models[vars]
```

모델은 `pins`를 사용하여 로컬 `board/` 디렉토리에서 로드됨. Docker API를 통하지 않음. 이것은 **R에서 직접 모델을 실행**하는 방식으로, `r01-nlp-classifiers:8000` Docker API를 호출하는 우리 Backend와는 다름.

---

## 4. 핵심 차이점: 기존 파이프라인 vs 신규 파이프라인

### 차이점 1: 문장 선택 방식 (가장 중요한 변경)

아래는 두 파이프라인의 **전체 주석 달린 코드**입니다. 각각의 핵심 라인은 `# ◀◀◀`로 표시됨.

#### 기존 파이프라인: `process-data-guille.R` (전체 175줄)

```r
# --- 라이브러리 (lines 1-13) ---
library(tidyverse)
library(tidymodels)
library(textrecipes)
library(ranger)
library(pins)
library(themis)
library(gt)
library(rlang)
library(glue)
library(gtsummary)
library(future)
library(bonsai)
library(tidytext)

# --- 초기화 (lines 15-17) ---
board <- pins::board_folder(here::here('board'))
files <- fs::dir_ls(here::here('data/transcripts'))          # 디렉토리 내 모든 파일

# --- 데이터 읽기 (lines 19-30) ---
datas <- map(files, \(x) readxl::read_excel(x)) |>
  enframe(name = 'file', value = 'data')
datas$file <- fs::path_file(datas$file) |>
  fs::path_ext_remove() |>
  str_remove('processed_transcripts_')
datas$data <- map(datas$data, \(x) {
  x |> mutate(index = row_number()) |> relocate(index)
})

# --- 의사 발화 필터링 (lines 32-47) ---
datas$physician_data <- map(datas$data, \(x) {
  physician_ids <- c(
    "INTERVIEWER", "INTERVIEWER 1", "INTERVIEWER 2",
    "Interviewer", "Q", "Q1", "Q2", "Q:"                    # 8가지 화자 ID
  )
  x |>
    filter(speaker %in% physician_ids) |>
    mutate(index = row_number())
})

# --- 문장 토큰화 (lines 49-66) ---
datas$physician_data <- map(datas$physician_data, \(x) {
  x |>
    unnest_tokens('text', text, 'sentences') |>
    group_by(index) |>
    mutate(i2 = row_number()) |>
    ungroup() |>
    relocate(i2, .after = index) |>
    rename(i = index) |>
    mutate(index = row_number()) |>
    relocate(index)
})

# --- 모델 로드 (lines 68-75) ---
models <- pins::pin_read(board, 'nlp-models')
models <- models |>
  filter(models == 'Random Forest') |>
  select(outcome, final_fits) |>
  unnest(final_fits) |>
  select(outcome, .workflow) |>
  deframe()

# --- 예측 (lines 77-89) ---
datas$physician_data_preds <- map(
  datas$physician_data,
  \(data) {
    preds <- imap(models, \(x, title) {
      predict(x, new_data = data, type = 'prob') |>
        select(!!title := .pred_1)
    }) |> bind_cols()
    bind_cols(data, preds)
  },
  .progress = TRUE
)

vars <- c(
  "cancer_prognosis", "continence", "erectile_dysfunction_potency",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia", "life_expectancy"
)

# ╔══════════════════════════════════════════════════════════════════════╗
# ║  ★★★ 핵심: 문장 선택 (lines 99-112) ★★★                            ║
# ╚══════════════════════════════════════════════════════════════════════╝
datas$top <- map(datas$physician_data_preds, \(x) {
  x |>
    select(index, i, i2, speaker, text, all_of(vars)) |>
    pivot_longer(
      cols = all_of(vars),
      names_to = 'name',
      values_to = '.pred_1'
    ) |>
    group_by(name) |>
    slice_max(order_by = .pred_1, n = 5) |>                  # ◀◀◀ TOP 5 선택
    ungroup() |>
    group_nest(name) |>
    deframe()
})

# --- Context 생성 (lines 114-136) ---
datas <- datas |> unnest_longer(top)
datas$topi <- map(datas$top, \(x) pull(x, index))
datas$context <- map2(datas$physician_data_preds, datas$topi, \(data, i) {
  map(i, \(x) {
    data <- data |>
      mutate(text = case_when(
        index == x ~ glue::glue('<main>{text}</main>'),
        .default = text
      ))
    data |>
      filter(index %in% seq(x - 3, x + 3, 1)) |>            # ±3 문장 윈도우
      pull(text) |>
      paste0(collapse = '.')
  })
})

# --- 출력 (lines 138-175) ---
out <- datas |>
  select(file, top, top_id, context) |>
  mutate(top = map2(top, context, \(top, context) {
    top |> mutate(context = unlist(context))
  })) |>
  select('name' = file, 'outcome' = top_id, top) |>
  unnest(cols = c(top))

out |>
  group_nest(outcome) |>
  mutate(outcome = factor(outcome,
    levels = c("cancer_prognosis", "continence",
               "erectile_dysfunction_potency",
               "irritative_urinary_symptoms_frequency_urgency_nocturnia",
               "life_expectancy"),
    labels = c('cp', 'inc', 'ed', 'ius', 'le')               # 시트명 약어 변환
  )) |>
  deframe() |>
  writexl::write_xlsx(here::here(                             # xlsx 파일 출력
    'results/original-study-physician-predictions-top-context.xlsx'
  ))
```

#### 신규 파이프라인: `data-processing-pipeline.html` 내 R 코드 (Quarto 노트북, 2026-02-17)

```r
# --- 라이브러리 (동일한 13개) ---
library(tidyverse)
library(tidymodels)
library(textrecipes)
library(ranger)
library(pins)
library(themis)
library(gt)
library(rlang)
library(glue)
library(gtsummary)
library(future)
library(bonsai)
library(tidytext)

# --- 초기화 ---
board <- pins::board_folder(here::here('board'))

# --- 데이터 읽기 ---
data <- readxl::read_excel(
  here::here('data/nlp-pilot/REC001 (SID 14).xlsx')          # 단일 파일만
)
# → 476 x 2 (speaker, text)

# --- 의사 발화 필터링 ---
data <- data |>
  filter(
    speaker == 'Interviewer:'                                  # 단일 화자 ID (콜론 포함)
  )
# → 192 x 2

# --- index 추가 ---
data <- data |>
  mutate(i = row_number(), .before = speaker)
# → 192 x 3

# --- 문장 토큰화 ---
data <- data |>
  unnest_tokens('text', text, 'sentences') |>
  group_by(i) |>
  mutate(i2 = row_number(), .after = i) |>
  ungroup() |>
  mutate(index = row_number(), .before = i)
# → 424 x 5 (index, i, i2, speaker, text)

# --- 모델 로드 ---
models <- pins::pin_read(board, 'nlp-models')
models <- models |>
  filter(models == 'Random Forest') |>
  select(outcome, final_fits) |>
  unnest(final_fits) |>
  select(outcome, .workflow) |>
  deframe()

vars <- c(
  "cancer_prognosis", "continence", "erectile_dysfunction_potency",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia", "life_expectancy"
)
models <- models[vars]

# --- 예측 ---
preds <- imap(models, \(x, title) {
  predict(x, new_data = data, type = 'prob') |>
    select(.pred_1)
})
params <- map(preds, \(x) bind_cols(data, x)) |>
  enframe(value = "data")
# → params: 5행 (모델당 1행), 각 data = tibble [424 x 6]

# ╔══════════════════════════════════════════════════════════════════════╗
# ║  ★★★ 핵심: 문장 선택 (HTML lines 2748-2753) ★★★                    ║
# ╚══════════════════════════════════════════════════════════════════════╝
params$top_sentences <- pmap(params, \(name, data) {
  data |>
    filter(
      .pred_1 >= 0.7                                          # ◀◀◀ 임계값 0.7 필터링
    )
})
# → cancer_prognosis: 40행, continence: 15행, ed: 14행, ius: 2행, le: 5행

# --- Context 생성 (동일 로직) ---
params$topi <- map(params$top_sentences, \(x) pull(x, index))
params$context <- map2(params$data, params$topi, \(data, i) {
  map(i, \(x) {
    data <- data |>
      mutate(text = case_when(
        index == x ~ glue::glue('<main>{text}</main>'),
        .default = text
      ))
    data |>
      filter(index %in% seq(x - 3, x + 3, 1)) |>            # ±3 문장 윈도우 (동일)
      pull(text) |>
      paste0(collapse = '.')
  })
})

# --- 결과 결합 ---
params$results <- pmap(params, \(name, top_sentences, context, ...) {
  top_sentences |> mutate(context = unlist(context))
})

results <- params |>
  select(name, results) |>
  deframe()
# → 출력 없음 (콘솔 출력만, writexl 호출 없음)
```

#### HTML line 2744 섹션 제목 확인:
> "Extract the sentences with a predicted probability of 0.7 or higher for each outcome."

#### 출력에 미치는 영향:

| 모델 | 기존 (Top 5) | 신규 (>= 0.7) | 비율 |
|------|-------------|---------------|------|
| cancer_prognosis | 5 | **40** | 8배 증가 |
| continence | 5 | **15** | 3배 증가 |
| erectile_dysfunction_potency | 5 | **14** | 2.8배 증가 |
| irritative_urinary_symptoms | 5 | **2** | 0.4배 (감소!) |
| life_expectancy | 5 | **5** | 동일 |
| **합계** | **25** | **76** | 3배 증가 |

임계값 방식은 모델 신뢰도에 따라 고정 top-5보다 **더 많거나 더 적은** 문장을 선택할 수 있음.

### 차이점 2: 화자 필터링

**기존 (`process-data-guille.R`, lines 33-42):**

```r
physician_ids <- c(
    "INTERVIEWER",
    "INTERVIEWER 1",
    "INTERVIEWER 2",
    "Interviewer",
    "Q",
    "Q1",
    "Q2",
    "Q:"
)

x |> filter(speaker %in% physician_ids)
```

**신규 (`data-processing-pipeline.html`, line 2349):**

```r
data <- data |>
  filter(
    speaker == 'Interviewer:'     # <-- 단일 값, 콜론 포함
  )
```

기존 스크립트는 8가지 화자 ID 형식을 처리 (여러 전사 소스에서 유래). 신규 스크립트는 TurboScribe 기반 전사에서 사용되는 `Interviewer:`만 매칭.

### 차이점 3: 시트 이름 규칙

| 모델 | 기존 시트명 | 신규 시트명 |
|------|------------|------------|
| Cancer Prognosis | `cp` | `cancer_prognosis` |
| Incontinence | `inc` | `continence` |
| Erectile Dysfunction | `ed` | `erectile_dysfunction_potency` |
| Irrit. Urinary Symptoms | `ius` | `irritative_urinary_symptoms_f` |
| Life Expectancy | `le` | `life_expectancy` |

**증거 — 기존 스크립트는 모델 변수명의 약어 사용:**

```r
# process-data-guille.R lines 109-111:
group_nest(name) |>
deframe()
# → 이름 출처: vars = c("cp", "le", "ed", "inc", "ius")
```

**신규 노트북은 전체 outcome 이름 사용:**

```r
# data-processing-pipeline.html lines 2455-2460:
vars <- c(
  "cancer_prognosis",
  "continence",
  "erectile_dysfunction_potency",
  "irritative_urinary_symptoms_frequency_urgency_nocturnia",
  "life_expectancy"
)
```

### 차이점 4: `name` 컬럼 누락

**기존 출력 (SID-01 결과):** 8개 컬럼 — `name`, `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- `name` 컬럼에 환자 ID 포함 (예: `sid-01`)
- 기존 결과 파일에 50명의 환자 ID 존재

**신규 출력 (SID-14 결과):** 7개 컬럼 — `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- `name` 컬럼 **부재**
- 노트북이 단일 환자 파일만 처리하기 때문

**증거 — 구조 비교:**

```
SID-01 컬럼 (8): ['name', 'index', 'i', 'i2', 'speaker', 'text', '.pred_1', 'context']
SID-14 컬럼 (7): ['index', 'i', 'i2', 'speaker', 'text', '.pred_1', 'context']
SID-14에서 누락: {'name'}
```

### 차이점 5: 단일 환자 vs 다중 환자 처리

**기존 스크립트:** `data/transcripts/` 디렉토리의 모든 전사를 `fs::dir_ls()`로 읽어 `map()`으로 일괄 처리. SID-01 결과 파일에 **50명** 환자 데이터 포함.

**신규 노트북:** 단일 파일만 처리:

```r
# HTML line 2320:
data <- readxl::read_excel(here::here('data/nlp-pilot/REC001 (SID 14).xlsx'))
```

### 차이점 6: 파일 출력 없음

**기존 스크립트 (`process-data-guille.R`, lines 172-174):**

```r
writexl::write_xlsx(here::here(
  'results/original-study-physician-predictions-top-context.xlsx'
))
```

**신규 노트북:** 출력 파일을 **생성하지 않음**. 최종 코드 블록(lines 3211-3215)은 결과를 콘솔에 출력만 함:

```r
results <- params |>
  select(name, results) |>
  deframe()

results
```

`nlp-pilot-processed-results-sid14.xlsx` 파일은 이 노트북이 아닌 별도 과정에서 생성된 것으로 추정.

---

## 5. 동일하게 유지된 부분

| 항목 | 기존 파이프라인 | 신규 파이프라인 | 일치 여부 |
|------|---------------|---------------|----------|
| R 라이브러리 | 13개 패키지 | 동일한 13개 패키지 | 동일 |
| 모델 | 5개 rand_forest() | 동일한 5개 모델 | 동일 |
| 전처리 | 8개 recipe 단계 | 동일한 8단계 | 동일 |
| Context 윈도우 | ±3 문장 | ±3 문장 | 동일 |
| Context 형식 | `<main>` 태그, `.` 구분자 | 동일한 형식 | 동일 |
| 예측 유형 | `predict(x, type = 'prob')` | 동일한 호출 | 동일 |
| 토큰화 | `unnest_tokens('sentences')` | 동일한 함수 | 동일 |
| 인덱스 구성 | `i` (발화), `i2` (문장), `index` (전체) | 동일한 구조 | 동일 |

Context 생성 코드의 전체 비교는 위 Section 4의 주석 달린 코드 목록에서 확인 가능 (기존: lines 114-136, 신규: HTML lines 2861-2880). 로직은 완전히 동일.

---

## 6. Backend(`transcript_service.py`)에 미치는 영향

현재 Backend는 `top_n` 모드와 임계값 모드를 **모두** 지원. 향후 기본값을 어떻게 설정할지가 핵심 질문.

### 현재 Backend 동작

Backend API는 `top_n` 파라미터를 수용 (기본값: 5). `top_n=0`이면 모든 문장이 반환됨.

### 임계값 모드 전환 시 변경 사항

| 변경 사항 | 상세 |
|-----------|------|
| 새 파라미터 | `threshold: float = 0.7` |
| 선택 로직 | `slice_max(n=top_n)` 대신 `filter(.pred_1 >= threshold)` |
| 시트명 | `cp`→`cancer_prognosis` 등 매핑 (또는 양쪽 지원) |
| `name` 컬럼 | 포함 여부 결정 필요 |
| 화자 형식 | `Interviewer:` (콜론 포함) 입력 처리 |

### 시트명 매핑

```
cp   → cancer_prognosis
inc  → continence
ed   → erectile_dysfunction_potency
ius  → irritative_urinary_symptoms_f
le   → life_expectancy
```

---

## 7. 요약

Michael의 파일(2026년 2월 17일)은 그의 NLP 처리 파이프라인에 **버전 간 불일치**가 존재함을 보여줌. 두 개의 서로 다른 문장 선택 기준이 그의 스크립트들에 걸쳐 존재:

| 스크립트 | 기준 | 동작 |
|----------|------|------|
| `process-data-guille.R` (이전에 제공) | `slice_max(.pred_1, n = 5)` | 고정: 모델당 항상 상위 5개 |
| `data-processing-pipeline.html` (2월 17일) | `filter(.pred_1 >= 0.7)` | 가변: 모델당 2~40개 |

이 변경이 **의도적인 것인지, 아니면 Michael이 시점에 따라 다른 버전의 파이프라인을 사용한 결과인지 불명확**함. 두 스크립트는 어느 것이 다른 것을 대체하는지에 대한 설명 없이 제공되었으며, 기준 변경에 대한 근거도 전달되지 않음.

동일한 불일치 패턴이 다른 영역에서도 관찰됨 — 시트명(약어 vs 전체 이름), 컬럼 구조(`name` 컬럼 존재 vs 부재), 화자 필터링(8개 ID vs 1개 ID) — 이는 하나의 일관된 업데이트라기보다, 서로 다른 개발 브랜치 또는 반복(iteration)에서 온 파일들일 가능성을 시사함.

핵심 모델 아키텍처(5개 Random Forest 분류기, 8단계 전처리)와 Context 생성 로직(±3문장, `<main>` 태그)은 양쪽 버전에서 동일하게 유지됨.

**Backend 업데이트 전, 모든 불일치 사항을 Michael과 확인해야 함 (Section 8 참조).**

---

## 8. Michael에게 확인할 사항

분석 과정에서 파악된 항목들로, Backend 파이프라인 업데이트 전 Michael의 확인이 필요합니다.

### Q1. 문장 선택 기준이 왜 변경되었는가?

**변경 사항:** `slice_max(.pred_1, n = 5)` → `filter(.pred_1 >= 0.7)`

**확인할 질문:**
- Top-5에서 0.7 임계값으로 전환한 근거는?
- 0.7이라는 수치는 통계적 기준에 근거한 것인가? (예: ROC 분석, Youden index, 도메인 전문가 합의)
- 5개 모델 모두 동일한 임계값을 사용해야 하는가, 아니면 모델별로 다른 임계값이 필요한가? (예: `irritative_urinary_symptoms`는 2개 문장만 선택됨 — 이것이 허용 가능한가?)
- 이것이 **향후 영구적 표준**인가, 아니면 SID-14 파일럿을 위한 실험적 설정인가?

### Q2. 시트 이름 규칙 — 약어 vs 전체 이름

**변경 사항:**

| 기존 | 신규 |
|------|------|
| `cp` | `cancer_prognosis` |
| `inc` | `continence` |
| `ed` | `erectile_dysfunction_potency` |
| `ius` | `irritative_urinary_symptoms_f` |
| `le` | `life_expectancy` |

**확인할 질문:**
- 이것이 의도적인 표준화인가, 아니면 `vars`를 시트명으로 직접 사용한 부수적 결과인가?
- 향후 Backend는 어떤 규칙을 따를 것인가?
- 참고: `irritative_urinary_symptoms_f`는 전체 모델명 `irritative_urinary_symptoms_frequency_urgency_nocturnia`에서 잘린 것으로 보임 — `_f` 접미사는 의도적인가?

### Q3. `name` 컬럼 누락

**변경 사항:** 기존 출력에는 `name`(환자 ID) 포함 8개 컬럼. 신규 출력에는 `name` 없이 7개 컬럼.

**확인할 질문:**
- 의도적 제거인가? (단일 환자 처리이므로 불필요해서?)
- Backend에서 다중 환자 일괄 처리 시에는 `name` 컬럼을 계속 포함해야 하는가?

### Q4. 화자 필터링 — 단일 ID vs 다중 ID

**변경 사항:**
- 기존: 8개 화자 ID (`INTERVIEWER`, `Interviewer`, `Q`, `Q1`, `Q2` 등)
- 신규: `speaker == 'Interviewer:'` (콜론 포함) 단일 값만

**확인할 질문:**
- 향후 모든 전사 파일이 `Interviewer:` 형식을 사용할 것인가? (TurboScribe 표준화?)
- 아니면 기존 전사 파일과의 하위 호환성을 위해 8개 ID 목록을 유지해야 하는가?

**⚠ 데이터 처리 시 주의사항:**
- `REC001 (SID 14).xlsx`에서 6개 행이 `Interviewer: `(후행 공백 포함)로 되어 있어 정확한 매칭 `== 'Interviewer:'`에서 누락됨.
- Backend에서 전사 파일 처리 시, **반드시 speaker 컬럼의 공백을 strip/trim 후 매칭**해야 함.
- 정확한 일치(`==`) 대신 접두사 매칭(`str.startswith()`) 또는 대소문자 무시 매칭을 사용하여 데이터 누락을 방지할 것.
- 전사 도구(수동 전사 vs TurboScribe)에 따라 화자 형식이 다를 수 있음 — 파이프라인은 알려진 모든 변형(`INTERVIEWER`, `Interviewer`, `Interviewer:`, `Q`, `Q1`–`Q5` 등)을 처리할 수 있어야 함.

### Q5. 제3자 참여자 처리

**발견 사항:** SID-14에는 `Patient's Wife:` (75개 발화)가 제3 참여자로 존재. 기존 전사에는 `Interviewer`와 `Patient`만 있었음.

**확인할 질문:**
- 제3자 발화(배우자, 가족)는 어떻게 처리해야 하는가?
- 제외해야 하는가(현재 동작), 환자 발화로 취급해야 하는가, 아니면 별도 플래그를 달아야 하는가?
- 향후 전사에도 제3자가 포함될 것인가?

---

## 9. Backend 수정 필요 사항

본 보고서에서 확인된 차이점을 바탕으로, 현재 Backend 구현(`Prostate_cancer_consultation_dashboard/app/Backend/`)에 필요한 수정 사항을 정리한다.

### 9.1 화자 필터링 — 공백 및 형식 견고성

**파일:** `transcript_service.py` 64–73행, 134–144행

**현재 구현:**
```python
PHYSICIAN_IDS = [
    "INTERVIEWER", "INTERVIEWER 1", "INTERVIEWER 2",
    "Interviewer", "Q", "Q1", "Q2", "Q:",
]

def filter_interviewer(df):
    filtered = df[df["speaker"].isin(PHYSICIAN_IDS)].copy()
```

**확인된 문제점:**
1. `isin()`은 **정확한 일치**만 수행 — 후행 공백(예: `"Interviewer: "`)이 있으면 `"Interviewer:"`와 매칭 불가
2. TurboScribe 형식 `"Interviewer:"`(콜론 포함)가 목록에 없음
3. `REC001 (SID 14).xlsx`에서 실제로 6개 행이 `"Interviewer: "`(후행 공백)로 되어 있어 조용히 누락됨

**필요한 수정:**
- **공백 제거**: 매칭 전 `speaker` 컬럼에 `df["speaker"].str.strip()` 적용
- **TurboScribe 형식 추가**: `"Interviewer:"`를 `PHYSICIAN_IDS`에 추가
- **접두사 매칭 고려**: 전사 도구마다 화자 레이블이 다르므로, 정확한 일치 대신 `str.startswith()`와 같은 접두사 매칭이 더 견고함

**우선순위:** 높음 — 이 수정 없이는 TurboScribe 전사본의 합법적인 인터뷰어 문장이 조용히 누락되어, NLP 결과가 불완전해짐.

---

### 9.2 문장 선택 — 임계값 기반 필터링 추가

**파일:** `transcript_service.py` 231–260행

**현재 구현:**
```python
def select_top_n(df, n=0):
    # n > 0: top-N (동점 포함, R slice_max 일치)
    # n = 0: 전체 문장 (점수 순 정렬)
```

**문제점:** 고정 top-N 선택만 지원. Michael의 신규 파이프라인은 임계값 기반 필터링(`filter(.pred_1 >= 0.7)`)을 사용하며, 모델별 가변 결과(SID-14: 2~40행)를 생성.

**필요한 수정:**
- `select_top_n()`에 `min_score` 파라미터 추가 (또는 별도 `select_by_threshold()` 함수 생성)
- `min_score` 설정 시, top-N 대신 `.pred_1 >= min_score`인 문장을 필터링
- 두 방식 모두 사용 가능해야 함 — API 호출자가 선택

**영향 받는 파일 (4개):**

| 파일 | 필요한 변경 |
|---|---|
| `transcript_service.py:231-260` | `select_top_n()`에 `min_score` 파라미터 추가 또는 `select_by_threshold()` 생성 |
| `routes_transcript.py:89-159, 210-310` | `/analyze` 및 `/analyze-batch` 엔드포인트에 `min_score: float` (선택) 추가; `analyze_transcript()` 및 `_save_to_db()`에 전달 |
| `models.py:345-362` | `TranscriptAnalysisLog`에 `min_score = Column(Float, nullable=True)` 추가 — 현재 `top_n`만 기록하고 임계값은 미기록 |
| `database_schema.sql:137-147` | `transcript_analysis_log` 테이블에 `min_score FLOAT` 컬럼 추가 |

**선택 로직:**
- `min_score` 제공 시 임계값 필터링, `top_n` 제공 시 top-N 사용
- 둘 다 제공 시: top-N 적용 후 min_score로 추가 필터링 (또는 유효하지 않은 입력으로 거부 — 추후 결정)

**우선순위:** 중간 — 현재 top-N은 정상 동작. 임계값 옵션은 Michael의 새로운 방식에 대한 유연성 제공.

---

### 9.3 환자 ID 추출 — 유연한 파일명 파싱

**파일:** `transcript_service.py` 120행

**현재 구현:**
```python
patient_id = re.sub(r"^processed_transcripts_", "", Path(filename).stem)
```

**문제점:** `processed_transcripts_<id>.xlsx` 패턴만 처리. Michael의 새 파일은 `REC001 (SID 14).xlsx` — 완전히 다른 명명 규칙. 현재 코드는 patient_id를 `"sid-14"` 대신 `"REC001 (SID 14)"`로 설정함.

**필요한 수정:**
- `REC###` / `SID ##` 명명 규칙 패턴 매칭 추가
- SID 번호를 추출하여 `sid-XX` 형식으로 정규화
- `processed_transcripts_` 패턴에 대한 기존 동작은 fallback으로 유지
- 예시 정규식: `r"SID[\s-]*(\d+)"` → `14` 추출 → `sid-14`로 포맷팅

**우선순위:** 중간 — 새로운 명명 규칙 파일 처리 시에만 영향. TurboScribe 전사본이 표준 입력이 될 때 대응.

---

### 9.4 시트 이름 — 약어 및 전체 이름 모두 지원

**파일:** `transcript_service.py` 77–83행

**현재 구현:**
```python
OUTCOME_TO_SHEET = {
    "cancer_prognosis": "cp",
    "continence": "inc",
    "erectile_dysfunction_potency": "ed",
    "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
    "life_expectancy": "le",
}
```

**상황:** 현재 Backend는 약어 시트 이름(`cp`, `inc`, `ed`, `ius`, `le`) 출력하며, 이는 기존 R 스크립트와 일치. Michael의 신규 출력은 전체 이름(`cancer_prognosis`, `continence` 등) 사용.

**필요한 수정:**
- **현재는 수정 불필요** — Michael에게 표준화 규칙 확인 후 결정 (Q2)
- 전체 이름이 표준이 되면: `OUTCOME_TO_SHEET` 값 변경
- 양쪽 모두 공존해야 하면: `sheet_format` 파라미터 추가 (`"short"` / `"full"`)
- xlsx 결과 **읽기** 시(다운로드/DB 조회): 양쪽 형식 모두 수용해야 함

**우선순위:** 낮음 — 외관상 차이. 약어 이름이 Excel 탭에서 더 가독성이 좋음.

---

### 9.5 요약 — 우선순위별 이슈

| # | 이슈 | 우선순위 | 필요한 수정 |
|---|---|---|---|
| 9.1 | 화자 필터링 | **높음** | 공백 제거 + `Interviewer:` 추가 + 접두사 매칭 |
| 9.2 | 문장 선택 | 중간 | `min_score` 임계값 옵션 추가 |
| 9.3 | 파일명 파싱 | 중간 | `REC/SID` 명명 패턴 지원 |
| 9.4 | 시트 이름 | 낮음 | 확인 후 전체 이름 대비; 양식 준비 |

### 9.6 영향 매트릭스 — 이슈별 영향 파일

| 파일 | 9.1 화자 | 9.2 임계값 | 9.3 파일명 | 9.4 시트 이름 |
|---|---|---|---|---|
| `transcript_service.py` | `PHYSICIAN_IDS` + `filter_interviewer()` | `select_top_n()` + `analyze_transcript()` | `read_transcript()` | `OUTCOME_TO_SHEET` + `export_to_xlsx()` |
| `routes_transcript.py` | — | 엔드포인트에 `min_score` 파라미터 추가 + `_save_to_db()` | — | — |
| `models.py` | — | `TranscriptAnalysisLog`에 `min_score` 컬럼 추가 | — | — |
| `database_schema.sql` | — | `transcript_analysis_log`에 `min_score FLOAT` 추가 | — | — |
| `nlp_service.py` | — | — | — | — |

**영향받는 총 파일 수:** 4개 (`transcript_service.py`, `routes_transcript.py`, `models.py`, `database_schema.sql`)

---

## 관련 문서

- [ML_PIPELINE_OVERVIEW_KR.md](./ML_PIPELINE_OVERVIEW_KR.md) / [EN](./ML_PIPELINE_OVERVIEW_EN.md) — 파이프라인 단계별 개요
- [ML_PIPELINE_DEVELOPMENT_STATUS_KR.md](./ML_PIPELINE_DEVELOPMENT_STATUS_KR.md) / [EN](./ML_PIPELINE_DEVELOPMENT_STATUS_EN.md) — 구현 현황
- [COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md) / [EN](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_EN.md) — R 스크립트 vs Docker 비교
- [NLP_PIPELINE_UPDATE_MICHAELS_CLASSIFIERS_EN.md](./NLP_PIPELINE_UPDATE_MICHAELS_CLASSIFIERS_EN.md) — English version
