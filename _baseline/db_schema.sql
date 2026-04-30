--
-- PostgreSQL database dump
--

\restrict kcWxmWxrcTZ1uuHFdYUP5a2PD4x73owCUiQKd28bBQeXtflEbbCyc41JuB8e3oe

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO prostatecancer_user;

--
-- Name: auth_api_key; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.auth_api_key (
    id integer NOT NULL,
    user_id integer NOT NULL,
    key_hash character varying(255) NOT NULL,
    label character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone
);


ALTER TABLE public.auth_api_key OWNER TO prostatecancer_user;

--
-- Name: auth_api_key_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.auth_api_key_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.auth_api_key_id_seq OWNER TO prostatecancer_user;

--
-- Name: auth_api_key_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.auth_api_key_id_seq OWNED BY public.auth_api_key.id;


--
-- Name: auth_user; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.auth_user (
    id integer NOT NULL,
    username character varying(150) NOT NULL,
    email character varying(255),
    password_hash character varying(255),
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    is_superuser boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    auth_provider character varying(50) DEFAULT 'local'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT auth_user_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'user'::character varying, 'readonly'::character varying])::text[])))
);


ALTER TABLE public.auth_user OWNER TO prostatecancer_user;

--
-- Name: auth_user_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.auth_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.auth_user_id_seq OWNER TO prostatecancer_user;

--
-- Name: auth_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.auth_user_id_seq OWNED BY public.auth_user.id;


--
-- Name: doctor_behavior; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.doctor_behavior (
    id integer NOT NULL,
    session_id character varying(100) NOT NULL,
    file character varying(255),
    speaker character varying(100) NOT NULL,
    event_type character varying(30) NOT NULL,
    target_type character varying(20),
    target_id character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    device_type character varying(20),
    client_timestamp timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_doc_event_type CHECK (((event_type)::text = ANY ((ARRAY['page_view'::character varying, 'view_change'::character varying, 'patient_select'::character varying, 'topic_select'::character varying, 'sentence_select'::character varying, 'rewrite_open'::character varying, 'rewrite_input'::character varying, 'rewrite_apply'::character varying, 'rubric_open'::character varying, 'rubric_close'::character varying, 'rubric_score_lock'::character varying, 'tour_open'::character varying, 'tour_end'::character varying, 'session_end'::character varying])::text[]))),
    CONSTRAINT ck_doc_target_type_values CHECK (((target_type IS NULL) OR ((target_type)::text = ANY ((ARRAY['patient'::character varying, 'topic'::character varying, 'sentence'::character varying])::text[]))))
);


ALTER TABLE public.doctor_behavior OWNER TO prostatecancer_user;

--
-- Name: doctor_behavior_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.doctor_behavior_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.doctor_behavior_id_seq OWNER TO prostatecancer_user;

--
-- Name: doctor_behavior_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.doctor_behavior_id_seq OWNED BY public.doctor_behavior.id;


--
-- Name: doctor_rewrite_log; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.doctor_rewrite_log (
    file character varying(255) NOT NULL,
    i integer NOT NULL,
    i2 integer NOT NULL,
    speaker character varying(100),
    "time" timestamp with time zone DEFAULT now() NOT NULL,
    original_sentence text,
    revised_sentence text,
    score double precision,
    class character varying(100)
);


ALTER TABLE public.doctor_rewrite_log OWNER TO prostatecancer_user;

