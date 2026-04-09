# Full Pipeline Detailed Guide

> **Updated:** 2026-04-02 | Actual Transcript -> NLP -> Scorer -> Rewriter -> DB -> Dashboard

---

## Starting Point: Docker Startup

```
./run_all.sh execution
  -> docker compose up -d --build
    -> 10 containers start
    -> Backend container's prestart.sh runs:
        1. wait_for_db.py     -- Wait for PostgreSQL connection
        2. init_db.py         -- Create 12 tables (skip if already exist)
        3. alembic stamp/upgrade -- Mark migrations
        4. pipeline_runner.py -- Begin actual transcript processing
```

---

## Input Data

```
AI_physician_patient_communication/data/input/
├── Input_Keystrokes REC 001 (SID 10).xlsx    <- Manual keystroke transcript
├── Input_Keystrokes REC001 (SID 14).xlsx
├── Input_Keystrokes REC001 (SID 15).xlsx
├── Input_Keystrokes REC001 (SID 18).xlsx
├── Input_TurboScribe SID 33.csv              <- Automatic transcription (TurboScribe)
└── processed_transcripts_sid-01.xlsx
```

In Docker, this folder is mounted as `/app/data/transcripts/`.

Structure of each file (2 columns):

| speaker | text |
|---------|------|
| Interviewer: | so it sounds like in july you had a psa check... |
| Patient: | yes, that's right. |
| Interviewer: | and since you're 52 years old... |

---

## pipeline_runner.py (Thin Main)

Reads configuration from `config.yaml` and processes each file sequentially:

```python
for filepath in files:
    result = await process_single_file(filepath, Session, cfg)
```

