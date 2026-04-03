# NLP Pipeline Update — Michael's Classifiers

### Michael's NLP Pipeline Update — SID-14 (2026-02-17)

> Detailed evidence-based analysis of the 3 files received from Michael on February 17, 2026
>
> All claims are backed by specific line numbers, code snippets, and data values.

---

## Files Analyzed

| # | File | Size | Description |
|---|------|------|-------------|
| 1 | `REC001 (SID 14).xlsx` | 58 KB | Raw transcript input (Stage 2 format) |
| 2 | `nlp-pilot-processed-results-sid14.xlsx` | 36 KB | NLP classification results (Stage 3 output) |
| 3 | `data-processing-pipeline.html` | 1.3 MB | Quarto R notebook documenting the full pipeline |

---

## 1. `REC001 (SID 14).xlsx` — Raw Transcript

### Basic Structure

| Property | Value |
|----------|-------|
| Sheets | 1 (`Sheet1`) |
| Rows | 476 |
| Columns | 2: `speaker`, `text` |
| Format | Stage 2 (preprocessed, not TurboScribe raw) |

### Speaker Breakdown

| Speaker | Count | Note |
|---------|-------|------|
| `Patient:` | 196 | |
| `Interviewer:` | 186 | Primary physician |
| `Patient's Wife:` | 75 | Third participant |
| `Interviewer: ` (trailing space) | 6 | Whitespace inconsistency |
| `Patient: ` (trailing space) | 5 | Whitespace inconsistency |
| `Patient's Wife: ` (trailing space) | 1 | Whitespace inconsistency |
| `[END FILE]` | 1 | File terminator marker |
| `null` (empty) | 6 | e.g., `[INAUDIBLE CONVERSATION TO 00:01:40]` |

**Evidence — Speaker inconsistency:** 12 rows have trailing whitespace variations (e.g., `Interviewer: ` vs `Interviewer:`). The pipeline's `filter(speaker == 'Interviewer:')` at HTML line 2349 would **miss** the 6 rows with trailing spaces. This is a potential data quality issue.

### Comparison with SID-01 Input (`processed_transcripts_sid-01.xlsx`)

| Aspect | SID-01 | SID-14 |
|--------|--------|--------|
| Total utterances | 192 | 476 |
| Speaker format | `Interviewer`, `Patient` (no colon) | `Interviewer:`, `Patient:` (with colon) |
| Third participant | None | `Patient's Wife:` (75 rows) |
| Whitespace issues | None observed | 12 rows with trailing spaces |
| Null speakers | None | 6 rows |
| End marker | None | 1 row (`[END FILE]`) |

**Evidence — SID-14 is a longer consultation:** 476 utterances vs SID-01's 192, with a third participant (wife) present.

---

## 2. `nlp-pilot-processed-results-sid14.xlsx` — NLP Results

### Sheet Structure

| Sheet Name | Rows | Columns | `.pred_1` min | `.pred_1` max | `.pred_1` mean |
|------------|------|---------|---------------|---------------|----------------|
| `cancer_prognosis` | 40 | 7 | 0.7023 | 0.9488 | 0.7993 |
| `continence` | 15 | 7 | 0.7155 | 0.9572 | 0.8108 |
| `erectile_dysfunction_potency` | 14 | 7 | 0.7040 | 0.9902 | 0.8190 |
| `irritative_urinary_symptoms_f` | 2 | 7 | 0.7043 | 0.7141 | 0.7092 |
| `life_expectancy` | 5 | 7 | 0.7742 | 0.9297 | 0.8378 |

**Total selected sentences: 76** (40 + 15 + 14 + 2 + 5)

### Column Layout

All 5 sheets have identical columns:

```
index | i | i2 | speaker | text | .pred_1 | context
```

7 columns. The `name` column (present in SID-01 output) is **missing**.

### `.pred_1` Distribution

| Sheet | [0.7, 0.8) | [0.8, 0.9) | [0.9, 1.0] | Total |
|-------|------------|------------|------------|-------|
| cancer_prognosis | 22 | 14 | 4 | 40 |
| continence | 7 | 6 | 2 | 15 |
| erectile_dysfunction_potency | 7 | 3 | 4 | 14 |
| irritative_urinary_symptoms_f | 2 | 0 | 0 | 2 |
| life_expectancy | 1 | 3 | 1 | 5 |

