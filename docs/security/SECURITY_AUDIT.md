# Security Audit Report: Prostate Cancer Consultation Dashboard Backend

**Date**: 2026-02-12
**Scope**: `Prostate_cancer_consultation_dashboard/app/Backend/`
**Auditor**: Claude Code (Automated Analysis)
**Stack**: FastAPI + PostgreSQL 13 + Redis 7 + Docker Compose + Nginx

---

## Executive Summary

After analyzing the overall security posture of the backend, **4 Critical, 5 High, 6 Medium, and 3 Low** security issues were identified.

The most urgent issues are **hardcoded secrets/credentials**, **disabled Nginx security settings**, **unauthenticated Redis access**, and **file path traversal vulnerability**.

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 4 | Immediate action required |
| High | 5 | Must resolve before deployment |
| Medium | 6 | Planned improvement recommended |
| Low | 3 | Long-term improvement items |

---

## Critical Findings

### C-1. Hardcoded Database Credentials

**File**: `docker-compose.yml:8-9, 66`

```yaml
# docker-compose.yml
POSTGRES_USER: prostatecancer_user
POSTGRES_PASSWORD: secure_password_123    # <-- hardcoded


# backend environment
DATABASE_URL: postgresql+asyncpg://prostatecancer_user:secure_password_123@postgres:5432/prostatecancer_db
```

**Risk**: If the source code is leaked, direct DB access is possible. These credentials are likely already recorded in Git history.

**Recommended Actions**:
- Remove the password from `docker-compose.yml` and reference it as a variable from the `.env` file
- Switch to Docker Secrets or environment variable injection
- Change the current password immediately
- Remove credentials from Git history (`git filter-branch` or `BFG Repo-Cleaner`)

```yaml
# Recommended approach
environment:
  POSTGRES_USER: ${POSTGRES_USER}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

---

### C-2. API Key and REDCap Token Exposed in Plaintext

**File**: `.env:40, 49`, `docker-compose.yml:109`

```bash
# .env
API_KEY=REDACTED_API_KEY
REDCAP_API_TOKEN=BB714F7B3BFE9ED3A93101639911D26A

# docker-compose.yml (webapp)
NEXT_PUBLIC_API_KEY: REDACTED_API_KEY   # <-- exposed to client
```

**Risk**:
- `.env` is included in `.gitignore` so it does not get committed to Git (good)
- However, the API key is hardcoded in `docker-compose.yml` and committed to Git
- The `NEXT_PUBLIC_` prefix causes Next.js to **expose the variable to the browser**. This means the API key is included in the client JavaScript bundle and visible to anyone
- The REDCap API token is an access key to a medical data system; if leaked, there is a risk of PHI (Protected Health Information) exposure

**Recommended Actions**:
- Remove `NEXT_PUBLIC_API_KEY` and handle API calls server-side (via Next.js API Routes)
- Manage the REDCap token with Docker Secrets or a vault
- Reissue all API keys immediately

---

### C-3. Unauthenticated Redis Access

**File**: `docker-compose.yml:29-34`, `redis_client.py:17`

```yaml
# Redis service - no password
redis:
  image: redis:7
  command: ["redis-server", "--appendonly", "yes"]
  # no --requirepass option
```

```python
# redis_client.py
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# URL without authentication
```

**Risk**: All containers on the same Docker network can access Redis without restriction. Cache data can be queried/modified/deleted. If the network is compromised, NLP prediction results can be manipulated.

**Recommended Actions**:
```yaml
redis:
  command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
```
```python
REDIS_URL = "redis://:${REDIS_PASSWORD}@redis:6379/0"
```

---

### C-4. Path Traversal Vulnerability

**File**: `routes_transcript.py:276-277`

```python
def _xlsx_path(patient_id: str) -> Path:
    return _UPLOAD_DIR / f"{patient_id}_predictions.xlsx"
```

**Risk**: There is no path validation for `patient_id`. An attacker could pass a value like `patient_id=../../etc/passwd` to write or read files at arbitrary locations on the file system.

The `download` endpoint receives `patient_id` directly and constructs a file path:
```python
@router.get("/download/{patient_id}")
async def download(patient_id: str, ...):
    filepath = _xlsx_path(patient_id)  # path constructed without validation
```

**Recommended Actions**:
```python
import re

def _sanitize_patient_id(patient_id: str) -> str:
    """Allow only alphanumeric, hyphens, underscores."""
    if not re.match(r'^[a-zA-Z0-9_-]+$', patient_id):
        raise ValueError(f"Invalid patient_id: {patient_id}")
    return patient_id

