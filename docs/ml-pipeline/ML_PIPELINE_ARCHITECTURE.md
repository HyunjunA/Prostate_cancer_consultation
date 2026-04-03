# ML Pipeline Architecture
> This document contains both English and Korean versions.
> 이 문서에는 영어와 한국어 버전이 모두 포함되어 있습니다.

---

## English

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
| **DB Write** | Save AI processing results to the database | INSERT NLP classification results into PostgreSQL `doctor_sentence_view`, etc. |
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

## 한국어

### 파이프라인 아키텍처 설계

> 원본 요구사항 및 아키텍처 설계 문서
>
> Last updated: 2026-02-10

---

### 원본 요구사항 (영문)

> Please add to the pipeline a module **"File Management"** — there is everything to fetch files, prepare them for processing and archive processed files. Then a module **"Process Manager"** that takes the input, calls the AI modules one by one, in this case, only Michael's for now. And another module **"State Manager"** — this one will eventually insert and read from the database. The main pipeline will be calling these modules.

---

### 요구사항 해석

파이프라인을 **3개 독립 모듈 + 1개 메인 오케스트레이터**로 구성하라는 설계 제안입니다.

각 모듈은 하나의 역할만 담당하며(separation of concerns), 메인 파이프라인이 이들을 순서대로 호출합니다.

---

### 모듈 상세 설명

#### Module 1: File Management

> *"everything to fetch files, prepare them for processing and archive processed files"*

**역할:** 파일의 생명주기 전체를 관리

| 기능 | 설명 | 우리 프로젝트에서의 의미 |
|------|------|------------------------|
| **Fetch** | 지정된 디렉토리에서 처리할 파일을 찾아오기 | `prostate_cancer_R01_raw_transcripts_Ella/` 에서 `SID 33 (8).csv` 같은 TurboScribe CSV 파일 검색 |
| **Prepare** | 파일을 AI 모듈이 처리할 수 있는 형식으로 변환 | TurboScribe → NLP 입력 형식 (Speaker 1→Interviewer, 타임스탬프 제거, 문장 분리) |
| **Archive** | 처리 완료된 파일을 별도 위치로 이동/복사 | 처리된 CSV를 `processed/` 폴더로 이동하여 중복 처리 방지 |

**핵심:** 이 모듈은 데이터의 내용을 이해하지 않습니다. 파일을 찾고, 형식을 맞추고, 정리하는 것만 담당합니다.

---

#### Module 2: Process Manager

> *"takes the input, calls the AI modules one by one, in this case, only Michael's for now"*

**역할:** 전처리된 데이터를 받아 AI 모듈을 순차적으로 실행

| 기능 | 설명 | 우리 프로젝트에서의 의미 |
|------|------|------------------------|
| **Input 수신** | File Management가 준비한 데이터를 받음 | 전처리된 Interviewer 문장 리스트 |
| **AI 모듈 호출** | 등록된 AI 모듈을 하나씩 순서대로 실행 | Michael의 NLP classifier 5개 모델 호출 (`cp`, `le`, `ed`, `inc`, `ius`) |
| **결과 수집** | 각 AI 모듈의 출력을 모아서 반환 | 모델별 예측 확률값 + Top 문장 선별 + Context 생성 |

**"only Michael's for now"의 의미:**

현재 등록된 AI 모듈은 Michael의 NLP classifier 하나뿐이지만, 이 구조는 **확장을 전제**로 합니다.

```
현재:    Input → [Michael's NLP Classifier] → Output

미래:    Input → [Michael's NLP Classifier]
               → [요약 생성 모듈]
               → [감성 분석 모듈]
               → [기타 AI 모듈]        → Output (통합)
```

Process Manager는 AI 모듈을 **플러그인처럼** 관리하여, 새 모듈 추가 시 기존 코드를 수정하지 않고 등록만 하면 됩니다.

---

#### Module 3: State Manager

> *"this one will eventually insert and read from the database"*

**역할:** 데이터베이스 읽기/쓰기 및 처리 상태 추적

| 기능 | 설명 | 우리 프로젝트에서의 의미 |
|------|------|------------------------|
| **DB 쓰기** | AI 처리 결과를 데이터베이스에 저장 | NLP 분류 결과를 PostgreSQL `doctor_sentence_view` 등에 INSERT |
| **DB 읽기** | 기존 데이터 조회 | 이미 처리된 환자 목록, 기존 점수 등 조회 |
| **상태 추적** | 파이프라인 실행 이력 관리 | 어떤 파일이 언제 처리되었는지, 성공/실패 여부 기록 |

