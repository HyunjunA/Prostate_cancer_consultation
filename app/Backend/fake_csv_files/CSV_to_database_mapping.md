# CSV → Database 매핑 상세 설명

> **⚠️ 데이터 출처 변경 (2026-03-27)**
>
> 모든 CSV 파일은 이제 `AI_physician_patient_communication` 파이프라인 output에서 `convert_output_to_csv.py`로 생성됩니다.
> 기존 수동 작성된 fake 데이터는 더 이상 사용하지 않습니다.
>
> **AI-Generated Summary (임시 구현)**: `Patient_interface_class_summary.csv`의 요약 텍스트는
> 현재 NLP 점수 상위 3개 문장을 단순 연결한 것이며, Guillermo의 AI sub-pipeline (Step 9)으로 대체 예정입니다.

## 📊 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Docker Compose Environment                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Webapp     │    │   Backend    │    │  PostgreSQL  │                   │
│  │  (Next.js)   │◄──►│  (FastAPI)   │◄──►│    (DB)      │                   │
│  │  port:3000   │    │  port:8000   │    │  port:5433   │                   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                   │
│                                                  │                           │
│                                    database_schema.sql                       │
│                                    (초기화 시 자동 실행)                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 CSV → DB 테이블 매핑 상세

### 1️⃣ `docter_interface_render_processed.csv` → `doctor_sentence_view`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CSV: docter_interface_render_processed.csv                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  file,i,i2,speaker,sentences,score,class,time                               │
│  consultation_001.txt,0,1,Interviewer:,"Have you...",3.5,2,2025-01-01 09:00 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB Table: doctor_sentence_view                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  CREATE TABLE doctor_sentence_view (                                         │
│      file VARCHAR(255) NOT NULL,        -- CSV: file                        │
│      i INT NOT NULL,                    -- CSV: i                           │
│      i2 INT NOT NULL,                   -- CSV: i2                          │
│      speaker VARCHAR(100),              -- CSV: speaker                     │
│      sentences TEXT,                    -- CSV: sentences                   │
│      score FLOAT,                       -- CSV: score                       │
│      class VARCHAR(100),                -- CSV: class                       │
│      time TIMESTAMP,                    -- CSV: time                        │
│      PRIMARY KEY (file, i, i2)          -- 복합 기본키                       │
│  );                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**컬럼 매핑:**

| CSV 컬럼    | DB 컬럼     | 타입         | 설명                         |
| ----------- | ----------- | ------------ | ---------------------------- |
| `file`      | `file`      | VARCHAR(255) | 상담 파일명 (PK)             |
| `i`         | `i`         | INT          | 세그먼트 번호 (PK)           |
| `i2`        | `i2`        | INT          | 문장 번호 (PK)               |
| `speaker`   | `speaker`   | VARCHAR(100) | 화자 (Interviewer:/Patient:) |
| `sentences` | `sentences` | TEXT         | 문장 내용                    |
| `score`     | `score`     | FLOAT        | AI 점수                      |
| `class`     | `class`     | VARCHAR(100) | 분류 (1-5 or -1)             |
| `time`      | `time`      | TIMESTAMP    | 타임스탬프                   |

---

### 2️⃣ `docter_interface_ai_rewriting_history.csv` → `doctor_rewrite_log`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CSV: docter_interface_ai_rewriting_history.csv                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  file,i,i2,speaker,time,original_sentence,                                   │
│  revised_sentence,score,class,selected                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB Table: doctor_rewrite_log                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  CREATE TABLE doctor_rewrite_log (                                           │
│      file VARCHAR(255) NOT NULL,                                             │
│      i INT NOT NULL,                                                         │
│      i2 INT NOT NULL,                                                        │
│      speaker VARCHAR(100),                                                   │
│      time TIMESTAMP DEFAULT NOW(),                                           │
│      original_sentence TEXT,                                                  │
│      revised_sentence TEXT,                                                   │
│      score FLOAT,                                                            │
│      class VARCHAR(100),                                                     │
│      selected BOOLEAN DEFAULT FALSE,                                         │
│      PRIMARY KEY (file, i, i2, time),   -- 복합 기본키 (time 포함)           │
│      CONSTRAINT fk_rewrite_to_sentence                                       │
│          FOREIGN KEY (file, i, i2)                                           │
│          REFERENCES doctor_sentence_view(file, i, i2)                        │
│          ON DELETE CASCADE                                                   │
│  );                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**⚠️ 주의: CSV와 DB 컬럼명 불일치**

