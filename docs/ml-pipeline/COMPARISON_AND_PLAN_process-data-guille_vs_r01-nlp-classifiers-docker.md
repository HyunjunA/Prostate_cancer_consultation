# Comparison & Plan: process-data-guille vs r01-nlp-classifiers-docker
> This document contains both English and Korean versions.
> 이 문서에는 영어와 한국어 버전이 모두 포함되어 있습니다.

---

## English


> Only implement features in the Backend (Python) that are **missing** from r01-nlp-classifiers-docker-image
> Model loading and 5-model predictions continue to use the existing r01-nlp-classifiers-docker-image as-is
>
> Last updated: 2026-02-11

---

# Part 1: Comparison

---

## At a Glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    process-data-guille.R (does everything)               │
│                                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌─────────┐  ┌─────┐  ┌────────┐│
│  │Step 1  │→│Step 2  │→│Step 3  │→│ Step 4  │→│Step5│→│Step 6 ││
│  │Read    │  │Filter  │  │Sentence│  │Model    │  │Top 5│  │Context ││
│  │File    │  │        │  │Split   │  │Predict  │  │     │  │        ││
│  └────────┘  └────────┘  └────────┘  └─────────┘  └─────┘  └────────┘│
│                                                              ┌────────┐│
│                                                              │Step 7  ││
│                                                              │Excel   ││
│                                                              └────────┘│
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              r01-nlp-classifiers Docker (model prediction only)          │
│                                                                         │
│                                       ┌─────────┐                       │
│                                       │ Step 4  │                       │
│                                       │Model    │                       │
│                                       │Predict  │                       │
│                                       │API serve│                       │
│                                       └─────────┘                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌─────────┐
                Commonality = │ Step 4  │  ← Same models, same .rds, same predict()
                              └─────────┘

                Difference  = Steps 1,2,3,5,6,7 exist only in the R script
```

---

## Commonalities

### Same Models, Same Structure

```
┌─────────────────────────────────────────┐
│          .rds files (5, identical)       │
│                                         │
│  ┌─ recipe (text preprocessing)         │
│  │   tokenize → stopword removal        │
│  │   → stemming                         │
│  │                                      │
│  ├─ model (ranger Random Forest)        │
│  │   trained trees + hyperparameters    │
│  │                                      │
│  └─ metadata                            │
│      model_name, required_pkgs          │
└─────────────────────────────────────────┘

         ┌──────────────────────────────────────────────────┐
         │              Same 5 Categories                    │
         │                                                  │
         │  cp  ── Cancer Prognosis                         │
         │  le  ── Life Expectancy                          │
         │  ed  ── Erectile Dysfunction                     │
         │  inc ── Continence                               │
         │  ius ── Irritative Urinary Symptoms              │
         └──────────────────────────────────────────────────┘
```

### Same Model Loading Code

```r
# process-data-guille.R (line 68)
board <- pins::board_folder(here::here('board'))
models <- pins::pin_read(board, 'nlp-models')

# Docker plumber.R
board <- pins::board_folder('board')
cp <- pins::pin_read(board, 'cancer_prognosis')
```

---

## Differences

### Step-by-Step Comparison

```
              process-data-guille.R        r01-nlp-classifiers Docker
              ─────────────────────        ──────────────────────────
Step 1        ██████ Read file (xlsx)
Step 2        ██████ Interviewer filtering
Step 3        ██████ Sentence splitting
Step 4        ██████ Model prediction        ██████ Model prediction (API)
Step 5        ██████ Top 5 selection
Step 6        ██████ Context generation
Step 7        ██████ Excel output

              ████████████████████████      ██████
              All 7 Steps                   Only 1 Step
```

### Execution Method Comparison

```
process-data-guille.R                    r01-nlp-classifiers Docker
━━━━━━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌──────────┐                             ┌──────────┐
  │ R script │                             │ External │
  │ Manual   │                             │ request  │
  │execution │                             │ HTTP POST│
  └────┬─────┘                             └────┬─────┘
       │                                        │
       ▼                                        ▼
  ┌──────────┐                             ┌──────────┐
  │ Load .rds│                             │ plumber  │
  │ predict()│                             │ API :8000│
  │ direct   │                             │ JSON I/O │
  │ call     │                             │          │
  └────┬─────┘                             └────┬─────┘
       │                                        │
       ▼                                        ▼
  ┌──────────┐                             ┌──────────┐
  │ Excel    │                             │ JSON     │
  │ file     │                             │ response │
  │ output   │                             │ returned │
  └──────────┘                             └──────────┘

  1 patient, one-off execution             Multi-access, always-on serving
  Requires local R installation            Only Docker needed
```

### Input/Output Comparison

```
process-data-guille.R:

  ┌──────────────────┐         ┌──────────────────────────┐
  │ Input             │         │ Output                    │
  │                  │  ────→  │                          │
  │ xlsx file        │  Full   │ xlsx file (5 sheets)      │
  │ [speaker, text]  │process  │ [cp, inc, ed, ius, le]   │
  │ 192 rows         │         │ Includes Top 5 + Context  │
  └──────────────────┘         └──────────────────────────┘


r01-nlp-classifiers Docker:

  ┌──────────────────┐         ┌──────────────────────────┐
  │ Input             │         │ Output                    │
  │                  │  ────→  │                          │
  │ JSON, 1 sentence │ Predict │ JSON, 1 probability       │
  │ {"text": "..."}  │ 1 item  │ {".pred_1": 0.91}        │
  └──────────────────┘         └──────────────────────────┘
```

---

## Docker Container Details

```
/opt/ml/
├── plumber.R                          ← API server
└── board/                             ← Model store
    ├── cancer_prognosis/
    │   └── cancer_prognosis.rds        (1.4 MB)
    ├── continence/
    │   └── continence.rds              (1.4 MB)
    ├── erectile_dysfunction_potency/
    │   └── erectile_dysfunction_potency.rds (1.1 MB)
    ├── irritative_urinary_symptoms_.../
    │   └── irritative_urinary_symptoms_... .rds (1.2 MB)
    └── life_expectancy/
        └── life_expectancy.rds         (515 KB)