def _xlsx_path(patient_id: str) -> Path:
    safe_id = _sanitize_patient_id(patient_id)
    path = (_UPLOAD_DIR / f"{safe_id}_predictions.xlsx").resolve()
    # Ensure path is within UPLOAD_DIR
    if not str(path).startswith(str(_UPLOAD_DIR.resolve())):
        raise ValueError("Path traversal detected")
    return path
```

---

## High Findings

### H-1. All Nginx Security Settings Disabled

**File**: `Webapp/nginx_setup/default.conf`

The currently active Nginx configuration (line 93-127) has **no security-related settings at all**. Security settings exist in the commented-out section (line 1-85) but are inactive:

| Setting | Current Status | Risk |
|---------|---------------|------|
| `X-Content-Type-Options: nosniff` | Disabled | MIME sniffing attacks |
| `X-Frame-Options: DENY` | Disabled | Clickjacking |
| `X-XSS-Protection` | Disabled | XSS attacks |
| `Referrer-Policy` | Disabled | Referrer information leakage |
| `server_tokens off` | Disabled | Nginx version exposure |
| Rate Limiting (`limit_req`) | Disabled | DoS attacks |
| Hidden file access blocking | Disabled | Sensitive file exposure (`.env`, etc.) |
| `proxy_hide_header X-Powered-By` | Disabled | Server technology stack exposure |

**Recommended Actions**: Activate the commented-out security settings and apply additional headers:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

---

### H-2. API Authentication Relies on a Single Static Key

**File**: `routes_transcript.py:32-41`, `routes_nlp.py:37-46`

```python
_API_KEY = os.getenv("API_KEY", "default-dev-key")  # dangerous fallback

async def _verify_api_key(api_key: str = Depends(_api_key_header)):
    if api_key != _API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
```

**Issues**:
- **Single key**: All clients use the same API key. If the key is leaked, the entire system is exposed
- **Fallback value**: If the `API_KEY` environment variable is not set, it operates with `"default-dev-key"` -- dangerous in production
- **Timing attack**: The `!=` comparison takes different amounts of time depending on string length, making it vulnerable to brute force attacks
- **No key rotation**: With a single static key, all clients are simultaneously affected when the key is replaced
- **Exposure in transit**: Without HTTPS, the API key is transmitted in plaintext in the header

**Recommended Actions**:
```python
import hmac

_API_KEY = os.getenv("API_KEY")
if not _API_KEY:
    raise RuntimeError("API_KEY must be set in production")

async def _verify_api_key(api_key: str = Depends(_api_key_header)):
    if api_key is None or not hmac.compare_digest(api_key, _API_KEY):
        raise HTTPException(status_code=403, detail="Forbidden")
```

---

### H-3. HTTPS/TLS Not Configured

**File**: `docker-compose.yml`, `default.conf`

```yaml
# Nginx: HTTP only
ports:
  - "3000:80"   # HTTP

# Backend: HTTP only
ports:
  - "8000:8000"  # HTTP
```

**Risk**: All communication occurs in plaintext (HTTP):
- API keys are transmitted in plaintext in the header
- Patient health data (PHI) is transmitted without encryption
- Possible **HIPAA violation** (encryption is mandatory when transmitting medical data)

**Recommended Actions**: Configure TLS certificates (Let's Encrypt or internal organizational CA):
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
}
```

---

### H-4. PostgreSQL External Port Exposed

**File**: `docker-compose.yml:11-12`

```yaml
postgres:
  ports:
    - "5433:5432"   # <-- directly accessible from host
```

**Risk**: PostgreSQL is accessible externally on host port 5433. Without a firewall, anyone on the network can attempt to connect to the DB.

**Recommended Actions**: Remove the port mapping if not used for development. Use only the internal Docker network:
```yaml
postgres:
  # ports:     # commented out - access only via internal network
  #   - "5433:5432"
  expose:
    - "5432"
```

---

### H-5. FORWARDED_ALLOW_IPS=* (Trust All IPs)

**File**: `Dockerfile:14`

```dockerfile
FORWARDED_ALLOW_IPS=*
```

**Risk**: The `X-Forwarded-For` header from all IPs is trusted. An attacker can forge their IP address to bypass IP-based access control, logging, and rate limiting.

**Recommended Actions**: Explicitly allow only the Nginx proxy IP:
```dockerfile
FORWARDED_ALLOW_IPS="172.18.0.0/16"  # Docker internal network only
```

---

## Medium Findings

### M-1. Rate Limiting Disabled

**File**: `main.py` (entirely commented out)

`FastAPILimiter` and `RateLimiter` code exists in `main.py` but is **entirely commented out**. Nginx's `limit_req` is also disabled.

