# Data Format Conversion: Frontend to REDCap

## Document Overview

| Item                | Description                                                               |
| ------------------- | ------------------------------------------------------------------------- |
| **Document Title**  | Data Format Conversion                                                    |
| **Purpose**         | Explains how survey data flows from frontend submission to REDCap storage |
| **Target Audience** | Developers working on the patient dashboard system                        |
| **Related Files**   | `routes_surveys.py`                                                       |

---

## 1. Problem Statement

### 1.1 The Issue

The frontend application sends survey answers using generic keys (`q1`, `q2`, `q3`, etc.), but REDCap requires specific field names that match its database schema.

---

### 1.2 Frontend Sends (All Survey Types)

#### SDM (Shared Decision Making) - 4 questions

```json
{
  "survey_type": "sdm",
  "file": "consultation_001.txt",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "yes",
    "q2": "1",
    "q3": "2",
    "q4": "yes"
  }
}
```

#### DCS (Decisional Conflict Survey) - 16 questions

```json
{
  "survey_type": "dcs",
  "file": "consultation_001.txt",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "1",
    "q2": "2",
    "q3": "2",
    "q4": "2",
    "q5": "3",
    "q6": "2",
    "q7": "1",
    "q8": "1",
    "q9": "2",
    "q10": "2",
    "q11": "3",
    "q12": "4",
    "q13": "2",
    "q14": "1",
    "q15": "2",
    "q16": "2"
  }
}
```

#### Risk Perception - 5 questions

```json
{
  "survey_type": "risk_perception",
  "file": "consultation_001.txt",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "3",
    "q2": "1",
    "q3": "3",
    "q4": "2",
    "q5": "2"
  }
}
```

#### Satisfaction - 1 question

```json
{
  "survey_type": "satisfaction",
  "file": "consultation_001.txt",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "The NLP report was very helpful in understanding my treatment options."
  }
}
```

#### Frontend Answer Format Summary

| Survey Type       | Question Count | Answer Format                                  |
| ----------------- | -------------- | ---------------------------------------------- |
| `sdm`             | 4              | q1: "yes"/"no", q2-q3: "1"-"4", q4: "yes"/"no" |
| `dcs`             | 16             | q1-q16: "1"-"5" (or "0"-"4" if 0-based)        |
| `risk_perception` | 5              | q1-q5: "1"-"5"                                 |
| `satisfaction`    | 1              | q1: free text                                  |

---

### 1.3 REDCap Expects

After conversion, REDCap receives data with proper field names:

#### SDM → REDCap

```json
{
  "record_id": "PATIENT_001",
  "sdmp_options": "1",
  "sdm_ptos": "1",
  "sdm_cons": "2",
  "sdm_pref": "1"
}
```

#### DCS → REDCap

```json
{
  "record_id": "PATIENT_001",
  "dcs1_v2": "1",
  "dcs2_v2": "2",
  "dcs3_v2": "2",
  "dcs4_v2": "2",
  "dcs5_v2": "3",
  "dcs6_v2": "2",
  "dcs7_v2": "1",
  "dcs8_v2": "1",
  "dcs9_v2": "2",
  "dcs10_v2": "2",
  "dcs11_v2": "3",
  "dcs12_v2": "4",
  "dcs13_v2": "2",
  "dcs14_v2": "1",
  "dcs15_v2": "2",
  "dcs16_v2": "2"
}
```

#### Risk Perception → REDCap

```json
{
  "record_id": "PATIENT_001",
  "risk_percep_1_1": "3",
  "risk_percept2_2": "1",
  "risk_percept_3_3": "3",
  "risk_percept_4_4": "2",
  "risk_percep_5_5": "2"
}
```

#### Satisfaction → REDCap

```json
{
  "record_id": "PATIENT_001",
  "pt_satisfaction": "The NLP report was very helpful in understanding my treatment options."
}
```

### 1.4 Record ID Mapping

REDCap requires a `record_id` to identify each patient/participant record. In this system, the frontend's `speaker` field is used as the REDCap `record_id`.

#### Mapping Relationship

| Frontend Field | Backend Variable | REDCap Field | Description                    |
| -------------- | ---------------- | ------------ | ------------------------------ |
| `speaker`      | `record_id`      | `record_id`  | Patient/Participant identifier |

#### Code Implementation

```python
record_id = submission.speaker
```

#### Example

**Frontend sends:**

```json
{
  "survey_type": "sdm",
  "file": "consultation_001.txt",
  "speaker": "PATIENT_001",      ← Used as record_id
  "answers": {
    "q1": "yes",
    "q2": "1",
    "q3": "2",
    "q4": "yes"
  }
}
```