--
-- Name: llm_domain_scoring_and_summary; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.llm_domain_scoring_and_summary (
    id integer NOT NULL,
    analysis_id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    domain character varying(10) NOT NULL,
    ai_score integer,
    score_explanation text,
    extracted_estimate text,
    treatment text,
    source_sentence text,
    source_context text,
    reformat_sentence text,
    source_filename character varying(500),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.llm_domain_scoring_and_summary OWNER TO prostatecancer_user;

--
-- Name: llm_domain_scoring_and_summary_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.llm_domain_scoring_and_summary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.llm_domain_scoring_and_summary_id_seq OWNER TO prostatecancer_user;

--
-- Name: llm_domain_scoring_and_summary_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.llm_domain_scoring_and_summary_id_seq OWNED BY public.llm_domain_scoring_and_summary.id;


--
-- Name: llm_pipeline_intermediate; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.llm_pipeline_intermediate (
    id integer NOT NULL,
    analysis_id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    domain character varying(10) NOT NULL,
    step character varying(20) NOT NULL,
    sentence_index integer NOT NULL,
    sentence_text text,
    context text,
    pred_score double precision,
    ai_score smallint,
    score_explanation text,
    estimate text,
    treatment text,
    survived_filter boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_lpi_domain CHECK (((domain)::text = ANY ((ARRAY['cp'::character varying, 'le'::character varying, 'ed'::character varying, 'inc'::character varying, 'ius'::character varying])::text[]))),
    CONSTRAINT ck_lpi_step CHECK (((step)::text = 'extraction'::text))
);


ALTER TABLE public.llm_pipeline_intermediate OWNER TO prostatecancer_user;

--
-- Name: llm_pipeline_intermediate_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.llm_pipeline_intermediate_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.llm_pipeline_intermediate_id_seq OWNER TO prostatecancer_user;

--
-- Name: llm_pipeline_intermediate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.llm_pipeline_intermediate_id_seq OWNED BY public.llm_pipeline_intermediate.id;


--
-- Name: nlp_all_predictions; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.nlp_all_predictions (
    id integer NOT NULL,
    analysis_id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    sentence_index integer NOT NULL,
    utterance_index integer NOT NULL,
    sentence_in_utterance integer NOT NULL,
    speaker character varying(255),
    sentence_text text,
    pred_cp double precision,
    pred_le double precision,
    pred_ed double precision,
    pred_inc double precision,
    pred_ius double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.nlp_all_predictions OWNER TO prostatecancer_user;

--
-- Name: nlp_all_predictions_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.nlp_all_predictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.nlp_all_predictions_id_seq OWNER TO prostatecancer_user;

--
-- Name: nlp_all_predictions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.nlp_all_predictions_id_seq OWNED BY public.nlp_all_predictions.id;


--
-- Name: nlp_pipeline_intermediate; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.nlp_pipeline_intermediate (
    id integer NOT NULL,
    analysis_id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    step character varying(20) NOT NULL,
    payload jsonb NOT NULL,
    row_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_npi_step CHECK (((step)::text = ANY ((ARRAY['raw'::character varying, 'filtered'::character varying, 'sentences'::character varying, 'top_by_model'::character varying])::text[])))
);


ALTER TABLE public.nlp_pipeline_intermediate OWNER TO prostatecancer_user;

--
-- Name: nlp_pipeline_intermediate_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.nlp_pipeline_intermediate_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.nlp_pipeline_intermediate_id_seq OWNER TO prostatecancer_user;

--
-- Name: nlp_pipeline_intermediate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.nlp_pipeline_intermediate_id_seq OWNED BY public.nlp_pipeline_intermediate.id;


--
-- Name: patient_access; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.patient_access (
    id integer NOT NULL,
    user_id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    access_type character varying(20) DEFAULT 'read'::character varying NOT NULL,
    granted_at timestamp with time zone DEFAULT now(),
    granted_by integer,
    CONSTRAINT patient_access_access_type_check CHECK (((access_type)::text = ANY ((ARRAY['read'::character varying, 'write'::character varying, 'admin'::character varying])::text[])))
);


ALTER TABLE public.patient_access OWNER TO prostatecancer_user;

--
-- Name: patient_access_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.patient_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patient_access_id_seq OWNER TO prostatecancer_user;

--
-- Name: patient_access_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.patient_access_id_seq OWNED BY public.patient_access.id;


--
-- Name: patient_first_behavior; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.patient_first_behavior (
    id integer NOT NULL,
    session_id character varying(100) NOT NULL,
    file character varying(255) NOT NULL,
    speaker character varying(100) NOT NULL,
    event_type character varying(30) NOT NULL,
    domain character varying(50),
    rating smallint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    device_type character varying(20),
    client_timestamp timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_pfb_domain_values CHECK (((domain IS NULL) OR ((domain)::text = ANY ((ARRAY['cp'::character varying, 'le'::character varying, 'ed'::character varying, 'inc'::character varying, 'ius'::character varying])::text[])))),
    CONSTRAINT ck_pfb_event_type CHECK (((event_type)::text = ANY ((ARRAY['page_view'::character varying, 'topic_open'::character varying, 'topic_close'::character varying, 'evidence_open'::character varying, 'evidence_close'::character varying, 'rating_click'::character varying, 'session_end'::character varying])::text[]))),
    CONSTRAINT ck_pfb_rating_range CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
    CONSTRAINT ck_pfb_rating_requires_domain CHECK ((((event_type)::text <> 'rating_click'::text) OR ((rating IS NOT NULL) AND (domain IS NOT NULL)))),
    CONSTRAINT ck_pfb_topic_event_requires_domain CHECK ((((event_type)::text <> ALL ((ARRAY['topic_open'::character varying, 'topic_close'::character varying, 'evidence_open'::character varying, 'evidence_close'::character varying])::text[])) OR (domain IS NOT NULL)))
);


ALTER TABLE public.patient_first_behavior OWNER TO prostatecancer_user;

--
-- Name: patient_first_behavior_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.patient_first_behavior_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patient_first_behavior_id_seq OWNER TO prostatecancer_user;

--
-- Name: patient_first_behavior_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.patient_first_behavior_id_seq OWNED BY public.patient_first_behavior.id;


--
-- Name: patient_followup_survey; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.patient_followup_survey (
    id integer NOT NULL,
    session_id character varying(100) NOT NULL,
    file character varying(255) NOT NULL,
    speaker character varying(100) NOT NULL,
    event_type character varying(30) NOT NULL,
    survey_type character varying(30),
    question_id character varying(50),
    step_number smallint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    device_type character varying(20),
    client_timestamp timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_pfs_event_type CHECK (((event_type)::text = ANY ((ARRAY['page_view'::character varying, 'survey_step_view'::character varying, 'survey_answer'::character varying, 'survey_complete'::character varying, 'session_end'::character varying])::text[]))),
    CONSTRAINT ck_pfs_step_only_for_step_view CHECK (((step_number IS NULL) OR ((event_type)::text = 'survey_step_view'::text))),
    CONSTRAINT ck_pfs_survey_answer_required CHECK ((((event_type)::text <> 'survey_answer'::text) OR ((survey_type IS NOT NULL) AND (question_id IS NOT NULL)))),
    CONSTRAINT ck_pfs_survey_type_values CHECK (((survey_type IS NULL) OR ((survey_type)::text = ANY ((ARRAY['sdm'::character varying, 'dcs'::character varying, 'risk_perception'::character varying, 'satisfaction'::character varying])::text[]))))
);


ALTER TABLE public.patient_followup_survey OWNER TO prostatecancer_user;

--
-- Name: patient_followup_survey_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.patient_followup_survey_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patient_followup_survey_id_seq OWNER TO prostatecancer_user;

--
-- Name: patient_followup_survey_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.patient_followup_survey_id_seq OWNED BY public.patient_followup_survey.id;


--
-- Name: patient_summary; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.patient_summary (
    file character varying(255) NOT NULL,
    speaker character varying(100) NOT NULL
);


ALTER TABLE public.patient_summary OWNER TO prostatecancer_user;

--
-- Name: patient_summary_domain; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.patient_summary_domain (
    file character varying(255) NOT NULL,
    speaker character varying(100) NOT NULL,
    domain character varying(100) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    patient_scoring integer,
    patient_response text,
    CONSTRAINT patient_summary_domain_patient_scoring_check CHECK (((patient_scoring >= 0) AND (patient_scoring <= 10)))
);


ALTER TABLE public.patient_summary_domain OWNER TO prostatecancer_user;

--
-- Name: sentence_prediction; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.sentence_prediction (
    id integer NOT NULL,
    analysis_id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    model character varying(10) NOT NULL,
    sentence_index integer NOT NULL,
    utterance_index integer NOT NULL,
    sentence_in_utterance integer NOT NULL,
    speaker character varying(100),
    sentence_text text,
    pred_score double precision NOT NULL,
    context text
);


ALTER TABLE public.sentence_prediction OWNER TO prostatecancer_user;

--
-- Name: sentence_prediction_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.sentence_prediction_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sentence_prediction_id_seq OWNER TO prostatecancer_user;

--
-- Name: sentence_prediction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.sentence_prediction_id_seq OWNED BY public.sentence_prediction.id;


--
-- Name: session_recording; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.session_recording (
    id integer NOT NULL,
    session_id character varying(100) NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    file character varying(255),
    visit_type character varying(20),
    recording_data bytea,
    event_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    area character varying(20) DEFAULT 'unknown'::character varying NOT NULL,
    CONSTRAINT session_recording_area_check CHECK (((area)::text = ANY ((ARRAY['patient_first'::character varying, 'patient_followup'::character varying, 'doctor'::character varying, 'unknown'::character varying])::text[])))
);


ALTER TABLE public.session_recording OWNER TO prostatecancer_user;

--
-- Name: session_recording_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.session_recording_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.session_recording_id_seq OWNER TO prostatecancer_user;

--
-- Name: session_recording_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.session_recording_id_seq OWNED BY public.session_recording.id;


--
-- Name: survey_submission_log; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.survey_submission_log (
    id integer NOT NULL,
    file character varying(255) NOT NULL,
    speaker character varying(100) NOT NULL,
    survey_type character varying(50) NOT NULL,
    answers jsonb NOT NULL,
    extra_data jsonb,
    submitted_at timestamp with time zone DEFAULT now(),
    redcap_synced boolean DEFAULT false,
    redcap_record_id character varying(255),
    redcap_error text
);


ALTER TABLE public.survey_submission_log OWNER TO prostatecancer_user;

--
-- Name: survey_submission_log_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.survey_submission_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.survey_submission_log_id_seq OWNER TO prostatecancer_user;

--
-- Name: survey_submission_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.survey_submission_log_id_seq OWNED BY public.survey_submission_log.id;


--
-- Name: transcript_analysis_log; Type: TABLE; Schema: public; Owner: prostatecancer_user
--

CREATE TABLE public.transcript_analysis_log (
    id integer NOT NULL,
    patient_id character varying(255) NOT NULL,
    total_sentences integer DEFAULT 0 NOT NULL,
    top_n integer DEFAULT 0 NOT NULL,
    context_window integer DEFAULT 3 NOT NULL,
    model_results jsonb,
    xlsx_data bytea,
    source_filename character varying(500),
    pipeline_started_at timestamp with time zone,
    analyzed_at timestamp with time zone DEFAULT now(),
    ai_overall_score double precision,
    processed boolean DEFAULT false,
    processed_at timestamp with time zone
);


ALTER TABLE public.transcript_analysis_log OWNER TO prostatecancer_user;

--
-- Name: transcript_analysis_log_id_seq; Type: SEQUENCE; Schema: public; Owner: prostatecancer_user
--

CREATE SEQUENCE public.transcript_analysis_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transcript_analysis_log_id_seq OWNER TO prostatecancer_user;

--
-- Name: transcript_analysis_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: prostatecancer_user
--

ALTER SEQUENCE public.transcript_analysis_log_id_seq OWNED BY public.transcript_analysis_log.id;


--
-- Name: auth_api_key id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.auth_api_key ALTER COLUMN id SET DEFAULT nextval('public.auth_api_key_id_seq'::regclass);


--
-- Name: auth_user id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.auth_user ALTER COLUMN id SET DEFAULT nextval('public.auth_user_id_seq'::regclass);


--
-- Name: doctor_behavior id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.doctor_behavior ALTER COLUMN id SET DEFAULT nextval('public.doctor_behavior_id_seq'::regclass);


--
-- Name: llm_domain_scoring_and_summary id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.llm_domain_scoring_and_summary ALTER COLUMN id SET DEFAULT nextval('public.llm_domain_scoring_and_summary_id_seq'::regclass);


--
-- Name: llm_pipeline_intermediate id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.llm_pipeline_intermediate ALTER COLUMN id SET DEFAULT nextval('public.llm_pipeline_intermediate_id_seq'::regclass);


--
-- Name: nlp_all_predictions id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.nlp_all_predictions ALTER COLUMN id SET DEFAULT nextval('public.nlp_all_predictions_id_seq'::regclass);


--
-- Name: nlp_pipeline_intermediate id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.nlp_pipeline_intermediate ALTER COLUMN id SET DEFAULT nextval('public.nlp_pipeline_intermediate_id_seq'::regclass);


--
-- Name: patient_access id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_access ALTER COLUMN id SET DEFAULT nextval('public.patient_access_id_seq'::regclass);


--
-- Name: patient_first_behavior id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_first_behavior ALTER COLUMN id SET DEFAULT nextval('public.patient_first_behavior_id_seq'::regclass);


--
-- Name: patient_followup_survey id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_followup_survey ALTER COLUMN id SET DEFAULT nextval('public.patient_followup_survey_id_seq'::regclass);


--
-- Name: sentence_prediction id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.sentence_prediction ALTER COLUMN id SET DEFAULT nextval('public.sentence_prediction_id_seq'::regclass);


--
-- Name: session_recording id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.session_recording ALTER COLUMN id SET DEFAULT nextval('public.session_recording_id_seq'::regclass);


--
-- Name: survey_submission_log id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.survey_submission_log ALTER COLUMN id SET DEFAULT nextval('public.survey_submission_log_id_seq'::regclass);


--
-- Name: transcript_analysis_log id; Type: DEFAULT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.transcript_analysis_log ALTER COLUMN id SET DEFAULT nextval('public.transcript_analysis_log_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: auth_api_key auth_api_key_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.auth_api_key
    ADD CONSTRAINT auth_api_key_pkey PRIMARY KEY (id);


--
-- Name: auth_user auth_user_email_key; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_email_key UNIQUE (email);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: doctor_behavior doctor_behavior_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.doctor_behavior
    ADD CONSTRAINT doctor_behavior_pkey PRIMARY KEY (id);


--
-- Name: doctor_rewrite_log doctor_rewrite_log_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.doctor_rewrite_log
    ADD CONSTRAINT doctor_rewrite_log_pkey PRIMARY KEY (file, i, i2, "time");


--
-- Name: llm_domain_scoring_and_summary llm_domain_scoring_and_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.llm_domain_scoring_and_summary
    ADD CONSTRAINT llm_domain_scoring_and_summary_pkey PRIMARY KEY (id);


--
-- Name: llm_pipeline_intermediate llm_pipeline_intermediate_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.llm_pipeline_intermediate
    ADD CONSTRAINT llm_pipeline_intermediate_pkey PRIMARY KEY (id);


--
-- Name: nlp_all_predictions nlp_all_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.nlp_all_predictions
    ADD CONSTRAINT nlp_all_predictions_pkey PRIMARY KEY (id);


--
-- Name: nlp_pipeline_intermediate nlp_pipeline_intermediate_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.nlp_pipeline_intermediate
    ADD CONSTRAINT nlp_pipeline_intermediate_pkey PRIMARY KEY (id);


--
-- Name: patient_access patient_access_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_access
    ADD CONSTRAINT patient_access_pkey PRIMARY KEY (id);


--
-- Name: patient_access patient_access_user_id_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_access
    ADD CONSTRAINT patient_access_user_id_patient_id_key UNIQUE (user_id, patient_id);


--
-- Name: patient_first_behavior patient_first_behavior_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_first_behavior
    ADD CONSTRAINT patient_first_behavior_pkey PRIMARY KEY (id);


--
-- Name: patient_followup_survey patient_followup_survey_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_followup_survey
    ADD CONSTRAINT patient_followup_survey_pkey PRIMARY KEY (id);


--
-- Name: patient_summary_domain patient_summary_domain_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_summary_domain
    ADD CONSTRAINT patient_summary_domain_pkey PRIMARY KEY (file, speaker, domain);


--
-- Name: patient_summary patient_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_summary
    ADD CONSTRAINT patient_summary_pkey PRIMARY KEY (file, speaker);


--
-- Name: sentence_prediction sentence_prediction_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.sentence_prediction
    ADD CONSTRAINT sentence_prediction_pkey PRIMARY KEY (id);


--
-- Name: session_recording session_recording_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.session_recording
    ADD CONSTRAINT session_recording_pkey PRIMARY KEY (id);


--
-- Name: survey_submission_log survey_submission_log_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.survey_submission_log
    ADD CONSTRAINT survey_submission_log_pkey PRIMARY KEY (id);


--
-- Name: transcript_analysis_log transcript_analysis_log_pkey; Type: CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.transcript_analysis_log
    ADD CONSTRAINT transcript_analysis_log_pkey PRIMARY KEY (id);


--
-- Name: idx_auth_api_key_hash; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_auth_api_key_hash ON public.auth_api_key USING btree (key_hash);


--
-- Name: idx_auth_api_key_user; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_auth_api_key_user ON public.auth_api_key USING btree (user_id);


--
-- Name: idx_auth_user_username; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_auth_user_username ON public.auth_user USING btree (username);


--
-- Name: idx_doc_session; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_doc_session ON public.doctor_behavior USING btree (session_id);


--
-- Name: idx_doc_speaker_event; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_doc_speaker_event ON public.doctor_behavior USING btree (speaker, event_type);


--
-- Name: idx_doc_timestamp; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_doc_timestamp ON public.doctor_behavior USING btree (client_timestamp DESC);


--
-- Name: idx_doctor_rewrite_file; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_doctor_rewrite_file ON public.doctor_rewrite_log USING btree (file);


--
-- Name: idx_llm_dss_analysis; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_llm_dss_analysis ON public.llm_domain_scoring_and_summary USING btree (analysis_id);


--
-- Name: idx_llm_dss_patient_domain; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_llm_dss_patient_domain ON public.llm_domain_scoring_and_summary USING btree (patient_id, domain);


--
-- Name: idx_lpi_analysis; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_lpi_analysis ON public.llm_pipeline_intermediate USING btree (analysis_id);


--
-- Name: idx_lpi_patient_domain; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_lpi_patient_domain ON public.llm_pipeline_intermediate USING btree (patient_id, domain);


--
-- Name: idx_nap_analysis; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_nap_analysis ON public.nlp_all_predictions USING btree (analysis_id);


--
-- Name: idx_nap_patient; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_nap_patient ON public.nlp_all_predictions USING btree (patient_id);


--
-- Name: idx_npi_analysis_step; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_npi_analysis_step ON public.nlp_pipeline_intermediate USING btree (analysis_id, step);


--
-- Name: idx_patient_access_patient; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_patient_access_patient ON public.patient_access USING btree (patient_id);


--
-- Name: idx_patient_access_user; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_patient_access_user ON public.patient_access USING btree (user_id);


--
-- Name: idx_patient_domain_file; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_patient_domain_file ON public.patient_summary_domain USING btree (file);


--
-- Name: idx_patient_domain_order; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_patient_domain_order ON public.patient_summary_domain USING btree (file, speaker, display_order);


--
-- Name: idx_patient_summary_file; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_patient_summary_file ON public.patient_summary USING btree (file);


--
-- Name: idx_pfb_file_event; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_pfb_file_event ON public.patient_first_behavior USING btree (file, event_type);


--
-- Name: idx_pfb_session; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_pfb_session ON public.patient_first_behavior USING btree (session_id);


--
-- Name: idx_pfb_timestamp; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_pfb_timestamp ON public.patient_first_behavior USING btree (client_timestamp DESC);


--
-- Name: idx_pfs_file_survey; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_pfs_file_survey ON public.patient_followup_survey USING btree (file, survey_type);


--
-- Name: idx_pfs_session; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_pfs_session ON public.patient_followup_survey USING btree (session_id);


--
-- Name: idx_pfs_timestamp; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_pfs_timestamp ON public.patient_followup_survey USING btree (client_timestamp DESC);


--
-- Name: idx_sp_analysis_model; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_sp_analysis_model ON public.sentence_prediction USING btree (analysis_id, model);


--
-- Name: idx_sp_patient_model; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_sp_patient_model ON public.sentence_prediction USING btree (patient_id, model);


--
-- Name: idx_sp_pred_score; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_sp_pred_score ON public.sentence_prediction USING btree (pred_score DESC);


--
-- Name: idx_sr_area_file; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_sr_area_file ON public.session_recording USING btree (area, file);


--
-- Name: idx_sr_session_id; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_sr_session_id ON public.session_recording USING btree (session_id);


--
-- Name: idx_survey_file_submitted; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_survey_file_submitted ON public.survey_submission_log USING btree (file, submitted_at DESC);


--
-- Name: idx_survey_redcap_pending; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_survey_redcap_pending ON public.survey_submission_log USING btree (id) WHERE (redcap_synced = false);


--
-- Name: idx_survey_speaker_submitted; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_survey_speaker_submitted ON public.survey_submission_log USING btree (speaker, submitted_at DESC);


--
-- Name: idx_survey_submission_file; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_survey_submission_file ON public.survey_submission_log USING btree (file);


--
-- Name: idx_survey_submission_speaker; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_survey_submission_speaker ON public.survey_submission_log USING btree (speaker);


--
-- Name: idx_survey_submission_type; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_survey_submission_type ON public.survey_submission_log USING btree (survey_type);


--
-- Name: idx_transcript_log_analyzed_at; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_transcript_log_analyzed_at ON public.transcript_analysis_log USING btree (analyzed_at);


--
-- Name: idx_transcript_log_history; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_transcript_log_history ON public.transcript_analysis_log USING btree (patient_id, analyzed_at DESC) INCLUDE (id, total_sentences, top_n, context_window, source_filename);


--
-- Name: idx_transcript_log_patient_analyzed; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_transcript_log_patient_analyzed ON public.transcript_analysis_log USING btree (patient_id, analyzed_at DESC);


--
-- Name: idx_transcript_log_patient_xlsx; Type: INDEX; Schema: public; Owner: prostatecancer_user
--

CREATE INDEX idx_transcript_log_patient_xlsx ON public.transcript_analysis_log USING btree (patient_id, analyzed_at DESC) WHERE (xlsx_data IS NOT NULL);


--
-- Name: auth_api_key auth_api_key_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.auth_api_key
    ADD CONSTRAINT auth_api_key_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: patient_summary_domain fk_domain_to_summary; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_summary_domain
    ADD CONSTRAINT fk_domain_to_summary FOREIGN KEY (file, speaker) REFERENCES public.patient_summary(file, speaker) ON DELETE CASCADE;


--
-- Name: survey_submission_log fk_survey_to_patient_summary; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.survey_submission_log
    ADD CONSTRAINT fk_survey_to_patient_summary FOREIGN KEY (file, speaker) REFERENCES public.patient_summary(file, speaker) ON DELETE CASCADE;


--
-- Name: llm_domain_scoring_and_summary llm_domain_scoring_and_summary_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.llm_domain_scoring_and_summary
    ADD CONSTRAINT llm_domain_scoring_and_summary_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.transcript_analysis_log(id) ON DELETE CASCADE;


--
-- Name: llm_pipeline_intermediate llm_pipeline_intermediate_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.llm_pipeline_intermediate
    ADD CONSTRAINT llm_pipeline_intermediate_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.transcript_analysis_log(id) ON DELETE CASCADE;


--
-- Name: nlp_all_predictions nlp_all_predictions_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.nlp_all_predictions
    ADD CONSTRAINT nlp_all_predictions_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.transcript_analysis_log(id) ON DELETE CASCADE;


--
-- Name: nlp_pipeline_intermediate nlp_pipeline_intermediate_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.nlp_pipeline_intermediate
    ADD CONSTRAINT nlp_pipeline_intermediate_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.transcript_analysis_log(id) ON DELETE CASCADE;


--
-- Name: patient_access patient_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_access
    ADD CONSTRAINT patient_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.auth_user(id);


--
-- Name: patient_access patient_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.patient_access
    ADD CONSTRAINT patient_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_user(id) ON DELETE CASCADE;


--
-- Name: sentence_prediction sentence_prediction_analysis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: prostatecancer_user
--

ALTER TABLE ONLY public.sentence_prediction
    ADD CONSTRAINT sentence_prediction_analysis_id_fkey FOREIGN KEY (analysis_id) REFERENCES public.transcript_analysis_log(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict kcWxmWxrcTZ1uuHFdYUP5a2PD4x73owCUiQKd28bBQeXtflEbbCyc41JuB8e3oe

