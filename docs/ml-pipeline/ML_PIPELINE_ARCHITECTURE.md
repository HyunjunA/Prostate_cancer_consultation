# ML Pipeline Architecture

### Pipeline Architecture Design

> Original requirements and architecture design document
>
> Last updated: 2026-02-10

---

### Original Requirements (English)

> Please add to the pipeline a module **"File Management"** — there is everything to fetch files, prepare them for processing and archive processed files. Then a module **"Process Manager"** that takes the input, calls the AI modules one by one, in this case, only Michael's for now. And another module **"State Manager"** — this one will eventually insert and read from the database. The main pipeline will be calling these modules.

---

### Requirements Interpretation

This is a design proposal to structure the pipeline as **3 independent modules + 1 main Orchestrator**.

Each module is responsible for a single role only (Separation of Concerns), and the main pipeline calls them in order.

---

### Detailed Module Descriptions

#### Module 1: File Management

> *"everything to fetch files, prepare them for processing and archive processed files"*

**Role:** Manage the entire lifecycle of files

| Function | Description | Meaning in Our Project |
|----------|-------------|------------------------|
| **Fetch** | Find files to process from a specified directory | Search for TurboScribe CSV files like `SID 33 (8).csv` in `prostate_cancer_R01_raw_transcripts_Ella/` |
| **Prepare** | Convert files into a format that AI modules can process | TurboScribe → NLP input format (Speaker 1→Interviewer, remove timestamps, split sentences) |
| **Archive** | Move/copy completed files to a separate location | Move processed CSVs to `processed/` folder to prevent duplicate processing |

**Key point:** This module does not understand the content of the data. It is only responsible for finding files, formatting them, and organizing them.

---

#### Module 2: Process Manager

> *"takes the input, calls the AI modules one by one, in this case, only Michael's for now"*

**Role:** Receive preprocessed data and execute AI modules sequentially

| Function | Description | Meaning in Our Project |
|----------|-------------|------------------------|
| **Receive Input** | Receive data prepared by File Management | Preprocessed list of Interviewer sentences |
| **Call AI Modules** | Execute registered AI modules one by one in order | Call Michael's NLP classifier 5 models (`cp`, `le`, `ed`, `inc`, `ius`) |
| **Collect Results** | Gather and return outputs from each AI module | Prediction probabilities per model + Top sentence selection + Context generation |

**What "only Michael's for now" means:**

Currently the only registered AI module is Michael's NLP classifier, but this architecture is **designed with extensibility in mind**.

```
Current: Input → [Michael's NLP Classifier] → Output

Future:  Input → [Michael's NLP Classifier]
               → [Summary Generation Module]
               → [Sentiment Analysis Module]
               → [Other AI Modules]         → Output (combined)
```

Process Manager manages AI modules **like plugins**, so when adding a new module, you only need to register it without modifying existing code.

---

#### Module 3: State Manager

> *"this one will eventually insert and read from the database"*

**Role:** Database read/write and processing state tracking

| Function | Description | Meaning in Our Project |
|----------|-------------|------------------------|
| **DB Write** | Save AI processing results to the database | INSERT NLP classification results into PostgreSQL `sentence_prediction`, etc. |
| **DB Read** | Query existing data | Query already-processed patient lists, existing scores, etc. |
| **State Tracking** | Manage pipeline execution history | Record which files were processed when, and whether they succeeded or failed |

**What "eventually" means:**

This module will be **implemented incrementally**.

```
Phase 1 (immediate): Save results as Excel files (without DB integration)
Phase 2 (later):     Save results to PostgreSQL DB
Phase 3 (final):     Real-time integration with the dashboard app
```

---

#### Main Pipeline (Orchestrator)

> *"The main pipeline will be calling these modules"*

**Role:** Call the 3 modules in the correct order to execute the entire workflow

