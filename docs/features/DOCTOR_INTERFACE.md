# Doctor Interface – Data Persistence & Validation Checklist

Step-by-step checklist to validate that data generated from the Doctor Interface (rewrites, scoring, behavior tracking) is correctly stored in the database.

---

## 1. Sentence Rewrite Persistence

URL example: `http://localhost:3001/doctor?fileid=quality-coded-nlp-pilot-sid-1.xlsx&speaker=Doctor`

After the doctor uses AI-assisted rewrite on a sentence, verify the rewrite is logged.

**Tables touched**: `doctor_rewrite_log`

**Endpoints to verify**:
- `GET /api/doctor/rewrites/{file}/{i}/{i2}/{class_}` — current rewrite
- `GET /api/doctor/rewrites/{file}/{i}/{i2}/history` — rewrite history
- `GET /api/doctor/rewrites/stats` — aggregate stats

**Checklist**:
- [ ] Each rewrite creates a row in `doctor_rewrite_log`
- [ ] Original + revised sentences are both stored
- [ ] Score and class are populated
- [ ] History endpoint returns rewrites in chronological order

---

## 2. Score Trajectory & Distribution

After the doctor reviews scoring across patients, verify aggregate endpoints serve correct data.

**Tables read**: `llm_domain_scoring_and_summary`, `nlp_all_predictions`

**Endpoints to verify**:
- `GET /api/doctor/scores/average`
- `GET /api/doctor/scores/trajectory`
- `GET /api/doctor/scores/summary/{file}`
- `GET /api/doctor/class-distribution/{file}`

**Checklist**:
- [ ] Average scores match `AVG(ai_score)` in `llm_domain_scoring_and_summary`
- [ ] Per-file summaries return all 5 domains (cp, le, ed, inc, ius)
- [ ] Class distribution counts match raw NLP predictions

---

## 3. Behavior Tracking

Every UI interaction (page open, tour open/end, sentence click) should be logged.

**Tables touched**: `doctor_behavior`

**Endpoint to verify**:
- `POST /api/doctor/behavior` (or whatever the tracking endpoint is) — query rows directly via SQL afterwards

**Checklist**:
- [ ] One row per UI event in `doctor_behavior`
- [ ] `event_type` matches the action (page_open, tour_open, tour_end, sentence_click, …)
- [ ] `target_type` + `target_id` correctly identify the clicked element
- [ ] `client_timestamp` and `created_at` are both populated

---

## 4. AI-Assisted Rewrite Improvement Suggestions

The "improvement suggestions" feature should return AI-generated rewrites without persisting until the doctor confirms.

**Endpoints to verify**:
- `POST /api/doctor/score-sentence` — returns AI score for a candidate sentence
- `GET /api/doctor/improvement-suggestions/{class_}` — domain-level suggestions
- `POST /api/doctor/ai-rewrite` — generate a rewrite candidate

**Checklist**:
- [ ] Score endpoint does **not** insert into `doctor_rewrite_log`
- [ ] Only `POST /api/doctor/rewrites` (commit) creates a row

---

## See Also

- [`PATIENT_INTERFACE.md`](PATIENT_INTERFACE.md) — patient-side validation checklist
- [`Query_string.md`](Query_string.md) — URL parameter routing
- [`../architecture/DATABASE_SCHEMA.md`](../architecture/DATABASE_SCHEMA.md) — table-level reference
