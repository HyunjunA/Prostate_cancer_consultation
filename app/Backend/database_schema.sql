-- =====================================================
-- DATABASE SCHEMA (FINAL VERSION WITH ALL FKs)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. Doctor Interface Tables
-- =====================================================

-- (A) docter_interface_render_processed.csv
CREATE TABLE doctor_sentence_view (
    file VARCHAR(255) NOT NULL,
    i INT NOT NULL,
    i2 INT NOT NULL,
    speaker VARCHAR(100),             -- PatientID or DoctorID
    sentence TEXT,
    score FLOAT,
    class VARCHAR(100),
    time TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (file, i, i2)
);

-- (B) docter_interface_ai_rewriting_history.csv
CREATE TABLE doctor_rewrite_log (
    file VARCHAR(255) NOT NULL,
    i INT NOT NULL,
    i2 INT NOT NULL,
    speaker VARCHAR(100),             -- DoctorID
    time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    original_sentence TEXT,
    revised_sentence TEXT,
    score FLOAT,
    class VARCHAR(100),
    PRIMARY KEY (file, i, i2, time),
    CONSTRAINT fk_rewrite_to_sentence
        FOREIGN KEY (file, i, i2)
        REFERENCES doctor_sentence_view(file, i, i2)
        ON DELETE CASCADE
);

-- =====================================================
-- 2. Patient Interface Tables
-- =====================================================

-- (A) Patient_interface_class_summary.csv
CREATE TABLE patient_summary (
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(100),             -- PatientID
    entire_summary TEXT,
    class_1 VARCHAR(100),
    summary_class_1 TEXT,
    class_2 VARCHAR(100),
    summary_class_2 TEXT,
    class_3 VARCHAR(100),
    summary_class_3 TEXT,
    class_4 VARCHAR(100),
    summary_class_4 TEXT,
    class_5 VARCHAR(100),
    summary_class_5 TEXT,
    PRIMARY KEY (file, speaker)
);

-- (B) Patient_interface_class_summary_scoring.csv
CREATE TABLE patient_summary_scoring (
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(100),             -- PatientID
    class_1_patient_scoring INT CHECK (class_1_patient_scoring BETWEEN 0 AND 10),
    class_2_patient_scoring INT CHECK (class_2_patient_scoring BETWEEN 0 AND 10),
    class_3_patient_scoring INT CHECK (class_3_patient_scoring BETWEEN 0 AND 10),
    class_4_patient_scoring INT CHECK (class_4_patient_scoring BETWEEN 0 AND 10),
    class_5_patient_scoring INT CHECK (class_5_patient_scoring BETWEEN 0 AND 10),
    PRIMARY KEY (file, speaker),
    CONSTRAINT fk_scoring_to_summary
        FOREIGN KEY (file, speaker)
        REFERENCES patient_summary(file, speaker)
        ON DELETE CASCADE
);

-- (C) Patient_interface_questions_responses.csv
CREATE TABLE patient_responses (
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(100),
    answer_1 TEXT,
    answer_2 TEXT,
    answer_3 TEXT,
    answer_4 TEXT,
    answer_5 TEXT,
    PRIMARY KEY (file, speaker),
    CONSTRAINT fk_responses_to_summary
        FOREIGN KEY (file, speaker)
        REFERENCES patient_summary(file, speaker)
        ON DELETE CASCADE
);

-- =====================================================
-- 3. Indexing
-- =====================================================
-- Note: idx_doctor_render_file (file) removed — redundant with PK (file, i, i2)
CREATE INDEX idx_doctor_rewrite_file ON doctor_rewrite_log(file);
CREATE INDEX idx_patient_summary_file ON patient_summary(file);
CREATE INDEX idx_patient_scoring_file ON patient_summary_scoring(file);
CREATE INDEX idx_patient_response_file ON patient_responses(file);

-- #1: Partial + composite index for scores/average 3-stage subquery (class != '-1' filter)
CREATE INDEX idx_dsv_file_speaker_class_i ON doctor_sentence_view (file, speaker, class, i DESC, i2 DESC)
    WHERE class != '-1' AND score IS NOT NULL;



-- =====================================================
-- Survey Submission Tables
-- =====================================================
CREATE TABLE survey_submission_log (
    id SERIAL PRIMARY KEY,
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(100) NOT NULL,
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
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
    speaker VARCHAR(100),                     -- xlsx 'speaker' : speaker label
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
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    element_id VARCHAR(255),
    event_data JSONB,
    device_type VARCHAR(20),
    client_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_uil_session ON user_interaction_log(session_id);
CREATE INDEX idx_uil_role ON user_interaction_log(role);
CREATE INDEX idx_uil_file ON user_interaction_log(file);
CREATE INDEX idx_uil_speaker ON user_interaction_log(speaker);
CREATE INDEX idx_uil_event_type ON user_interaction_log(event_type);
CREATE INDEX idx_uil_client_timestamp ON user_interaction_log(client_timestamp);
CREATE INDEX idx_uil_file_event_type ON user_interaction_log(file, event_type);

-- #4: Expression index for analytics timeline (GROUP BY date_trunc)
CREATE INDEX idx_uil_client_ts_hour ON user_interaction_log (date_trunc('hour', client_timestamp))
    WHERE client_timestamp IS NOT NULL;

-- #5: Expression index for hourly heatmap (GROUP BY extract hour)
CREATE INDEX idx_uil_client_ts_hour_of_day ON user_interaction_log (extract(hour FROM client_timestamp))
    WHERE client_timestamp IS NOT NULL;