-- ============================================================================
-- Pipeline DB Storage — Verification & Analyst Query Notebook
--
-- Usage:
--   docker exec -it prostatecancer-postgres bash -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB'
-- ============================================================================

-- ====================================================================
-- 0. Baseline — what analyses do we have?
-- ====================================================================
SELECT
  id                AS analysis_id,
  patient_id,
  source_filename,
  total_sentences,
  ai_overall_score,
  processed         AS ai_processed,
  analyzed_at,
  processed_at      AS ai_processed_at
FROM transcript_analysis_log
ORDER BY analyzed_at DESC;


-- ====================================================================
-- 1. Per-analysis 12-stage row counts in one shot (most-used query)
-- ====================================================================
SELECT
  tal.id                                                                    AS analysis_id,
  tal.patient_id,
  tal.source_filename,
  tal.processed                                                             AS ai_done,
  tal.ai_overall_score,
  (SELECT count(*) FROM nlp_pipeline_intermediate WHERE analysis_id=tal.id) AS nlp_jsonb_blobs,
  (SELECT count(*) FROM nlp_all_predictions       WHERE analysis_id=tal.id) AS nlp_step3_rows,
  (SELECT count(*) FROM sentence_prediction       WHERE analysis_id=tal.id) AS nlp_step5_topN,
  (SELECT count(*) FROM llm_pipeline_intermediate WHERE analysis_id=tal.id) AS ai_candidates,
  (SELECT count(*) FROM llm_domain_scoring_and_summary WHERE analysis_id=tal.id) AS ai_final_rows,
  octet_length(tal.xlsx_data) AS xlsx_bytes
FROM transcript_analysis_log tal
ORDER BY tal.id;
-- Expected: nlp_jsonb_blobs=4, nlp_step5_topN=50, ai_candidates=50,
--          ai_final_rows: 5..25


-- ====================================================================
-- 2. Bug 1 regression check — any NULLs in pred_*?
-- ====================================================================
-- Healthy: count(*) == count(pred_cp) == count(pred_le) == ...
SELECT
  analysis_id,
  count(*)              AS total_rows,
  count(pred_cp)        AS cp_nonnull,
  count(pred_le)        AS le_nonnull,
  count(pred_ed)        AS ed_nonnull,
  count(pred_inc)       AS inc_nonnull,
  count(pred_ius)       AS ius_nonnull,
  CASE
    WHEN count(*) = count(pred_cp)
     AND count(*) = count(pred_le)
     AND count(*) = count(pred_ed)
     AND count(*) = count(pred_inc)
     AND count(*) = count(pred_ius)
    THEN 'PASS'
    ELSE 'FAIL — NULL leak'
  END AS status
FROM nlp_all_predictions
GROUP BY analysis_id
ORDER BY analysis_id;


-- ====================================================================
-- 3. Bug 2 regression check — patient_summary duplicates from re-runs
-- ====================================================================
-- Each (file, speaker) must have exactly one row.
SELECT
  file,
  speaker,
  count(*) AS rows,
  CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL — duplicate' END AS status
FROM patient_summary
GROUP BY file, speaker
HAVING count(*) <> 1;
-- Empty result set = all clean (PASS).


-- ====================================================================
-- 4. Top-scoring sentences in one NLP domain for a given analysis
-- ====================================================================
-- Replace the analysis_id and model values to taste.
SELECT
  sentence_index,
  pred_score,
  substr(sentence_text, 1, 80) AS text_preview,
  substr(context, 1, 100)      AS context_preview
FROM sentence_prediction
WHERE analysis_id = 1 AND model = 'cp'
ORDER BY pred_score DESC
LIMIT 10;


-- ====================================================================
-- 5. Cross-domain analysis — sentences scoring high on multiple domains
-- ====================================================================
-- "Discusses both cancer prognosis AND life expectancy"
SELECT
  sentence_index,
  substr(sentence_text, 1, 80) AS text,
  pred_cp,
  pred_le,
  (pred_cp + pred_le) AS combined
FROM nlp_all_predictions
WHERE analysis_id = 1
  AND pred_cp > 0.7
  AND pred_le > 0.5
ORDER BY combined DESC
LIMIT 10;


-- ====================================================================
-- 6. AI candidate selection rate per domain
-- Migration 031 dropped `survived_filter`; whether a candidate was chosen is
-- answered by joining to the final table on (estimate, treatment).
-- ====================================================================
SELECT
  i.analysis_id,
  i.domain,
  count(*)                                  AS total_candidates,
  count(f.id)                               AS selected,
  round(100.0 * count(f.id) / count(*), 1)  AS selection_pct,
  avg(i.ai_score)::numeric(3,2)             AS avg_ai_score,
  max(i.ai_score)                           AS max_ai_score
