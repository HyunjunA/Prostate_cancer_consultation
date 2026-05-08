# Schema Cleanup — Drop `llm_pipeline_intermediate.sentence_text`

> **Status:** Identified, deferred — to be scheduled.
> **Priority:** **HIGH** — must be resolved before the next persistence-touching PR ships.
> **Discovered:** 2026-05-08 during AI pipeline DB inspection.
> **Functional severity:** None today (no broken behaviour). Schema-correctness severity is what raises this to HIGH: storing two columns where one is a deterministic function of the other is a drift hazard the moment anyone changes the upstream pipeline.

---

## Issue

The `sentence_text` column on `llm_pipeline_intermediate` is **fully derivable** from
the `context` column. Both columns hold the same context-window text — `context`
just adds `<main>...</main>` markers around the top-N sentence.

Verified across 100% of currently persisted rows (300/300):

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN regexp_replace(context, '</?main>', '', 'g') = sentence_text
                THEN 1 ELSE 0 END) AS marker_only_diff
FROM llm_pipeline_intermediate;
-- total = 300, marker_only_diff = 300
```

Storing both is a violation of normalization (one column is a deterministic
function of another) and risks **drift** if the upstream AI pipeline ever
updates one form but not the other.

---

## Why it exists

The AI pipeline (`ai_pipeline_service.py`) consumes a `df_extraction` DataFrame
that already carries both `text` and `context` columns from the upstream NLP
pipeline. The persistence call at `app/Backend/ai_pipeline_service.py:212`
just forwards both as-is — convenience over normalization, in line with how
research-pipeline code is typically written.

---

## Impact assessment for dropping the column

Investigation conducted via repo-wide grep on
`LLMPipelineIntermediate.sentence_text` and the bare `sentence_text` column
name (disambiguated against `SentencePrediction.sentence_text` and
`NLPAllPredictions.sentence_text`, which are unrelated and keep the column).

### Writer — 1 location

| File | Line | Code |
|---|---|---|
| `app/Backend/ai_pipeline_service.py` | 212 | `sentence_text=row.get("text") if "text" in row.index else None,` |

### Reader — 1 location (diagnostics only)

| File | Line | Code |
|---|---|---|
| `app/Backend/inspect_pipeline_run.py` | 259 | `"text": r.sentence_text,` (in `_dump_ai_intermediate`) |

### ORM definition

| File | Line | Code |
|---|---|---|
| `app/Backend/models.py` | 576 | `sentence_text = Column(Text)` (inside `class LLMPipelineIntermediate`) |

### Migrations referencing the column

| File | Line | Note |
|---|---|---|
| `app/Backend/migrations/versions/007_add_ai_intermediate_tables.py` | 41 | Original creation. **Do not modify** — alembic history is immutable. |

### Confirmed NOT to use this column

- `routes_doctor.py` — does not query `LLMPipelineIntermediate` at all.
- `routes_patient.py` — does not query `LLMPipelineIntermediate`.
- `routes_transcript.py` — only queries `SentencePrediction` (a different table).
- `routes_surveys.py` — unrelated.
- HTTP API responses — no endpoint surfaces this column.
- Webapp (`app/Webapp/`) — no client-side reference.
- Tests — no test targets `LLMPipelineIntermediate.sentence_text` specifically
  (only `SentencePrediction.sentence_text`, e.g.
  `tests/test_doctor_endpoints.py:411`).

---

## Action plan when scheduled

1. Add new Alembic migration `011_drop_lpi_sentence_text.py`:
   ```python
   def upgrade():
       op.drop_column('llm_pipeline_intermediate', 'sentence_text')
   def downgrade():
       op.add_column(
           'llm_pipeline_intermediate',
           sa.Column('sentence_text', sa.Text(), nullable=True),
       )
   ```
2. Remove line `app/Backend/ai_pipeline_service.py:212`.
3. Update `app/Backend/inspect_pipeline_run.py:259` to read `r.context`
   (the diagnostic dump can keep the `<main>` markers — they are informative
   in a debug context). Or strip them with a regex if a plainer rendering
   is preferred.
4. Remove `sentence_text = Column(Text)` from
   `app/Backend/models.py:576` inside `class LLMPipelineIntermediate`.
5. Run `pytest -m "not e2e"` and verify zero failures.
6. Restart the backend and confirm AI pipeline still writes the table.

Estimated effort: ~30 minutes including migration scaffolding and
verification.

---

## Why HIGH priority despite no functional impact

Researcher decided to defer the actual implementation but flagged it as
**must-be-resolved**, because:

1. **Drift hazard**: the moment the upstream NLP / AI pipeline updates one
   form (text or context) without the other, the two columns silently
   disagree. Any downstream consumer that read one expecting the other
   form would silently produce wrong results.
2. **Misleading data model**: a future contributor reading the schema
   would assume the two columns carry independent information and might
   build queries that join or compare them, wasting time on a non-real
   distinction.
3. **Cost of letting it linger**: zero now, increases with every new
   reader added against `LLMPipelineIntermediate`.

## Trigger conditions for picking this up

Take this on the next time **any** of the following happen, even if the
primary purpose of the PR is something else:

- A change to `app/Backend/ai_pipeline_service.py` persistence block.
- A new column added to `llm_pipeline_intermediate`.
- Any new code that reads from `LLMPipelineIntermediate` (especially if
  it touches `sentence_text` or `context`).
- A general schema-cleanup or refactor PR for the intermediate tables.

If none of the above happens within the next sprint, schedule a dedicated
~30-minute PR on its own. The scope is bounded and tested, so it is a
clean piece of work to slot into a low-context day.