**REDCap receives:**

```json
{
  "record_id": "PATIENT_001",    ← speaker becomes record_id
  "sdmp_options": "1",
  "sdm_ptos": "1",
  "sdm_cons": "2",
  "sdm_pref": "1"
}
```

#### Important Notes

- The `speaker` value must be unique for each patient/participant in REDCap
- If a record with the same `record_id` already exists in REDCap, the data will be updated (overwritten)
- The `file` field is stored in PostgreSQL but is **not** sent to REDCap

---

### 1.5 Why This Matters

Without proper field mapping:

- Data sent to REDCap is **not saved** because field names don't match
- Survey responses are lost or stored incorrectly
- Research data integrity is compromised

### 1.6 The Solution

Implement a **field mapping layer** that:

1. Converts frontend keys (`q1`, `q2`) to REDCap field names (`sdmp_options`, `sdm_ptos`)
2. Transforms values when necessary (`"yes"` → `"1"`)
3. Reuses the existing `import_to_redcap_record()` function for actual API calls

---

## 2. Architecture Overview

### 2.1 High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────┐ │
│  │ Frontend │ ──── │   Backend    │ ──── │  PostgreSQL │      │  REDCap  │ │
│  │  (React) │ POST │  (FastAPI)   │ Save │     DB      │      │   API    │ │
│  └──────────┘      └──────────────┘      └─────────────┘      └──────────┘ │
│       │                   │                                        ▲        │
│       │                   │                                        │        │
│       │                   └────────────────────────────────────────┘        │
│       │                              Transform & Import                      │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  POST /api/surveys/submit                                            │   │
│  │  {                                                                   │   │
│  │    "survey_type": "sdm",                                             │   │
│  │    "file": "consultation_001.txt",                                   │   │
│  │    "speaker": "PATIENT_001",                                         │   │
│  │    "answers": { "q1": "yes", "q2": "1", "q3": "2", "q4": "yes" }     │   │
│  │  }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Detailed Processing Flow

```
Frontend                      Backend                              REDCap
────────                      ───────                              ──────

POST /api/surveys/submit
         │
         ▼
┌─────────────────────┐
│ SurveySubmission    │
│ {                   │
│   survey_type: sdm  │
│   file: xxx.txt     │
│   speaker: PAT_001  │
│   answers: {        │
│     q1: "yes"       │
│     q2: "1"         │
│     q3: "2"         │
│     q4: "yes"       │
│   }                 │
│ }                   │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ submit_survey()     │──────────────────┐
│ Endpoint Handler    │                  │
└─────────────────────┘                  │
         │                               ▼
         │                    ┌─────────────────────┐
         │                    │ Save to PostgreSQL  │
         │                    │ (SurveySubmissionLog)│
         │                    └─────────────────────┘
         ▼
┌─────────────────────┐
│ import_to_redcap()  │
│                     │
│ 1. Get field mapping│
│ 2. Transform values │
│ 3. Build REDCap obj │
└─────────────────────┘
         │
         │  Field Mapping:
         │  ┌────────────────────────────┐
         │  │ q1 → sdmp_options          │
         │  │ q2 → sdm_ptos              │
         │  │ q3 → sdm_cons              │
         │  │ q4 → sdm_pref              │
         │  └────────────────────────────┘
         │
         │  Value Transformation:
         │  ┌────────────────────────────┐
         │  │ "yes" → "1"                │
         │  │ "no"  → "0"                │
         │  └────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│ REDCapImportData    │
│ {                   │
│   sdmp_options: "1" │
│   sdm_ptos: "1"     │
│   sdm_cons: "2"     │
│   sdm_pref: "1"     │
│ }                   │
└─────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ import_to_redcap_record │
│ (record_id, import_data)│
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐             ┌─────────────────────┐
│ REDCap API POST         │ ─────────── │ REDCap Database     │
│ /api/                   │   HTTP      │ Record saved with   │
│                         │   POST      │ correct field names │
└─────────────────────────┘             └─────────────────────┘
```

---

## 3. Component Details

### 3.1 Field Mapping Configuration

Located at the top of `surveys.py`:

