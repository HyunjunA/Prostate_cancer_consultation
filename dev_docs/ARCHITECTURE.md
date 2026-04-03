# System Architecture — Prostate Cancer Consultation Dashboard

> **Version:** 3.0 — 2026-04-02  
> **Status:** Production-ready (research deployment)  
> **Stack:** FastAPI · Next.js · PostgreSQL · Redis · R plumber · Docker Compose

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser["🌐 Browser<br/>(Patient / Physician)"]
    end

    subgraph Proxy["Reverse Proxy"]
        Nginx["Nginx<br/>:3001 → :80"]
    end

    subgraph Frontend["Frontend"]
        Webapp["Next.js (React)<br/>Express Server<br/>:3000"]
    end

    subgraph Backend["Backend API"]
        FastAPI["FastAPI + Gunicorn<br/>3 Workers<br/>:8000"]
    end

    subgraph AI["AI Services"]
        NLP1["NLP Classifier<br/>R plumber #1"]
        NLP2["NLP Classifier<br/>R plumber #2"]
        NLP3["NLP Classifier<br/>R plumber #3"]
        Scorer["Consultation Scorer<br/>Step 8 — :8001"]
        Rewriter["Summary Rewriter<br/>Step 9 — :8002"]
    end

    subgraph Data["Data Layer"]
        PG["PostgreSQL 13<br/>12 tables<br/>:5432"]
        Redis["Redis 7<br/>Cache + Rate Limit<br/>:6379"]
    end

    Browser -->|HTTPS| Nginx
    Nginx -->|/api/*| FastAPI
    Nginx -->|/*| Webapp
    FastAPI -->|HTTP JSON| NLP1 & NLP2 & NLP3
    FastAPI -->|HTTP JSON| Scorer
    FastAPI -->|HTTP JSON| Rewriter
    FastAPI -->|asyncpg| PG
    FastAPI -->|redis.asyncio| Redis

    style Client fill:#e1f5fe
    style Proxy fill:#fff3e0
    style Frontend fill:#e8f5e9
    style Backend fill:#fce4ec
    style AI fill:#f3e5f5
    style Data fill:#fff9c4
```

---

## 2. Docker Service Topology

```mermaid
graph LR
    subgraph Network["prostatecancer-network (bridge)"]
        direction TB

        subgraph External["External Ports (localhost only)"]
            NGX["nginx<br/>127.0.0.1:3001→80"]
            BE["backend<br/>127.0.0.1:8000→8000"]
            DB["postgres<br/>127.0.0.1:5433→5432"]
        end

        subgraph Internal["Internal Only"]
            WA["webapp :3000"]
            RD["redis :6379"]
            SC["scorer :8001"]
            RW["rewriter :8002"]
            NLP1["nlp-1 :8000"]
            NLP2["nlp-2 :8000"]
            NLP3["nlp-3 :8000"]
        end
    end

    NGX -->|proxy_pass| WA
    NGX -->|proxy_pass /api| BE
    BE -->|depends_on| DB
    BE -->|depends_on| RD
    BE -->|depends_on| NLP1 & NLP2 & NLP3
    BE -->|depends_on| SC
    BE -->|depends_on| RW
    WA -->|depends_on| BE
    NGX -->|depends_on| WA

    style External fill:#ffebee
    style Internal fill:#e8eaf6
```

### Service Resource Limits

| Service | Image | Memory | CPU | Replicas | Healthcheck |
|---------|-------|--------|-----|----------|-------------|
| postgres | postgres:13 | 512M | 1.0 | 1 | pg_isready 15s |
| redis | redis:7 | 256M | 0.5 | 1 | redis-cli ping 5s |
| nlp-classifiers | r01-nlp-classifiers | 2G | — | **3** | Rscript /ping 15s |
| backend | Python 3.10-slim | 1G | 2.0 | 1 | curl /health 15s |
| consultation-scorer | Python 3.10-slim | 256M | 0.5 | 1 | urllib /ping 10s |
| patient-summary-rewriter | Python 3.10-slim | 256M | 0.5 | 1 | urllib /ping 10s |
| webapp | Node 18-alpine | — | — | 1 | wget / 15s |
| nginx | nginx:alpine | — | — | 1 | curl /nginx-health 15s |

---

## 3. Data Flow — Full Pipeline

```mermaid
flowchart TD
    subgraph Input["📂 Input"]
        TX["Transcript .xlsx files<br/>(speaker + text columns)"]
    end

    subgraph Pipeline["🔬 Pipeline Runner (pipeline_runner.py)"]
        S1["Step 1: Read Transcript<br/>Extract patient_id from filename"]
        S2["Step 2: Identify Doctor<br/>Speaker with most text = doctor<br/>(Ivan's dynamic rule)"]
        S3["Step 3: Split Sentences<br/>Regex tokenizer → index, i, i2"]
        S4["Step 4: NLP Prediction<br/>5 models × asyncio.gather<br/>cp, le, ed, inc, ius"]
        S5["Step 5: Select Top-N<br/>Top 10 per domain by .pred_1"]
        S6["Step 6: Generate Context<br/>±3 sentences with ⟨main⟩ tags"]
        S7["Step 7: Export xlsx<br/>5 sheets (cp, inc, ed, ius, le)"]
        S8["Step 8: Score Sentences<br/>consultation-scorer → 0-5"]
        S9["Step 9: Rewrite Summary<br/>patient-summary-rewriter"]
    end

    subgraph DB["🗄️ PostgreSQL"]
        DSV["doctor_sentence_view<br/>sentence + score(0-5) + class"]
        SP["sentence_prediction<br/>pred_score(0-1) × 5 domains"]
        TAL["transcript_analysis_log<br/>run metadata + xlsx binary"]
        PS["patient_summary<br/>5 domain AI summaries"]
        PSS["patient_summary_scoring<br/>NIH PROMIS 1-5 ratings"]
        PR["patient_responses<br/>free-text answers"]
    end

    TX --> S1 --> S2 --> S3 --> S4
    S4 --> S5 --> S6 --> S7
    S4 --> S8
    S5 --> S9
    S7 -->|xlsx_data| TAL
    S8 -->|score 0-5| DSV
    S4 -->|.pred_1| SP
    S9 -->|summary text| PS
    PS -.->|FK| PSS
    PS -.->|FK| PR

    style Input fill:#e3f2fd
    style Pipeline fill:#f1f8e9
    style DB fill:#fff8e1
```

---

## 4. Database ER Diagram

```mermaid
erDiagram
    doctor_sentence_view {
        varchar file PK
        int i PK
        int i2 PK
        varchar speaker
        text sentence
        float score "0-5 quality"
        varchar class "domain name"
        timestamptz time
    }

    doctor_rewrite_log {
        varchar file PK-FK
        int i PK-FK
        int i2 PK-FK
        timestamptz time PK
        text original_sentence
        text revised_sentence
        float score
        varchar class
    }

    patient_summary {
        varchar file PK
        varchar speaker PK
        text entire_summary
        varchar class_1
        text summary_class_1
        varchar class_2
        text summary_class_2
        varchar class_3
        text summary_class_3
        varchar class_4
        text summary_class_4
        varchar class_5
        text summary_class_5
    }

    patient_summary_scoring {
        varchar file PK-FK
        varchar speaker PK-FK
        int class_1_patient_scoring "0-10"
        int class_2_patient_scoring
        int class_3_patient_scoring
        int class_4_patient_scoring
        int class_5_patient_scoring
    }

    patient_responses {
        varchar file PK-FK
        varchar speaker PK-FK
        text answer_1
        text answer_2
        text answer_3
        text answer_4
        text answer_5
    }

    survey_submission_log {
        serial id PK
        varchar file FK
        varchar speaker FK
        varchar survey_type
        jsonb answers
        jsonb extra_data
        timestamptz submitted_at
        boolean redcap_synced
    }

    transcript_analysis_log {
        serial id PK
        varchar patient_id
        int total_sentences
        int top_n
        int context_window
        jsonb model_results "deprecated"
        bytea xlsx_data
        varchar source_filename
        timestamptz analyzed_at
    }

    sentence_prediction {
        serial id PK
        int analysis_id FK
        varchar patient_id
        varchar model "cp le ed inc ius"
        int sentence_index
        float pred_score "0.0-1.0"
        text context
    }

    user_interaction_log {
        serial id PK
        varchar session_id
        varchar role "patient/physician"
        varchar file
        varchar event_type
        jsonb event_data
        timestamptz client_timestamp
    }

    auth_user {
        serial id PK
        varchar username
        varchar email UK
        varchar role "admin/user/readonly"
        boolean is_active
    }

    auth_api_key {
        serial id PK
        int user_id FK
        varchar key_hash
        boolean is_active
        timestamptz expires_at
    }

    patient_access {
        serial id PK
        int user_id FK
        varchar patient_id
        varchar access_type "read/write/admin"
    }

    doctor_sentence_view ||--o{ doctor_rewrite_log : "1:N CASCADE"
    patient_summary ||--|| patient_summary_scoring : "1:1 CASCADE"
    patient_summary ||--|| patient_responses : "1:1 CASCADE"
    patient_summary ||--o{ survey_submission_log : "1:N CASCADE"
    transcript_analysis_log ||--o{ sentence_prediction : "1:N CASCADE"
    auth_user ||--o{ auth_api_key : "1:N CASCADE"
    auth_user ||--o{ patient_access : "1:N CASCADE"
```

---

## 5. API Endpoint Map

```mermaid
graph LR
    subgraph System["System (3)"]
        R["/"]
        H["/health"]
        RD["/ready"]
    end

    subgraph Doctor["Doctor Interface (17)"]
        DS["/api/doctor/sentences/{file}/{speaker}"]
        DR["/api/doctor/rewrites"]
        DRH["/api/doctor/rewrites/{file}/{i}/{i2}/history"]
        DRK["/api/doctor/rewrites/{file}/{i}/{i2}/{class}"]
        DRS["/api/doctor/rewrites/stats"]
        DF["/api/doctor/files"]
        DSA["/api/doctor/scores/average"]
        DSS["/api/doctor/scores/summary/{file}/{speaker}"]
        DST["/api/doctor/scores/trajectory"]
        DCD["/api/doctor/class-distribution"]
        DAR["/api/doctor/ai-rewrite"]
        DIS["/api/doctor/improvement-suggestions"]
    end

    subgraph Patient["Patient Interface (10)"]
        PSM["/api/patient/summaries"]
        PSD["/api/patient/summaries/{file}/{speaker}"]
        PSC["/api/patient/scoring"]
        PPR["/api/patient/responses"]
        PPF["/api/patient/files"]
        PPS["/api/patient/sentences/{file}"]
        PDB["/api/stats/dashboard"]
    end

    subgraph Transcript["Transcript (6)"]
        TA["/api/transcript/analyze"]
        TAB["/api/transcript/analyze-batch"]
        TD["/api/transcript/download/{id}"]
        TDB["/api/transcript/download-batch"]
        TH["/api/transcript/history/{id}"]
        TP["/api/transcript/predictions/{id}"]
    end

    subgraph NLP["NLP Proxy (6)"]
        NH["/api/nlp/health"]
        NP["/api/nlp/predict"]
        NPB["/api/nlp/predict/batch"]
        NPC["/api/nlp/predict/by-class"]
        NPA["/api/nlp/predict/all"]
        NM["/api/nlp/models"]
    end

    subgraph Survey["Surveys (14)"]
        SS["/api/surveys/submit"]
        SSB["/api/surveys/submissions"]
        SST["/api/surveys/by-type/{type}"]
        SSP["/api/surveys/by-speaker/{speaker}"]
        SSF["/api/surveys/by-file/{file}"]
        SRC["/api/surveys/redcap/*"]
    end

    subgraph Tracking["Tracking (5)"]
        TE["/api/tracking/events"]
        TS["/api/tracking/stats"]
        TPT["/api/tracking/patients"]
        TAN["/api/tracking/analytics"]
    end

    subgraph Auth["Auth Admin (14)"]
        AU["/api/auth/users"]
        AK["/api/auth/users/{id}/api-keys"]
        AP["/api/auth/users/{id}/patient-access"]
    end

    style System fill:#e0e0e0
    style Doctor fill:#bbdefb
    style Patient fill:#c8e6c9
    style Transcript fill:#ffe0b2
    style NLP fill:#e1bee7
    style Survey fill:#f8bbd0
    style Tracking fill:#b2ebf2
    style Auth fill:#d7ccc8
```

---

## 6. NLP Model Architecture

```mermaid
flowchart LR
    subgraph Input["Input"]
        TXT["Sentence Text<br/>(lowercased)"]
    end

    subgraph Preprocessing["R textrecipes"]
        TOK["Tokenization"]
        STEM["SnowballC<br/>Stemming"]
        STOP["Stopword<br/>Removal"]
        TFIDF["TF-IDF<br/>Vectorization"]
    end

    subgraph Models["5 Random Forest Models (ranger)"]
        CP["cp<br/>Cancer Prognosis<br/>2.7MB"]
        LE["le<br/>Life Expectancy<br/>1.1MB"]
        ED["ed<br/>Erectile Dysfunction<br/>2.2MB"]
        INC["inc<br/>Continence<br/>2.8MB"]
        IUS["ius<br/>Irritative Urinary<br/>2.4MB"]
    end

    subgraph Output["Output"]
        P1[".pred_1<br/>Probability 0.0-1.0"]
        P0[".pred_0<br/>1 - pred_1"]
    end

    TXT --> TOK --> STEM --> STOP --> TFIDF
    TFIDF --> CP & LE & ED & INC & IUS
    CP & LE & ED & INC & IUS --> P1 & P0

    style Input fill:#e3f2fd
    style Preprocessing fill:#f3e5f5
    style Models fill:#fff3e0
    style Output fill:#e8f5e9
```

### Model Serving Flow

```mermaid
sequenceDiagram
    participant B as Backend (FastAPI)
    participant C as Redis Cache
    participant N as NLP Docker ×3

    B->>C: Check cache (sha256 hash)
    alt Cache Hit
        C-->>B: Return cached result
    else Cache Miss
        B->>N: POST /predict/{model} [{"text": "..."}]
        Note over N: R plumber → vetiver → ranger
        N-->>B: [{"pred_1": 0.92, "pred_0": 0.08}]
        B->>C: Store result (TTL 1h)
    end
```

---

## 7. Frontend Page Architecture

```mermaid
flowchart TD
    subgraph App["Next.js App Router"]
        Layout["layout.tsx<br/>Dark mode, Providers"]
        Page["page.tsx<br/>URL param routing"]
        Admin["admin/tracking/page.tsx"]
    end

    subgraph Views["View Selection (URL params)"]
        V1["?visit=first<br/>Patient First Visit"]
        V2["?visit=followup<br/>Patient Follow-Up"]
        V3["?doctorid=auto<br/>Doctor Demo"]
    end

    subgraph Patient1["Patient First Visit"]
        PV1["PatientInitialVisitReportV35"]
        AI1["AI Summary Cards ×5"]
        EV1["Evidence Sentences"]
        RT1["Star Ratings (1-5)"]
    end

    subgraph Patient2["Patient Follow-Up"]
        PV2["PatientFollowUpReportV31Re"]
        SDM["SDM Survey"]
        DCS["DCS Survey"]
        RISK["Risk Perception"]
        SAT["Satisfaction"]
    end

    subgraph Doctor["Doctor Demo"]
        PV3["PhysicianReportsModifiedV41Timothy"]
        DASH["Dashboard View<br/>All patients overview"]
        GRID["Grid View<br/>5 topics × scores"]
        DET["Detail View<br/>Sentences + Rewrite"]
    end

    Page --> V1 & V2 & V3
    V1 --> PV1
    V2 --> PV2
    V3 --> PV3
    PV1 --> AI1 & EV1 & RT1
    PV2 --> SDM & DCS & RISK & SAT
    PV3 --> DASH --> GRID --> DET

    style App fill:#e8f5e9
    style Views fill:#e3f2fd
    style Patient1 fill:#c8e6c9
    style Patient2 fill:#b2dfdb
    style Doctor fill:#bbdefb
```

---

## 8. Deployment Flow

```mermaid
flowchart TD
    subgraph Start["run_all.sh"]
        S1["Step 1: Load NLP Docker Image<br/>(OCI archive → docker load)"]
        S2["Step 2: docker compose up -d --build<br/>Build 4 images + start 10 containers"]
        S3["Step 3: Wait for Healthchecks<br/>Poll 5s intervals, max 300s"]
        S4["Step 4: NLP 5-Model Test<br/>8 sentences × 5 models"]
        S5["Step 5: Stress Test<br/>1000 requests, 20 concurrent"]
        S6["Step 6: Final Status"]
    end

    subgraph Startup["Backend Startup (prestart.sh)"]
        PS1["wait_for_db.py"]
        PS2["init_db.py<br/>Create tables (idempotent)"]
        PS3["Alembic stamp + upgrade"]
        PS4["pipeline_runner.py<br/>Process real transcripts"]
        PS5["Gunicorn start<br/>3 uvicorn workers"]
    end

    subgraph PipelineDetail["pipeline_runner.py"]
        PR1["Read *.xlsx from /app/data/transcripts/"]
        PR2["For each file:<br/>Steps 1-9 → DB INSERT"]
        PR3["Skip if already in DB"]
    end

    S1 --> S2 --> S3 --> S4 --> S5 --> S6
    S2 -.->|triggers| PS1
    PS1 --> PS2 --> PS3 --> PS4 --> PS5
    PS4 -.-> PipelineDetail

    style Start fill:#fff3e0
    style Startup fill:#fce4ec
    style PipelineDetail fill:#f3e5f5
```

---

## 9. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Next.js | 13.5.6 | React SSR/SSG framework |
| | React | 18.x | UI components |
| | Tailwind CSS | 3.x | Utility-first styling |
| | Zustand | 5.x | State management (8 stores) |
| | Recharts | 2.x | Dashboard charts |
| | D3.js | 7.x | Data visualization |
| **Backend** | FastAPI | 0.135.1 | Async REST API |
| | Gunicorn | 25.1.0 | WSGI/ASGI server |
| | SQLAlchemy | 2.0.48 | Async ORM |
| | Alembic | 1.18.4 | DB migrations |
| | Pydantic | 2.12.5 | Request/response validation |
| | httpx | 0.28.1 | Async HTTP client |
| **NLP Models** | R | 4.5.1 | Model runtime |
| | tidymodels / ranger | — | Random Forest classification |
| | vetiver / plumber | — | Model serving API |
| | textrecipes | — | TF-IDF, stemming, stopwords |
| **Database** | PostgreSQL | 13 | Primary data store |
| | Redis | 7 | Cache + rate limiting |
| **Infrastructure** | Docker Compose | 3.8 | Container orchestration |
| | Nginx | alpine | Reverse proxy |

---

## 10. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Dynamic doctor identification** (text length) | Ivan's rule — no hardcoded speaker IDs; works with any transcript format |
| **5 NLP models in parallel** (asyncio.gather) | ~5× speedup over sequential; verified bit-identical results |
| **JSONB for JSON columns** | Auto-validation, field-level queries, smaller storage vs TEXT |
| **Separate scorer/rewriter services** | Step 8/9 are Guillermo's — isolated containers allow independent replacement |
| **pipeline_runner.py** (no fake CSV) | Real transcripts → NLP → scorer → rewriter → DB directly |
| **file_details in /api/doctor/files** | Dynamic speaker per file — frontend auto-detects, no hardcoding |
| **Alembic for migrations** | Schema versioning for production; DDL for initial creation |
| **Multi-stage Docker build** | Builder installs deps → runtime copies only binaries (428MB backend) |
| **Redis caching with TTL** | NLP predictions cached 1h; same text+model returns instantly |
| **Covering indexes** | History endpoint: index-only scan, no heap access |

---

## 11. Clinical Domain Mapping

```mermaid
graph TD
    subgraph Domains["5 Clinical Domains"]
        CP["🔬 Cancer Prognosis<br/>cp — class 1"]
        LE["⏳ Life Expectancy<br/>le — class 2"]
        ED["🩺 Erectile Dysfunction<br/>ed — class 3"]
        INC["💧 Urinary Incontinence<br/>inc — class 4"]
        IUS["⚡ Irritative Urinary Symptoms<br/>ius — class 5"]
    end

    subgraph Scores["Scoring"]
        PRED[".pred_1 (0.0-1.0)<br/>NLP relevance probability<br/>→ sentence_prediction.pred_score"]
        QUAL["Quality Score (0-5)<br/>Consultation quality<br/>→ doctor_sentence_view.score"]
    end

    subgraph Outputs["Dashboard Output"]
        DOC["Physician Dashboard<br/>Sentences + scores + rewrite tool"]
        PAT["Patient First Visit<br/>AI summary cards + star ratings"]
        FU["Patient Follow-Up<br/>4 validated surveys"]
    end

    CP & LE & ED & INC & IUS --> PRED
    CP & LE & ED & INC & IUS --> QUAL
    PRED --> DOC
    QUAL --> DOC
    PRED --> PAT
    QUAL --> PAT
    PAT --> FU

    style Domains fill:#e8eaf6
    style Scores fill:#fff8e1
    style Outputs fill:#e8f5e9
```

---

## 12. Security Architecture

```mermaid
flowchart LR
    subgraph Auth["Authentication"]
        AK["X-API-Key Header<br/>(current mode)"]
        JWT["JWT Bearer Token<br/>(available)"]
        OAuth["OAuth2<br/>(available)"]
        MK["Multi-Key DB<br/>(available)"]
    end

    subgraph Access["Access Control"]
        PA["patient_access table<br/>user_id + patient_id"]
        ROLE["role CHECK<br/>admin / user / readonly"]
    end

    subgraph Security["Security Measures"]
        CORS["CORS whitelist<br/>localhost:3000,3001"]
        RL["Rate Limiting<br/>30 req/min tracking"]
        BIND["Port binding<br/>127.0.0.1 only"]
        HMAC["hmac.compare_digest<br/>timing-attack safe"]
        PTR["Path traversal<br/>regex + resolve()"]
    end

    AK -->|default| Access
    JWT -.->|switchable| Access
    OAuth -.->|switchable| Access
    Access --> Security

    style Auth fill:#ffebee
    style Access fill:#fce4ec
    style Security fill:#f3e5f5
```

---

*Generated: 2026-04-02 | 29 commits | 10 Docker services | 12 DB tables | 75 API endpoints*
