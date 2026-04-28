# AI Pipeline — Side-Effect Domain Multi-Row (for review)

**Status:** Observation, needs verification with the AI pipeline maintainer and project manager.
**First noted:** 2026-04-27 (Docker mode `run_all.sh`).
**Possibly affects:** `ed`, `inc`, `ius`.

---

## What was seen

`llm_domain_scoring_and_summary` had 11 rows after a fresh run that processed 2 transcripts. Expected 10 (2 patients × 5 domains). The extra row was `inc` for SID 10:

```
analysis_id | domain | count
1 | inc | 2     ← extra
others    | 1
```

Both `inc` rows shared the same `reformat_sentence` but differed in `ai_score`, `treatment`, and `source_sentence`. The native-mode database produced 10 rows on a separate run of the same files, so the count is not consistent across runs.

---

## Why this might happen (to verify)

`AI_physician_patient_communication/ai_pipeline/selection.py:112-121` branches on whether the domain has a `treatment` column and, if so, returns one row per treatment group. The extraction prompts only mention `treatment` for `ed`, `inc`, `ius` — consistent with `ARCHITECTURE.md` calling these "side-effect domains". So the multi-row output may be an intentional shape from the pipeline; that is the first thing to confirm.

---

## Code paths involved

| Layer | File | What it does |
|---|---|---|
| AI pipeline (Guille's repo) | `ai_pipeline/selection.py:112-121` | returns list per treatment for side-effect domains |
| AI pipeline | `ai_pipeline/pipeline.py:67-73` | wraps list into `result["selected"]` |
| Backend | `app/Backend/ai_pipeline_service.py:165-182` | iterates the list and inserts one DB row per item |
| API | `app/Backend/routes_patient.py:561-...` | returns all rows under `domains: [...]` |
| Frontend | `app/Webapp/src/components/PatientReportModified*.tsx` | writes `summaries[topicName] = ...`, last write wins |

---

## Questions to clarify

1. Is the multi-row output for `ed`/`inc`/`ius` an intended shape, or an artifact?
2. If intended, should the patient page show one card per treatment, or a single consolidated card?
3. If a single card, which row should win (e.g., highest `ai_score`)?

The answer determines which layer (if any) needs to change. No fix has been applied.

---

## Possible approaches (not yet selected)

- Backend collapses to one row in `ai_pipeline_service.py:165-182` (smallest change in this repo).
- Frontend renders one card per treatment for side-effect domains (preserves all data).
- AI pipeline returns one row regardless of treatment (smallest change at the source, but in the upstream repo).

Each option has trade-offs and depends on the answer to question 1.

---

## Reproduction note

```bash
docker exec prostatecancer-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT analysis_id, domain, COUNT(*)
FROM llm_domain_scoring_and_summary
GROUP BY 1, 2 HAVING COUNT(*) > 1;"
```

Returns rows only when a side-effect domain produced more than one entry. Output appears probabilistically across runs (GPT-4o sampling) on the same input.
