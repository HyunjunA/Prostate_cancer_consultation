# ML / NLP Pipeline

End-to-end documentation of the consultation-transcript analysis pipeline: NLP classification (7 steps) followed by AI/LLM scoring + summarization (5 sub-steps), with results persisted to PostgreSQL.

---

## Overview

```
Transcript (.xlsx / .csv)
    │
    ▼
[NLP 7-step]   sentence_classification (R + Random Forest, in Docker)
    │           ├─ preprocessing → segmentation → classification (5 models)
    │           └─ top-N selection → context window → export
    ▼
[AI 5-step]    ai_pipeline (Azure OpenAI GPT-4o)
    │           └─ scoring → extraction → filtering → selection → reformat
    ▼
PostgreSQL (8 tables) + nested output folder
```

Both stages run as one process via `pipeline_runner.py`; the standalone CLI `scripts/run-pipeline-standalone.py` invokes the same code path against the same DB without needing the FastAPI backend.

---

## NLP 7-Step (sentence_classification)

| Step | Module | Output |
|---|---|---|
| 1 — preprocessing | `preprocessing.py` | normalised utterance dataframe |
| 2 — segmentation | `segmentation.py` (R `stringi` via `docker exec`) | 1-row-per-sentence dataframe |
| 3 — classification | `classification.py` → NLP container `/predict/{model}` | per-sentence probability per model |
| 4 — selection | `selection.py` | top-N sentences per domain (default top-10) |
| 5 — context | `context.py` | each top-N sentence + ±N surrounding sentences |
| 6 — export | `export.py` | xlsx + nested CSVs |
| 7 — DB persistence | `app/Backend/persistence.py` | 6 tables (see DB section) |

### Five domains / models

| Code | Domain |
|---|---|
| `cp` | Cancer Prognosis |
| `le` | Life Expectancy |
| `ed` | Erectile Dysfunction / Potency |
| `inc` | Urinary Incontinence |
| `ius` | Irritative Urinary Symptoms / Frequency / Urgency / Nocturia |

Each model is a Random Forest classifier hosted in the `r01-nlp-classifiers` Docker container (one POST per (sentences, model) pair).

### Sentence-tokenisation note

Segmentation uses R's `stringi::stri_split_boundaries` (via `docker exec` into the NLP container), guaranteeing 100% match with the reference R pipeline. Native Python tokenisers (NLTK, PyICU) were evaluated and produced fewer-than-50/50 boundary matches — they are not used.

---

## AI 5-Step (ai_pipeline)

For each domain, the top-10 sentences plus ±3 context windows are passed through five sub-steps:

| Sub-step | Purpose |
|---|---|
| 1 — scoring | Per-sentence specificity score (0–5) |
| 2 — extraction | Pull risk numbers / treatment terms from the conversation |
| 3 — filtering | Drop low-quality / out-of-domain results |
| 4 — selection | Pick the most representative survivors |
| 5 — reformat | Generate patient-friendly summary text |

Implementation: `../AI_physician_patient_communication/ai_pipeline/pipeline.py` (sibling repo). The Backend invokes it through `ai_pipeline_service.run_ai_scoring_and_summary()` after the NLP stage finishes.

LLM: Azure OpenAI GPT-4o, configured via `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` + `AZURE_OPENAI_API_VERSION` (default `2024-08-01-preview`) + `AZURE_OPENAI_MODEL` (default `gpt-4o`).

---

## Database Persistence

All pipeline outputs land in PostgreSQL through two persistence modules:

| Module | Tables | Stage |
|---|---|---|
| `app/Backend/persistence.py` | `transcript_analysis_log`, `sentence_prediction`, `nlp_all_predictions`, `nlp_pipeline_intermediate`, `patient_summary`, `patient_summary_domain` | NLP |
| `app/Backend/ai_pipeline_service.py` | `llm_pipeline_intermediate`, `llm_domain_scoring_and_summary`, plus `transcript_analysis_log.ai_overall_score` UPDATE | AI |

See [`DATABASE_SCHEMA.md`](../architecture/DATABASE_SCHEMA.md) for column-level detail. Migration `009_widen_llm_text_columns` widens `estimate`/`treatment` columns to `TEXT` so longer LLM outputs do not overflow.

---

## Output Folder

Each processed file produces a nested folder under `OUTPUT_DIR` (default `../AI_physician_patient_communication/data/output/`):