API Endpoints:
┌──────────────┬────────┬──────────────────────┬──────────────────────────┐
│ Endpoint     │ Method │ Input                │ Output                    │
├──────────────┼────────┼──────────────────────┼──────────────────────────┤
│ /predict/cp  │ POST   │ [{"text": "sentence"}]│ [{".pred_1": 0.87}]     │
│ /predict/le  │ POST   │ [{"text": "sentence"}]│ [{".pred_1": 0.05}]     │
│ /predict/ed  │ POST   │ [{"text": "sentence"}]│ [{".pred_1": 0.91}]     │
│ /predict/inc │ POST   │ [{"text": "sentence"}]│ [{".pred_1": 0.02}]     │
│ /predict/ius │ POST   │ [{"text": "sentence"}]│ [{".pred_1": 0.04}]     │
│ /ping        │ GET    │ —                    │ {"status": "online"}     │
│ /metadata    │ GET    │ —                    │ {"required_pkgs": [...]} │
└──────────────┴────────┴──────────────────────┴──────────────────────────┘
```

### plumber.R Full Code

```r
library(pins)
library(plumber)
library(rapidoc)
library(vetiver)
board <- pins::board_folder('board')

cp  <- pins::pin_read(board, 'cancer_prognosis')
ed  <- pins::pin_read(board, 'erectile_dysfunction_potency')
inc <- pins::pin_read(board, 'continence')
ius <- pins::pin_read(board, 'irritative_urinary_symptoms_frequency_urgency_nocturnia')
le  <- pins::pin_read(board, 'life_expectancy')

#* @plumber
function(pr) {
pr |>
  vetiver_api(cp,  path = '/predict/cp',  type = 'prob') |>
  vetiver_api(ed,  path = '/predict/ed',  type = 'prob') |>
  vetiver_api(inc, path = '/predict/inc', type = 'prob') |>
  vetiver_api(ius, path = '/predict/ius', type = 'prob') |>
  vetiver_api(le,  path = '/predict/le',  type = 'prob')
}
```

---

## Comparison Conclusion

```
process-data-guille.R = preprocessing + model prediction + postprocessing  (all 7 Steps)
Docker container       = model prediction only                              (Step 4 only)

Docker = lines 68–89 of process-data-guille.R exposed as an API
Remaining 6 Steps (read file, filter, sentence split, Top 5, Context, Excel) = not in Docker
```

---
---

# Part 2: Implementation Results (completed)

---

## Core Idea

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   Of the 7 Steps in process-data-guille.R:                           │
│                                                                      │
│   Step 4 (model prediction)  →  keep as-is  →  r01-nlp-classifiers  │
│                                                  Docker              │
│   Remaining 6 Steps          →  completed    →  implemented in       │
│                                                  Backend Python      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘


  process-data-guille.R (legacy)         Backend Python (completed)
  ┌──────────────────┐                 ┌──────────────────┐
  │ Step 1 Read file │                 │ Step 1 Read file │  read_transcript()
  │ Step 2 Filter    │                 │ Step 2 Filter    │  filter_interviewer()
  │ Step 3 Sentence  │                 │ Step 3 Sentence  │  split_sentences()
  │        split     │                 │        split     │
  │ Step 4 Model     │                 │ Step 4 ──────────┼──→ r01-nlp-classifiers Docker
  │        predict   │                 │                  │
  │ Step 5 Top 5     │                 │ Step 5 Top N     │  select_top_n()
  │ Step 6 Context   │                 │ Step 6 Context   │  generate_context()
  │ Step 7 Excel     │                 │ Step 7 Excel     │  export_to_xlsx()
  └──────────────────┘                 └──────────────────┘

  Single R script                      Python + Docker integration
  Manual execution                     Automated via API (single + batch)

  Verified that both paths produce identical output (.pred_1 diff < 0.00005)
```

---

## 7 Steps to Implementation Mapping

```
Step   process-data-guille.R         In Docker?          Implementation Status
━━━━   ━━━━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1     Read xlsx file (lines 17–20)  Not in Docker       Done — read_transcript() (openpyxl)
 2     Interviewer filter (32–47)    Not in Docker       Done — filter_interviewer() (pandas)
 3     Sentence splitting (49–66)    Not in Docker       Done — split_sentences() (regex)
 4     Model load + predict (68–89)  In Docker           Existing — nlp_service.predict_batch()
 5     Top N selection (99–112)      Not in Docker       Done — select_top_n() (pandas, ties included)
 6     Context generation (119–136)  Not in Docker       Done — generate_context() (index slicing)
 7     Excel 5-sheet output (151–175)Not in Docker       Done — export_to_xlsx() (openpyxl)
```

---

## Backend Implementation Status (completed)

```
┌──────────────────────────────────────────────────────────────┐
│                   Existing (reused)                           │
│                                                              │
│  nlp_service.py                                              │
│  ├─ predict_single()    1 sentence + 1 model → probability   │
│  ├─ predict_batch()     multiple sentences + 1 model         │
│  │                      → probability list                   │
│  └─ predict_all_models() 1 sentence + 5 models               │
│                          → 5 probabilities                   │
│                                                              │
│  redis_client.py        text SHA256 cache, TTL 1 hour        │
│  routes_nlp.py          API Key auth (X-API-Key)             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Added (new)                                 │
│                                                              │
│  requirements.txt       ← openpyxl dependency added          │
│  transcript_service.py  ← pre/post-processing logic          │
│                           (Steps 1–7)                        │
│  routes_transcript.py   ← single/batch analysis +            │
│                           download API                       │
│  main.py                ← transcript router added            │
└──────────────────────────────────────────────────────────────┘

Note: Used regex-based _sent_tokenize() instead of nltk
      (nltk punkt_tab extraction failed inside Docker)
```

---

## File Structure (final)

```
Backend/
├── main.py                  ← Modified: transcript router added
├── routes_nlp.py            ← Existing (unchanged)
├── routes_transcript.py     ← New: single/batch analysis + single/batch download (4 endpoints)
├── nlp_service.py           ← Existing (unchanged, predict_batch reused)
├── transcript_service.py    ← New: Steps 1–7 pipeline orchestrator
├── redis_client.py          ← Existing (unchanged)
├── requirements.txt         ← Modified: openpyxl added
└── ...
```

---