**"eventually"의 의미:**

이 모듈은 **점진적으로 구현**됩니다.

```
Phase 1 (당장):   결과를 Excel 파일로 저장 (DB 연동 없이)
Phase 2 (이후):   결과를 PostgreSQL DB에 저장
Phase 3 (최종):   대시보드 앱과 실시간 연동
```

---

#### Main Pipeline (오케스트레이터)

> *"The main pipeline will be calling these modules"*

**역할:** 3개 모듈을 올바른 순서로 호출하여 전체 워크플로우를 실행

```
Main Pipeline 실행 흐름:

    1. File Management.fetch()
       → 입력 디렉토리에서 미처리 CSV 파일 목록 가져오기

    2. File Management.prepare(file)
       → 각 파일을 NLP 입력 형식으로 변환

    3. Process Manager.run(prepared_data)
       → Michael의 NLP 모델 5개에 문장들을 보내서 분류
       → (미래: 추가 AI 모듈도 순차 실행)

    4. State Manager.save(results)
       → 분류 결과를 DB 또는 Excel에 저장

    5. File Management.archive(file)
       → 처리 완료된 원본 파일을 아카이브 폴더로 이동
```

---

### 아키텍처 다이어그램

```
prostate_cancer_R01_raw_transcripts_Ella/             NLP Docker API              Dashboard DB
   SID 33 (8).csv              (r01-nlp-classifiers)          (PostgreSQL)
        │                              │                            │
        ▼                              ▼                            ▼
┌──────────────────┐  data  ┌───────────────────┐  results  ┌──────────────────┐
│  File Management │ ─────→ │  Process Manager  │ ────────→ │  State Manager   │
│                  │        │                   │           │                  │
│  - fetch()       │        │  - run()          │           │  - save()        │
│  - prepare()     │        │  - AI 모듈 관리    │           │  - load()        │
│  - archive()     │        │  - 현재: NLP만     │           │  - track_status()│
│                  │        │  - 미래: 확장 가능  │           │  - 현재: Excel   │
│                  │        │                   │           │  - 미래: DB      │
└──────────────────┘        └───────────────────┘           └──────────────────┘
         ▲                          ▲                              ▲
         │                          │                              │
         └──────────────── Main Pipeline ──────────────────────────┘
                        (오케스트레이터)
```

---

### 모듈 간 데이터 흐름 (구체적 예시)

SID 33 환자의 상담 녹음 처리를 예시로:

```
1. File Management.fetch("prostate_cancer_R01_raw_transcripts_Ella/")
   └─→ ["SID 33 (8).csv"] 반환

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
       └─→ Top 5 문장 선별 + Context 생성

4. State Manager.save(results)
   └─→ original-study-physician-predictions-sid-33.xlsx (5개 시트)

5. File Management.archive("SID 33 (8).csv")
   └─→ prostate_cancer_R01_raw_transcripts_Ella/processed/SID 33 (8).csv 로 이동
```

---

### 설계 원칙

| 원칙 | 설명 |
|------|------|
| **관심사 분리** | 각 모듈은 하나의 책임만 가짐 (파일 / AI 처리 / DB) |
| **확장 가능** | Process Manager에 새 AI 모듈 추가 시 기존 코드 변경 불필요 |
| **점진적 구현** | State Manager는 Excel 출력부터 시작, 이후 DB 연동으로 발전 |
| **독립적 테스트** | 각 모듈을 개별적으로 테스트 가능 |
| **실패 복구** | Archive 전에 실패하면 파일이 입력 폴더에 남아 재처리 가능 |

---

### 관련 문서

- [ML_PIPELINE_OVERVIEW_KR.md](./ML_PIPELINE_OVERVIEW_KR.md) / [EN](./ML_PIPELINE_OVERVIEW_EN.md) — 데이터 파일 간 관계 및 Stage별 상세 설명
- [ML_PIPELINE_DEVELOPMENT_STATUS_KR.md](./ML_PIPELINE_DEVELOPMENT_STATUS_KR.md) / [EN](./ML_PIPELINE_DEVELOPMENT_STATUS_EN.md) — ML 파이프라인 구현 상태 분석 및 Gap 분석