FROM llm_pipeline_intermediate i
LEFT JOIN llm_domain_scoring_and_summary f
       ON f.analysis_id = i.analysis_id
      AND f.domain      = i.domain
      AND f.extracted_estimate IS NOT DISTINCT FROM i.estimate
      AND f.treatment          IS NOT DISTINCT FROM i.treatment
GROUP BY i.analysis_id, i.domain
ORDER BY i.analysis_id, i.domain;


-- ====================================================================
-- 7. Insight — high-scoring candidates that were not selected ("why?")
-- ====================================================================
SELECT
  i.analysis_id,
  i.domain,
  i.sentence_index,
  i.ai_score,
  i.estimate,
  i.treatment,
  substr(i.score_explanation, 1, 120) AS reason_preview,
  substr(i.sentence_text, 1, 100)     AS text
FROM llm_pipeline_intermediate i
LEFT JOIN llm_domain_scoring_and_summary f
       ON f.analysis_id = i.analysis_id
      AND f.domain      = i.domain
      AND f.extracted_estimate IS NOT DISTINCT FROM i.estimate
      AND f.treatment          IS NOT DISTINCT FROM i.treatment
WHERE i.ai_score >= 4
  AND f.id IS NULL
ORDER BY i.analysis_id, i.ai_score DESC, i.domain;


-- ====================================================================
-- 8. Final patient-facing reformat sentences
-- ====================================================================
SELECT
  analysis_id,
  domain,
  ai_score,
  extracted_estimate,
  treatment,
  reformat_sentence
FROM llm_domain_scoring_and_summary
ORDER BY analysis_id, domain;


-- ====================================================================
-- 9. Pull a JSONB stage (Step 0 raw transcript)
-- ====================================================================
SELECT
  step,
  row_count,
  jsonb_typeof(payload)        AS payload_type,
  jsonb_pretty(payload->0)     AS first_record_pretty
FROM nlp_pipeline_intermediate
WHERE analysis_id = 1 AND step = 'raw';


-- ====================================================================
-- 10. Filter inside JSONB — doctor-only utterances from raw payload
-- ====================================================================
SELECT
  jsonb_array_length(
    jsonb_path_query_array(payload, '$[*] ? (@.speaker == "Interviewer:")')
  ) AS doctor_utterance_count
FROM nlp_pipeline_intermediate
WHERE analysis_id = 1 AND step = 'raw';


-- ====================================================================
-- 11. Confirm the Alembic migration head
-- ====================================================================
SELECT version_num FROM alembic_version;
-- Expected: 007_ai_intermediates


-- ====================================================================
-- 12. Confirm the new tables exist (006/007 applied)
-- ====================================================================
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'nlp_all_predictions',
    'nlp_pipeline_intermediate',
    'llm_pipeline_intermediate',
    'llm_domain_scoring_and_summary'
  )
ORDER BY tablename;
-- Four rows = PASS.


-- ====================================================================
-- 13. Recent analyses with status (live monitoring)
-- ====================================================================
SELECT
  id,
  patient_id,
  source_filename,
  analyzed_at,
  CASE
    WHEN processed THEN 'AI complete'
    WHEN xlsx_data IS NOT NULL THEN 'NLP done, AI pending'
    ELSE 'incomplete'
  END AS status,
  ai_overall_score,
  EXTRACT(EPOCH FROM (processed_at - analyzed_at)) AS ai_duration_sec
FROM transcript_analysis_log
ORDER BY analyzed_at DESC
LIMIT 10;


-- ====================================================================
-- 14. Safe full deletion of one analysis (CASCADE verification)
-- ====================================================================
-- Note: CASCADE removes sentence_prediction, nlp_all_predictions,
-- nlp_pipeline_intermediate, llm_pipeline_intermediate, and
-- llm_domain_scoring_and_summary rows. patient_summary has no FK
-- and must be deleted manually. Double-check before running.
--
-- DELETE FROM transcript_analysis_log WHERE id = :aid;
-- DELETE FROM patient_summary WHERE file = (SELECT source_filename FROM transcript_analysis_log WHERE id = :aid);


-- ====================================================================
-- 15. One patient's processing history (re-analysis tracking)
-- ====================================================================
SELECT
  id,
  source_filename,
  analyzed_at,
  ai_overall_score,
  processed,
  total_sentences
FROM transcript_analysis_log
WHERE patient_id = 'SID_10'
ORDER BY analyzed_at DESC;
