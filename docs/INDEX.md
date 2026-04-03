# Documentation Index

> All project documentation in one place. Start here.
> Updated: 2026-04-03
> EN/KR bilingual documents are marked with (EN/KR).

---

## Getting Started

| Document | Description |
|----------|-------------|
| [README](../README.md) | Quick Start, Docker setup, environment config, API examples |
| [Backend README](../app/Backend/README_V5.md) | Backend-specific setup, endpoints, DB details |
| [Webapp README](../app/Webapp/README.md) | Frontend component overview |

---

## Setup

| Document | Description |
|----------|-------------|
| [Docker Setup](setup/DOCKER_SETUP.md) | Consolidated Docker setup — prerequisites, services, env config, startup, troubleshooting |
| [Local Setup](setup/LOCAL_SETUP.md) | Running locally without Docker — PostgreSQL, venv, frontend |

---

## Architecture

| Document | Description |
|----------|-------------|
| [System Architecture](architecture/SYSTEM_ARCHITECTURE.md) (EN/KR) | Full system overview — pipeline steps, DB tables, API flow |
| [Architecture Diagrams](architecture/ARCHITECTURE_DIAGRAMS.md) | 12 Mermaid diagrams — Docker topology, ER diagram, data flow, deployment |
| [Database Schema](architecture/DATABASE_SCHEMA.md) (EN/KR) | 12 tables detailed — columns, types, FK relationships, indexes |
| [Full Pipeline Guide](architecture/FULL_PIPELINE_GUIDE.md) | Steps 1-10 detailed — input/output examples, DataFrame transformations |

---

## ML Pipeline