Steps 1 through 10 are executed for each file. Each step is **a single function call** (Ivan's Thin Main principle).

---

## Step 1: Read Transcript

**Function:** `transcript_service.read_transcript(file_bytes, filename)`

**What it does:**
- Read xlsx file into a pandas DataFrame
- Verify `speaker` and `text` columns
- Extract patient_id from filename: `Input_Keystrokes REC001 (SID 14).xlsx` -> `Input_Keystrokes REC001 (SID 14)`
- Add 1-based index

**Resulting DataFrame:**

| index | speaker | text |
|-------|---------|------|
| 1 | Interviewer: | so it sounds like in july... |
| 2 | Patient: | yes, that's right. |
| 3 | Interviewer: | and since you're 52 years old... |
| ... | ... | ... |

For SID 14: **344 rows**

---

## Step 2: Identify Doctor & Filter

**Function:** `transcript_service.filter_interviewer(df_raw)`

**What it does (Ivan's rule: identify doctor by text volume):**

1. Sum total text length for each speaker:
   ```
   Interviewer:    -> 28,115 chars (most = doctor!)
   Patient:        -> 3,200 chars
   Patient's Wife: -> 850 chars
   [END FILE]      -> excluded
   ```

2. Speaker with the most text = doctor (`Interviewer:`)

3. Filter to doctor rows only + re-index

**Resulting DataFrame:**

| index | speaker | text |
|-------|---------|------|
| 1 | Interviewer: | so it sounds like in july... |
| 2 | Interviewer: | and since you're 52 years old... |
| ... | ... | ... |

For SID 14: 344 rows -> **161 rows** (doctor utterances only)

---

## Step 3: Split into Sentences

**Function:** `transcript_service.split_sentences(df_filtered)`

**What it does:**
- Split each utterance into individual sentences
- Regex tokenizer: split at whitespace following `.!?`
- Convert to lowercase (NLP model input format)
- Assign `i` (utterance number), `i2` (sentence number within utterance), `index` (global number)

**Example:**

Original utterance (i=20):
```
"You're a 56-year-old patient. The cancer is slow-growing. We need to plan."
```

Split result:

| index | i | i2 | speaker | text |
|-------|---|----|---------|----- |
| 45 | 20 | 1 | Interviewer: | you're a 56-year-old patient. |
| 46 | 20 | 2 | Interviewer: | the cancer is slow-growing. |
| 47 | 20 | 3 | Interviewer: | we need to plan. |

For SID 14: 161 utterances -> **423 sentences**

---

## Step 4: NLP Prediction (5 models, parallel)

**Function:** `transcript_service.run_predictions(df_sentences)`

**What it does:**
- Split 423 sentences into batches of 50 (`batch_size: 50` in `config.yaml`)
- Call **5 models simultaneously** per batch (`asyncio.gather`)
- HTTP POST to NLP Docker container (3 replicas, load-balanced)

**Call flow (1 batch):**

```
Backend -> asyncio.gather([
    predict_batch(chunk, "cp"),   -> NLP replica 1
    predict_batch(chunk, "le"),   -> NLP replica 2
    predict_batch(chunk, "ed"),   -> NLP replica 3
    predict_batch(chunk, "inc"),  -> NLP replica 1 (reused)
    predict_batch(chunk, "ius"),  -> NLP replica 2 (reused)
])
```

**Inside NLP Docker (R plumber):**
```
Sentence text -> textrecipes (tokenization -> stemming -> stopword removal -> TF-IDF) -> ranger Random Forest -> .pred_1 probability
```

**Resulting DataFrame (423 rows x 5 new columns added):**

| index | i | i2 | text | cancer_prognosis | life_expectancy | erectile_dysfunction_potency | continence | irritative_urinary_symptoms... |
|-------|---|----|----|---|---|---|---|---|
| 45 | 20 | 1 | you're a 56-year-old patient. | 0.8503 | 0.6445 | 0.1429 | 0.2157 | 0.0669 |
| 46 | 20 | 2 | the cancer is slow-growing. | 0.9488 | 0.9297 | 0.0349 | 0.4565 | 0.1280 |

Each value is a **`.pred_1` probability (0.0~1.0)** -- "the probability that this sentence is related to the given domain"

SID 14: 423 sentences x 9 batches x 5 models = **45 HTTP calls** (parallel, so effectively 9 rounds)

---

## Step 5: Select Top-N

**Function:** `transcript_service.select_top_n(df_predicted, n=10)`

**What it does:**
- Sort by `.pred_1` descending for each domain
- Select top 10 sentences (ties are included -- matching R's `slice_max` behavior)

**Result: dictionary of DataFrames**

```python
{
    "cancer_prognosis": DataFrame (10 rows),
    "life_expectancy": DataFrame (10 rows),
    "erectile_dysfunction_potency": DataFrame (10 rows),
    "continence": DataFrame (10 rows),
    "irritative_urinary_symptoms_...": DataFrame (10 rows),
}
```

cancer_prognosis Top-3 example:

| index | i | i2 | text | .pred_1 |
|-------|---|----|----|---------|
| 46 | 20 | 2 | the cancer is slow-growing. | 0.9488 |
| 135 | 48 | 3 | reducing your risk of death from 50 to 18 percent. | 0.9297 |
| 78 | 27 | 4 | you can control this cancer for ten years. | 0.8503 |

---

## Step 6: Generate Context

**Function:** `transcript_service.generate_context(df_sentences, top_df, window=3)`

**What it does:**
- Extract +/-3 sentences of context for each Top sentence
- Wrap the target sentence in a `<main>` tag

**Example (index=46, window=3):**

```
index 43: "and none of us live forever."
index 44: "so, this is a little bit different."
index 45: "you're a 56-year-old patient."
index 46: <main>the cancer is slow-growing.</main>      <- target sentence
index 47: "we need to plan."
index 48: "so the question is what happens."
index 49: "if you do absolutely nothing."
```

Combined result:
```
"and none of us live forever..so, this is a little bit different..
you're a 56-year-old patient..<main>the cancer is slow-growing.</main>.
we need to plan..so the question is what happens..if you do absolutely nothing."
```

---

## Step 7: Export xlsx

**Function:** `transcript_service.export_to_xlsx(final_results, patient_id)`

**What it does:**
- Create an xlsx file in memory with 5 sheets (cp, inc, ed, ius, le)
- Each sheet: name, index, i, i2, speaker, text, .pred_1, context columns

This xlsx is later stored as binary in `transcript_analysis_log.xlsx_data`.

---

## Step 8: Score Sentences (Consultation Quality 0-5)

**Function:** `scorer_service.score_batch(scorer_input)`

**What it does:**
1. Deduplicate from Top-N results (if the same sentence appears in multiple domains, keep only the one with the highest probability)
2. Send each sentence to the `consultation-scorer` Docker service
3. Receive a 0-5 integer quality score

**Call:**
```
POST http://consultation-scorer:8001/score/batch
Body: {"sentences": [
    {"text": "the cancer is slow-growing.", "domain": "cp"},
    {"text": "reducing your risk of death...", "domain": "cp"},
    ...
]}
```

**Response:**
```json
{"scores": [
    {"text": "the cancer is slow-growing.", "domain": "cp", "score": 4},
    {"text": "reducing your risk of death...", "domain": "cp", "score": 2},
    ...
]}
```

Currently a placeholder: deterministic pseudo-random (hash-based). Will be replaced with Guillermo's AI model in the future.

SID 14: **47 sentences scored with 0-5 scores**

---

## Step 9: Rewrite Patient Summaries

**Function:** `rewriter_service.rewrite_batch(domains_for_rewrite)`

**What it does:**
1. Extract Top-3 sentences per domain (`summary_top_k: 3` in `config.yaml`)
2. Send to the `patient-summary-rewriter` Docker service
3. Receive patient-friendly summary text

**Call:**
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

**Response:**
```json
{"summaries": [
    {"domain": "cp", "summary": "sentence1 sentence2 sentence3"},
    {"domain": "le", "summary": "..."},
    ...
]}
```

Currently a placeholder: pass-through (input sentences are simply concatenated). Will be replaced with Guillermo's AI model in the future.

---

## Step 10: Save to DB

**Function:** `persistence.save_all(Session, ...)`

**What it does (single transaction):**

| Order | Table | Row Count | Contents |
|-------|-------|-----------|----------|
| 1 | `transcript_analysis_log` | 1 | Execution record (patient_id, top_n, context_window, xlsx binary) |
| 2 | `sentence_prediction` | 50 | 5 domains x 10 sentences, `.pred_1` probability + context |
| 3 | `doctor_sentence_view` | 47 | Deduplicated sentences + **0-5 quality score** + domain name |
| 4 | `patient_summary` | 1 | AI summary text for 5 domains (class_1~5, summary_class_1~5) |
| 5 | `patient_summary_scoring` | 1 | Patient ratings for 5 domains (initially NULL -- patient enters later) |
| 6 | `patient_responses` | 1 | Free-text responses for 5 domains (initially NULL) |

+ Save xlsx file to output folder:
```
/app/data/output/Input_Keystrokes REC001 (SID 14)/
  └── Input_Keystrokes REC001 (SID 14)_predictions.xlsx
```

---

## Full File Processing Results (6 files)

| File | Doctor Speaker | Sentence Count | Processing Time |
|------|---------------|----------------|-----------------|
| SID 10 | `Interviewer:` (28,115 chars) | 44 | ~60s |
| SID 14 | `Interviewer:` (32,400 chars) | 47 | ~50s |
| SID 15 | `Interviewer:` (8,200 chars) | 38 | ~12s |
| SID 18 | `Interviewer:` (30,100 chars) | 46 | ~40s |
| SID 33 | `Speaker 1` (25,000 chars) | 46 | ~40s |
| sid-01 | `Interviewer` (18,500 chars) | 45 | ~35s |

**Total: 266 doctor sentences, 300 predictions, 6 patient summaries**

---

## After That: Dashboard Reads from DB

### Doctor Demo (`PhysicianReportsModifiedV41Timothy.tsx`)
```
GET /api/doctor/files -> file_details (file + speaker mapping)
GET /api/doctor/sentences/{file}/{speaker} -> reads from doctor_sentence_view
GET /api/doctor/scores/average -> average score per domain
GET /api/doctor/scores/trajectory -> score trends over time
```

### Patient First Visit (`PatientInitialVisitReportV35.tsx`)
```
GET /api/patient/summaries/{file}/{speaker} -> patient_summary + patient_summary_scoring
GET /api/patient/sentences/{file} -> top 7 sentences per domain from doctor_sentence_view
```

### Patient Follow-Up (`PatientFollowUpReportV31Re.tsx`)
```
GET /api/patient/summaries/{file}/{speaker} -> AI summary cards
POST /api/surveys/submit -> save SDM, DCS, Risk Perception, Satisfaction
GET /api/surveys/by-speaker/{speaker} -> restore previous responses
```

---

## Distinguishing the Two Types of Scores

| | `sentence_prediction.pred_score` | `doctor_sentence_view.score` |
|---|---|---|
| **Range** | 0.0 ~ 1.0 | 0 ~ 5 |
| **Meaning** | The **probability** determined by the NLP model that "this sentence is related to the given domain" | Consultation **quality** score |
| **Generated at** | Step 4 (NLP Docker) | Step 8 (consultation-scorer) |
| **Usage** | Basis for Top-N sentence selection | Score displayed on the dashboard |
| **Naming convention** | `.pred_1` is "probability" | score is "score" |