```python
# ──────────────────────────────────────────────────────────────────────────────
# Field Mapping: Frontend → REDCap
# ──────────────────────────────────────────────────────────────────────────────
FRONTEND_TO_REDCAP_MAPPING = {
    "dcs": {
        "q1": "dcs1_v2",
        "q2": "dcs2_v2",
        "q3": "dcs3_v2",
        "q4": "dcs4_v2",
        "q5": "dcs5_v2",
        "q6": "dcs6_v2",
        "q7": "dcs7_v2",
        "q8": "dcs8_v2",
        "q9": "dcs9_v2",
        "q10": "dcs10_v2",
        "q11": "dcs11_v2",
        "q12": "dcs12_v2",
        "q13": "dcs13_v2",
        "q14": "dcs14_v2",
        "q15": "dcs15_v2",
        "q16": "dcs16_v2",
    },
    "sdm": {
        "q1": "sdmp_options",
        "q2": "sdm_ptos",
        "q3": "sdm_cons",
        "q4": "sdm_pref",
    },
    "risk_perception": {
        "q1": "risk_percep_1_1",
        "q2": "risk_percept2_2",
        "q3": "risk_percept_3_3",
        "q4": "risk_percept_4_4",
        "q5": "risk_percep_5_5",
    },
    "satisfaction": {
        "q1": "pt_satisfaction",
    },
}
```

### 3.2 Value Transformation Function

Handles special value conversions:

```python
def transform_value(survey_type: str, field_key: str, value: any) -> str:
    """
    Transform frontend values to REDCap format

    Transformations:
    - SDM yes/no fields: "yes" → "1", "no" → "0"
    - DCS 0-4 index: 0 → "1", 1 → "2", etc. (if frontend uses 0-based)
    """
    str_value = str(value) if value is not None else ""

    # SDM yes/no transformation (q1, q4 are yesno type)
    if survey_type == "sdm" and field_key in ["q1", "q4"]:
        if str_value.lower() == "yes":
            return "1"
        elif str_value.lower() == "no":
            return "0"
        return str_value

    # DCS 0-4 → 1-5 transformation (if needed)
    if survey_type == "dcs":
        try:
            int_value = int(str_value)
            if 0 <= int_value <= 4:
                return str(int_value + 1)
        except ValueError:
            pass

    return str_value
```

### 3.3 Updated import_to_redcap Function

The main function that orchestrates the conversion:

```python
async def import_to_redcap(submission: SurveySubmission, timestamp: str) -> dict:
    """
    Import survey data to REDCap

    Flow:
    1. Check if REDCap is enabled
    2. Get field mapping for survey type
    3. Transform each answer to REDCap format
    4. Create REDCapImportData object
    5. Call import_to_redcap_record() for actual API call
    """
    if not REDCAP_ENABLED:
        return {"success": False, "error": "REDCap not configured", "record_id": None}

    record_id = submission.speaker
    survey_type = submission.survey_type

    # Step 1: Get mapping for this survey type
    field_mapping = FRONTEND_TO_REDCAP_MAPPING.get(survey_type, {})

    if not field_mapping:
        print(f"[WARNING] No field mapping for survey_type: {survey_type}")
        return {"success": False, "error": f"No mapping for {survey_type}", "record_id": record_id}

    # Step 2: Convert frontend answers to REDCap field names
    redcap_fields = {}
    for frontend_key, value in submission.answers.items():
        redcap_field = field_mapping.get(frontend_key)
        if redcap_field:
            transformed_value = transform_value(survey_type, frontend_key, value)
            redcap_fields[redcap_field] = transformed_value
        else:
            print(f"[WARNING] No mapping for field: {frontend_key}")

    if not redcap_fields:
        return {"success": False, "error": "No valid fields", "record_id": record_id}

    # Step 3: Create REDCapImportData and call import_to_redcap_record
    try:
        import_data = REDCapImportData(**redcap_fields)
        result = await import_to_redcap_record(record_id, import_data)

        return {
            "success": result.get("status") == "success",
            "error": None,
            "record_id": record_id,
            "fields_imported": len(redcap_fields)
        }
    except Exception as e:
        print(f"[ERROR] REDCap import failed: {e}")
        return {"success": False, "error": str(e), "record_id": record_id}
```

---

## 4. Data Transformation Examples

### 4.1 SDM Survey

**Frontend Input:**

```json
{
  "survey_type": "sdm",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "yes",
    "q2": "1",
    "q3": "2",
    "q4": "yes"
  }
}
```

**Transformation Process:**

| Step | Frontend Key | Frontend Value | Mapping      | Transformed Value | REDCap Field      |
| ---- | ------------ | -------------- | ------------ | ----------------- | ----------------- |
| 1    | q1           | "yes"          | sdmp_options | "1" (yes→1)       | sdmp_options: "1" |
| 2    | q2           | "1"            | sdm_ptos     | "1" (no change)   | sdm_ptos: "1"     |
| 3    | q3           | "2"            | sdm_cons     | "2" (no change)   | sdm_cons: "2"     |
| 4    | q4           | "yes"          | sdm_pref     | "1" (yes→1)       | sdm_pref: "1"     |

