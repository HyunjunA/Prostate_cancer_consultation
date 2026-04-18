# AI Physician-Patient Communication Pipeline — TODO

> Production readiness audit and improvement items.  
> Target: `prostate_cancer_project/AI_physician_patient_communication/`  
> Created: 2026-04-13  
> Verdict: **NOT production-ready** — critical security + reliability gaps

---

## CRITICAL (Immediate)

| # | Area | Item | Detail | Impact |
|---|------|------|--------|--------|
| 1 | Security | **Revoke exposed Azure API key** | `ai_pipeline/.env` contains live key `5b88e...` committed to git. Revoke in Azure portal immediately, generate new key, use secrets manager only | Credential compromise risk |
| 2 | Security | **Remove credentials from version control** | `.env` is committed; `.gitignore` doesn't block it. Run `git rm --cached ai_pipeline/.env`, add `.env` to `.gitignore`, scrub git history with BFG | Exposed secrets in git history |
| 3 | Security | **Remove hardcoded DB password from config.yaml** | `password: "secure_password_123"` on line 45. Use `PIPELINE_DB_PASSWORD` env var only | Credential exposure |
| 4 | Dependencies | **Add missing packages to requirements.txt** | `openai`, `pydantic`, `tqdm`, `python-dotenv` are used but not listed. `pip install -r requirements.txt` fails for ai_pipeline | Broken installation |

---

## HIGH (1–2 weeks)

### Error Handling & Reliability

| # | Area | Item | Detail |
|---|------|------|--------|
| 5 | AI Pipeline | **Add retry logic to LLM calls** | `ai_pipeline/llm.py` has no retry for Azure OpenAI API. Add exponential backoff (3 retries, 2^n wait). Single transient error currently stops entire domain |
| 6 | Backend | **Transaction-based DB persistence** | `main_pipeline.py:103-120` — DB writes are non-blocking fire-and-forget. Partial writes leave inconsistent state. Wrap in transaction with rollback |
| 7 | NLP API | **Validate NLP response structure** | `classification.py:107` — `.get(".pred_1", 0.0)` silently defaults on missing key. Can't distinguish real 0.0 from API error. Add schema validation |
| 8 | Pipeline | **Add startup health checks** | Verify R + rpy2, Docker NLP containers, Azure OpenAI connectivity, PostgreSQL before processing any files |

### Observability

| # | Area | Item | Detail |
|---|------|------|--------|
| 9 | Logging | **Implement structured logging** | Currently uses `%`-formatting. Switch to `structlog` with JSON output. Log start/end time and duration per step |
| 10 | Metrics | **Track execution metrics** | Sentences segmented/classified/selected per run, NLP API latencies, LLM token costs, step execution times |
| 11 | Debugging | **Log NLP API requests/responses** | Currently no request/response logging for classification API calls. Add for debugging (sanitize PHI) |

### Missing Implementation

| # | Area | Item | Detail |
|---|------|------|--------|
| 12 | AI Pipeline | **Implement Step 8 (AI Selector)** | `main_pipeline.py:98` — marked TODO. Single consultation-level estimate for physician dashboard not yet built |
| 13 | AI Pipeline | **Implement Step 9 (AI Patient Reformat)** | `main_pipeline.py:100` — marked TODO. Patient-friendly AI summary not generating actual AI output; currently uses top-3 concatenation |

---

## MEDIUM (2–4 weeks)

### Testing

| # | Area | Item | Detail |
|---|------|------|--------|
| 14 | AI Pipeline | **Add unit tests for ai_pipeline/ modules** | No tests exist for scoring, extraction, filtering, selection, reformat. Mock Azure OpenAI for deterministic tests |
| 15 | AI Pipeline | **Test error paths** | Malformed LLM output, out-of-bounds selection index, missing columns in input data |
| 16 | Pipeline | **Add end-to-end test with Azure** | Full pipeline test with real API (use small transcript, verify all 5 domains produce output) |

### Deployment

| # | Area | Item | Detail |
|---|------|------|--------|
| 17 | Dependencies | **Pin dependency versions** | `>=` → `==` in requirements.txt (e.g., `pandas==2.0.3`). Test on Python 3.9 and 3.11 |
| 18 | Docker | **Containerize standalone pipeline** | Create Dockerfile including R + stringi. Document volume mounting for Backend docker-compose |
| 19 | CI/CD | **Add GitHub Actions** | Lint (black, isort), type check (mypy), test (pytest). Pre-commit hooks |

### Security

