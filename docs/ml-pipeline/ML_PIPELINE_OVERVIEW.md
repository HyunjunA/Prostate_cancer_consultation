# ML Pipeline Overview

> Prostate Cancer Consultation Transcript → NLP Topic Classification
>
> Last updated: 2026-02-10 | English version

---

## Overall Pipeline Flow

```
┌─────────────────────────────┐      ┌──────────────────────────────┐      ┌─────────────────────────────────┐
│         Stage 1             │      │          Stage 2             │      │           Stage 3               │
│  Ella's TurboScribe         │      │   NLP Model Input Format     │      │     NLP Classification Results  │
│    Transcription            │      │      (preprocessed)          │      │       (predictions)             │
│      (raw transcript)       │      │                              │      │                                 │
│  SID 33 (8).csv             │      │  processed_transcripts_      │      │  {patient_id}_predictions.xlsx  │
│  [start, end, text,         │─────▶│  sid-01.xlsx                 │─────▶│  [5 sheets: cp, inc, ed,        │
│   speaker]                  │      │  [speaker, text]             │      │   ius, le]                      │
│                             │      │                              │      │  [name, index, i, i2, speaker,  │
│  489 utterances             │      │  192 utterances              │      │   text, .pred_1, context]       │
│                             │      │                              │      │  Top N sentences + Context      │
│                             │      │                              │      │   per model                     │
└─────────────────────────────┘      └──────────────────────────────┘      └─────────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌─────────────────────────────┐      ┌──────────────────────────────────────────────────────────┐
│     Stage 1 → 2          │      │               Stage 2 → 3 Analysis (Implemented)       │
│    Conversion               │      │                                                          │
│  (Not Yet Implemented       │      │  [R Path — Legacy]           [Backend Path — New ]     │
│   — Top Priority)           │      │  process-data-guille.R       POST /api/transcript/analyze │
│                             │      │                          POST /api/transcript/analyze-batch│
│  • Speaker 1 → Interviewer  │      │                                                          │
│  • Speaker 2 → Patient      │      │  Verified that both paths produce identical output        │
│  • Remove timestamps        │      │  (.pred_1 difference < 0.00005)                          │
│  • Standardize filename     │      │                                                          │
│  • CSV → xlsx conversion    │      │                                                          │
└─────────────────────────────┘      └──────────────────────────────────────────────────────────┘
```

### Backend Analysis Pipeline Detailed Flow (Stage 2 → 3)

```
┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐    ┌──────────────────────────────┐
│   Step 1     │    │     Step 2       │    │      Step 3        │    │          Step 4              │
│  Read xlsx   │───▶│ Filter for       │───▶│ Sentence Splitting │───▶│   5-Model NLP Prediction     │
│              │    │ Interviewer      │    │                    │    │                              │
│ [speaker,    │    │ Interviewer,     │    │ i = utterance #    │    │ r01-nlp-classifiers:8000     │
│  text]       │    │ Q, Q1, Q2, etc.  │    │ i2 = sentence #    │    │ cp, le, ed, inc, ius         │
│              │    │ only             │    │ index = overall     │    │ → .pred_1 (0~1)             │
│              │    │                  │    │  sequence           │    │                              │
└──────────────┘    └──────────────────┘    └────────────────────┘    └──────────────────────────────┘
                                                                                    │
                    ┌──────────────────────────────────────────────────────────────────┘
                    ▼
┌──────────────────────┐    ┌──────────────────────────────┐    ┌──────────────────────────┐
│       Step 5         │    │          Step 6              │    │        Step 7            │
│ Select Top N         │───▶│  Generate Context            │───▶│    xlsx Output            │
│  Sentences           │    │                              │    │                          │
│ Top N by .pred_1     │    │ ±window sentences around     │    │ 5 sheets                 │
│ per model            │    │ target sentence              │    │ (cp, inc, ed, ius, le)   │
│ (ties included)      │    │ Target: <main> tag           │    │ + JSON API response      │
│                      │    │ Default window = 3           │    │                          │
└──────────────────────┘    └──────────────────────────────┘    └──────────────────────────┘
```

