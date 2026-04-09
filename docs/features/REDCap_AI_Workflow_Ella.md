# Cedars-Sinai R01 Study — REDCap & AI Dashboard Integration (Ella’s Explanation)

## 🧭 Overview
This document summarizes how **Ella** described the workflow of data handling in the R01 prostate cancer consultation dashboard study, including how **REDCap**, **TurboScribe**, and the **AI data processing server** interact.

The system processes patient–physician consultation data (audio → transcript → AI summary → dashboard → REDCap).  
The diagram below represents the logical data flow:

```
raw transcripts ──▶ Data Processing Server ──▶ Processed Data
                         │
                         ▼
                     Dashboard
```

---

##  1. Data Generation and Transcription
### Source: Consultation Recordings
- Each consultation between physician and patient is **audio-recorded** (e.g., `.wav`, `.mp3`).
- These recordings contain **PHI (Protected Health Information)** and are stored securely.
- REDCap is **not involved** at this stage.

### Transcription via TurboScribe
> Ella: “From that recording, we are going to use TurboScribe, which is going to transcribe everything, and separate out the physician and the patient.”

- **TurboScribe** automatically converts audio → text (Speech-to-Text).  
- It also performs **speaker diarization**, labeling text as “Physician” and “Patient”.
- The output is a **raw transcript**, which becomes input for the AI processing server.

---

## 🧠 2. Data Processing Server
This is where the AI models operate. It performs three key tasks:

| Component | Function |
|------------|-----------|
| **Sentence Classifier** | Identifies and categorizes clinical sentences (e.g., diagnosis, recommendation, risk discussion). |
| **AI Scoring Model** | Rates physician–patient communication quality (clarity, empathy, completeness). |
| **AI Summary / Rewriter** | Generates concise, patient-friendly summaries for both patient and physician dashboards. |

Output: structured JSON or CSV containing:
- Extracted key points  
- AI-generated summaries  
- Communication scores  
- Metadata (timestamps, model version)

These results form the **Processed Data** layer.

---

## 💻 3. Dashboard Integration
> Ella: “Currently, how it works is, from your page I would download it and then click upload file … for the patient and physician.”

The dashboard displays results from the processing server:
- **Patient-facing view** → shows simplified AI summaries.
- **Physician-facing view** → includes communication feedback and rewrite suggestions.

Current implementation:
- Jun (developer) hosts the dashboard prototype.
- Data is not yet dynamically connected to REDCap; outputs are **downloaded manually** as PDF reports.

---

## 🧾 4. REDCap as the Research Database
REDCap acts as the **core research data repository**, not the processing engine.  
Ella’s workflow involves uploading the AI output into REDCap for study tracking.

### REDCap Stores:
| Data Type | Example Fields |
|------------|----------------|
| **Demographics** | Name, DOB, contact, provider |
| **Survey Responses** | Health literacy, numeracy, decision conflict |
| **AI Reports** | Uploaded PDF summaries (patient & physician) |
| **Follow-up Data** | Subsequent visits, patient feedback |
| **Consent & Admin Info** | Signatures, consent status, audit logs |

Future plan: automate upload via **REDCap API** instead of manual file upload.

---

##  5. Combined Data Flow Summary
```text
(1) Physician–Patient Consultation → Audio Recording
        ↓
(2) TurboScribe → Speech-to-Text Transcription (speaker-separated)
        ↓
(3) AI Data Processing Server
        ├─ Sentence classification
        ├─ AI scoring
        └─ AI summarization (rewriting)
        ↓
(4) Dashboard (for visualization)
        ↓
(5) Processed summaries exported (PDF)
        ↓
(6) REDCap upload (Manual now → API planned)
        ↓
(7) REDCap integrates with surveys, consent forms, and follow-ups
```

---

## 🧩 PHI Classification
| Stage | Contains PHI? | Notes |
|--------|----------------|-------|
| Audio recordings |  Yes | Voice, names, clinical context |
| Transcripts (TurboScribe) |  Yes | Patient/physician statements |
| Processed data (AI summaries) |  Yes (indirect PHI) | Derived from identifiable dialogue |
| Dashboard display |  Yes | Personalized patient data |
| REDCap stored files |  Yes | Reports, demographics, surveys |

---

## 🧠 Key Insight from Ella’s Explanation
- REDCap is **not a live integration layer** but the **final repository**.  
- The **AI processing server + dashboard** handle transformation and presentation.  
- Long-term vision: connect dashboard → REDCap API for automated ingestion.  
- All stages (recording → summary) involve **PHI** and must follow **HIPAA compliance** standards.

---

*Document compiled from Ella’s meeting discussion and integration diagram.*
