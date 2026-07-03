# Patient Interface – Data Persistence & Validation Checklist

## Purpose

This document provides a step-by-step checklist to validate that data generated from the Patient Interface
(first-visit Risk answers and follow-up survey submissions) is correctly stored in:

1. The internal database, and
2. The REDCap project.

---

## 1. Patient Interface – First-Visit Risk Answers Persistence Check

> The old per-summary scoring / `patient_responses` feature was removed: migrations 021/022
> dropped the `patient_scoring` / `patient_response` columns + the `patient_summary_domain`
> table. The first visit now captures Risk Perception answers, persisted to
> `patient_survey_submission_log` (`survey_type='risk_perception_2'`).

### URL

http://localhost:3000/?f=<file-stem>&survey=first-visit

### Description

After the patient submits each domain on the first-visit Risk Perception survey, verify the answers are stored in the database.

### Validation Method

`GET /api/patient/first-visit-answers/{file}/{speaker}` (reads back the persisted answers).

### Checklist

- [ ] Answers exist in `patient_survey_submission_log` with `survey_type='risk_perception_2'`
- [ ] Answers are retrievable by (file, speaker)
- [ ] Stored answers match those entered in the UI

---

## 2. Patient Interface – Survey Submission Persistence Check

### Description

After a patient completes each survey in the web application, verify that the submission is properly stored
in the database.

### Validation Method

Run the following API in the `api_call_test.rest` file.

### API Call

```
### 11. Get Submissions with Filters
### API test to retrieve data stored in the patient_survey_submission_log table
### when a user with a specific patient ID submits survey results via the web app
```

### Checklist

- [ ] Records exist in the `patient_survey_submission_log` table
- [ ] Submission history is retrievable by patient ID
- [ ] Submission timestamps are correctly recorded

---

## 3. REDCap Storage Verification (Manual)

### Description

Verification that data has been successfully saved to REDCap must be performed directly
within the REDCap project UI.

### Validation Method

- [ ] Navigate to the corresponding REDCap project
- [ ] Confirm that a record exists for the given patient ID (record ID)
- [ ] Verify that survey responses match the expected values

---

## 4. REDCap Record Deletion (Cleanup / Testing)

### Description

For testing or cleanup purposes, delete a specific patient record from REDCap.
The Record ID is the same as the speaker, which corresponds to the patient ID.

### API Call

```
### 18. Delete Record from REDCap by using the Record ID,
### which is the same as the speaker, which is patient ID.
```

### Checklist

- [ ] The specified patient ID (record ID) is deleted from REDCap
- [ ] The record is no longer retrievable after deletion
- [ ] Deletion was performed only in the appropriate test environment

---

## Validation Summary (Optional)

- Patient Interface Scoring Stored: ☐ Complete / ☐ Incomplete
- Survey Submission Stored in DB: ☐ Complete / ☐ Incomplete
- REDCap Storage Verified: ☐ Complete / ☐ Incomplete
- REDCap Record Deletion Verified: ☐ Complete / ☐ Incomplete

---

## Change Log

- YYYY-MM-DD: Initial version created