---

## Stage 1: Raw Transcription File (TurboScribe Output)

- **Source:** Ella transcribed consultation recordings using TurboScribe
- **Location:** `prostate_cancer_R01_raw_transcripts_Ella/`
- **Example file:** `SID 33 (8).csv`

### File Structure

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `start` | int | Utterance start time (ms) | `1430` |
| `end` | int | Utterance end time (ms) | `2890` |
| `text` | str | Utterance text | `"Yeah, great doctor."` |
| `speaker` | str | Speaker | `"Speaker 1"`, `"Speaker 2"` |

### Characteristics
- Data unit: **utterance** — a single utterance may contain multiple sentences
- Speaker labels: `Speaker 1` (physician), `Speaker 2` (patient) — anonymized
- Timestamps included (in milliseconds)
- For `SID 33 (8).csv`: 489 utterances, Speaker 1 = 453 (92.6%), Speaker 2 = 36 (7.4%)

---

## Stage 2: NLP Model Input Format (After Preprocessing)

- **Source:** Format processed by Michael from keystroke data
- **Location:** `prostate_cancer_R01_NLP_classifiers_Michael/prediction_pipeline_and_results/`
- **Example file:** `processed_transcripts_sid-01.xlsx`

### File Structure

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `speaker` | str | Speaker | `"Interviewer"`, `"Patient"` |
| `text` | str | Utterance text (may contain multiple sentences) | `"Here we are. So the one thing..."` |

### Characteristics
- Data unit: **utterance**
- Speaker labels: `Interviewer`, `Patient` — roles are explicitly labeled
- No timestamps
- For `processed_transcripts_sid-01.xlsx`: 192 utterances

---

## Stage 1 → Stage 2 Conversion (Not Yet Implemented)

Preprocessing is required to convert TurboScribe output into the NLP input format.

### Required Conversion Steps

| Item | Stage 1 (TurboScribe) | Stage 2 (NLP Input) | Conversion |
|------|----------------------|---------------------|------------|
| Speaker label | `Speaker 1`, `Speaker 2` | `Interviewer`, `Patient` | Mapping |
| Timestamps | `start`, `end` (ms) | None | Remove |
| Filename | `SID 33 (8).csv` | `processed_transcripts_sid-33.xlsx` | Standardize |

### Michael's Comment (readme.txt)

> *"The data from TurboScribe will look slightly different — since the code that I wrote was meant for keystrokes. The initial parts will need to be changed to pre-process the TurboScribe input."*

---

## Stage 2 → Stage 3: NLP Classification (Michael's Pipeline)

### Processing Steps (process-data-guille.R)

1. **Filter for Interviewer utterances only**
   - Target speaker IDs: `INTERVIEWER`, `Interviewer`, `Q`, `Q1`, `Q2`, `Q:`, etc.
2. **Split utterances into sentences** (`unnest_tokens('sentences')`)
   - A single utterance is split into multiple sentences
   - Each sentence is assigned `i` (utterance number) and `i2` (sentence number)
3. **Predict with 5 NLP models**
   - All sentences are passed through each of the 5 models
   - Each model returns a probability value (`.pred_1`) between 0 and 1
4. **Select Top 5 sentences per model** (`slice_max`)
5. **Add context** (±3 sentences around the selected sentence, target marked with `<main>` tag)
6. **Excel output** (one sheet per model)

### NLP Models (5 total)

| Model | Endpoint | Classification Topic | Class |
|-------|----------|---------------------|-------|
| Cancer Prognosis | `/predict/cp` | Cancer prognosis | 1 |
| Life Expectancy | `/predict/le` | Life expectancy | 2 |
| Erectile Dysfunction | `/predict/ed` | Erectile dysfunction | 3 |
| Incontinence | `/predict/inc` | Incontinence | 4 |
| Irritative Urinary Symptoms | `/predict/ius` | Irritative urinary symptoms | 5 |