**Evidence — Threshold filtering, not top-N:** The minimum `.pred_1` across all sheets is 0.7023, but this alone does not prove threshold filtering (top-5 could also yield all values >= 0.7). The **decisive evidence** is the variable row count per sheet: cancer_prognosis has **40 rows** and continence has **15 rows** (both exceeding 5), while irritative_urinary_symptoms_f has only **2 rows** (below 5). Top-5 selection would always produce exactly 5 rows per sheet. This variability (2–40) confirms `filter(.pred_1 >= 0.7)` was used.

### Sample Data (life_expectancy sheet, first row)

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

**Evidence — Context format identical:** `<main>` tags, ±3 sentence window, `.` separator — same format as previous pipeline.

---

## 3. `data-processing-pipeline.html` — Quarto R Notebook

### Metadata

| Property | Value |
|----------|-------|
| Title | "NLP Processing Pipeline" |
| Published | February 17, 2026 |
| Engine | Quarto 1.8.24 |
| Format | Rendered HTML with code folding |
| Size | 1.3 MB (~3,400 lines) |

### Pipeline Steps (8 H1 sections)

From HTML line numbers:

| Step | Heading | Line |
|------|---------|------|
| 1 | Read in the raw excel/csv transcript data | 2316 |
| 2 | Subset the data for only the physician text | 2343 |
| 3 | Construct the index variable | 2373 |
| 4 | Tokenize text into sentences (i, i2, index) | 2404 |
| 5 | Read NLP models and generate predictions | 2440 |
| 6 | **Extract sentences with predicted probability >= 0.7** | 2744 |
| 7 | Identify context (±3 sentences with `<main>` tags) | 2833 |
| 8 | Combine top sentences with context | 3123 |

### R Libraries (13 packages)

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

Same library set as old script (`process-data-guille.R`).

### Data Flow Through Pipeline

| Stage | Dimensions | HTML Line |
|-------|-----------|-----------|
| Raw input | 476 x 2 | 2325 |
| After physician filter | 192 x 2 | 2355 |
| After adding index (i) | 192 x 3 | 2386 |
| After sentence tokenization | 424 x 5 | 2422 |
| Per-model predictions | 424 x 6 each | 2662 |
| After threshold filter (cp) | 40 x 6 | 2759 |
| After threshold filter (inc) | 15 x 6 | 2775 |
| After threshold filter (ed) | 14 x 6 | 2795 |
| After threshold filter (ius) | 2 x 6 | 2814 |
| After threshold filter (le) | 5 x 6 | 2821 |
| Final with context (per sheet) | N x 7 | 3219+ |

### Model Specifications (5 models, all Random Forest)

From HTML lines 2470-2632:

| Model | Sample Size | Indep. Variables | Mtry | Node Size | Splitrule | OOB Brier Score |
|-------|-------------|-----------------|------|-----------|-----------|-----------------|
| cancer_prognosis | 504 | 738 | 27 | 10 | gini | 0.1306 |
| continence | 534 | 742 | 27 | 10 | gini | 0.0745 |
| erectile_dysfunction_potency | 892 | 742 | 27 | 10 | gini | 0.0687 |
| irritative_urinary_symptoms | 444 | 744 | 27 | 10 | gini | 0.0493 |
| life_expectancy | 176 | 739 | 27 | 10 | gini | 0.1322 |

**Evidence — Model preprocessing pipeline (identical for all 5):**

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

### Model Loading Method

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

Models are loaded from a local `board/` directory using `pins`, not via Docker API. This is the **direct R model execution** approach, unlike our Backend which calls the Docker API at `r01-nlp-classifiers:8000`.

---

## 4. Key Differences: Old Pipeline vs New Pipeline

### Difference 1: Sentence Selection Method (THE CRITICAL CHANGE)

Below are the **full annotated code listings** of both pipelines. The critical line in each is marked with `# ◀◀◀`.

#### Old Pipeline: `process-data-guille.R` (full 175 lines)