```
Main Pipeline Execution Flow:

    1. File Management.fetch()
       → Get list of unprocessed CSV files from input directory

    2. File Management.prepare(file)
       → Convert each file to NLP input format

    3. Process Manager.run(prepared_data)
       → Send sentences to Michael's 5 NLP models for classification
       → (Future: also run additional AI modules sequentially)

    4. State Manager.save(results)
       → Save classification results to DB or Excel

    5. File Management.archive(file)
       → Move completed source file to archive folder
```

---

### Architecture Diagram

```
prostate_cancer_R01_raw_transcripts_Ella/             NLP Docker API              Dashboard DB
   SID 33 (8).csv              (r01-nlp-classifiers)          (PostgreSQL)
        │                              │                            │
        ▼                              ▼                            ▼
┌──────────────────┐  data  ┌───────────────────┐  results  ┌──────────────────┐
│  File Management │ ─────→ │  Process Manager  │ ────────→ │  State Manager   │
│                  │        │                   │           │                  │
│  - fetch()       │        │  - run()          │           │  - save()        │
│  - prepare()     │        │  - AI module mgmt │           │  - load()        │
│  - archive()     │        │  - Current: NLP   │           │  - track_status()│
│                  │        │  - Future: extend │           │  - Current: Excel│
│                  │        │                   │           │  - Future: DB    │
└──────────────────┘        └───────────────────┘           └──────────────────┘
         ▲                          ▲                              ▲
         │                          │                              │
         └──────────────── Main Pipeline ──────────────────────────┘
                        (Orchestrator)
```

---

### Data Flow Between Modules (Concrete Example)

Using the processing of patient SID 33's consultation recording as an example:

```
1. File Management.fetch("prostate_cancer_R01_raw_transcripts_Ella/")
   └─→ Returns ["SID 33 (8).csv"]

2. File Management.prepare("SID 33 (8).csv")
   └─→ {
         "patient_id": "sid-33",
         "sentences": [
           {"i": 1, "i2": 1, "speaker": "Interviewer", "text": "Yeah, great doctor."},
           {"i": 1, "i2": 2, "speaker": "Interviewer", "text": "His name is Dr. Timothy Daskovich."},
           ...
         ]
       }

3. Process Manager.run(prepared_data)
   └─→ Michael's NLP Classifier:
       ├─ /predict/cp  → [0.12, 0.85, 0.03, ...]
       ├─ /predict/le  → [0.05, 0.23, 0.01, ...]
       ├─ /predict/ed  → [0.02, 0.04, 0.91, ...]
       ├─ /predict/inc → [0.01, 0.03, 0.02, ...]
       └─ /predict/ius → [0.03, 0.07, 0.04, ...]
       └─→ Top 5 sentence selection + Context generation

4. State Manager.save(results)
   └─→ original-study-physician-predictions-sid-33.xlsx (5 sheets)

5. File Management.archive("SID 33 (8).csv")
   └─→ Moved to prostate_cancer_R01_raw_transcripts_Ella/processed/SID 33 (8).csv
```

---

### Design Principles

| Principle | Description |
|-----------|-------------|
| **Separation of Concerns** | Each module has a single responsibility (files / AI processing / DB) |
| **Extensible** | Adding a new AI module to Process Manager requires no changes to existing code |
| **Incremental Implementation** | State Manager starts with Excel output, then evolves to DB integration |
| **Independent Testing** | Each module can be tested individually |
| **Failure Recovery** | If a failure occurs before archiving, the file remains in the input folder and can be reprocessed |

---

### Related Documents

- [ML_PIPELINE_OVERVIEW.md](./ML_PIPELINE_OVERVIEW.md) ([EN](./ML_PIPELINE_OVERVIEW_EN.md) | [KR](./ML_PIPELINE_OVERVIEW.md)) — Relationships between data files and detailed description per Stage
- [ML_PIPELINE_DEVELOPMENT_STATUS.md](./ML_PIPELINE_DEVELOPMENT_STATUS.md) ([EN](./ML_PIPELINE_DEVELOPMENT_STATUS_EN.md) | [KR](./ML_PIPELINE_DEVELOPMENT_STATUS.md)) — ML pipeline implementation status analysis and Gap analysis

---