### Runtime Environment
- **Docker image:** `r01-nlp-classifiers:latest`
- **Framework:** R 4.5.1 + vetiver + plumber
- **Model algorithm:** ranger (Random Forest)
- **API port:** 8000 (inside container)

---

## Stage 3: Final Output

- **Location:** `prostate_cancer_R01_NLP_classifiers_Michael/prediction_pipeline_and_results/`
- **Example file:** `original-study-physician-predictions-top-context.xlsx`

### File Structure (5 sheets: cp, le, ed, inc, ius)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `name` | str | Patient ID | `"sid-01"` |
| `index` | int | Overall sentence sequence number | `21` |
| `i` | int | Utterance number | `5` |
| `i2` | int | Sentence number within utterance | `3` |
| `speaker` | str | Speaker (Interviewer only) | `"Interviewer"` |
| `text` | str | Sentence text | `"and it's actually the best predictor..."` |
| `.pred_1` | float | Model prediction probability (0~1) | `0.9138` |
| `context` | str | ±3 surrounding sentences (target sentence in `<main>` tag) | `"so your biopsy...<main>and it's...</main>..."` |

### Characteristics
- Each sheet contains only the **Top 5 sentences** per model (ranked by highest probability)
- Only physician (Interviewer) sentences are included
- Context enables understanding the surrounding conversational context of each sentence

---

## File Location Summary

```
Graciela_Lab_Collab/
│
├── prostate_cancer_R01_raw_transcripts_Ella/                          ← [Stage 1] Ella's TurboScribe transcriptions
│   └── SID 33 (8).csv                               489 utterances, 4 columns
│
├── prostate_cancer_R01_NLP_classifiers_Michael/   ← [Stage 2 & 3] Michael's NLP pipeline
│   ├── README.md                                     Docker image & API documentation
│   │
│   ├── prediction_pipeline_and_results/
│   │   ├── readme.txt                                Michael's notes (email)
│   │   ├── process-data-guille.R                     R script (legacy pipeline)
│   │   ├── processed_transcripts_sid-01.xlsx         [Stage 2] NLP input example (192 utterances)
│   │   └── original-study-physician-predictions-     [Stage 3] NLP output example (5 sheets, top 5 per model)
│   │       top-context.xlsx
│   │
│   ├── manual_scoring_ground_truth/
│   │   └── nlp-pilot-manual-scores(cp).csv           Manual scoring ground truth (9,543 sentences, 20 patients)
│   │
│   └── r01-nlp-classifiers-docker-image/             Docker image file (660 MB)
│
└── Prostate_cancer_consultation_dashboard/         ← Web dashboard app (Backend + Webapp)
    └── app/Backend/                                  FastAPI + NLP API proxy (implemented in this project)
```

---

## Implementation Status

| Stage | Status | Description |
|-------|--------|-------------|
| **Stage 1 → 2 Conversion** |  Not Yet Implemented | Automated conversion of TurboScribe CSV → NLP input xlsx |
| **Stage 2 → 3 Analysis** |  Implemented | `transcript_service.py` + `routes_transcript.py` (replaces R script) |

### Remaining Work: Stage 1 → 2 Preprocessing Automation

A preprocessing script is needed to convert TurboScribe CSV files into the NLP input format.

1. **Speaker mapping** — `Speaker 1` / `Speaker 2` → `Interviewer` / `Patient`
2. **Remove timestamps** — Delete `start`, `end` columns
3. **Standardize filename** — `SID 33 (8).csv` → `processed_transcripts_sid-33.xlsx`
4. **Format conversion** — CSV → xlsx

---

## Related Documents

- [ML_PIPELINE_OVERVIEW.md](./ML_PIPELINE_OVERVIEW.md) — Korean version (original)
- [ML_PIPELINE_OVERVIEW_EN.md](./ML_PIPELINE_OVERVIEW_EN.md) — English version (this document)

---