```r
# --- Libraries (lines 1-13) ---
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

# --- Init (lines 15-17) ---
board <- pins::board_folder(here::here('board'))
files <- fs::dir_ls(here::here('data/transcripts'))          # All files in directory

# --- Read data (lines 19-30) ---
datas <- map(files, \(x) readxl::read_excel(x)) |>
  enframe(name = 'file', value = 'data')
datas$file <- fs::path_file(datas$file) |>
  fs::path_ext_remove() |>
  str_remove('processed_transcripts_')
datas$data <- map(datas$data, \(x) {
  x |> mutate(index = row_number()) |> relocate(index)
})

# --- Physician filter (lines 32-47) ---
datas$physician_data <- map(datas$data, \(x) {
  physician_ids <- c(
    "INTERVIEWER", "INTERVIEWER 1", "INTERVIEWER 2",
    "Interviewer", "Q", "Q1", "Q2", "Q:"                    # 8 speaker IDs
  )
  x |>
    filter(speaker %in% physician_ids) |>
    mutate(index = row_number())
})

# --- Sentence tokenization (lines 49-66) ---
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

# --- Model loading (lines 68-75) ---
models <- pins::pin_read(board, 'nlp-models')
models <- models |>
  filter(models == 'Random Forest') |>
  select(outcome, final_fits) |>
  unnest(final_fits) |>
  select(outcome, .workflow) |>
  deframe()

# --- Prediction (lines 77-89) ---
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
# ║  ★★★ CRITICAL: Sentence selection (lines 99-112) ★★★               ║
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
    slice_max(order_by = .pred_1, n = 5) |>                  # ◀◀◀ TOP 5 SELECTION
    ungroup() |>
    group_nest(name) |>
    deframe()
})

# --- Context generation (lines 114-136) ---
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
      filter(index %in% seq(x - 3, x + 3, 1)) |>            # ±3 sentence window
      pull(text) |>
      paste0(collapse = '.')
  })
})

# --- Output (lines 138-175) ---
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
    labels = c('cp', 'inc', 'ed', 'ius', 'le')               # Sheet name abbreviations
  )) |>
  deframe() |>
  writexl::write_xlsx(here::here(                             # Writes xlsx output
    'results/original-study-physician-predictions-top-context.xlsx'
  ))
```

#### New Pipeline: `data-processing-pipeline.html` R code (Quarto notebook, Feb 17 2026)

```r
# --- Libraries (same 13 packages) ---
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

# --- Init ---
board <- pins::board_folder(here::here('board'))

# --- Read data ---
data <- readxl::read_excel(
  here::here('data/nlp-pilot/REC001 (SID 14).xlsx')          # Single file only
)
# → 476 x 2 (speaker, text)

# --- Physician filter ---
data <- data |>
  filter(
    speaker == 'Interviewer:'                                  # Single speaker ID (with colon)
  )
# → 192 x 2

# --- Add index ---
data <- data |>
  mutate(i = row_number(), .before = speaker)
# → 192 x 3

# --- Sentence tokenization ---
data <- data |>
  unnest_tokens('text', text, 'sentences') |>
  group_by(i) |>
  mutate(i2 = row_number(), .after = i) |>
  ungroup() |>
  mutate(index = row_number(), .before = i)
# → 424 x 5 (index, i, i2, speaker, text)

# --- Model loading ---
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

# --- Prediction ---
preds <- imap(models, \(x, title) {
  predict(x, new_data = data, type = 'prob') |>
    select(.pred_1)
})
params <- map(preds, \(x) bind_cols(data, x)) |>
  enframe(value = "data")
# → params: 5 rows (one per model), each data = tibble [424 x 6]

# ╔══════════════════════════════════════════════════════════════════════╗
# ║  ★★★ CRITICAL: Sentence selection (HTML lines 2748-2753) ★★★       ║
# ╚══════════════════════════════════════════════════════════════════════╝
params$top_sentences <- pmap(params, \(name, data) {
  data |>
    filter(
      .pred_1 >= 0.7                                          # ◀◀◀ THRESHOLD 0.7 FILTERING
    )
})
# → cancer_prognosis: 40, continence: 15, ed: 14, ius: 2, le: 5

# --- Context generation (identical logic) ---
params$topi <- map(params$top_sentences, \(x) pull(x, index))
params$context <- map2(params$data, params$topi, \(data, i) {
  map(i, \(x) {
    data <- data |>
      mutate(text = case_when(
        index == x ~ glue::glue('<main>{text}</main>'),
        .default = text
      ))
    data |>
      filter(index %in% seq(x - 3, x + 3, 1)) |>            # ±3 sentence window (same)
      pull(text) |>
      paste0(collapse = '.')
  })
})

# --- Combine results ---
params$results <- pmap(params, \(name, top_sentences, context, ...) {
  top_sentences |> mutate(context = unlist(context))
})

results <- params |>
  select(name, results) |>
  deframe()
# → No file output (console display only, no writexl call)
```

