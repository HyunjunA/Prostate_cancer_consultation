# Patient Dashboard URL Routing Guide

## URL Format

```
http://localhost:3000/?fileid={FILE_NAME}&patid={PATIENT_ID}
```

## Parameters

| Parameter | Description        | Example                                 |
| --------- | ------------------ | --------------------------------------- |
| `fileid`  | Excel file name    | `quality-coded-nlp-pilot-sid-1.xlsx`    |
| `patid`   | Patient speaker ID | `Patient_quality-coded-nlp-pilot-sid-1` |

## Data Flow

```
URL Parameters
     │
     ▼
┌─────────────────────────────────┐
│  page.tsx                       │
│  - fileid → useFileId store     │
│  - patid → usePatientId store   │
│  - Saved to localStorage        │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  PatientReport.tsx              │
│  - currentFile = fileId         │
│  - currentSpeaker = patientId   │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│  API Call                       │
│  GET /api/patient/summaries/    │
│      {file}/{speaker}           │
└─────────────────────────────────┘
```

## Example

**URL:**

```
http://localhost:3000/?fileid=quality-coded-nlp-pilot-sid-1.xlsx&patid=Patient_quality-coded-nlp-pilot-sid-1
```

**API Request:**

```
GET /api/patient/summaries/quality-coded-nlp-pilot-sid-1.xlsx/Patient_quality-coded-nlp-pilot-sid-1
```

## Priority

1. **URL parameter** (highest priority)
2. **localStorage** (if URL param missing)
3. **Default value** (fallback)

## Related Files

| File                | Location          | Purpose                     |
| ------------------- | ----------------- | --------------------------- |
| `useFileId.tsx`     | `src/stores/`     | File ID state management    |
| `usePatientId.tsx`  | `src/stores/`     | Patient ID state management |
| `page.tsx`          | `src/app/`        | URL parameter handling      |
| `PatientReport.tsx` | `src/components/` | API integration             |