```
<source_filename_stem>/
├── step2_segmentation/segmented_sentences.csv     # all sentences after seg
├── step3_classification/predictions_long.csv      # all sentences × 5 models
├── step4_selection/top10_by_outcome.xlsx          # 5 sheets, top-10 each
├── step5_context/top10_with_context.xlsx          # 5 sheets, with ±N context
└── final/
    ├── cp.csv
    ├── le.csv
    ├── ed.csv
    ├── inc.csv
    └── ius.csv
```

Format matches `data/output_test/` (frozen R-pipeline reference) — used for byte-level regression checks during development.

---

## Running the Pipeline

### Standalone (manager validation path)

```bash
.venv/bin/python scripts/run-pipeline-standalone.py \
    --file "../AI_physician_patient_communication/data/input/Input_Keystrokes REC 001 (SID 10).xlsx"
```

Flags:
- `--dir <path>` — process every `.xlsx`/`.csv` in a folder, sorted
- `--skip-ai` — NLP only, no Azure OpenAI calls (~30s/file vs ~2-3 min)
- `--top-n 10 --context-window 3` — selection/context tuning
- `--quiet` — suppress per-step INFO logs

The script does an upfront NLP healthcheck (`GET {NLP_API_URL}/ping`) and aborts early with a recovery hint if the NLP container is not running.

DB writes are printed with a `[DB]` prefix so the operator can watch each table grow:

```
[DB]    INSERT transcript_analysis_log → id=5
[DB]    INSERT sentence_prediction: 50 rows
[DB]    INSERT nlp_all_predictions: 428 rows
[DB]    INSERT nlp_pipeline_intermediate: 4 JSONB rows
[AI]    AI pipeline: scoring + extraction + filtering + selection + reformat
[DB]    INSERT llm_pipeline_intermediate: <N> rows
[DB]    INSERT llm_domain_scoring_and_summary: 5 rows
[DB]    UPDATE transcript_analysis_log id=5: ai_overall_score=2.14, processed=true
```

### Auto-run on backend start

`scripts/run-native.sh` automatically processes every transcript in `OUTPUT_DIR` before launching uvicorn. Files that already produced a row in `transcript_analysis_log` are still re-processed (no dedup yet — see Known Limitations).

### Verification

```bash
.venv/bin/python scripts/verify_db.py                   # all analyses, all 7 checks
.venv/bin/python scripts/verify_db.py --analysis-id 5   # one analysis
.venv/bin/python scripts/show.py --patient-id SID_10    # detailed dump
```

Exit code 0 = pass.

---

## Configuration Knobs

In `app/Backend/.env.native`:

```
NLP_API_URL=http://localhost:8888
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_KEY=...
AZURE_OPENAI_MODEL=gpt-4o
TRANSCRIPTS_DIR=../AI_physician_patient_communication/data/input
OUTPUT_DIR=../AI_physician_patient_communication/data/output
```

Selection defaults (top-N, context window) are CLI flags on the standalone runner; the API-driven path reads them from request parameters.

---

## Repo Layout

| Concern | Location |
|---|---|
| Backend orchestration | `app/Backend/pipeline_runner.py`, `persistence.py`, `ai_pipeline_service.py` |
| NLP module (independent) | `../AI_physician_patient_communication/sentence_classification/` |
| AI/LLM module (independent) | `../AI_physician_patient_communication/ai_pipeline/` |
| NLP Docker image | OCI archive at `../AI_physician_patient_communication/nlp-classifiers/r01-nlp-classifiers-docker-image/` |
| Reference data (frozen) | `../AI_physician_patient_communication/data/output_test/` |

Backend imports the AI repo modules via `sys.path` insertion in `ai_pipeline_service.py` and `pipeline_runner.py` — no installation step is required when both repos are siblings.

---

## Known Limitations

- **No de-duplication on re-run**: re-processing the same file appends a new `transcript_analysis_log` row instead of overwriting.
- **Side-effect domains may produce multiple LLM rows per (analysis, domain)**: probabilistic LLM behaviour for `ed`/`inc`/`ius`. Downstream queries should `ORDER BY id DESC LIMIT 1` per `(analysis_id, domain)`.
- **NLP container is required** for both segmentation (via `docker exec`) and classification (via HTTP) — the pipeline cannot run with the NLP image absent.