#### Section heading at HTML line 2744 confirms:
> "Extract the sentences with a predicted probability of 0.7 or higher for each outcome."

#### Impact on output:

| Model | Old (Top 5) | New (>= 0.7) | Ratio |
|-------|-------------|---------------|-------|
| cancer_prognosis | 5 | **40** | 8x more |
| continence | 5 | **15** | 3x more |
| erectile_dysfunction_potency | 5 | **14** | 2.8x more |
| irritative_urinary_symptoms | 5 | **2** | 0.4x (fewer!) |
| life_expectancy | 5 | **5** | same |
| **Total** | **25** | **76** | 3x more |

The threshold approach can select **more or fewer** sentences than the fixed top-5, depending on model confidence.

### Difference 2: Speaker Filtering

**Old (`process-data-guille.R`, lines 33-42):**

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

**New (`data-processing-pipeline.html`, line 2349):**

```r
data <- data |>
  filter(
    speaker == 'Interviewer:'     # <-- single value, with colon
  )
```

The old script handles 8 different speaker ID formats (from multiple transcription sources). The new script only matches `Interviewer:` (the format used in the TurboScribe-based transcripts).

### Difference 3: Sheet Naming Convention

| Model | Old Sheet Name | New Sheet Name |
|-------|---------------|----------------|
| Cancer Prognosis | `cp` | `cancer_prognosis` |
| Incontinence | `inc` | `continence` |
| Erectile Dysfunction | `ed` | `erectile_dysfunction_potency` |
| Irrit. Urinary Symptoms | `ius` | `irritative_urinary_symptoms_f` |
| Life Expectancy | `le` | `life_expectancy` |

**Evidence — Old script uses abbreviations from model variable names:**

```r
# process-data-guille.R lines 109-111:
group_nest(name) |>
deframe()
# → names come from vars = c("cp", "le", "ed", "inc", "ius")
```

**New notebook uses full outcome names:**

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

### Difference 4: Missing `name` Column

**Old output (SID-01 results):** 8 columns — `name`, `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- The `name` column contains patient ID (e.g., `sid-01`)
- 50 unique patient IDs found in the old results file

**New output (SID-14 results):** 7 columns — `index`, `i`, `i2`, `speaker`, `text`, `.pred_1`, `context`
- The `name` column is **absent**
- Because the notebook processes only a single patient file

**Evidence from structural comparison:**

```
SID-01 columns (8): ['name', 'index', 'i', 'i2', 'speaker', 'text', '.pred_1', 'context']
SID-14 columns (7): ['index', 'i', 'i2', 'speaker', 'text', '.pred_1', 'context']
Missing from SID-14: {'name'}
```

### Difference 5: Single-Patient vs Multi-Patient Processing

**Old script:** Processes all transcripts in `data/transcripts/` directory via `fs::dir_ls()`, iterating with `map()`. The SID-01 results file contains data from **50 patients**.

**New notebook:** Processes a single file:

```r
# HTML line 2320:
data <- readxl::read_excel(here::here('data/nlp-pilot/REC001 (SID 14).xlsx'))
```

### Difference 6: No File Output

**Old script (`process-data-guille.R`, lines 172-174):**

```r
writexl::write_xlsx(here::here(
  'results/original-study-physician-predictions-top-context.xlsx'
))
```

**New notebook:** Does **not** write any output file. The final code block (lines 3211-3215) only prints results to console:

```r
results <- params |>
  select(name, results) |>
  deframe()

