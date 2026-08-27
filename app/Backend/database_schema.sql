-- =====================================================
-- DATABASE SCHEMA (FINAL VERSION WITH ALL FKs)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. Doctor Interface Tables
-- =====================================================

-- Doctor rewriting history (no FK — sentence existence validated at application level)
CREATE TABLE doctor_rewrite_log (
    file VARCHAR(255) NOT NULL,
    i INT NOT NULL,
    i2 INT NOT NULL,
    speaker VARCHAR(255),             -- DoctorID
    time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    original_sentence TEXT,
    revised_sentence TEXT,
    score FLOAT,
    class VARCHAR(100),
    PRIMARY KEY (file, i, i2, time)
);

-- =====================================================
-- 2. Patient Interface Tables
-- =====================================================

-- (A) Patient summary — one row per patient
CREATE TABLE patient_summary (
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(255) NOT NULL,
    entire_summary TEXT,
    PRIMARY KEY (file, speaker)
);

-- (B) Patient summary per domain — one row per patient per domain (replaces
--     the old patient_summary class_1~5 columns, patient_summary_scoring, and patient_responses)
CREATE TABLE patient_summary_domain (
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(255) NOT NULL,
    domain VARCHAR(100) NOT NULL,        -- e.g. 'cancer_prognosis', 'continence', ...
    display_order INT NOT NULL DEFAULT 0,-- display order in UI (1-based)
    summary_text TEXT,                   -- AI-generated summary for this domain
    patient_scoring INT CHECK (patient_scoring BETWEEN 0 AND 10),  -- patient usefulness rating
    patient_response TEXT,               -- free-text feedback from patient
    PRIMARY KEY (file, speaker, domain),
    CONSTRAINT fk_domain_to_summary
        FOREIGN KEY (file, speaker)
        REFERENCES patient_summary(file, speaker)
        ON DELETE CASCADE
);

-- =====================================================
-- 3. Indexing
-- =====================================================
CREATE INDEX idx_doctor_rewrite_file ON doctor_rewrite_log(file);
CREATE INDEX idx_patient_summary_file ON patient_summary(file);
CREATE INDEX idx_patient_domain_file ON patient_summary_domain(file);
CREATE INDEX idx_patient_domain_order ON patient_summary_domain(file, speaker, display_order);



-- =====================================================
-- Survey Submission Tables
-- =====================================================
CREATE TABLE survey_submission_log (
    id SERIAL PRIMARY KEY,
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(255) NOT NULL,
    survey_type VARCHAR(50) NOT NULL,
    answers JSONB NOT NULL,
    extra_data JSONB,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    redcap_synced BOOLEAN DEFAULT FALSE,
    redcap_record_id VARCHAR(255),
    redcap_error TEXT,
    CONSTRAINT fk_survey_to_patient_summary
        FOREIGN KEY (file, speaker)
        REFERENCES patient_summary(file, speaker)
        ON DELETE CASCADE
);

CREATE INDEX idx_survey_submission_file ON survey_submission_log(file);
CREATE INDEX idx_survey_submission_speaker ON survey_submission_log(speaker);
CREATE INDEX idx_survey_submission_type ON survey_submission_log(survey_type);

-- #9: Composite indexes for WHERE + ORDER BY DESC patterns in survey endpoints
CREATE INDEX idx_survey_speaker_submitted ON survey_submission_log(speaker, submitted_at DESC);
CREATE INDEX idx_survey_file_submitted ON survey_submission_log(file, submitted_at DESC);

-- #10: Partial index for REDCap sync pending items (only unsynced rows indexed)
CREATE INDEX idx_survey_redcap_pending ON survey_submission_log(id) WHERE redcap_synced = FALSE;


