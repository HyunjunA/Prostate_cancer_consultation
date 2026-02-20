# REDCap-Dashboard Integration Architecture

## Overview

This document outlines the integration approach for connecting a web application (dashboard) with REDCap for managing patient follow-up surveys without exposing Protected Health Information (PHI).

### Surveys to be Integrated

- Decisional Conflict Survey
- Shared Decision Making (SDM)
- Post Risk Perception
- Patient Satisfaction

All surveys are post-follow-up and must not contain PHI.

---

## Data Flow

```
[Web App] ──(1) Save──→ [REDCap]
    │                      │
    └──(2) Retrieve←───────┘
```

1. **Web App → REDCap**: Patient completes survey in web app → Data saved to REDCap project
2. **REDCap → Web App**: Existing survey data from REDCap → Displayed in web app

---

## Patient Identification Method

### URL-Based Identification

Each patient receives a personalized URL containing their study ID:

```
https://app.example.com/survey?pid=PC001
```

### Flow

```
Personalized URL sent to patient
         ↓
https://app.example.com/survey?pid=PC001
         ↓
Web app extracts pid parameter
         ↓
Query REDCap API with study ID
         ↓
Display patient's existing survey data + New survey form
```

### Advantages

- No login required
- PHI-free identification (study ID only)
- URL serves as authentication

---

## Security Considerations

### 1. URL Security

Simple sequential study IDs (PC001, PC002...) are guessable. Recommended approaches:

**Option A: Add random token**

```
?pid=PC001&token=a8f3k2x9
```

**Option B: Use UUID**

```
?pid=a1b2c3d4-e5f6-7890-abcd-1234567890ab
```

### 2. Link Expiration

Consider implementing:

- Expiration after survey completion
- Time-based expiration (e.g., 7 days after issuance)

### 3. Duplicate Submission Prevention

Define policy for:

- Allow multiple submissions (track timestamps)
- One-time submission only (disable link after completion)

---

## Technical Implementation

### REDCap API Endpoints

| Function       | API Method | Purpose                       |
| -------------- | ---------- | ----------------------------- |
| Export Records | `POST`     | Retrieve existing survey data |
| Import Records | `POST`     | Save new survey responses     |

### Required Information

1. REDCap API URL
2. API Token (project-specific)
3. Field names for each survey instrument
4. Study ID field name (`record_id`)

---

## PHI Compliance

### Data Stored in Web App

- Study ID only
- Survey responses
- Timestamps

### Data NOT Stored in Web App

- Patient name
- MRN
- Date of birth
- Contact information
- Any other PHI

### Mapping Table

The Study ID ↔ Patient Name mapping remains exclusively within REDCap with restricted access.

---

## Next Steps

1. [ ] Confirm REDCap API access and obtain API token
2. [ ] Finalize study ID format and URL structure
3. [ ] Confirm field names for all 4 survey instruments
4. [ ] Determine link expiration and duplicate submission policies
5. [ ] Begin API integration testing

---

## Questions for Ella/Research Team

1. Is the study ID system already established in the REDCap project?
2. Can we obtain an API token for the project?
3. Are the survey field names finalized?
4. What is the preferred link expiration policy?
5. Should patients be able to edit/resubmit surveys?