**Risk**: With only an authenticated API key, unlimited requests are possible:
- Unlimited calls to NLP models -- resource exhaustion
- Brute force API key guessing attacks are possible
- Overload on the NLP service (3 replicas, 2GB memory each)

**Recommended Actions**: Enabling Nginx-level rate limiting is most efficient:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
}
```

---

### M-2. Internal Information Exposed in Error Messages

**File**: `routes_transcript.py:93-95`

```python
except Exception as exc:
    raise HTTPException(
        status_code=500,
        detail=f"Analysis failed: {exc}",  # <-- internal stack info exposed
    )
```

**Risk**: Error messages may contain file paths, library versions, internal logic, etc., providing attackers with system information.

**Recommended Actions**: In production, return only generic error messages and log detailed information only in logs:
```python
except Exception as exc:
    logger.error("Transcript analysis failed: %s", exc, exc_info=True)
    raise HTTPException(
        status_code=500,
        detail="Internal server error. Please try again later.",
    )
```

---

### M-3. No File Upload Size Limit Enforced

**File**: `routes_transcript.py:70-72`

```python
try:
    file_bytes = await file.read()  # <-- reads entire file without size limit
```

`MAX_FILE_SIZE=10485760` (10MB) is defined in `.env` but is **not validated in the actual code**. Only Nginx has `client_max_body_size 16m` set.

**Risk**: Memory exhaustion attack (DoS) possible through large file uploads.

**Recommended Actions**:
```python
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 10 * 1024 * 1024))

file_bytes = await file.read()
if len(file_bytes) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, detail="File too large")
```

---

### M-4. CORS Configuration Mismatch

**File**: `docker-compose.yml:74`, `.env:20`

```yaml
# docker-compose.yml
CORS_ORIGINS: '["http://localhost:3000","http://localhost"]'

# .env
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]
```

Currently `main.py` is entirely commented out, so the **CORS middleware itself is not functioning**. The active routers (`routes_transcript.py`, `routes_nlp.py`) have no CORS settings.

**Risk**: If CORS is not configured, cross-origin requests from browsers may be blocked, but since only API key-based authentication is used, it can be bypassed via cURL, etc. Proper CORS configuration is essential for production deployment.

---

### M-5. PostgreSQL SSL Not Configured

**File**: `docker-compose.yml:66`

```yaml
DATABASE_URL: postgresql+asyncpg://...@postgres:5432/prostatecancer_db
# No SSL parameters
```

Since this is an internal Docker network, the risk is relatively lower, but without SSL on the DB connection, patient data could be exposed through network sniffing.

**Recommended Actions**: Add `?ssl=require` or `sslmode=require` parameter (especially when using an external DB).

---

### M-6. Poor Dependency Management

**File**: `requirements.txt`

```text
# Duplicate packages
pandas      # line 14
pandas      # line 43

fastapi     # line 2
fastapi     # line 44

asyncpg>=0.29  # line 40
asyncpg        # line 70

# No version pinning
fastapi        # any version gets installed
sqlalchemy     # any version gets installed
redis>=5.0.0   # only minimum version specified
```

**Risk**:
- No version pinning -- different versions get installed depending on build time -- versions with known vulnerabilities may be installed
- Duplicate declarations -- maintenance confusion

**Recommended Actions**: Pin exact versions with `pip freeze > requirements.txt`. Or use `pip-compile`.

---

## Low Findings

### L-1. Health Endpoint Accessible Without Authentication

**File**: `routes_nlp.py:133-139`, `Dockerfile:64`

```python
@router.get("/health")      # no API key required
async def nlp_health(): ...
```

The health check endpoint is accessible without authentication. Service status information (healthy/unhealthy, error messages) may be exposed.

**Recommended Actions**: Separate internal health checks (Docker) from external checks. Return only minimal information externally.

---

### L-2. DEBUG=True Setting

**File**: `.env:12`

```bash
DEBUG=True
```

Since `main.py` is currently deactivated, there is no direct impact, but if DEBUG mode is enabled in production, detailed error pages, stack traces, etc. will be exposed.

---

### L-3. print Statements Used in `wait_for_db.py`

**File**: `wait_for_db.py:25-29`

```python
print("DB is ready")
print("DB not ready yet:", e)
```

This is not a security issue per se, but using `print` instead of structured logging (the `logging` module) makes log collection/monitoring difficult.

---

## Architecture Security Overview

### Current Architecture

```
[Client Browser]
      | HTTP (plaintext)
      v