-- =====================================================
-- 4. Transcript Analysis Log (ML Pipeline Results)
-- =====================================================
CREATE TABLE transcript_analysis_log (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(255) NOT NULL,
    total_sentences INT NOT NULL DEFAULT 0,
    top_n INT NOT NULL DEFAULT 0,
    context_window INT NOT NULL DEFAULT 3,
    model_results JSONB,                   -- per-model NLP scores (validated JSON)
    xlsx_data BYTEA,                       -- binary xlsx file for DB-backed download
    source_filename VARCHAR(500),
    pipeline_started_at TIMESTAMP WITH TIME ZONE,  -- when pipeline_runner began processing
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  -- when NLP results saved to DB
    ai_overall_score FLOAT,                 -- GPT-4o average score across all domains (0-5)
    processed BOOLEAN DEFAULT FALSE,        -- True when full pipeline (NLP + AI) completed
    processed_at TIMESTAMP WITH TIME ZONE   -- when AI pipeline completed
);

-- Note: idx_transcript_log_patient_id removed — redundant with composite (patient_id, analyzed_at DESC)
CREATE INDEX idx_transcript_log_analyzed_at ON transcript_analysis_log(analyzed_at);
CREATE INDEX idx_transcript_log_patient_analyzed ON transcript_analysis_log(patient_id, analyzed_at DESC);

-- #6: Partial index for download endpoint (only rows with xlsx_data)
CREATE INDEX idx_transcript_log_patient_xlsx ON transcript_analysis_log(patient_id, analyzed_at DESC)
    WHERE xlsx_data IS NOT NULL;

-- #8: Covering index for history endpoint (index-only scan, no heap access)
CREATE INDEX idx_transcript_log_history ON transcript_analysis_log(patient_id, analyzed_at DESC)
    INCLUDE (id, total_sentences, top_n, context_window, source_filename);

-- =====================================================
-- 5. Sentence-Level Predictions (per-row NLP scores)
-- =====================================================
-- Stores one row per sentence per model from the ML pipeline output.
-- Each row mirrors a single row in the xlsx output sheets.
--
-- Column mapping (xlsx sheet → DB):
--   xlsx column    DB column               Description
--   -----------    ---------               -----------
--   (sheet name)   model                   NLP model: cp, inc, ed, ius, le
--   name           patient_id              Patient identifier (e.g. "sid-01")
--   index          sentence_index          Global sentence sequence number (1-based)
--   i              utterance_index         Original utterance number from transcript
--   i2             sentence_in_utterance   Sentence position within the utterance (1-based)
--   speaker        speaker                 Speaker label (e.g. "Interviewer")
--   text           sentence_text           The sentence text (lowercased)
--   .pred_1        pred_score              NLP prediction probability (0.0–1.0)
--   context        context                 Surrounding sentences with <main>target</main> tags
--
-- DB-only columns (not in xlsx):
--   id             Auto-increment primary key
--   analysis_id    FK → transcript_analysis_log.id (links to the analysis run)
--
CREATE TABLE sentence_prediction (
    id SERIAL PRIMARY KEY,
    analysis_id INT NOT NULL REFERENCES transcript_analysis_log(id) ON DELETE CASCADE,
    patient_id VARCHAR(255) NOT NULL,         -- xlsx 'name'    : patient identifier
    model VARCHAR(10) NOT NULL,               -- xlsx sheet name: cp, inc, ed, ius, le
    sentence_index INT NOT NULL,              -- xlsx 'index'   : global sentence number
    utterance_index INT NOT NULL,             -- xlsx 'i'       : utterance number
    sentence_in_utterance INT NOT NULL,       -- xlsx 'i2'      : sentence within utterance
    speaker VARCHAR(255),                     -- xlsx 'speaker' : speaker label
    sentence_text TEXT,                       -- xlsx 'text'    : sentence text
    pred_score FLOAT NOT NULL,               -- xlsx '.pred_1' : prediction score (0.0–1.0)
    context TEXT                              -- xlsx 'context' : surrounding sentences
);

