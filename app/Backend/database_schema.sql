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
    sentences TEXT,
    score FLOAT,
    class VARCHAR(100),
    time TIMESTAMP,
    PRIMARY KEY (file, i, i2)
);

-- (B) docter_interface_ai_rewriting_history.csv
CREATE TABLE doctor_rewrite_log (
    file VARCHAR(255) NOT NULL,
    i INT NOT NULL,
    i2 INT NOT NULL,
    speaker VARCHAR(100),             -- DoctorID
    time TIMESTAMP DEFAULT NOW(),
    original_sentences TEXT,
    original_score FLOAT,
    revised_sentences TEXT,
    score FLOAT,
    class VARCHAR(100),
    selected BOOLEAN DEFAULT FALSE,
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
-- 3. Optional Indexing
-- =====================================================
CREATE INDEX idx_doctor_render_file ON doctor_sentence_view(file);
CREATE INDEX idx_doctor_rewrite_file ON doctor_rewrite_log(file);
CREATE INDEX idx_patient_summary_file ON patient_summary(file);
CREATE INDEX idx_patient_scoring_file ON patient_summary_scoring(file);
CREATE INDEX idx_patient_response_file ON patient_responses(file);



-- =====================================================
-- Survey Submission Tables
-- =====================================================
CREATE TABLE survey_submission_log (
    id SERIAL PRIMARY KEY,
    file VARCHAR(255) NOT NULL,
    speaker VARCHAR(100) NOT NULL,
    survey_type VARCHAR(50) NOT NULL,
    answers TEXT NOT NULL,
    extra_data TEXT,
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


-- =====================================================
-- 4. Transcript Analysis Log (ML Pipeline Results)
-- =====================================================
CREATE TABLE transcript_analysis_log (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(255) NOT NULL,
    total_sentences INT NOT NULL DEFAULT 0,
    top_n INT NOT NULL DEFAULT 0,
    context_window INT NOT NULL DEFAULT 3,
    model_results TEXT,                    -- JSON string of per-model scores
    xlsx_data BYTEA,                       -- binary xlsx file for DB-backed download
    source_filename VARCHAR(500),
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transcript_log_patient_id ON transcript_analysis_log(patient_id);
CREATE INDEX idx_transcript_log_analyzed_at ON transcript_analysis_log(analyzed_at);

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

CREATE INDEX idx_sp_analysis_id ON sentence_prediction(analysis_id);
CREATE INDEX idx_sp_patient_model ON sentence_prediction(patient_id, model);
CREATE INDEX idx_sp_pred_score ON sentence_prediction(pred_score DESC);


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

CREATE INDEX idx_auth_api_key_hash ON auth_api_key(key_hash);
CREATE INDEX idx_auth_api_key_user ON auth_api_key(user_id);
CREATE INDEX idx_patient_access_user ON patient_access(user_id);
CREATE INDEX idx_patient_access_patient ON patient_access(patient_id);