| Document | Description |
|----------|-------------|
| [Pipeline Architecture](ml-pipeline/ML_PIPELINE_ARCHITECTURE.md) (EN/KR) | 7-module pipeline design |
| [Pipeline Overview](ml-pipeline/ML_PIPELINE_OVERVIEW.md) (EN/KR) | High-level pipeline summary |
| [Pipeline Spec (Final)](ml-pipeline/NLP_PIPELINE_SPEC_FINAL.md) | Detailed specification |
| [Implementation Plan](ml-pipeline/NLP_PIPELINE_IMPLEMENTATION_PLAN.md) | Step-by-step implementation plan |
| [Development Status](ml-pipeline/ML_PIPELINE_DEVELOPMENT_STATUS.md) (EN/KR) | Current development status |
| [Michael's NLP Classifiers](ml-pipeline/NLP_PIPELINE_UPDATE_MICHAELS_CLASSIFIERS.md) (EN/KR) | R plumber model analysis |
| [Pipeline Comparison](ml-pipeline/COMPARISON_AND_PLAN_process-data-guille_vs_r01-nlp-classifiers-docker.md) (EN/KR) | Guille vs Michael pipeline comparison |

---

## Features

| Document | Description |
|----------|-------------|
| [REDCap Field Mapping](features/Frontend_REDCap_Field_Mapping.md) | Frontend field → REDCap variable mapping |
| [REDCap API Access](features/Concurrent_REDCap_API_Access_Management.md) | Concurrent access management |
| [REDCap Instruments](features/REDCap_Instruments_Fields_Documentation.md) | REDCap instruments and fields |
| [REDCap AI Workflow](features/REDCap_AI_Workflow_Ella.md) | Ella's AI workflow design |
| [REDCap API Playground](features/Redcap_api_playground.md) | API testing notes |
| [REDCap Dashboard Integration](features/redcap-dashboard-integration-idea.md) | Integration design notes |
| [Doctor Interface](features/DOCTOR_INTERFACE.md) | Doctor data persistence checklist |
| [Patient Interface](features/PATIENT_INTERFACE.md) | Patient data persistence checklist |
| [Query String](features/Query_string.md) | Query string parameter documentation |
| [Testing](features/Test.md) | Testing guidelines |

---

## Security & Compliance

| Document | Description |
|----------|-------------|
| [Security Audit](security/SECURITY_AUDIT.md) | OWASP vulnerability audit (20 identified, 6 fixed) |
| [PHI Compliance](security/PHI_COMPLIANCE.md) | Azure PHI handling requirements |

---

## Developer Guides

| Document | Description |
|----------|-------------|
| [Ivan Code Review Standards](../../IVAN_CODE_REVIEW_STANDARDS.md) | 16 principles from Ivan's code reviews |
| [Backend Improvements TODO](../dev_docs/BACKEND_IMPROVEMENTS_TODO_KR.md) | Pending backend improvements (KR) |
| [Component State Map](../app/Webapp/COMPONENT_STATE_MAP.md) | Webapp component → state store mapping |

---

## Analysis Reports (date-stamped)

| Date | Document | Description |
|------|----------|-------------|
| 2026-04-02 | [DB Optimization](../dev_docs/2026-04-02_DB_ISSUES_ANALYSIS.md) | 17 DB issues identified + all fixed |
| 2026-04-02 | [ML Model Deployment](../dev_docs/2026-04-02_ML_MODEL_DEPLOYMENT_OPTIMIZATION.md) | 8 NLP serving optimization items |
| 2026-04-02 | [Webapp Optimization](../dev_docs/2026-04-02_WEBAPP_OPTIMIZATION_ANALYSIS.md) | 10 frontend optimization items |
| 2026-04-02 | [Project Structure](../dev_docs/2026-04-02_PROJECT_STRUCTURE_ANALYSIS.md) | Full codebase analysis |

---

## Presentations

| File | Description |
|------|-------------|
| [NLP Visualization Plan (PDF)](NLP%20+%20AI%20R01%20Visualization%20plan%209%204%2025.pdf) | Original visualization plan |
| [System Integration (PPTX)](System%20integration.pptx) | System integration overview |
| [Manual Scores Reference (PDF)](nlp-pilot-manual-scores(cp).pdf) | Ground truth scoring reference |

---

## Daily Control Logs

Location: [`daily_control_logs/`](../daily_control_logs/)

Format:
```
YYYY-MM-DD_control.txt          — English, Technical Detail
YYYY-MM-DD_control_summary.txt  — English, Summary
YYYY-MM-DD_control_kr.txt       — Korean, Technical Detail
YYYY-MM-DD_control_kr_summary.txt — Korean, Summary
```

---

## Archived

| Document | Description |
|----------|-------------|
| [discussion.md](archive/discussion.md) | Historical design discussions |
| [questions.md](archive/questions.md) | Historical open questions |
| [temp.md](archive/temp.md) | Working notes |

---

## Quick Reference

| Looking for... | Go to |
|----------------|-------|
| How to run the project | [README.md](../README.md) |
| Docker setup (consolidated) | [DOCKER_SETUP.md](setup/DOCKER_SETUP.md) |
| Local development | [LOCAL_SETUP.md](setup/LOCAL_SETUP.md) |
| System architecture diagram | [ARCHITECTURE_DIAGRAMS.md](architecture/ARCHITECTURE_DIAGRAMS.md) |
| Database table details | [DATABASE_SCHEMA.md](architecture/DATABASE_SCHEMA.md) |
| Pipeline step-by-step | [FULL_PIPELINE_GUIDE.md](architecture/FULL_PIPELINE_GUIDE.md) |
| ML pipeline docs | [ml-pipeline/](ml-pipeline/) |
| Ivan's coding rules | [IVAN_CODE_REVIEW_STANDARDS.md](../../IVAN_CODE_REVIEW_STANDARDS.md) |
| API endpoint list | [README.md](../README.md#api-endpoints-75-total) |
| Docker services | [README.md](../README.md#docker-services) |
| Config parameters | [config.yaml](../app/Backend/config.yaml) |
| Environment variables | [README.md](../README.md#environment-configuration) |
| Security vulnerabilities | [SECURITY_AUDIT.md](security/SECURITY_AUDIT.md) |
| What was done today | [daily_control_logs/](../daily_control_logs/) |