results
```

The `nlp-pilot-processed-results-sid14.xlsx` file was likely created separately (not by this notebook).

---

## 5. What Remains Identical

| Aspect | Old Pipeline | New Pipeline | Match? |
|--------|-------------|--------------|--------|
| R libraries | 13 packages | Same 13 packages | Identical |
| Models | 5 rand_forest() | Same 5 models | Identical |
| Preprocessing | 8 recipe steps | Same 8 steps | Identical |
| Context window | ±3 sentences | ±3 sentences | Identical |
| Context format | `<main>` tags, `.` separator | Same format | Identical |
| Prediction type | `predict(x, type = 'prob')` | Same call | Identical |
| Tokenization | `unnest_tokens('sentences')` | Same function | Identical |
| Index construction | `i` (utterance), `i2` (sentence), `index` (global) | Same structure | Identical |

The full context generation code can be compared in the annotated listings in Section 4 above (old: lines 114-136, new: HTML lines 2861-2880). The logic is byte-for-byte identical.

---

## 6. Impact on Backend (`transcript_service.py`)

Our Backend currently supports **both** `top_n` and threshold modes. The key question is which should be the default going forward.

### Current Backend Behavior

Our Backend API accepts `top_n` parameter (default: 5). If `top_n=0`, all sentences are returned.

### What Would Need to Change for Threshold Mode

| Change | Details |
|--------|---------|
| New parameter | `threshold: float = 0.7` |
| Selection logic | `filter(.pred_1 >= threshold)` instead of `slice_max(n=top_n)` |
| Sheet names | Map `cp`→`cancer_prognosis`, etc. (or support both) |
| `name` column | Decide whether to include or omit |
| Speaker format | Handle `Interviewer:` (with colon) as valid input |

### Sheet Name Mapping

```
cp   → cancer_prognosis
inc  → continence
ed   → erectile_dysfunction_potency
ius  → irritative_urinary_symptoms_f
le   → life_expectancy
```

---

## 7. Summary

Michael's files (Feb 17, 2026) reveal **version inconsistency** in his NLP processing pipeline. Two different sentence selection criteria exist across his scripts:

| Script | Criterion | Behavior |
|--------|-----------|----------|
| `process-data-guille.R` (provided earlier) | `slice_max(.pred_1, n = 5)` | Fixed: always top 5 per model |
| `data-processing-pipeline.html` (Feb 17) | `filter(.pred_1 >= 0.7)` | Variable: 2–40 per model |

It is **unclear whether this change was intentional** or a result of Michael using different versions of his pipeline at different times. The two scripts were not provided together with an explanation of which supersedes the other, and no rationale for the criterion change was communicated.

The same pattern of inconsistency appears in other areas — sheet names (abbreviations vs. full names), column structure (`name` column present vs. absent), and speaker filtering (8 IDs vs. 1 ID) — suggesting these files may come from different development branches or iterations rather than representing a single coherent update.

The core model architecture (5 Random Forest classifiers, 8 preprocessing steps) and context generation logic (±3 sentences, `<main>` tags) remain identical in both versions.

**Before updating the Backend, all discrepancies must be clarified with Michael (see Section 8).**

---

## 8. Questions to Clarify with Michael

The following items were identified during analysis and require Michael's clarification before updating the Backend pipeline.

### Q1. Why did the sentence selection method change?

**What changed:** `slice_max(.pred_1, n = 5)` → `filter(.pred_1 >= 0.7)`

**Questions to ask:**
- What is the rationale for switching from top-5 to a 0.7 threshold?
- Is 0.7 based on a statistical criterion (e.g., ROC analysis, Youden index, domain expert consensus)?
- Should the threshold be the same for all 5 models, or should each model have a different threshold? (e.g., `irritative_urinary_symptoms` only selected 2 sentences — is that acceptable?)
- Is this the **permanent standard going forward**, or was it experimental for the SID-14 pilot?

### Q2. Sheet naming convention — abbreviations or full names?

**What changed:**

| Old | New |
|-----|-----|
| `cp` | `cancer_prognosis` |
| `inc` | `continence` |
| `ed` | `erectile_dysfunction_potency` |
| `ius` | `irritative_urinary_symptoms_f` |
| `le` | `life_expectancy` |

**Questions to ask:**
- Is this an intentional standardization, or an artifact of using `vars` directly as sheet names?
- Which convention should the Backend use going forward?
- Note: `irritative_urinary_symptoms_f` appears truncated from the full model name `irritative_urinary_symptoms_frequency_urgency_nocturnia` — is the `_f` suffix intentional?

### Q3. Missing `name` column

**What changed:** The old output had 8 columns including `name` (patient ID). The new output has 7 columns — `name` is absent.

**Questions to ask:**
- Is the removal intentional (single-patient processing doesn't need it)?
- Should the Backend continue including the `name` column for multi-patient batch processing?

### Q4. Speaker filtering — single ID vs. multiple IDs

**What changed:**
- Old: 8 speaker IDs (`INTERVIEWER`, `Interviewer`, `Q`, `Q1`, `Q2`, etc.)
- New: Only `speaker == 'Interviewer:'` (with colon)

**Questions to ask:**
- Is this because all future transcripts will use the `Interviewer:` format (TurboScribe standardized)?
- Or should the Backend maintain backwards compatibility with the 8-ID list for older transcripts?

**⚠ Data Processing Caution:**
- In `REC001 (SID 14).xlsx`, 6 rows have `Interviewer: ` (with trailing space) that would be missed by exact match `== 'Interviewer:'`.
- When processing transcripts in the Backend, **always strip/trim whitespace** from the speaker column before matching.
- Consider using prefix matching (`str.startswith()`) or case-insensitive matching rather than exact equality to prevent silent data loss.
- The speaker format may vary across transcription tools (manual vs. TurboScribe) — the pipeline must handle all known variants (`INTERVIEWER`, `Interviewer`, `Interviewer:`, `Q`, `Q1`–`Q5`, etc.).

### Q5. Third-party participants

**What we found:** SID-14 has `Patient's Wife:` (75 utterances) as a third participant. The old transcripts only had `Interviewer` and `Patient`.