| CSV 컬럼            | DB 컬럼              | 비고             |
| ------------------- | -------------------- | ---------------- |
| `original_sentence` | `original_sentences` | **단수 vs 복수** |
| `revised_sentence`  | `revised_sentences`  | **단수 vs 복수** |

**외래키 관계:**

```
doctor_rewrite_log.(file, i, i2) → doctor_sentence_view.(file, i, i2)
```

---

### 3️⃣ `Patient_interface_class_summary.csv` → `patient_summary`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CSV: Patient_interface_class_summary.csv                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  file,Speaker,Entire_summary,Class_1,Summary_class_1,Class_2,...            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB Table: patient_summary                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  CREATE TABLE patient_summary (                                              │
│      file VARCHAR(255) NOT NULL,                                             │
│      speaker VARCHAR(100),              -- ⚠️ CSV: Speaker (대문자)         │
│      entire_summary TEXT,               -- ⚠️ CSV: Entire_summary (공백)    │
│      class_1 VARCHAR(100),              -- ⚠️ CSV: Class_1                  │
│      summary_class_1 TEXT,              -- ⚠️ CSV: Summary_class_1          │
│      class_2 VARCHAR(100),                                                   │
│      summary_class_2 TEXT,                                                   │
│      class_3 VARCHAR(100),                                                   │
│      summary_class_3 TEXT,                                                   │
│      class_4 VARCHAR(100),                                                   │
│      summary_class_4 TEXT,                                                   │
│      class_5 VARCHAR(100),                                                   │
│      summary_class_5 TEXT,                                                   │
│      PRIMARY KEY (file, speaker)                                             │
│  );                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**⚠️ 주의: CSV와 DB 컬럼명 불일치**

| CSV 컬럼          | DB 컬럼           | 변환 필요         |
| ----------------- | ----------------- | ----------------- |
| `Speaker`         | `speaker`         | 대문자 → 소문자   |
| `Entire_summary`  | `entire_summary`  | 공백 → 언더스코어 |
| `Class_1`         | `class_1`         | 대문자 → 소문자   |
| `Summary_class_1` | `summary_class_1` | 대문자 → 소문자   |

---

### 4️⃣ `Patient_interface_class_summary_scoring.csv` → `patient_summary_scoring`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CSV: Patient_interface_class_summary_scoring.csv                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  file,Speaker,Class_1_Patient_scoring,Class_2_Patient_scoring,...           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB Table: patient_summary_scoring                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  CREATE TABLE patient_summary_scoring (                                      │
│      file VARCHAR(255) NOT NULL,                                             │
│      speaker VARCHAR(100),                                                   │
│      class_1_patient_scoring INT CHECK (... BETWEEN 0 AND 10),              │
│      class_2_patient_scoring INT CHECK (... BETWEEN 0 AND 10),              │
│      class_3_patient_scoring INT CHECK (... BETWEEN 0 AND 10),              │
│      class_4_patient_scoring INT CHECK (... BETWEEN 0 AND 10),              │
│      class_5_patient_scoring INT CHECK (... BETWEEN 0 AND 10),              │
│      PRIMARY KEY (file, speaker),                                            │
│      CONSTRAINT fk_scoring_to_summary                                        │
│          FOREIGN KEY (file, speaker)                                         │
│          REFERENCES patient_summary(file, speaker)                           │
│          ON DELETE CASCADE                                                   │
│  );                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**외래키 관계:**

```
patient_summary_scoring.(file, speaker) → patient_summary.(file, speaker)
```

---