## transcript_service.py Function Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        transcript_service.py                             │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │ analyze_transcript(file) → Dict                                   │   │
│  │   Full pipeline orchestration: calls Steps 1–7 in sequence        │   │
│  │                                                                   │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 1              │                                         │   │
│  │   │ read_transcript()   │  xlsx → DataFrame [speaker, text]       │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 2              │                                         │   │
│  │   │ filter_interviewer()│  Filter to Interviewer utterances only   │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 3              │                                         │   │
│  │   │ split_sentences()   │  Sentence split                         │   │
│  │   │                     │  → [index, i, i2, speaker, text]        │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────────────────────────────────┐             │   │
│  │   │ Step 4 (calls existing nlp_service.py)          │             │   │
│  │   │ predict_batch() × 5 models                      │             │   │
│  │   │                    ↕ r01-nlp-classifiers Docker  │             │   │
│  │   └─────────┬───────────────────────────────────────┘             │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 5              │                                         │   │
│  │   │ select_top_n()      │  Select top 5 sentences per model       │   │
│  │   │                     │  by probability                         │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 6              │                                         │   │
│  │   │ generate_context()  │  ±3 surrounding sentences + <main> tag  │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 7              │                                         │   │
│  │   │ export_to_xlsx()    │  5-sheet Excel output                   │   │
│  │   └─────────────────────┘                                         │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Function Details — R Code to Python Mapping

### Step 1: read_transcript()

```
R (lines 17–24):                          Python:
━━━━━━━━━━━━━━━                           ━━━━━━━
readxl::read_excel(x)                     pandas.read_excel(file)
str_remove('processed_transcripts_')      re.sub → extract patient_id

Input:  processed_transcripts_sid-01.xlsx
Output: DataFrame [speaker, text] + patient_id = "sid-01"
```

### Step 2: filter_interviewer()

```
R (lines 32–47):                          Python:
━━━━━━━━━━━━━━━                           ━━━━━━━
physician_ids <- c("INTERVIEWER",         PHYSICIAN_IDS = [
  "INTERVIEWER 1", "INTERVIEWER 2",         "INTERVIEWER", "INTERVIEWER 1",
  "Interviewer", "Q", "Q1", "Q2", "Q:")     "INTERVIEWER 2", "Interviewer",
x |> filter(speaker %in% physician_ids)     "Q", "Q1", "Q2", "Q:"]
                                          df[df['speaker'].isin(PHYSICIAN_IDS)]

Input:  192 rows (Interviewer + Patient)
Output: ~100 rows (Interviewer only)
```

### Step 3: split_sentences()

```
R (lines 49–66):                          Python:
━━━━━━━━━━━━━━━                           ━━━━━━━
unnest_tokens('sentences')                _sent_tokenize(text)  ← regex-based
group_by(index) → i2 = row_number()       i2 = sentence number within utterance
rename(i = index) → index = row_number()  i = original utterance number
                                          index = global sequence number (from 1)

Input:  ~100 rows (utterance-level)
Output: ~250 rows [index, i, i2, speaker, text] (sentence-level)
```

### Step 4: predict — Uses Existing Docker

```
R (lines 68–89):                          Python (existing nlp_service.py):
━━━━━━━━━━━━━━━                           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
predict(model, data, type='prob')         predict_batch(texts, model)

┌─────────────────────────────────────────────────────────┐
│  250 sentences × 5 models = 1,250 predictions            │
│                                                         │
│  predict_batch() sends max 50 at a time                  │
│  → 250 sentences ÷ 50 = 5 batches × 5 models            │
│    = 25 API calls                                        │
│                                                         │
│  ┌─── cp  model: [50][50][50][50][50] → 250 probs ───┐  │
│  ├─── le  model: [50][50][50][50][50] → 250 probs ───┤  │
│  ├─── ed  model: [50][50][50][50][50] → 250 probs ───┤  │
│  ├─── inc model: [50][50][50][50][50] → 250 probs ───┤  │
│  └─── ius model: [50][50][50][50][50] → 250 probs ───┘  │
│                                                         │
│  Redis cache applied automatically                       │
│  (previously predicted sentences get cache hits)         │
└─────────────────────────────────────────────────────────┘
```

### Step 5: select_top_n()

```
R (lines 99–112):                         Python:
━━━━━━━━━━━━━━━━                          ━━━━━━━
group_by(name) |>                         for model in ['cp','le','ed','inc','ius']:
  slice_max(.pred_1, n = 5)                df.nlargest(5, 'pred_1')

Input:  250 sentences × 5 models = 1,250 probabilities
Output: 5 models × Top 5 = 25 sentences
```

### Step 6: generate_context()

```
R (lines 119–136):                        Python:
━━━━━━━━━━━━━━━━━                         ━━━━━━━
filter(index %in% seq(x-3, x+3, 1))      df[(index >= x-3) & (index <= x+3)]
case_when(index==x ~ '<main>...</main>')  if idx == x: f'<main>{text}</main>'
paste0(collapse = '.')                    '.'.join(texts)

Example:
  Sentence 43: "preceding sentence 3"
  Sentence 44: "preceding sentence 2"
  Sentence 45: "preceding sentence 1"
  Sentence 46: ← Top sentence (index=46)
  Sentence 47: "following sentence 1"
  Sentence 48: "following sentence 2"
  Sentence 49: "following sentence 3"

  → "preceding sentence 3.preceding sentence 2.preceding sentence 1.<main>Top sentence</main>.following sentence 1.following sentence 2.following sentence 3"
```

### Step 7: export_to_xlsx()

```
R (lines 151–175):                        Python:
━━━━━━━━━━━━━━━━━                         ━━━━━━━
group_nest(outcome) |>                    with pd.ExcelWriter(path) as writer:
  writexl::write_xlsx(...)                  for sheet in ['cp','inc','ed','ius','le']:
                                              df.to_excel(writer, sheet_name=sheet)

Output: xlsx file
  ├─ cp sheet:  [name, index, i, i2, speaker, text, .pred_1, context]
  ├─ inc sheet: [name, index, i, i2, speaker, text, .pred_1, context]
  ├─ ed sheet:  [name, index, i, i2, speaker, text, .pred_1, context]
  ├─ ius sheet: [name, index, i, i2, speaker, text, .pred_1, context]
  └─ le sheet:  [name, index, i, i2, speaker, text, .pred_1, context]
```

---

## API Endpoints (4 endpoints, all implemented)