| # | Area | Item | Detail |
|---|------|------|--------|
| 20 | PHI | **Output file encryption** | CSVs contain full physician-patient dialogue. Add encryption at rest for output files |
| 21 | PHI | **Secure temp file deletion** | Temp files created during processing not explicitly cleaned. Overwrite before removing |
| 22 | PHI | **Data access audit trail** | No logging of who accessed which patient data. Add audit table |
| 23 | Config | **Input path validation** | config.yaml accepts arbitrary paths with no validation. Add path sanitization |

### Code Quality

| # | Area | Item | Detail |
|---|------|------|--------|
| 24 | AI Pipeline | **Move treatment names to config** | `extraction.py:14-16` hardcodes "surgery", "radiation", "ablation therapy". Should be in config.yaml |
| 25 | Pipeline | **Add domain-to-class mapping config** | `convert_output_to_csv.py` duplicates domain→class_number mappings from frontend. Single source of truth needed |

### Documentation

| # | Area | Item | Detail |
|---|------|------|--------|
| 26 | Deployment | **Secrets management guide** | Document how to configure Azure Key Vault / env vars for production |
| 27 | Data | **Input/output schema documentation** | Column requirements for input CSVs, output CSV column definitions, DB schema ERD |
| 28 | Operations | **Troubleshooting guide** | Common R errors, NLP API failures, Azure rate limits, recovery procedures |

---

## LOW (Backlog)

| # | Area | Item | Detail |
|---|------|------|--------|
| 29 | Performance | **Async NLP API calls** | `asyncio` + `aiohttp` for concurrent classification. Currently blocking HTTP |
| 30 | Performance | **Parallel domain processing** | 5 domains processed sequentially in ai_pipeline. Can parallelize |
| 31 | Performance | **Batch LLM calls** | Score 10 sentences in one prompt instead of 10 separate calls |
| 32 | Performance | **Cache sentence segmentation** | R via rpy2 is expensive. Cache results for repeated analysis |
| 33 | Resilience | **Resume/checkpoint system** | Save state after each step. Resume from last checkpoint on failure |
| 34 | Resilience | **Batch processing mode** | Accept directory of transcripts, process with worker pool, aggregate results |
| 35 | Tracing | **Data lineage tracking** | Log provenance of each output row, audit trail of transformations |
| 36 | Long-term | **ONNX model conversion** | R Docker (1.41GB) → Python ONNX runtime (~200MB). Not needed at research scale |

---

## Priority Summary

| Level | Count | Focus |
|-------|:-----:|-------|
| **CRITICAL** | 4 | Security (API key revocation, credentials removal) + dependency fix |
| **HIGH** | 9 | Error handling, observability, missing AI pipeline steps |
| **MEDIUM** | 15 | Testing, deployment, PHI protection, code quality, documentation |
| **LOW** | 8 | Performance optimization, resilience, tracing |
| **Total** | **36** | |

---

## File-Specific Issues

| File | Line | Issue | Priority |
|------|------|-------|----------|
| `ai_pipeline/.env` | — | Live Azure API key committed to git | CRITICAL |
| `config.yaml` | 45 | Hardcoded DB password | CRITICAL |
| `requirements.txt` | — | Missing openai, pydantic, tqdm, python-dotenv | CRITICAL |
| `.gitignore` | — | Doesn't block `.env` files | CRITICAL |
| `ai_pipeline/llm.py` | — | No retry logic for Azure API | HIGH |
| `main_pipeline.py` | 103-120 | DB persistence fire-and-forget, no transaction | HIGH |
| `main_pipeline.py` | 98 | Step 8 (AI Selector) not implemented — TODO | HIGH |
| `main_pipeline.py` | 100 | Step 9 (AI Patient Reformat) not implemented — TODO | HIGH |
| `classification.py` | 107 | Silent default on missing `.pred_1` key | HIGH |
| `extraction.py` | 14-16 | Hardcoded treatment names | MEDIUM |
| `convert_output_to_csv.py` | — | Duplicated domain→class mappings | MEDIUM |

---

## Estimated Effort

| Phase | Duration | Focus |
|-------|----------|-------|
| Week 1 | Security + Dependencies | Revoke keys, fix requirements.txt, add .gitignore entries, remove hardcoded passwords |
| Week 2 | Error Handling + Observability | Retry logic, transaction support, structured logging, health checks |
| Week 3 | Testing + Documentation | ai_pipeline unit tests, deployment guide, troubleshooting docs |
| Total | ~80-100 hours | For full production readiness |
