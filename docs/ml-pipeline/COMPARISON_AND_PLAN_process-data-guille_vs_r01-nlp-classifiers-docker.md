# Comparison & Plan: process-data-guille vs r01-nlp-classifiers-docker

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