```
routes_transcript.py:

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  POST /api/transcript/analyze                                       │
│  ─────────────────────────────                                      │
│  Input:  1 xlsx file (multipart/form-data) + X-API-Key              │
│  Options: top_n (default 0=all), context_window (default 3)         │
│  Process: Full pipeline Steps 1–7                                   │
│  Output:  JSON results + xlsx saved to disk                         │
│                                                                     │
│  POST /api/transcript/analyze-batch                                 │
│  ──────────────────────────────────                                  │
│  Input:  Multiple xlsx files + X-API-Key                            │
│  Process: Each file runs independently                              │
│           (if 1 fails, the rest continue)                           │
│  Output:  Per-file success/failure JSON summary                     │
│                                                                     │
│  GET /api/transcript/download/{patient_id}                          │
│  ─────────────────────────────────────────                           │
│  Output: Download the result xlsx for the given patient_id          │
│                                                                     │
│  GET /api/transcript/download-batch?patient_ids=sid-01,sid-02       │
│  ────────────────────────────────────────────────────────            │
│  Output: Download multiple patient_id results bundled as a zip      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Single analysis response example:
{
  "patient_id": "sid-01",
  "total_sentences": 341,
  "models": {
    "cp": [ { "index": 45, "i": 12, "i2": 3, "speaker": "Interviewer",
              "text": "in your case that risk turns out to be...",
              "pred_1": 0.9138, "context": "prev sentence.<main>target sentence</main>.next sentence" }, ... ],
    "le": [...], "ed": [...], "inc": [...], "ius": [...]
  },
  "output_file": "sid-01_predictions.xlsx"
}
```

---

## Full Execution Flow

```
Client
    │
    │  POST /api/transcript/analyze
    │  + xlsx file upload
    │  + X-API-Key header
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ routes_transcript.py                                            │
│   API Key validation → receive file                             │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ transcript_service.py                                           │
│                                                                 │
│   Step 1: read_transcript()                                     │
│   xlsx → DataFrame [speaker, text] (192 rows)                   │
│                           │                                     │
│                           ▼                                     │
│   Step 2: filter_interviewer()                                  │
│   Interviewer only → ~100 rows                                  │
│                           │                                     │
│                           ▼                                     │
│   Step 3: split_sentences()                                     │
│   Sentence splitting → ~250 rows                                │
│                           │                                     │
│                           ▼                                     │
│   Step 4: nlp_service.predict_batch() × 5 models                │
│           ┌───────────────┼───────────────┐                     │
│           │               ▼               │                     │
│           │  ┌─────────────────────────┐  │                     │
│           │  │ r01-nlp-classifiers     │  │                     │
│           │  │ Docker container        │  │                     │
│           │  │ (used as-is)            │  │                     │
│           │  └─────────────────────────┘  │                     │
│           └───────────────┼───────────────┘                     │
│                           ▼                                     │
│   Step 5: select_top_n()                                        │
│   Select Top 5 per model                                        │
│                           │                                     │
│                           ▼                                     │
│   Step 6: generate_context()                                    │
│   ±3 surrounding sentences + <main> tag                         │
│                           │                                     │
│                           ▼                                     │
│   Step 7: export_to_xlsx()                                      │
│   Generate 5-sheet Excel                                        │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
                    JSON result returned
                    + xlsx download path
```

---

## Implementation Order (all completed)

```
Order  Task                                                  Status
━━━━   ━━━━                                                  ━━━━━━
 1     Add openpyxl dependency                               Done — requirements.txt
 2     transcript_service.py — Step 1 (read_transcript)      Done
 3     transcript_service.py — Step 2 (filter)               Done
 4     transcript_service.py — Step 3 (split)                Done — regex-based (nltk replacement)
 5     transcript_service.py — Step 4 integration (predict)  Done — nlp_service.predict_batch() reused
 6     transcript_service.py — Step 5 (top_n)                Done — ties included
 7     transcript_service.py — Step 6 (context)              Done — ±window + <main> tag
 8     transcript_service.py — Step 7 (xlsx)                 Done — 5-sheet output
 9     transcript_service.py — analyze_transcript()          Done — full orchestrator
10     routes_transcript.py — single/batch analysis          Done — 4 endpoints
       + download
11     main.py modification — add router                     Done
12     Docker rebuild                                        Done — build + test complete
13     Test: xlsx upload → API call                          Done — sid-01 single + batch success
14     Validation: compare with R script output              Done — 208/208 fields match (5 sheets)
```

### Issues Encountered During Implementation and Solutions

```
Issue                                       Solution
━━━━━                                       ━━━━━━━━
nltk punkt_tab extraction failed in Docker  → Replaced with regex-based _sent_tokenize()
gunicorn multi-worker shared memory issue   → Switched to file-based storage (/app/uploads/)
R unnest_tokens to_lower=TRUE was missed    → Added .lower()
R slice_max tie-handling behavior mismatch  → Implemented threshold-based tie inclusion logic
```

---

## Verification Results (passed)

```
┌──────────────────────────┐       ┌──────────────────────────┐
│ R script output           │       │ Backend output            │
│                          │       │                          │
│ original-study-physician-│       │ sid-01_predictions.xlsx   │
│ predictions-top-         │  vs   │                          │
│ context.xlsx             │       │                          │
│                          │       │                          │
│ Top 5 sentences per sheet│       │ Top 5 sentences per sheet│
│ text + .pred_1           │  ==   │ text + pred_1            │
└──────────────────────────┘       └──────────────────────────┘

Verification passed:
  • 5 sheets (cp, inc, ed, ius, le): 208/208 fields match (100%)
  • Identical sentence indices, identical text, identical context strings
  • .pred_1 difference max < 0.00005 (within floating-point tolerance)
  • ius sheet: tie handling verified (pred=0.5821, 2 ties → exactly 6 rows returned)

Note: Confirmed that R's unnest_tokens() and Python's regex-based
   _sent_tokenize() produce identical sentence splitting results
```

---

## Related Documents

- [ML_PIPELINE_ARCHITECTURE.md](./ML_PIPELINE_ARCHITECTURE.md) — ML pipeline architecture design document
- [ML_PIPELINE_DEVELOPMENT_STATUS.md](./ML_PIPELINE_DEVELOPMENT_STATUS.md) — ML pipeline implementation status analysis and gap analysis
- [COMPARISON_AND_PLAN (Korean original)](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker.md) — This document in Korean

---

## 한국어


> r01-nlp-classifiers-docker-image에 **없는** 기능만 Backend (Python)에서 구현
> 모델 로드 및 5개 모델 예측은 기존 r01-nlp-classifiers-docker-image를 그대로 사용
>
> Last updated: 2026-02-11

---

# Part 1: 비교

---

