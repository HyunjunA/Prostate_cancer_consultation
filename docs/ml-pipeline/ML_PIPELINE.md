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

Both stages run as one process via `../AI_physician_patient_communication/main_complete_pipeline_db.py` (the canonical Phase 2 entry point in the sibling AI repo). It calls AI repo's own NLP and AI modules directly and writes to the same DB by importing the dashboard's `persistence.save_all()` cross-repo.

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

Implementation: `../AI_physician_patient_communication/ai_pipeline/pipeline.py` (sibling repo). The Phase 2 entry point (`main_complete_pipeline_db.py`) calls `run_ai_pipeline()` from this module directly after the NLP stage finishes; the resulting per-domain dict is then written to the LLM tables by the `_save_ai_results` helper in `../AI_physician_patient_communication/db/persistence_helper.py`.

LLM: Azure OpenAI GPT-4o, configured via `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` + `AZURE_OPENAI_API_VERSION` (default `2024-08-01-preview`) + `AZURE_OPENAI_MODEL` (default `gpt-4o`).

---

## Database Persistence

All pipeline outputs land in PostgreSQL through two write paths:

| Where the writes are issued | Tables | Stage |
|---|---|---|
| `app/Backend/persistence.py` `save_all()` (in this repo) — called cross-repo by Phase 2's `_save_nlp_results` helper in `../AI_physician_patient_communication/db/persistence_helper.py` | `transcript_analysis_log`, `sentence_prediction`, `nlp_all_predictions`, `nlp_pipeline_intermediate`, `patient_summary`, `patient_summary_domain` | NLP |
| `_save_ai_results` helper in `../AI_physician_patient_communication/db/persistence_helper.py` (called from `main_complete_pipeline_db.py` after the AI 5-substep finishes) | `llm_pipeline_intermediate`, `llm_domain_scoring_and_summary`, plus `transcript_analysis_log.ai_overall_score` UPDATE | AI |

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
.venv/bin/python main_complete_pipeline_db.py \
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

### Phase 2 — explicit invocation

There is no auto-run on backend start any more. The pipeline runs only when the operator explicitly invokes the Phase 2 entry point in the sibling AI repo:

```bash
cd ../AI_physician_patient_communication
../Prostate_cancer_consultation_dashboard/.venv/bin/python \
    main_complete_pipeline_db.py --dir data/input
```

That entry point owns the NLP container lifecycle (loads the OCI image if missing, brings the container up via `docker-compose-ai-nlp-pipeline.yml`, waits for healthcheck) and orchestrates NLP + AI directly by calling AI repo's own modules. Files that already produced a row in `transcript_analysis_log` are still re-processed (no dedup yet — see Known Limitations).

The dashboard's Phase 1 start scripts (`scripts/run-frontend-backend.sh`, `scripts/run-backend.sh`) no longer touch the pipeline or the NLP container — they only start the webapp and backend, which read the rows Phase 2 wrote.

### Verification

```bash
.venv/bin/python scripts/verify_db.py                   # all analyses, all 7 checks
.venv/bin/python scripts/verify_db.py --analysis-id 5   # one analysis
.venv/bin/python scripts/show.py --patient-id SID_10    # detailed dump
```

Exit code 0 = pass.

---

## Configuration Knobs

The pipeline reads its runtime config from **two separate env files** — one
per repo, by design (each side owns the variables it consumes; see the env
files for the rationale):

In the dashboard repo (`app/Backend/.env`) — Phase 1 (webapp + backend):

```
DATABASE_URL=postgresql+asyncpg://...     # read target (same DB as Phase 2)
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com   # Try & Score
AZURE_OPENAI_KEY=...
REDCAP_API_URL=...                        # survey sync (Phase 1 only)
REDCAP_API_TOKEN=...
API_KEY=...                               # webapp ↔ backend auth
```

In the AI repo (`../AI_physician_patient_communication/.env`) — Phase 2 only:

```
DATABASE_URL=postgresql+asyncpg://...     # write target (shared with dashboard)
NLP_API_URL=http://localhost:8888         # NLP container (Phase 2 only)
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_KEY=...
AZURE_OPENAI_MODEL=gpt-4o
TRANSCRIPTS_DIR=data/input                # relative to AI repo root
OUTPUT_DIR=data/output                    # relative to AI repo root
```

`DATABASE_URL` and `AZURE_OPENAI_*` are duplicated in both files on purpose —
each repo carries its own copy of every variable it actually consumes. Drift
between the two values is a deployment concern, not an architectural one.

Selection defaults (top-N, context window) are CLI flags on the Phase 2
runner; the API-driven path reads them from request parameters.

---

## Repo Layout

| Concern | Location |
|---|---|
| Pipeline orchestration (Phase 2 entry point) | `../AI_physician_patient_communication/main_complete_pipeline_db.py` |
| NLP-side DB writes (cross-repo import target) | `app/Backend/persistence.py` (`save_all`, `get_latest_analysis_id`) |
| ORM definitions | `app/Backend/models.py` |
| NLP module (in AI repo) | `../AI_physician_patient_communication/sentence_classification/` |
| AI/LLM module (in AI repo) | `../AI_physician_patient_communication/ai_pipeline/` |
| NLP Docker image | OCI archive at `../AI_physician_patient_communication/nlp-classifiers/r01-nlp-classifiers-docker-image/` |
| Reference data (frozen) | `../AI_physician_patient_communication/data/output_test/` |

The Phase 2 entry point imports `persistence.save_all` and a few ORM models from the dashboard repo via `sys.path` insertion — no installation step is required when both repos are siblings.

---

## Known Limitations

- **No de-duplication on re-run**: re-processing the same file appends a new `transcript_analysis_log` row instead of overwriting.
- **Side-effect domains may produce multiple LLM rows per (analysis, domain)**: probabilistic LLM behaviour for `ed`/`inc`/`ius`. Downstream queries should `ORDER BY id DESC LIMIT 1` per `(analysis_id, domain)`.
- **NLP container is required** for both segmentation (via `docker exec`) and classification (via HTTP) — the pipeline cannot run with the NLP image absent.