-- Note: idx_sp_analysis_id removed — redundant with composite (analysis_id, model)
CREATE INDEX idx_sp_patient_model ON sentence_prediction(patient_id, model);
CREATE INDEX idx_sp_pred_score ON sentence_prediction(pred_score DESC);
CREATE INDEX idx_sp_analysis_model ON sentence_prediction(analysis_id, model);


-- =====================================================
-- 6. Authentication & Access Control Tables
-- =====================================================

CREATE TABLE auth_user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','readonly')),
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auth_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE auth_api_key (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    label VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE patient_access (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
    patient_id VARCHAR(255) NOT NULL,
    access_type VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_type IN ('read','write','admin')),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by INT REFERENCES auth_user(id),
    UNIQUE(user_id, patient_id)
);

CREATE INDEX idx_auth_user_username ON auth_user(username);
CREATE INDEX idx_auth_api_key_hash ON auth_api_key(key_hash);
CREATE INDEX idx_auth_api_key_user ON auth_api_key(user_id);
CREATE INDEX idx_patient_access_user ON patient_access(user_id);
CREATE INDEX idx_patient_access_patient ON patient_access(patient_id);


-- =====================================================
-- 7. User Interaction Tracking
-- =====================================================
CREATE TABLE user_interaction_log (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'patient',
    visit_type VARCHAR(20),                        -- 'first' | 'followup' | NULL (physician/legacy)
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    element_id VARCHAR(255),
    event_data JSONB,
    device_type VARCHAR(20),
    client_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_uil_session ON user_interaction_log(session_id);
-- idx_uil_role REMOVED: low cardinality (2-3 values), index ineffective
-- idx_uil_file REMOVED: covered by composite idx_uil_file_event_type (first column)
-- idx_uil_speaker REMOVED: rarely queried alone
CREATE INDEX idx_uil_event_type ON user_interaction_log(event_type);
CREATE INDEX idx_uil_client_timestamp ON user_interaction_log(client_timestamp);
CREATE INDEX idx_uil_file_event_type ON user_interaction_log(file, event_type);

-- #4, #5: Expression indexes (date_trunc, extract) removed — require IMMUTABLE wrapper (TODO #42)


-- =====================================================
-- 7b. Session Recording (rrweb)
-- =====================================================
CREATE TABLE session_recording (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    chunk_index INT NOT NULL DEFAULT 0,
    file VARCHAR(255),
    visit_type VARCHAR(20),
    recording_data BYTEA,                       -- gzipped rrweb events JSON
    event_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sr_session_id ON session_recording(session_id);


-- =====================================================
-- 8. LLM Domain Scoring & Summary (AI Pipeline)
-- =====================================================
-- Stores the output of the AI pipeline (Step 11):
--   - GPT-4o scores each sentence's clinical specificity (0-5)
--   - Extracts actual risk numbers ("24-25%", "13 years")
--   - Reformats into patient-facing plain language
--   - For side-effect domains (ed, inc, ius): one row per treatment
--
CREATE TABLE llm_domain_scoring_and_summary (
    id SERIAL PRIMARY KEY,
    analysis_id INT NOT NULL REFERENCES transcript_analysis_log(id) ON DELETE CASCADE,
    patient_id VARCHAR(255) NOT NULL,
    domain VARCHAR(10) NOT NULL,                -- cp, le, ed, inc, ius
    ai_score INT,                               -- 0-5 GPT-4o relevance score
    score_explanation TEXT,                      -- chain-of-thought reasoning
    extracted_estimate TEXT,                     -- e.g., "24-25%", "13 years", "<missing>"
    treatment VARCHAR(50),                      -- e.g., "surgery", "radiation", NULL (regular domains)
    source_sentence TEXT,                        -- original single sentence (input to reformat)
    source_context TEXT,                         -- surrounding context sentences
    reformat_sentence TEXT,                      -- patient-facing summary sentence
    source_filename VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_llm_dss_analysis ON llm_domain_scoring_and_summary(analysis_id);
CREATE INDEX idx_llm_dss_patient_domain ON llm_domain_scoring_and_summary(patient_id, domain);