## 한눈에 보기

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    process-data-guille.R (전부 다 함)                     │
│                                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌─────────┐  ┌─────┐  ┌────────┐│
│  │Step 1  │→│Step 2  │→│Step 3  │→│ Step 4  │→│Step5│→│Step 6 ││
│  │파일읽기 │  │필터링   │  │문장분리 │  │모델 예측 │  │Top 5│  │Context ││
│  └────────┘  └────────┘  └────────┘  └─────────┘  └─────┘  └────────┘│
│                                                              ┌────────┐│
│                                                              │Step 7  ││
│                                                              │Excel   ││
│                                                              └────────┘│
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              r01-nlp-classifiers Docker (모델 예측만)                     │
│                                                                         │
│                                       ┌─────────┐                       │
│                                       │ Step 4  │                       │
│                                       │모델 예측 │                       │
│                                       │ API서빙  │                       │
│                                       └─────────┘                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌─────────┐
                    공통점 =   │ Step 4  │  ← 같은 모델, 같은 .rds, 같은 predict()
                              └─────────┘

                    차이점 =   Step 1,2,3,5,6,7은 R 스크립트에만 존재
```

---

## 공통점

### 같은 모델, 같은 구조

```
┌─────────────────────────────────────────┐
│            .rds 파일 (5개 동일)           │
│                                         │
│  ┌─ recipe (텍스트 전처리)               │
│  │   토큰화 → 불용어 제거 → 어간 추출     │
│  │                                      │
│  ├─ model (ranger Random Forest)        │
│  │   학습된 트리 + 하이퍼파라미터         │
│  │                                      │
│  └─ metadata                            │
│      model_name, required_pkgs          │
└─────────────────────────────────────────┘

         ┌──────────────────────────────────────────────────┐
         │              같은 5개 카테고리                     │
         │                                                  │
         │  cp  ── 암 예후 (Cancer Prognosis)               │
         │  le  ── 기대 수명 (Life Expectancy)              │
         │  ed  ── 발기 부전 (Erectile Dysfunction)          │
         │  inc ── 요실금 (Continence)                      │
         │  ius ── 자극성 비뇨기 증상 (Irritative Urinary)   │
         └──────────────────────────────────────────────────┘
```

### 같은 모델 로드 코드

```r
# process-data-guille.R (68행)
board <- pins::board_folder(here::here('board'))
models <- pins::pin_read(board, 'nlp-models')

# Docker plumber.R
board <- pins::board_folder('board')
cp <- pins::pin_read(board, 'cancer_prognosis')
```

---

## 차이점

### 각 Step별 비교

```
              process-data-guille.R        r01-nlp-classifiers Docker
              ─────────────────────        ──────────────────────────
Step 1        ██████ 파일 읽기 (xlsx)
Step 2        ██████ Interviewer 필터링
Step 3        ██████ 문장 단위 분리
Step 4        ██████ 모델 예측              ██████ 모델 예측 (API)
Step 5        ██████ Top 5 선별
Step 6        ██████ Context 생성
Step 7        ██████ Excel 출력

              ████████████████████████      ██████
              7개 Step 전부                  1개 Step만
```

### 실행 방식 비교

```
process-data-guille.R                    r01-nlp-classifiers Docker
━━━━━━━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌──────────┐                             ┌──────────┐
  │ R 스크립트│                             │ 외부 요청 │
  │ 수동 실행 │                             │ HTTP POST│
  └────┬─────┘                             └────┬─────┘
       │                                        │
       ▼                                        ▼
  ┌──────────┐                             ┌──────────┐
  │ .rds 로드 │                             │ plumber  │
  │ predict() │                             │ API :8000│
  │ 직접 호출  │                             │ JSON I/O │
  └────┬─────┘                             └────┬─────┘
       │                                        │
       ▼                                        ▼
  ┌──────────┐                             ┌──────────┐
  │ Excel    │                             │ JSON     │
  │ 파일 출력 │                             │ 응답 반환 │
  └──────────┘                             └──────────┘

  1명, 1회성 실행                           다중 접근, 상시 서빙
  로컬 R 설치 필요                          Docker만 있으면 됨
```

### 입력/출력 비교

```
process-data-guille.R:

  ┌──────────────────┐         ┌──────────────────────────┐
  │ 입력              │         │ 출력                      │
  │                  │  ────→  │                          │
  │ xlsx 파일         │  전체   │ xlsx 파일 (5시트)          │
  │ [speaker, text]  │  처리   │ [cp, inc, ed, ius, le]   │
  │ 192행            │         │ Top5 + Context 포함       │
  └──────────────────┘         └──────────────────────────┘


r01-nlp-classifiers Docker:

  ┌──────────────────┐         ┌──────────────────────────┐
  │ 입력              │         │ 출력                      │
  │                  │  ────→  │                          │
  │ JSON 문장 1개     │  예측   │ JSON 확률 1개              │
  │ {"text": "..."}  │  1건   │ {".pred_1": 0.91}        │
  └──────────────────┘         └──────────────────────────┘
```

---

## Docker 컨테이너 상세

```
/opt/ml/
├── plumber.R                          ← API 서버
└── board/                             ← 모델 저장소
    ├── cancer_prognosis/
    │   └── cancer_prognosis.rds        (1.4 MB)
    ├── continence/
    │   └── continence.rds              (1.4 MB)
    ├── erectile_dysfunction_potency/
    │   └── erectile_dysfunction_potency.rds (1.1 MB)
    ├── irritative_urinary_symptoms_.../
    │   └── irritative_urinary_symptoms_... .rds (1.2 MB)
    └── life_expectancy/
        └── life_expectancy.rds         (515 KB)

API 엔드포인트:
┌──────────────┬────────┬──────────────────────┬──────────────────────────┐
│ 엔드포인트    │ 메서드  │ 입력                  │ 출력                      │
├──────────────┼────────┼──────────────────────┼──────────────────────────┤
│ /predict/cp  │ POST   │ [{"text": "문장"}]    │ [{".pred_1": 0.87}]      │
│ /predict/le  │ POST   │ [{"text": "문장"}]    │ [{".pred_1": 0.05}]      │
│ /predict/ed  │ POST   │ [{"text": "문장"}]    │ [{".pred_1": 0.91}]      │
│ /predict/inc │ POST   │ [{"text": "문장"}]    │ [{".pred_1": 0.02}]      │
│ /predict/ius │ POST   │ [{"text": "문장"}]    │ [{".pred_1": 0.04}]      │
│ /ping        │ GET    │ —                    │ {"status": "online"}     │
│ /metadata    │ GET    │ —                    │ {"required_pkgs": [...]} │
└──────────────┴────────┴──────────────────────┴──────────────────────────┘
```

### plumber.R 전체 코드

```r
library(pins)
library(plumber)
library(rapidoc)
library(vetiver)
board <- pins::board_folder('board')

