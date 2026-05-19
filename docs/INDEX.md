# Documentation Index

Top-level catalog of all docs under `docs/`. Updated 2026-04-28.

---

## Setup / Deployment — [`setup/`](setup/)

| Document | Use for |
|---|---|
| [`DEPLOYMENT_NATIVE.md`](setup/DEPLOYMENT_NATIVE.md) | Native Postgres / Redis / Backend + Docker for NLP and webapp only. End-to-end fresh-deploy walkthrough. |

---

## Architecture — [`architecture/`](architecture/)

| Document | Use for |
|---|---|
| [`ARCHITECTURE.md`](architecture/ARCHITECTURE.md) | Deployment topology, repo layout, module map, request flow. |
| [`DATABASE_SCHEMA.md`](architecture/DATABASE_SCHEMA.md) | All 19 tables — columns, FKs, table groups. |

---

## ML / NLP Pipeline — [`ml-pipeline/`](ml-pipeline/)

| Document | Use for |
|---|---|
| [`ML_PIPELINE.md`](ml-pipeline/ML_PIPELINE.md) | NLP 7-step + AI 5-step pipeline, models, output format, standalone runner. |

---

## Features — [`features/`](features/)

| Document | Use for |
|---|---|
| [`Frontend_REDCap_Field_Mapping.md`](features/Frontend_REDCap_Field_Mapping.md) | Frontend field → REDCap variable mapping. |
| [`Concurrent_REDCap_API_Access_Management.md`](features/Concurrent_REDCap_API_Access_Management.md) | REDCap concurrent-access design. |
| [`REDCap_Instruments_Fields_Documentation.md`](features/REDCap_Instruments_Fields_Documentation.md) | REDCap instruments and fields reference. |
| [`REDCap_AI_Workflow_Ella.md`](features/REDCap_AI_Workflow_Ella.md) | AI workflow design context. |
| [`redcap-dashboard-integration-idea.md`](features/redcap-dashboard-integration-idea.md) | Integration design notes. |
| [`PATIENT_INTERFACE.md`](features/PATIENT_INTERFACE.md) | Patient page validation checklist. |
| [`DOCTOR_INTERFACE.md`](features/DOCTOR_INTERFACE.md) | Doctor page validation checklist. |
| [`Query_string.md`](features/Query_string.md) | URL parameter routing. |

---

## Security & Compliance — [`security/`](security/)

| Document | Use for |
|---|---|
| [`SECURITY_AUDIT.md`](security/SECURITY_AUDIT.md) | OWASP vulnerability audit. |
| [`PHI_COMPLIANCE.md`](security/PHI_COMPLIANCE.md) | Azure PHI handling requirements. |

---

## Developer References (outside `docs/`)

| Document | Use for |
|---|---|
| [`../README.md`](../README.md) | Top-level overview + quick start. |
| [`../app/Backend/README_V5.md`](../app/Backend/README_V5.md) | Backend setup + endpoints. |
| [`../app/Webapp/README.md`](../app/Webapp/README.md) | Webapp overview. |
| [`../app/Webapp/COMPONENT_STATE_MAP.md`](../app/Webapp/COMPONENT_STATE_MAP.md) | Webapp component → state store. |
| [`../../IVAN_CODE_REVIEW_STANDARDS.md`](../../IVAN_CODE_REVIEW_STANDARDS.md) | Manager's 16 code review principles. |
| [`../dev_docs/`](../dev_docs/) | Internal development notes (mostly Korean). |
| `../../meeting_notes/` | Meeting records (project-wide, in the parent folder). |

---

## Presentations (in this folder)

- [`NLP + AI R01 Visualization Plan.pdf`](NLP%20+%20AI%20R01%20Visualization%20plan%209%204%2025.pdf) / [`.pptx`](NLP%20+%20AI%20R01%20Visualization%20plan%209%204%2025.pptx)
- [`System integration.pptx`](System%20integration.pptx)
- [`nlp-pilot-manual-scores(cp).pdf`](nlp-pilot-manual-scores%28cp%29.pdf) — ground-truth scoring reference

---

## Archived — [`archive/`](archive/)

Historical design discussions, open questions, working notes. Kept for context; no longer authoritative.