### 5️⃣ `Patient_interface_questions_responses.csv` → `patient_responses`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CSV: Patient_interface_questions_responses.csv                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  file,Speaker,Answer_1,Answer_2,Answer_3,Answer_4,Answer_5                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB Table: patient_responses                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  CREATE TABLE patient_responses (                                            │
│      file VARCHAR(255) NOT NULL,                                             │
│      speaker VARCHAR(100),              -- ⚠️ CSV: Speaker                  │
│      answer_1 TEXT,                     -- ⚠️ CSV: Answer_1                 │
│      answer_2 TEXT,                                                          │
│      answer_3 TEXT,                                                          │
│      answer_4 TEXT,                                                          │
│      answer_5 TEXT,                                                          │
│      PRIMARY KEY (file, speaker),                                            │
│      CONSTRAINT fk_responses_to_summary                                      │
│          FOREIGN KEY (file, speaker)                                         │
│          REFERENCES patient_summary(file, speaker)                           │
│          ON DELETE CASCADE                                                   │
│  );                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6️⃣ `survey_submission_log` (CSV 없음 - Frontend에서 직접 생성)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ❌ CSV 파일 없음 - Frontend에서 API로 직접 제출                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  POST /api/surveys/submit                                                    │
│  {                                                                           │
│    "survey_type": "dcs",                                                     │
│    "file": "consultation_001.txt",                                           │
│    "speaker": "PATIENT_001",                                                 │
│    "answers": { "q1": "1", "q2": "2", ... }                                  │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DB Table: survey_submission_log                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CREATE TABLE survey_submission_log (                                        │
│      id SERIAL PRIMARY KEY,             -- 자동 증가                         │
│      file VARCHAR(255) NOT NULL,                                             │
│      speaker VARCHAR(100) NOT NULL,                                          │
│      survey_type VARCHAR(50) NOT NULL,  -- dcs, sdm, risk_perception, etc   │
│      answers TEXT NOT NULL,             -- JSON 문자열                       │
│      extra_data TEXT,                   -- 메타데이터                        │
│      submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),                    │
│      redcap_synced BOOLEAN DEFAULT FALSE,                                    │
│      redcap_record_id VARCHAR(255),                                          │
│      redcap_error TEXT,                                                      │
│      CONSTRAINT fk_survey_to_patient_summary                                 │
│          FOREIGN KEY (file, speaker)                                         │
│          REFERENCES patient_summary(file, speaker)                           │
│          ON DELETE CASCADE                                                   │
│  );                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 전체 테이블 관계도 (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database Schema                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────┐
│  doctor_sentence_view   │ ◄─── docter_interface_render_processed.csv
│  PK: (file, i, i2)      │
└───────────┬─────────────┘
            │
            │ FK (file, i, i2)
            ▼
┌─────────────────────────┐
│  doctor_rewrite_log     │ ◄─── docter_interface_ai_rewriting_history.csv
│  PK: (file, i, i2, time)│
└─────────────────────────┘


┌─────────────────────────┐
│  patient_summary        │ ◄─── Patient_interface_class_summary.csv
│  PK: (file, speaker)    │
└───────────┬─────────────┘
            │
            │ FK (file, speaker)
            ├─────────────────────────────┬─────────────────────────────┐
            ▼                             ▼                             ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│ patient_summary_scoring │  │ patient_responses       │  │ survey_submission_log   │
│ PK: (file, speaker)     │  │ PK: (file, speaker)     │  │ PK: id (auto)           │
└─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
         ▲                            ▲                            ▲
         │                            │                            │
Patient_interface_           Patient_interface_              (Frontend API 제출)
class_summary_scoring.csv    questions_responses.csv
```

---

## 📦 Docker 초기화 프로세스

```yaml
# docker-compose.yml
postgres:
  volumes:
    - ./database_schema.sql:/docker-entrypoint-initdb.d/001_schema.sql:ro
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Docker Compose 실행 시                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. PostgreSQL 컨테이너 시작                                                 │
│     - postgres:13 이미지 사용                                                │
│     - prostatecancer_db 데이터베이스 생성                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. /docker-entrypoint-initdb.d/ 스크립트 자동 실행                          │
│     - 001_schema.sql (database_schema.sql) 실행                             │
│     - 모든 테이블, 인덱스, FK 생성                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. Backend (FastAPI) 시작                                                   │
│     - models.py의 SQLAlchemy 모델로 DB 접근                                  │
│     - db.py의 async session 사용                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. CSV 데이터 Import (수동 또는 init_db.py)                                 │
│     - 각 CSV → 해당 테이블로 INSERT                                          │
│     - 컬럼명 변환 필요                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ CSV Import 시 주의사항

### 컬럼명 변환 필요

```python
# CSV → DB 컬럼명 변환 예시
column_mapping = {
    # Patient_interface_class_summary.csv
    "Speaker": "speaker",
    "Entire_summary": "entire_summary",
    "Class_1": "class_1",
    "Summary_class_1": "summary_class_1",

    # Patient_interface_class_summary_scoring.csv
    "Class_1_Patient_scoring": "class_1_patient_scoring",

    # Patient_interface_questions_responses.csv
    "Answer_1": "answer_1",

    # docter_interface_ai_rewriting_history.csv
    "original_sentence": "original_sentences",  # 단수 → 복수
    "revised_sentence": "revised_sentences",    # 단수 → 복수
}

# pandas로 변환
df = df.rename(columns=column_mapping)
```

---

## 📋 요약 테이블

| CSV 파일                                      | DB 테이블                 | PK                  | FK                     |
| --------------------------------------------- | ------------------------- | ------------------- | ---------------------- |
| `docter_interface_render_processed.csv`       | `doctor_sentence_view`    | (file, i, i2)       | -                      |
| `docter_interface_ai_rewriting_history.csv`   | `doctor_rewrite_log`      | (file, i, i2, time) | → doctor_sentence_view |
| `Patient_interface_class_summary.csv`         | `patient_summary`         | (file, speaker)     | -                      |
| `Patient_interface_class_summary_scoring.csv` | `patient_summary_scoring` | (file, speaker)     | → patient_summary      |
| `Patient_interface_questions_responses.csv`   | `patient_responses`       | (file, speaker)     | → patient_summary      |
| ❌ (API 제출)                                 | `survey_submission_log`   | id                  | → patient_summary      |

---

## 🔍 DB 조회 SQL 예시

### Speaker로 개별 테이블 조회

```sql
-- 1. patient_summary (환자 요약)
SELECT * FROM patient_summary
WHERE speaker = 'Patient_Input_Keystrokes REC001 (SID 14)';

-- 2. patient_summary_scoring (평가 점수)
SELECT * FROM patient_summary_scoring
WHERE speaker = 'Patient_Input_Keystrokes REC001 (SID 14)';

-- 3. patient_responses (Q&A 응답)
SELECT * FROM patient_responses
WHERE speaker = 'Patient_Input_Keystrokes REC001 (SID 14)';

-- 4. survey_submission_log (설문 제출 로그)
SELECT * FROM survey_submission_log
WHERE speaker = 'Patient_Input_Keystrokes REC001 (SID 14)';
```

### 전체 데이터 JOIN 조회

```sql
SELECT
    ps.file,
    ps.speaker,
    ps.entire_summary,
    pss.class_1_patient_scoring,
    pss.class_2_patient_scoring,
    pss.class_3_patient_scoring,
    pss.class_4_patient_scoring,
    pss.class_5_patient_scoring,
    pr.answer_1,
    pr.answer_2,
    pr.answer_3,
    pr.answer_4,
    pr.answer_5
FROM patient_summary ps
LEFT JOIN patient_summary_scoring pss ON ps.file = pss.file AND ps.speaker = pss.speaker
LEFT JOIN patient_responses pr ON ps.file = pr.file AND ps.speaker = pr.speaker
WHERE ps.speaker = 'Patient_Input_Keystrokes REC001 (SID 14)';
```

### Docker에서 SQL 실행

```bash
# PostgreSQL 컨테이너 접속
docker exec -it prostatecancer-postgres psql -U prostatecancer_user -d prostatecancer_db

# 또는 한 줄로 실행
docker exec -it prostatecancer-postgres psql -U prostatecancer_user -d prostatecancer_db -c "SELECT * FROM patient_summary WHERE speaker = 'Patient_Input_Keystrokes REC001 (SID 14)';"
```

---

**문서 작성일:** 2025-12-17
**최종 수정:** 2026-03-27 (파이프라인 데이터 전환 반영, SQL 예시 업데이트)
**작성자:** Claude AI Assistant
