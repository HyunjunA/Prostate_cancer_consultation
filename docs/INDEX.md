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
| [`REDCap_Factors_MultiSelect_Issue.md`](features/REDCap_Factors_MultiSelect_Issue.md) | Known issue + fix plan: first-visit "factors" multi-select saves only one value to REDCap (REDCap radio vs UI checkbox mismatch). |
| [`REDCap_AI_Workflow_Ella.md`](features/REDCap_AI_Workflow_Ella.md) | AI workflow design context. |
| [`redcap-dashboard-integration-idea.md`](features/redcap-dashboard-integration-idea.md) | Integration design notes. |
| [`PATIENT_INTERFACE.md`](features/PATIENT_INTERFACE.md) | Patient page validation checklist. |
| [`DOCTOR_INTERFACE.md`](features/DOCTOR_INTERFACE.md) | Doctor page validation checklist. |
| [`Query_string.md`](features/Query_string.md) | URL parameter routing. |

---

## Operations — [`operations/`](operations/)

| Document | Use for |
|---|---|
| [`RUNBOOK.md`](operations/RUNBOOK.md) | **Something is broken — what do I do?** Triage, per-service diagnosis, restart, rebuild, rollback, database restore. |
| [`INCIDENT_RESPONSE.md`](operations/INCIDENT_RESPONSE.md) | **Suspected patient-data exposure.** Contain, preserve evidence, report, scope, remediate. Read before touching anything. |

---

## Security & Compliance — [`security/`](security/)

| Document | Use for |
|---|---|
| [`PRODUCTION_READINESS.md`](security/PRODUCTION_READINESS.md) | What is missing before this can be called production — ten axes, measured. Supersedes `SECURITY_AUDIT.md`. |
| [`PHI_COMPLIANCE.md`](security/PHI_COMPLIANCE.md) | Azure PHI handling requirements. |
| [`SECURITY_AUDIT.md`](security/SECURITY_AUDIT.md) | OWASP audit from 2026-02-12. **Largely stale** — assumes nginx + a Dockerised backend, which is not the current deployment. |
| [`INCIDENT_2026-08-25_ADMIN_LOGIN.md`](security/INCIDENT_2026-08-25_ADMIN_LOGIN.md) | Why admin login bounced back to the login page for 12 days: the systemd migration emptied the process environment, so `jwt_auth.py`'s `os.getenv` signed with the development fallback. Read before adding config that `os.getenv` reads. |

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