cp  <- pins::pin_read(board, 'cancer_prognosis')
ed  <- pins::pin_read(board, 'erectile_dysfunction_potency')
inc <- pins::pin_read(board, 'continence')
ius <- pins::pin_read(board, 'irritative_urinary_symptoms_frequency_urgency_nocturnia')
le  <- pins::pin_read(board, 'life_expectancy')

#* @plumber
function(pr) {
pr |>
  vetiver_api(cp,  path = '/predict/cp',  type = 'prob') |>
  vetiver_api(ed,  path = '/predict/ed',  type = 'prob') |>
  vetiver_api(inc, path = '/predict/inc', type = 'prob') |>
  vetiver_api(ius, path = '/predict/ius', type = 'prob') |>
  vetiver_api(le,  path = '/predict/le',  type = 'prob')
}
```

---

## 비교 결론

```
process-data-guille.R = 전처리 + 모델 예측 + 후처리  (7 Step 전부)
Docker 컨테이너       = 모델 예측만                   (Step 4만)

Docker = process-data-guille.R의 68~89행을 API로 만든 것
나머지 6개 Step (파일읽기, 필터링, 문장분리, Top5, Context, Excel) = Docker에 없음
```

---
---

# Part 2: 구현 결과 (✅ 완료)

---

## 핵심 아이디어

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   process-data-guille.R의 7 Step 중:                                 │
│                                                                      │
│   Step 4 (모델 예측)  →  기존 유지  →  r01-nlp-classifiers Docker    │
│   나머지 6개 Step      →  ✅ 구현 완료  →  Backend Python으로 구현    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘


  process-data-guille.R (레거시)        Backend Python (✅ 구현 완료)
  ┌──────────────────┐                 ┌──────────────────┐
  │ Step 1 파일읽기   │                 │ Step 1 파일읽기   │  ✅ read_transcript()
  │ Step 2 필터링     │                 │ Step 2 필터링     │  ✅ filter_interviewer()
  │ Step 3 문장분리   │                 │ Step 3 문장분리   │  ✅ split_sentences()
  │ Step 4 모델예측   │                 │ Step 4 ──────────┼──→ r01-nlp-classifiers Docker
  │ Step 5 Top 5     │                 │ Step 5 Top N     │  ✅ select_top_n()
  │ Step 6 Context   │                 │ Step 6 Context   │  ✅ generate_context()
  │ Step 7 Excel     │                 │ Step 7 Excel     │  ✅ export_to_xlsx()
  └──────────────────┘                 └──────────────────┘

  R 스크립트 하나                       Python + Docker 연동
  수동 실행                             API로 자동 실행 (단일 + 배치)

  ✅ 두 경로의 출력이 동일함을 검증 완료 (.pred_1 차이 < 0.00005)
```

---

## 7단계 → 구현 매핑

```
Step   process-data-guille.R         Docker에 있나?      구현 상태
━━━━   ━━━━━━━━━━━━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1     xlsx 파일 읽기 (17~20행)       Docker에 없음       ✅ 완료 — read_transcript() (openpyxl)
 2     Interviewer 필터링 (32~47행)   Docker에 없음       ✅ 완료 — filter_interviewer() (pandas)
 3     문장 단위 분리 (49~66행)       Docker에 없음       ✅ 완료 — split_sentences() (regex)
 4     모델 로드 + 예측 (68~89행)     ★ Docker에 있음     ✅ 기존 — nlp_service.predict_batch()
 5     Top N 선별 (99~112행)          Docker에 없음       ✅ 완료 — select_top_n() (pandas, 동점 포함)
 6     Context 생성 (119~136행)       Docker에 없음       ✅ 완료 — generate_context() (index 슬라이싱)
 7     Excel 5시트 출력 (151~175행)   Docker에 없음       ✅ 완료 — export_to_xlsx() (openpyxl)
```

---

## Backend 구현 현황 (✅ 완료)

```
┌──────────────────────────────────────────────────────────────┐
│                   기존 재사용                                  │
│                                                              │
│  nlp_service.py                                              │
│  ├─ predict_single()    문장 1개 + 모델 1개 → 확률            │
│  ├─ predict_batch()     문장 여러개 + 모델 1개 → 확률 리스트   │
│  └─ predict_all_models() 문장 1개 + 5모델 → 5개 확률          │
│                                                              │
│  redis_client.py        텍스트 SHA256 캐시, TTL 1시간         │
│  routes_nlp.py          API Key 인증 (X-API-Key)             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   ✅ 추가 완료                                │
│                                                              │
│  requirements.txt       ← openpyxl 추가 완료                  │
│  transcript_service.py  ← ✅ 전처리 + 후처리 로직 (Step 1~7)  │
│  routes_transcript.py   ← ✅ 단일/배치 분석 + 다운로드 API     │
│  main.py                ← ✅ transcript 라우터 추가 완료       │
└──────────────────────────────────────────────────────────────┘

참고: nltk 대신 regex 기반 _sent_tokenize()를 사용 (Docker 내 nltk punkt_tab 추출 실패로 변경)
```

---

## 파일 구조 (최종)

```
Backend/
├── main.py                  ← 수정 완료: transcript 라우터 추가
├── routes_nlp.py            ← 기존 유지
├── routes_transcript.py     ← ✅ 신규: 단일/배치 분석 + 단일/배치 다운로드 (4개 엔드포인트)
├── nlp_service.py           ← 기존 유지 (predict_batch 재사용)
├── transcript_service.py    ← ✅ 신규: Step 1~7 파이프라인 오케스트레이터
├── redis_client.py          ← 기존 유지
├── requirements.txt         ← 수정 완료: openpyxl 추가
└── ...
```

---