[Nginx :80] --- No security headers, no rate limiting
      |
      |---> [Next.js Webapp :3000] -- API key included in bundle via NEXT_PUBLIC
      |
      +---> [FastAPI Backend :8000] -- Static API Key authentication only
              |
              |---> [PostgreSQL :5432] -- Hardcoded password, no SSL
              |
              |---> [Redis :6379] -- No authentication, no TLS
              |
              +---> [NLP Classifiers :8000 x3] -- No authentication (internal communication)
```

### Docker Network Security

| Item | Current Status | Recommended |
|------|---------------|-------------|
| Network Driver | bridge (single) | Separate networks per service |
| External Port Exposure | PostgreSQL(5433), Backend(8000), Nginx(3000) | Expose only Nginx |
| Inter-container Communication | All on same network | Separate into frontend/backend/data |
| Non-root Execution | Backend only (appuser) | Apply to all containers |
| Read-only Filesystem | Not applied | `read_only: true` + tmpfs |

### Database Security

| Item | Current Status | Recommended |
|------|---------------|-------------|
| Authentication | Hardcoded password | Environment variables/Secrets |
| Encryption (in transit) | None | SSL/TLS |
| Encryption (at rest) | None | PostgreSQL TDE or volume encryption |
| Access Control | Single user, full privileges | Role-based (read-only/write separation) |
| Backup | Not configured | Automated backup + encryption |
| Audit Log | None | pg_audit extension |

---

## Compliance Considerations (HIPAA)

This system processes patient medical data (consultation transcripts, NLP analysis results), so HIPAA compliance considerations are necessary:

| HIPAA Requirement | Current Status | Action Required |
|-------------------|---------------|-----------------|
| Encryption in transit (164.312(e)) | HTTP plaintext | TLS mandatory |
| Encryption at rest (164.312(a)(2)(iv)) | Not applied | Disk/DB encryption |
| Access control (164.312(a)(1)) | Static API Key only | Per-user authentication/authorization |
| Audit log (164.312(b)) | Basic logging only | Access audit logging |
| Automatic logoff (164.312(a)(2)(iii)) | Not applicable (API) | Session expiration settings |
| Data integrity (164.312(c)(1)) | DB constraints only | Checksums/signatures |

---

## Recommended Priority Actions

### Phase 1: Immediate (1-2 days)

1. **Remove all hardcoded secrets from `docker-compose.yml`** -- change to `.env` variable references
2. **Remove `NEXT_PUBLIC_API_KEY`** -- switch to server-side API calls
3. **Add `patient_id` input validation** -- prevent path traversal
4. **Set Redis password**
5. **Reissue API keys** (current keys are already exposed in Git)

### Phase 2: Short-term (1-2 weeks)

6. **Activate Nginx security headers** (uncomment + add CSP)
7. **Configure TLS/HTTPS** (Let's Encrypt or internal CA)
8. **Remove PostgreSQL external port**
9. **Activate rate limiting** (Nginx level)
10. **Generalize error messages** (prevent internal information exposure)

### Phase 3: Medium-term (1 month)

11. **Introduce JWT-based authentication** (activate commented-out code + improve)
12. **Separate Docker networks** (frontend/backend/data tier)
13. **Clean up `requirements.txt` and pin versions**
14. **Implement file upload size validation**
15. **Configure DB SSL connection**

### Phase 4: Long-term (quarterly)

16. **Implement RBAC (Role-Based Access Control)** -- separate doctor/patient/admin
17. **Build audit logging system**
18. **Automated security scanning** (add Trivy, Bandit to CI/CD pipeline)
19. **DB backup and disaster recovery** plan
20. **Conduct penetration testing**

---

## Positive Findings (Well-Implemented Aspects)

Several security-positive aspects were also found:

- **Non-root container execution**: Runs as `appuser` in the Dockerfile (line 34, 41)
- **Tini PID 1**: Uses tini to prevent zombie processes (line 68)
- **Health Check implementation**: Health checks configured for all services
- **Graceful Degradation**: When Redis fails, only caching is disabled; the service continues to operate
- **Connection Pooling**: DB connection pool properly configured (pool_size=10, max_overflow=20)
- **pool_pre_ping**: Automatic detection/recovery of expired DB connections
- **`.env` included in `.gitignore`**: Environment variable file is prevented from being committed to Git
- **Pydantic input validation**: `min_length`, `max_length`, `min_items`, `max_items` validation in NLP routes
- **Gunicorn max-requests**: Worker restart to prevent memory leaks (max_requests=1000)
- **Dependency order management**: `depends_on` + `condition: service_healthy` to guarantee service startup order
- **Exponential Backoff**: Exponential backoff retry on NLP service calls

---

*Report generated by automated code analysis. Manual penetration testing is recommended for comprehensive security validation.*
