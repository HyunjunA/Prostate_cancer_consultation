-- ===== Extensions =====
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===== Tables =====
CREATE TABLE IF NOT EXISTS studies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    covidence_id VARCHAR(50),
    pmid VARCHAR(50),
    study_id VARCHAR(200),
    title TEXT,
    publication_year INTEGER,
    study_location_1 VARCHAR(100),
    study_location_2 VARCHAR(100),
    number_of_samples_sequenced INTEGER DEFAULT 0,
    repository VARCHAR(200),
    sequence_ids_reported BOOLEAN DEFAULT FALSE,
    sequence_id_article_location TEXT,

    -- Demographic metadata flags
    age_reported BOOLEAN DEFAULT FALSE,
    gender_reported BOOLEAN DEFAULT FALSE,
    race_ethnicity_nationality_reported BOOLEAN DEFAULT FALSE,
    demographic_article_location TEXT,

    -- Clinical metadata flags
    comorbidities_reported BOOLEAN DEFAULT FALSE,
    inpatient_outpatient_reported BOOLEAN DEFAULT FALSE,
    outcomes_reported BOOLEAN DEFAULT FALSE,
    severity_reported BOOLEAN DEFAULT FALSE,
    signs_symptoms_reported BOOLEAN DEFAULT FALSE,
    treatment_reported BOOLEAN DEFAULT FALSE,
    vaccination_status_reported BOOLEAN DEFAULT FALSE,
    clinical_article_location TEXT,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_publication_year CHECK (
        publication_year IS NULL
        OR (publication_year >= 1900 AND publication_year <= EXTRACT(YEAR FROM CURRENT_DATE) + 1)
    ),
    CONSTRAINT valid_sample_count CHECK (number_of_samples_sequenced >= 0)

    -- Uncomment below to prohibit blank strings
    -- ,CONSTRAINT chk_covidence_id_not_blank
    --   CHECK (covidence_id IS NULL OR btrim(covidence_id) <> '')

);

CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    iso_code VARCHAR(3),
    region VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS repositories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ===== Indexes (studies) =====
-- General index for query performance
CREATE INDEX IF NOT EXISTS idx_studies_covidence_id ON studies(covidence_id);

-- Unique constraint is enforced only when actual ID exists (NULLs are allowed to be duplicated)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_studies_covidence_id
  ON studies(covidence_id)
  WHERE covidence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_studies_publication_year ON studies(publication_year);
CREATE INDEX IF NOT EXISTS idx_studies_location_1 ON studies(study_location_1);
CREATE INDEX IF NOT EXISTS idx_studies_repository ON studies(repository);
CREATE INDEX IF NOT EXISTS idx_studies_sequence_ids ON studies(sequence_ids_reported);
CREATE INDEX IF NOT EXISTS idx_studies_sample_count ON studies(number_of_samples_sequenced);

-- Demographic reporting indexes
CREATE INDEX IF NOT EXISTS idx_studies_age_reported ON studies(age_reported);
CREATE INDEX IF NOT EXISTS idx_studies_gender_reported ON studies(gender_reported);
CREATE INDEX IF NOT EXISTS idx_studies_race_reported ON studies(race_ethnicity_nationality_reported);

-- Clinical reporting indexes
CREATE INDEX IF NOT EXISTS idx_studies_comorbidities ON studies(comorbidities_reported);
CREATE INDEX IF NOT EXISTS idx_studies_outcomes ON studies(outcomes_reported);
CREATE INDEX IF NOT EXISTS idx_studies_severity ON studies(severity_reported);
CREATE INDEX IF NOT EXISTS idx_studies_treatment ON studies(treatment_reported);

-- Composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_studies_location_year ON studies(study_location_1, publication_year);
CREATE INDEX IF NOT EXISTS idx_studies_repository_year ON studies(repository, publication_year);
CREATE INDEX IF NOT EXISTS idx_studies_sequence_location ON studies(sequence_ids_reported, study_location_1);

-- Full-text / trigram
CREATE INDEX IF NOT EXISTS idx_studies_title_fts
  ON studies USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_studies_title_trigram
  ON studies USING gin (title gin_trgm_ops);

-- ===== Materialized View =====
DROP MATERIALIZED VIEW IF EXISTS dashboard_statistics;

CREATE MATERIALIZED VIEW dashboard_statistics AS
SELECT
    COUNT(*)                                          AS total_studies,
    COUNT(DISTINCT study_location_1)                  AS unique_countries,
    COUNT(DISTINCT repository)                        AS unique_repositories,
    COALESCE(SUM(number_of_samples_sequenced), 0)     AS total_samples,
    COUNT(*) FILTER (WHERE sequence_ids_reported = TRUE) AS studies_with_sequence_ids,
    MIN(publication_year)                             AS earliest_year,
    MAX(publication_year)                             AS latest_year,
    AVG(number_of_samples_sequenced)                  AS avg_samples_per_study,

    -- Demographic reporting statistics
    COUNT(*) FILTER (WHERE age_reported = TRUE)       AS studies_with_age,
    COUNT(*) FILTER (WHERE gender_reported = TRUE)    AS studies_with_gender,
    COUNT(*) FILTER (WHERE race_ethnicity_nationality_reported = TRUE) AS studies_with_race_ethnicity,

    -- Clinical reporting statistics
    COUNT(*) FILTER (WHERE comorbidities_reported = TRUE)     AS studies_with_comorbidities,
    COUNT(*) FILTER (WHERE outcomes_reported = TRUE)           AS studies_with_outcomes,
    COUNT(*) FILTER (WHERE severity_reported = TRUE)           AS studies_with_severity,
    COUNT(*) FILTER (WHERE treatment_reported = TRUE)          AS studies_with_treatment,
    COUNT(*) FILTER (WHERE vaccination_status_reported = TRUE) AS studies_with_vaccination
FROM studies;

-- Example: adding index for a small view
CREATE INDEX IF NOT EXISTS idx_dashboard_stats_refresh ON dashboard_statistics(total_studies);

-- ===== Functions & Triggers =====
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW dashboard_statistics;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_studies_updated_at ON studies;

CREATE TRIGGER update_studies_updated_at
    BEFORE UPDATE ON studies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===== Seed Data =====
INSERT INTO countries (name, iso_code, region) VALUES
('Ethiopia', 'ETH', 'Africa'),
('South Africa', 'ZAF', 'Africa'),
('Argentina', 'ARG', 'South America'),
('Australia', 'AUS', 'Oceania'),
('Austria', 'AUT', 'Europe'),
('Singapore', 'SGP', 'Asia'),
('Taiwan', 'TWN', 'Asia'),
('Brazil', 'BRA', 'South America'),
('United States', 'USA', 'North America'),
('United Kingdom', 'GBR', 'Europe')
ON CONFLICT (name) DO NOTHING;

INSERT INTO repositories (name, url, description) VALUES
('GISAID', 'https://gisaid.org', 'Global Initiative on Sharing All Influenza Data'),
('NCBI GenBank', 'https://ncbi.nlm.nih.gov/genbank', 'NIH genetic sequence database'),
('ENA', 'https://ebi.ac.uk/ena', 'European Nucleotide Archive'),
('figshare', 'https://figshare.com', 'Online open access repository'),
('OSF', 'https://osf.io', 'Open Science Framework')
ON CONFLICT (name) DO NOTHING;