## transcript_service.py 함수 구조

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        transcript_service.py                             │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │ analyze_transcript(file) → Dict                                   │   │
│  │   전체 파이프라인 오케스트레이션: Step 1~7을 순서대로 호출           │   │
│  │                                                                   │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 1              │                                         │   │
│  │   │ read_transcript()   │  xlsx → DataFrame [speaker, text]       │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 2              │                                         │   │
│  │   │ filter_interviewer()│  Interviewer 발언만 필터                  │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 3              │                                         │   │
│  │   │ split_sentences()   │  문장 분리 → [index, i, i2, speaker, text]│  │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────────────────────────────────┐             │   │
│  │   │ Step 4 (기존 nlp_service.py 호출)                │             │   │
│  │   │ predict_batch() × 5모델                         │             │   │
│  │   │                    ↕ r01-nlp-classifiers Docker  │             │   │
│  │   └─────────┬───────────────────────────────────────┘             │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 5              │                                         │   │
│  │   │ select_top_n()      │  모델별 확률 Top 5 문장 선별             │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 6              │                                         │   │
│  │   │ generate_context()  │  전후 3문장 + <main>태그                 │   │
│  │   └─────────┬───────────┘                                         │   │
│  │             ▼                                                     │   │
│  │   ┌─────────────────────┐                                         │   │
│  │   │ Step 7              │                                         │   │
│  │   │ export_to_xlsx()    │  5시트 Excel 출력                        │   │
│  │   └─────────────────────┘                                         │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 각 함수 상세 — R 코드 → Python 대응

### Step 1: read_transcript()

```
R (17~24행):                              Python:
━━━━━━━━━━                                ━━━━━━━
readxl::read_excel(x)                     pandas.read_excel(file)
str_remove('processed_transcripts_')      re.sub → patient_id 추출

입력: processed_transcripts_sid-01.xlsx
출력: DataFrame [speaker, text] + patient_id = "sid-01"
```

### Step 2: filter_interviewer()

```
R (32~47행):                              Python:
━━━━━━━━━━                                ━━━━━━━
physician_ids <- c("INTERVIEWER",         PHYSICIAN_IDS = [
  "INTERVIEWER 1", "INTERVIEWER 2",         "INTERVIEWER", "INTERVIEWER 1",
  "Interviewer", "Q", "Q1", "Q2", "Q:")     "INTERVIEWER 2", "Interviewer",
x |> filter(speaker %in% physician_ids)     "Q", "Q1", "Q2", "Q:"]
                                          df[df['speaker'].isin(PHYSICIAN_IDS)]

입력: 192행 (Interviewer + Patient)
출력: ~100행 (Interviewer만)
```

### Step 3: split_sentences()

```
R (49~66행):                              Python:
━━━━━━━━━━                                ━━━━━━━
unnest_tokens('sentences')                _sent_tokenize(text)  ← regex 기반
group_by(index) → i2 = row_number()       i2 = 발언 내 문장 번호
rename(i = index) → index = row_number()  i = 원래 발언 번호
                                          index = 전체 순서번호 (1부터)

입력: ~100행 (발언 단위)
출력: ~250행 [index, i, i2, speaker, text] (문장 단위)
```

### Step 4: predict — 기존 Docker 사용

```
R (68~89행):                              Python (기존 nlp_service.py):
━━━━━━━━━━                                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
predict(model, data, type='prob')         predict_batch(texts, model)

┌─────────────────────────────────────────────────────────┐
│  250개 문장 × 5개 모델 = 1,250번 예측                     │
│                                                         │
│  predict_batch()는 최대 50개씩                            │
│  → 250문장 ÷ 50 = 5배치 × 5모델 = 25번 API 호출          │
│                                                         │
│  ┌─── cp  모델: [50][50][50][50][50] → 250개 확률 ───┐   │
│  ├─── le  모델: [50][50][50][50][50] → 250개 확률 ───┤   │
│  ├─── ed  모델: [50][50][50][50][50] → 250개 확률 ───┤   │
│  ├─── inc 모델: [50][50][50][50][50] → 250개 확률 ───┤   │
│  └─── ius 모델: [50][50][50][50][50] → 250개 확률 ───┘   │
│                                                         │
│  Redis 캐시 자동 적용 (이미 예측한 문장은 캐시 히트)        │
└─────────────────────────────────────────────────────────┘
```

### Step 5: select_top_n()

```
R (99~112행):                             Python:
━━━━━━━━━━━                               ━━━━━━━
group_by(name) |>                         for model in ['cp','le','ed','inc','ius']:
  slice_max(.pred_1, n = 5)                df.nlargest(5, 'pred_1')

입력: 250문장 × 5모델 = 1,250개 확률
출력: 5모델 × Top 5 = 25개 문장
```

### Step 6: generate_context()

```
R (119~136행):                            Python:
━━━━━━━━━━━━                              ━━━━━━━
filter(index %in% seq(x-3, x+3, 1))      df[(index >= x-3) & (index <= x+3)]
case_when(index==x ~ '<main>...</main>')  if idx == x: f'<main>{text}</main>'
paste0(collapse = '.')                    '.'.join(texts)

예시:
  문장 43: "이전 문장 3"
  문장 44: "이전 문장 2"
  문장 45: "이전 문장 1"
  문장 46: ← Top 문장 (index=46)
  문장 47: "이후 문장 1"
  문장 48: "이후 문장 2"
  문장 49: "이후 문장 3"

  → "이전 문장 3.이전 문장 2.이전 문장 1.<main>Top 문장</main>.이후 문장 1.이후 문장 2.이후 문장 3"
```

### Step 7: export_to_xlsx()

```
R (151~175행):                            Python:
━━━━━━━━━━━━                              ━━━━━━━
group_nest(outcome) |>                    with pd.ExcelWriter(path) as writer:
  writexl::write_xlsx(...)                  for sheet in ['cp','inc','ed','ius','le']:
                                              df.to_excel(writer, sheet_name=sheet)

출력: xlsx 파일
  ├─ cp 시트:  [name, index, i, i2, speaker, text, .pred_1, context]
  ├─ inc 시트: [name, index, i, i2, speaker, text, .pred_1, context]
  ├─ ed 시트:  [name, index, i, i2, speaker, text, .pred_1, context]
  ├─ ius 시트: [name, index, i, i2, speaker, text, .pred_1, context]
  └─ le 시트:  [name, index, i, i2, speaker, text, .pred_1, context]
```

---

## API 엔드포인트 (✅ 4개 구현 완료)