**Questions to ask:**
- How should third-party utterances (wife, family members) be handled?
- Should they be excluded (current behavior), treated as patient utterances, or flagged separately?
- Will future transcripts also have third parties?

---

## 9. Backend Modifications Required

Based on the differences identified in this report, the following modifications are needed in the current Backend implementation (`Prostate_cancer_consultation_dashboard/app/Backend/`).

### 9.1 Speaker Filtering — Whitespace & Format Robustness

**File:** `transcript_service.py` lines 64–73, 134–144

**Current implementation:**
```python
PHYSICIAN_IDS = [
    "INTERVIEWER", "INTERVIEWER 1", "INTERVIEWER 2",
    "Interviewer", "Q", "Q1", "Q2", "Q:",
]

def filter_interviewer(df):
    filtered = df[df["speaker"].isin(PHYSICIAN_IDS)].copy()
```

**Problems identified:**
1. `isin()` performs **exact match** — trailing whitespace (e.g., `"Interviewer: "`) will not match `"Interviewer:"`
2. The TurboScribe format `"Interviewer:"` (with colon) is not in the list
3. Actual data in `REC001 (SID 14).xlsx` has 6 rows with `"Interviewer: "` (trailing space) that would be silently dropped

**Required changes:**
- **Strip whitespace** from the `speaker` column before matching (`df["speaker"].str.strip()`)
- **Add TurboScribe format** `"Interviewer:"` to `PHYSICIAN_IDS`
- Consider **prefix matching** (e.g., `str.startswith()`) as a more robust alternative to exact match, since speaker labels across different transcription tools are inconsistent

**Priority:** HIGH — Without this fix, legitimate interviewer sentences from TurboScribe transcripts are silently dropped, leading to incomplete NLP results.

---

### 9.2 Sentence Selection — Add Threshold-Based Filtering

**File:** `transcript_service.py` lines 231–260

**Current implementation:**
```python
def select_top_n(df, n=0):
    # n > 0: top-N with tie inclusion (matches R slice_max)
    # n = 0: all sentences sorted by score
```

**Problem:** Only supports fixed top-N selection. Michael's new pipeline uses threshold-based filtering (`filter(.pred_1 >= 0.7)`), which produces a variable number of results per model (2–40 rows for SID-14).

**Required changes:**
- Add a `min_score` parameter to `select_top_n()` (or create a separate `select_by_threshold()`)
- When `min_score` is set, filter sentences where `.pred_1 >= min_score` instead of taking top-N
- Both methods should be available — the API caller decides which to use

**Affected files (4 files):**

| File | Change Required |
|---|---|
| `transcript_service.py:231-260` | Add `min_score` parameter to `select_top_n()` or create `select_by_threshold()` |
| `routes_transcript.py:89-159, 210-310` | Add `min_score: float` (optional) to `/analyze` and `/analyze-batch` endpoint parameters; pass to `analyze_transcript()` and `_save_to_db()` |
| `models.py:345-362` | Add `min_score = Column(Float, nullable=True)` to `TranscriptAnalysisLog` — currently only records `top_n`, not the threshold used |
| `database_schema.sql:137-147` | Add `min_score FLOAT` column to `transcript_analysis_log` table |