**REDCap Output:**

```json
{
  "record_id": "PATIENT_001",
  "sdmp_options": "1",
  "sdm_ptos": "1",
  "sdm_cons": "2",
  "sdm_pref": "1"
}
```

### 4.2 DCS Survey

**Frontend Input:**

```json
{
  "survey_type": "dcs",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "0",
    "q2": "1",
    "q3": "2",
    "q4": "1"
  }
}
```

**Transformation Process:**

| Step | Frontend Key | Frontend Value | Mapping | Transformed Value | REDCap Field |
| ---- | ------------ | -------------- | ------- | ----------------- | ------------ |
| 1    | q1           | "0"            | dcs1_v2 | "1" (0→1)         | dcs1_v2: "1" |
| 2    | q2           | "1"            | dcs2_v2 | "2" (1→2)         | dcs2_v2: "2" |
| 3    | q3           | "2"            | dcs3_v2 | "3" (2→3)         | dcs3_v2: "3" |
| 4    | q4           | "1"            | dcs4_v2 | "2" (1→2)         | dcs4_v2: "2" |

**Note:** DCS transformation assumes frontend uses 0-based indexing (0-4). If frontend already sends 1-5, remove the transformation logic.

### 4.3 Risk Perception Survey

**Frontend Input:**

```json
{
  "survey_type": "risk_perception",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "3",
    "q2": "1",
    "q3": "3",
    "q4": "2",
    "q5": "2"
  }
}
```

**Transformation Process:**

| Step | Frontend Key | Frontend Value | REDCap Field          |
| ---- | ------------ | -------------- | --------------------- |
| 1    | q1           | "3"            | risk_percep_1_1: "3"  |
| 2    | q2           | "1"            | risk_percept2_2: "1"  |
| 3    | q3           | "3"            | risk_percept_3_3: "3" |
| 4    | q4           | "2"            | risk_percept_4_4: "2" |
| 5    | q5           | "2"            | risk_percep_5_5: "2"  |

**Note:** Risk Perception fields have inconsistent naming in REDCap (typos preserved).

### 4.4 Satisfaction Survey

**Frontend Input:**

```json
{
  "survey_type": "satisfaction",
  "speaker": "PATIENT_001",
  "answers": {
    "q1": "The NLP report was very helpful in understanding my options."
  }
}
```

**REDCap Output:**

```json
{
  "record_id": "PATIENT_001",
  "pt_satisfaction": "The NLP report was very helpful in understanding my options."
}
```

---

## 5. Function Call Sequence

### 5.1 Sequence Diagram

```
Client              submit_survey()     import_to_redcap()    import_to_redcap_record()    REDCap API
  │                      │                    │                        │                      │
  │  POST /submit        │                    │                        │                      │
  │─────────────────────>│                    │                        │                      │
  │                      │                    │                        │                      │
  │                      │ Save to PostgreSQL │                        │                      │
  │                      │──────────────────> │                        │                      │
  │                      │                    │                        │                      │
  │                      │ Call with          │                        │                      │
  │                      │ submission data    │                        │                      │
  │                      │───────────────────>│                        │                      │
  │                      │                    │                        │                      │
  │                      │                    │ Get field mapping      │                      │
  │                      │                    │ Transform values       │                      │
  │                      │                    │ Create REDCapImportData│                      │
  │                      │                    │                        │                      │
  │                      │                    │ Call with record_id    │                      │
  │                      │                    │ and import_data        │                      │
  │                      │                    │───────────────────────>│                      │
  │                      │                    │                        │                      │
  │                      │                    │                        │ Check longitudinal   │
  │                      │                    │                        │ Build record JSON    │
  │                      │                    │                        │                      │
  │                      │                    │                        │  POST /api/          │
  │                      │                    │                        │─────────────────────>│
  │                      │                    │                        │                      │
  │                      │                    │                        │  200 OK              │
  │                      │                    │                        │<─────────────────────│
  │                      │                    │                        │                      │
  │                      │                    │  Return result         │                      │
  │                      │                    │<───────────────────────│                      │
  │                      │                    │                        │                      │
  │                      │  Return result     │                        │                      │
  │                      │<───────────────────│                        │                      │
  │                      │                    │                        │                      │
  │  200 OK Response     │                    │                        │                      │
  │<─────────────────────│                    │                        │                      │
  │                      │                    │                        │                      │
```

### 5.2 Code Execution Flow