```
routes_transcript.py:

┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  POST /api/transcript/analyze                                       │
│  ─────────────────────────────                                      │
│  입력: xlsx 파일 1개 (multipart/form-data) + X-API-Key              │
│  옵션: top_n (기본 0=전체), context_window (기본 3)                  │
│  처리: Step 1~7 전체 파이프라인                                      │
│  출력: JSON 결과 + xlsx 디스크 저장                                  │
│                                                                     │
│  POST /api/transcript/analyze-batch                                 │
│  ──────────────────────────────────                                  │
│  입력: xlsx 파일 여러 개 + X-API-Key                                │
│  처리: 각 파일 독립 실행 (1개 실패해도 나머지 계속)                   │
│  출력: 파일별 성공/실패 JSON 요약                                    │
│                                                                     │
│  GET /api/transcript/download/{patient_id}                          │
│  ─────────────────────────────────────────                           │
│  출력: 해당 patient_id의 결과 xlsx 다운로드                          │
│                                                                     │
│  GET /api/transcript/download-batch?patient_ids=sid-01,sid-02       │
│  ────────────────────────────────────────────────────────            │
│  출력: 여러 patient_id 결과를 zip으로 묶어 다운로드                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

단일 분석 응답 예시:
{
  "patient_id": "sid-01",
  "total_sentences": 341,
  "models": {
    "cp": [ { "index": 45, "i": 12, "i2": 3, "speaker": "Interviewer",
              "text": "in your case that risk turns out to be...",
              "pred_1": 0.9138, "context": "이전문장.<main>대상문장</main>.이후문장" }, ... ],
    "le": [...], "ed": [...], "inc": [...], "ius": [...]
  },
  "output_file": "sid-01_predictions.xlsx"
}
```

---

## 전체 실행 흐름

```
클라이언트
    │
    │  POST /api/transcript/analyze
    │  + xlsx 파일 업로드
    │  + X-API-Key 헤더
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ routes_transcript.py                                            │
│   API Key 검증 → 파일 수신                                      │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ transcript_service.py                                           │
│                                                                 │
│   Step 1: read_transcript()                                     │
│   xlsx → DataFrame [speaker, text] (192행)                      │
│                           │                                     │
│                           ▼                                     │
│   Step 2: filter_interviewer()                                  │
│   Interviewer만 → ~100행                                        │
│                           │                                     │
│                           ▼                                     │
│   Step 3: split_sentences()                                     │
│   문장 분리 → ~250행                                             │
│                           │                                     │
│                           ▼                                     │
│   Step 4: nlp_service.predict_batch() × 5모델                   │
│           ┌───────────────┼───────────────┐                     │
│           │               ▼               │                     │
│           │  ┌─────────────────────────┐  │                     │
│           │  │ r01-nlp-classifiers     │  │                     │
│           │  │ Docker 컨테이너          │  │                     │
│           │  │ (기존 그대로 사용)        │  │                     │
│           │  └─────────────────────────┘  │                     │
│           └───────────────┼───────────────┘                     │
│                           ▼                                     │
│   Step 5: select_top_n()                                        │
│   모델별 Top 5 선별                                              │
│                           │                                     │
│                           ▼                                     │
│   Step 6: generate_context()                                    │
│   전후 3문장 + <main>태그                                        │
│                           │                                     │
│                           ▼                                     │
│   Step 7: export_to_xlsx()                                      │
│   5시트 Excel 생성                                               │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
                    JSON 결과 반환
                    + xlsx 다운로드 경로
```

---

## 구현 순서 (✅ 전체 완료)

```
순서   작업                                              상태
━━━━   ━━━━                                              ━━━━
 1     openpyxl 의존성 추가                              ✅ requirements.txt
 2     transcript_service.py — Step 1 (read_transcript)  ✅ 구현 완료
 3     transcript_service.py — Step 2 (filter)           ✅ 구현 완료
 4     transcript_service.py — Step 3 (split)            ✅ regex 기반 (nltk 대체)
 5     transcript_service.py — Step 4 연동 (predict)     ✅ nlp_service.predict_batch() 재사용
 6     transcript_service.py — Step 5 (top_n)            ✅ 동점 포함 처리
 7     transcript_service.py — Step 6 (context)          ✅ ±window + <main>태그
 8     transcript_service.py — Step 7 (xlsx)             ✅ 5시트 출력
 9     transcript_service.py — analyze_transcript()      ✅ 전체 오케스트레이터
10     routes_transcript.py — 단일/배치 분석 + 다운로드    ✅ 4개 엔드포인트
11     main.py 수정 — 라우터 추가                         ✅ 수정 완료
12     Docker 재빌드                                     ✅ 빌드 + 테스트 완료
13     테스트: xlsx 업로드 → API 호출                     ✅ sid-01 단일 + 배치 성공
14     검증: R 스크립트 출력과 비교                        ✅ 208/208 필드 일치 (5시트)
```

### 구현 중 발생한 이슈 및 해결

```
이슈                                    해결
━━━━                                    ━━━━
nltk punkt_tab Docker 추출 실패          → regex 기반 _sent_tokenize()로 교체
gunicorn 멀티워커 메모리 저장소 공유 불가  → 파일 기반 저장 (/app/uploads/)으로 변경
R unnest_tokens의 to_lower=TRUE 누락     → .lower() 추가
R slice_max 동점 포함 동작 차이           → threshold 기반 동점 포함 로직 구현
```

---

## 검증 결과 (✅ 통과)

```
┌──────────────────────────┐       ┌──────────────────────────┐
│ R 스크립트 출력            │       │ Backend 출력              │
│                          │       │                          │
│ original-study-physician-│       │ sid-01_predictions.xlsx   │
│ predictions-top-         │  vs   │                          │
│ context.xlsx             │       │                          │
│                          │       │                          │
│ 각 시트 Top 5 문장       │       │ 각 시트 Top 5 문장       │
│ text + .pred_1           │  ══   │ text + pred_1            │
└──────────────────────────┘       └──────────────────────────┘

✅ 검증 완료:
  • 5개 시트 (cp, inc, ed, ius, le): 208/208 필드 일치 (100%)
  • 동일한 문장 인덱스, 동일한 텍스트, 동일한 context 문자열
  • .pred_1 차이 최대 < 0.00005 (부동소수점 오차 범위)
  • ius 시트: 동점 처리 검증 (pred=0.5821 동점 2개 → 정확히 6행 반환)

참고: R의 unnest_tokens()와 Python의 regex 기반 _sent_tokenize()가
   동일한 문장 분리 결과를 생성함을 확인
```

---

## 관련 문서

- [ML_PIPELINE_ARCHITECTURE_KR.md](./ML_PIPELINE_ARCHITECTURE_KR.md) / [EN](./ML_PIPELINE_ARCHITECTURE_EN.md) — ML 파이프라인 아키텍처 설계 문서
- [ML_PIPELINE_DEVELOPMENT_STATUS_KR.md](./ML_PIPELINE_DEVELOPMENT_STATUS_KR.md) / [EN](./ML_PIPELINE_DEVELOPMENT_STATUS_EN.md) — ML 파이프라인 구현 상태 분석 및 Gap 분석
