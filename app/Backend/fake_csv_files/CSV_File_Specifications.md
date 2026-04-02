# 📊 CSV File Documentation

This document summarizes all CSV files used in the Doctor & Patient Interface system.

> **⚠️ 데이터 출처 변경 (2026-03-27)**
>
> 모든 CSV 파일은 이제 `AI_physician_patient_communication` 파이프라인 output에서 생성됩니다.
> 기존 수동 작성된 fake 데이터는 더 이상 사용하지 않습니다.
>
> 생성 스크립트: `AI_physician_patient_communication/convert_output_to_csv.py`
>
> **AI-Generated Summary (임시 구현)**: `Patient_interface_class_summary.csv`의 `Summary_class_1~5` 컬럼은
> 현재 각 도메인별 NLP 점수 상위 3개 문장을 단순 연결한 것입니다.
> 이는 Guillermo의 AI sub-pipeline (Step 9: AI reformat)으로 대체될 예정입니다.

---

## 🩺 Doctor Interface CSVs

### 1️⃣ `docter_interface_render.csv`

**Purpose:** Sentence-level data for Doctor interface rendering.

| Column    | Type         | Description                      |
| --------- | ------------ | -------------------------------- |
| file      | VARCHAR(255) | Transcript file name             |
| i         | INT          | Segment number                   |
| i2        | INT          | Sentence number within segment   |
| speaker   | VARCHAR(100) | Speaker (PatientID or DoctorID)  |
| sentences | TEXT         | Raw sentence text                |
| score     | FLOAT        | AI-generated score               |
| class     | INT          | Auto-assigned class (1–5 or -1)  |
| time      | TIMESTAMP    | Assigned chronological timestamp |

---

### 2️⃣ `docter_interface_ai_rewriting_history.csv`

**Purpose:** Log of AI rewriting operations performed in the Doctor interface.

| Column            | Type         | Description                         |
| ----------------- | ------------ | ----------------------------------- |
| file              | VARCHAR(255) | Transcript file name                |
| i                 | INT          | Segment number                      |
| i2                | INT          | Sentence number                     |
| speaker           | VARCHAR(100) | Doctor ID who performed rewriting   |
| time              | TIMESTAMP    | Rewriting execution time            |
| original_sentence | TEXT         | Original sentence before rewriting  |
| revised_sentence  | TEXT         | AI-generated revised sentence       |
| score             | FLOAT        | Rewriting quality score             |
| class             | VARCHAR(100) | Semantic class                      |
| selected          | BOOLEAN      | Whether this rewriting was selected |

---

## 🧍‍♀️ Patient Interface CSVs

### 3️⃣ `Patient_interface_class_summary.csv`

**Purpose:** AI-generated summaries for the patient interface.

| Column            | Type         | Description                  |
| ----------------- | ------------ | ---------------------------- |
| file              | VARCHAR(255) | Transcript file name         |
| speaker           | VARCHAR(100) | Patient ID                   |
| Entire_summary    | TEXT         | Full summary of conversation |
| Class_1–5         | VARCHAR(100) | Topic classes                |
| Summary_class_1–5 | TEXT         | Summaries for each class     |

---

### 4️⃣ `Patient_interface_class_summary_scoring.csv`

**Purpose:** Stores patient feedback scores for each class summary.

| Column                  | Type         | Description                   |
| ----------------------- | ------------ | ----------------------------- |
| file                    | VARCHAR(255) | Transcript file name          |
| speaker                 | VARCHAR(100) | Patient ID                    |
| Class_1–5               | VARCHAR(100) | Topic classes                 |
| Class_n_Patient_scoring | INT          | Score for each summary (0–10) |

---

### 5️⃣ `Patient_interface_questions_responses.csv`

**Purpose:** Patient answers to AI assistant (Ella) questions.

| Column     | Type         | Description                       |
| ---------- | ------------ | --------------------------------- |
| file       | VARCHAR(255) | Transcript file name              |
| speaker    | VARCHAR(100) | Patient ID                        |
| Answer_1–5 | TEXT         | Patient responses to AI questions |

---

## ⚙️ Relationships

| Relationship                                                                                                      | Key             |
| ----------------------------------------------------------------------------------------------------------------- | --------------- |
| docter_interface_render ↔ docter_interface_ai_rewriting_history                                                   | (file, i, i2)   |
| Patient_interface_class_summary ↔ Patient_interface_class_summary_scoring ↔ Patient_interface_questions_responses | (file, speaker) |

---

---

## 📂 추가 CSV (2026-03-27)

### 6️⃣ `sentence_prediction.csv`

**Purpose:** NLP 모델별 문장 예측 점수 (도메인별 분리 유지).

| Column               | Type         | Description                          |
| -------------------- | ------------ | ------------------------------------ |
| patient_id           | VARCHAR(100) | 환자 식별자 (SID_14 등)               |
| model                | VARCHAR(10)  | NLP 도메인 (cp, le, ed, inc, ius)    |
| sentence_index       | INT          | 전체 문장 인덱스                      |
| utterance_index      | INT          | 발화 인덱스 (i)                       |
| sentence_in_utterance| INT          | 발화 내 문장 인덱스 (i2)              |
| speaker              | VARCHAR(100) | 화자                                  |
| sentence_text        | TEXT         | 문장 내용                              |
| pred_score           | FLOAT        | NLP 예측 점수 (0.0~1.0)              |
| context              | TEXT         | ±3 문장 컨텍스트                      |

### 7️⃣ `transcript_analysis_log.csv`

**Purpose:** 파이프라인 분석 실행 기록.

| Column           | Type         | Description            |
| ---------------- | ------------ | ---------------------- |
| patient_id       | VARCHAR(100) | 환자 식별자             |
| total_sentences  | INT          | 총 문장 수              |
| top_n            | INT          | 선택된 상위 문장 수      |
| context_window   | INT          | 컨텍스트 윈도우 크기     |
| source_filename  | VARCHAR(255) | 원본 파일명              |
| analyzed_at      | TIMESTAMP    | 분석 시각                |

---

**Author:** Generated by ChatGPT Documentation Tool
**Date:** 2025-11-06
**Updated:** 2026-03-27 (파이프라인 데이터 전환, AI summary 임시 구현 안내 추가)