```python
# 1. Client sends POST request
POST /api/surveys/submit
{
    "survey_type": "sdm",
    "file": "consultation.txt",
    "speaker": "PAT_001",
    "answers": {"q1": "yes", "q2": "1", "q3": "2", "q4": "yes"}
}

# 2. submit_survey() receives request
@router.post("/submit")
async def submit_survey(submission: SurveySubmission, db: AsyncSession):
    # Save to PostgreSQL
    db_record = SurveySubmissionLog(...)
    db.add(db_record)
    await db.commit()

    # Call REDCap import
    if REDCAP_ENABLED:
        redcap_result = await import_to_redcap(submission, timestamp)

# 3. import_to_redcap() transforms data
async def import_to_redcap(submission, timestamp):
    # Get mapping: {"q1": "sdmp_options", "q2": "sdm_ptos", ...}
    field_mapping = FRONTEND_TO_REDCAP_MAPPING["sdm"]

    # Transform: {"sdmp_options": "1", "sdm_ptos": "1", ...}
    redcap_fields = {}
    for key, value in submission.answers.items():
        redcap_field = field_mapping[key]
        redcap_fields[redcap_field] = transform_value("sdm", key, value)

    # Create data object
    import_data = REDCapImportData(**redcap_fields)

    # Call actual import
    return await import_to_redcap_record("PAT_001", import_data)

# 4. import_to_redcap_record() sends to REDCap API
async def import_to_redcap_record(record_id, import_data):
    # Build REDCap record
    redcap_record = {"record_id": record_id, **import_data.model_dump()}

    # Send to REDCap
    response = await client.post(REDCAP_API_URL, data={
        'content': 'record',
        'data': json.dumps([redcap_record]),
        ...
    })

    return {"status": "success", ...}
```

---

## 6. Error Handling

### 6.1 Possible Errors and Handling

| Error                         | Location                    | Handling                        |
| ----------------------------- | --------------------------- | ------------------------------- |
| REDCap not configured         | `import_to_redcap()`        | Return early with error message |
| Unknown survey_type           | `import_to_redcap()`        | Log warning, return error       |
| Unknown field key             | `import_to_redcap()`        | Log warning, skip field         |
| No valid fields after mapping | `import_to_redcap()`        | Return error                    |
| REDCapImportData validation   | `import_to_redcap()`        | Catch exception, return error   |
| REDCap API error              | `import_to_redcap_record()` | Return HTTP error details       |

### 6.2 Error Response Example

```json
{
  "status": "received",
  "survey_type": "sdm",
  "file": "consultation.txt",
  "speaker": "PAT_001",
  "db": { "id": 123, "saved": true },
  "redcap": {
    "success": false,
    "error": "No mapping for survey_type: unknown_type",
    "record_id": "PAT_001"
  }
}
```

---

## 7. Testing

### 7.1 Test with REST Client

```http
### Test SDM Survey Submission
POST http://localhost:8000/api/surveys/submit
Content-Type: application/json

{
  "survey_type": "sdm",
  "file": "test_consultation.txt",
  "speaker": "TEST_PATIENT_001",
  "answers": {
    "q1": "yes",
    "q2": "1",
    "q3": "2",
    "q4": "yes"
  }
}

### Verify in REDCap
GET http://localhost:8000/api/surveys/redcap/records/TEST_PATIENT_001
```

### 7.2 Expected Console Output

```
================================================================================
[SURVEY] SUBMISSION RECEIVED
================================================================================
[TIME]    2024-12-11T10:30:00
[FILE]    test_consultation.txt
[SPEAKER] TEST_PATIENT_001
[TYPE]    SDM
--------------------------------------------------------------------------------
[ANSWERS]
{
  "q1": "yes",
  "q2": "1",
  "q3": "2",
  "q4": "yes"
}
================================================================================

[DB] Saved with ID: 123
[REDCAP] Converted 4 fields for sdm
[REDCAP] Fields: {'sdmp_options': '1', 'sdm_ptos': '1', 'sdm_cons': '2', 'sdm_pref': '1'}
[SUCCESS]  REDCap import successful!
```

---

## 8. Summary

### 8.1 Key Components

| Component                    | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| `FRONTEND_TO_REDCAP_MAPPING` | Maps frontend keys to REDCap field names    |
| `transform_value()`          | Converts values (yes→1, 0-based→1-based)    |
| `import_to_redcap()`         | Orchestrates mapping and calls API function |
| `import_to_redcap_record()`  | Handles actual REDCap API communication     |

### 8.2 Benefits of This Approach

1. **Separation of Concerns**: Frontend doesn't need to know REDCap field names
2. **Maintainability**: Field mappings are centralized and easy to update
3. **Code Reuse**: Uses existing `import_to_redcap_record()` function
4. **Error Handling**: Comprehensive logging and error reporting
5. **Flexibility**: Easy to add new survey types or modify mappings