**Selection logic:**
- When `min_score` is provided, use threshold filtering; when `top_n` is provided, use top-N
- When both are provided, apply top-N first then filter by min_score (or reject as invalid — to be decided)

**Priority:** MEDIUM — Current top-N still works. Threshold option adds flexibility matching Michael's newer approach.

---

### 9.3 Patient ID Extraction — Flexible Filename Parsing

**File:** `transcript_service.py` line 120

**Current implementation:**
```python
patient_id = re.sub(r"^processed_transcripts_", "", Path(filename).stem)
```

**Problem:** Only handles the `processed_transcripts_<id>.xlsx` naming pattern. Michael's new file is named `REC001 (SID 14).xlsx` — a completely different convention. Current code would set patient_id to `"REC001 (SID 14)"` instead of `"sid-14"`.

**Required changes:**
- Add pattern matching for `REC###` / `SID ##` naming convention
- Extract the SID number and normalize to `sid-XX` format
- Fallback to current behavior for `processed_transcripts_` pattern
- Example regex: `r"SID[\s-]*(\d+)"` → extract `14` → format as `sid-14`

**Priority:** MEDIUM — Only matters when processing files with the new naming convention. Can be addressed when TurboScribe transcripts become standard input.

---

### 9.4 Sheet Naming — Support Both Abbreviated and Full Names

**File:** `transcript_service.py` lines 77–83

**Current implementation:**
```python
OUTCOME_TO_SHEET = {
    "cancer_prognosis": "cp",
    "continence": "inc",
    "erectile_dysfunction_potency": "ed",
    "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
    "life_expectancy": "le",
}
```

**Situation:** Current Backend outputs abbreviated sheet names (`cp`, `inc`, `ed`, `ius`, `le`), matching the old R script. Michael's new output uses full names (`cancer_prognosis`, `continence`, etc.).

**Required changes:**
- **No change needed for now** — wait for Michael's clarification on which convention to standardize (Q2)
- If full names become standard: update `OUTCOME_TO_SHEET` values
- If both must coexist: add a `sheet_format` parameter (`"short"` / `"full"`)
- For **reading** xlsx results (e.g., in download/DB retrieval): should accept both formats

**Priority:** LOW — Cosmetic difference. Abbreviated names are more readable in Excel tabs.

---

### 9.5 Summary — Issues by Priority

| # | Issue | Priority | Required Change |
|---|---|---|---|
| 9.1 | Speaker filtering | **HIGH** | Strip whitespace + add `Interviewer:` + prefix match |
| 9.2 | Sentence selection | MEDIUM | Add `min_score` threshold option |
| 9.3 | Filename parsing | MEDIUM | Support `REC/SID` naming pattern |
| 9.4 | Sheet names | LOW | Wait for clarification; prepare for full names |

### 9.6 Impact Matrix — Files Affected per Issue

| File | 9.1 Speaker | 9.2 Threshold | 9.3 Filename | 9.4 Sheet Names |
|---|---|---|---|---|
| `transcript_service.py` | `PHYSICIAN_IDS` + `filter_interviewer()` | `select_top_n()` + `analyze_transcript()` | `read_transcript()` | `OUTCOME_TO_SHEET` + `export_to_xlsx()` |
| `routes_transcript.py` | — | Add `min_score` param to endpoints + `_save_to_db()` | — | — |
| `models.py` | — | Add `min_score` column to `TranscriptAnalysisLog` | — | — |
| `database_schema.sql` | — | Add `min_score FLOAT` to `transcript_analysis_log` | — | — |
| `nlp_service.py` | — | — | — | — |

**Total files affected:** 4 (`transcript_service.py`, `routes_transcript.py`, `models.py`, `database_schema.sql`)

---

## Related Documents

- [ML_PIPELINE_OVERVIEW_KR.md](./ML_PIPELINE_OVERVIEW_KR.md) / [EN](./ML_PIPELINE_OVERVIEW_EN.md) — Pipeline stages overview
- [ML_PIPELINE_DEVELOPMENT_STATUS_KR.md](./ML_PIPELINE_DEVELOPMENT_STATUS_KR.md) / [EN](./ML_PIPELINE_DEVELOPMENT_STATUS_EN.md) — Implementation status
- [COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_KR.md) / [EN](./COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker_EN.md) — R script vs Docker comparison
- [한국어 버전](#한국어) — below

---
