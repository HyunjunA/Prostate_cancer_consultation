# Security Audit Report: COMPASS Backend

**Date**: 2026-02-12
**Scope**: `Prostate_cancer_consultation_dashboard/app/Backend/`
**Auditor**: Claude Code (Automated Analysis)
**Stack**: FastAPI + PostgreSQL 13 + Redis 7 + Docker Compose + Nginx

---

## Executive Summary

Backend의 전체 보안 상태를 분석한 결과, **치명적(Critical) 4건, 높음(High) 5건, 중간(Medium) 6건, 낮음(Low) 3건**의 보안 이슈가 발견되었습니다.

가장 긴급한 문제는 **하드코딩된 시크릿/자격증명**, **비활성화된 Nginx 보안 설정**, **Redis 무인증 접근**, 그리고 **파일 경로 조작 가능성**입니다.

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 4 | 즉시 조치 필요 |
| High | 5 | 배포 전 반드시 해결 |
| Medium | 6 | 계획적 개선 권장 |
| Low | 3 | 장기 개선 사항 |

---

## Critical Findings

### C-1. 하드코딩된 데이터베이스 자격증명

**파일**: `docker-compose.yml:8-9, 66`

```yaml
# docker-compose.yml
POSTGRES_USER: prostatecancer_user
POSTGRES_PASSWORD: secure_password_123    # <-- 하드코딩

# backend environment
DATABASE_URL: postgresql+asyncpg://prostatecancer_user:secure_password_123@postgres:5432/prostatecancer_db
```

**위험도**: 소스 코드가 유출되면 DB에 직접 접근 가능. Git 히스토리에 이미 기록되어 있을 가능성 높음.

**권장 조치**:
- `docker-compose.yml`에서 비밀번호를 제거하고 `.env` 파일에서 변수로 참조
- Docker Secrets 또는 환경 변수 주입 방식으로 전환
- 현재 비밀번호 즉시 변경
- Git 히스토리에서 자격증명 제거 (`git filter-branch` 또는 `BFG Repo-Cleaner`)

```yaml
# 권장 방식
environment:
  POSTGRES_USER: ${POSTGRES_USER}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

---

### C-2. API Key 및 REDCap 토큰 평문 노출

**파일**: `.env:40, 49`, `docker-compose.yml:109`

```bash
# .env
API_KEY=<YOUR_API_KEY>
REDCAP_API_TOKEN=BB714F7B3BFE9ED3A93101639911D26A

# docker-compose.yml (webapp)
NEXT_PUBLIC_API_KEY: <YOUR_API_KEY>   # <-- 클라이언트에 노출됨
```

**위험도**:
- `.env`는 `.gitignore`에 포함되어 있어 Git에는 올라가지 않음 (양호)
- 그러나 `docker-compose.yml`에 API 키가 하드코딩 → Git에 커밋됨
- `NEXT_PUBLIC_` 접두사는 Next.js에서 **브라우저에 노출**되는 변수. 즉 API 키가 클라이언트 JavaScript 번들에 포함되어 누구나 볼 수 있음
- REDCap API 토큰은 의료 데이터 시스템 접근 키로, 유출 시 PHI(Protected Health Information) 노출 위험

**권장 조치**:
- `NEXT_PUBLIC_API_KEY`를 제거하고 API 호출을 서버 사이드(Next.js API Routes)에서 처리
- REDCap 토큰을 Docker Secrets 또는 vault로 관리
- 모든 API 키 즉시 재발급

---

### C-3. Redis 무인증 접근

**파일**: `docker-compose.yml:29-34`, `redis_client.py:17`

```yaml
# Redis 서비스 - 비밀번호 없음
redis:
  image: redis:7
  command: ["redis-server", "--appendonly", "yes"]
  # --requirepass 옵션 없음
```

```python
# redis_client.py
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
# 인증 없는 URL
```

**위험도**: 같은 Docker 네트워크의 모든 컨테이너가 Redis에 무제한 접근 가능. 캐시 데이터 조회/변조/삭제 가능. 네트워크 침투 시 NLP 예측 결과 조작 가능.

**권장 조치**:
```yaml
redis:
  command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
```
```python
REDIS_URL = "redis://:${REDIS_PASSWORD}@redis:6379/0"
```

---

### C-4. 파일 경로 조작(Path Traversal) 취약점

**파일**: `routes_transcript.py:276-277`

```python
def _xlsx_path(patient_id: str) -> Path:
    return _UPLOAD_DIR / f"{patient_id}_predictions.xlsx"
```

**위험도**: `patient_id`에 대한 경로 검증이 없음. 공격자가 `patient_id=../../etc/passwd` 같은 값을 전달하면 파일 시스템 임의 위치에 파일을 쓰거나 읽을 수 있음.

`download` 엔드포인트에서 `patient_id`를 직접 받아 파일 경로를 구성:
```python
@router.get("/download/{patient_id}")
async def download(patient_id: str, ...):
    filepath = _xlsx_path(patient_id)  # 검증 없이 경로 생성
```

**권장 조치**:
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

### H-1. Nginx 보안 설정 전부 비활성화

**파일**: `Webapp/nginx_setup/default.conf`

현재 활성화된 Nginx 설정(line 93-127)에는 **보안 관련 설정이 하나도 없음**. 주석 처리된 보안 설정(line 1-85)에 존재하지만 비활성 상태:

| 설정 | 현재 상태 | 위험 |
|------|-----------|------|
| `X-Content-Type-Options: nosniff` | 비활성 | MIME 스니핑 공격 |
| `X-Frame-Options: DENY` | 비활성 | 클릭재킹 |
| `X-XSS-Protection` | 비활성 | XSS 공격 |
| `Referrer-Policy` | 비활성 | 리퍼러 정보 유출 |
| `server_tokens off` | 비활성 | Nginx 버전 노출 |
| Rate Limiting (`limit_req`) | 비활성 | DoS 공격 |
| Hidden files 접근 차단 | 비활성 | `.env` 등 민감 파일 노출 |
| `proxy_hide_header X-Powered-By` | 비활성 | 서버 기술 스택 노출 |

**권장 조치**: 주석 처리된 보안 설정을 활성화하고 추가 헤더 적용:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Content-Security-Policy "default-src 'self'" always;
```

---

### H-2. API 인증이 단일 Static Key에 의존

**파일**: `routes_transcript.py:32-41`, `routes_nlp.py:37-46`

```python
_API_KEY = os.getenv("API_KEY", "default-dev-key")  # fallback이 위험

async def _verify_api_key(api_key: str = Depends(_api_key_header)):
    if api_key != _API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
```

**문제점**:
- **단일 키**: 모든 클라이언트가 동일한 API 키 사용. 키 유출 시 전체 시스템 노출
- **Fallback 값**: `API_KEY` 환경변수 미설정 시 `"default-dev-key"`로 동작 → 프로덕션에서 위험
- **타이밍 공격**: `!=` 비교는 문자열 길이에 따라 비교 시간이 달라져 brute force 공격에 취약
- **키 로테이션 불가**: 단일 정적 키로 교체 시 모든 클라이언트가 동시에 영향
- **전송 중 노출**: HTTPS 미설정 시 헤더에서 API 키가 평문으로 전송

**권장 조치**:
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

### H-3. HTTPS/TLS 미설정

**파일**: `docker-compose.yml`, `default.conf`

```yaml
# Nginx: HTTP only
ports:
  - "3000:80"   # HTTP

# Backend: HTTP only
ports:
  - "8000:8000"  # HTTP
```

**위험도**: 모든 통신이 평문(HTTP)으로 이루어짐:
- API 키가 헤더에서 평문으로 전송
- 환자 건강 데이터(PHI)가 암호화 없이 전송
- **HIPAA 위반** 가능성 (의료 데이터 전송 시 암호화 의무)

**권장 조치**: TLS 인증서 설정 (Let's Encrypt 또는 조직 내부 CA):
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
}
```

---

### H-4. PostgreSQL 외부 포트 노출

**파일**: `docker-compose.yml:11-12`

```yaml
postgres:
  ports:
    - "5433:5432"   # <-- 호스트에서 직접 접근 가능
```

**위험도**: PostgreSQL이 호스트의 5433 포트에서 외부 접근 가능. 방화벽이 없으면 네트워크 내 누구나 DB에 접속 시도 가능.

**권장 조치**: 개발용이 아닌 경우 포트 매핑 제거. 내부 Docker 네트워크만 사용:
```yaml
postgres:
  # ports:     # 주석 처리 - 내부 네트워크로만 접근
  #   - "5433:5432"
  expose:
    - "5432"
```

---

### H-5. FORWARDED_ALLOW_IPS=* (모든 IP 신뢰)

**파일**: `Dockerfile:14`

```dockerfile
FORWARDED_ALLOW_IPS=*
```

**위험도**: 모든 IP의 `X-Forwarded-For` 헤더를 신뢰. 공격자가 IP 주소를 위조하여 IP 기반 접근 제어, 로깅, Rate Limiting을 우회할 수 있음.

**권장 조치**: Nginx 프록시 IP만 명시적으로 허용:
```dockerfile
FORWARDED_ALLOW_IPS="172.18.0.0/16"  # Docker 내부 네트워크만
```

---

## Medium Findings

### M-1. Rate Limiting 비활성화

**파일**: `main.py` (전체 주석 처리)

`main.py`에 `FastAPILimiter` 및 `RateLimiter` 코드가 존재하지만 **전부 주석 처리**되어 있음. Nginx의 `limit_req`도 비활성 상태.

**위험도**: 인증된 API 키만 있으면 무제한 요청 가능:
- NLP 모델에 대한 무제한 호출 → 리소스 고갈
- Brute force API 키 추측 공격 가능
- NLP 서비스(3 replicas, 2GB 메모리 각각)에 과부하

**권장 조치**: Nginx 레벨 Rate Limiting 활성화가 가장 효율적:
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
}
```

---

### M-2. 에러 메시지에 내부 정보 노출

**파일**: `routes_transcript.py:93-95`

```python
except Exception as exc:
    raise HTTPException(
        status_code=500,
        detail=f"Analysis failed: {exc}",  # <-- 내부 스택 정보 노출
    )
```

**위험도**: 에러 메시지에 파일 경로, 라이브러리 버전, 내부 로직 등이 포함될 수 있어 공격자에게 시스템 정보를 제공.

**권장 조치**: 프로덕션에서는 일반적인 에러 메시지만 반환, 상세 정보는 로그에만 기록:
```python
except Exception as exc:
    logger.error("Transcript analysis failed: %s", exc, exc_info=True)
    raise HTTPException(
        status_code=500,
        detail="Internal server error. Please try again later.",
    )
```

---

### M-3. 파일 업로드 크기 제한 미적용

**파일**: `routes_transcript.py:70-72`

```python
try:
    file_bytes = await file.read()  # <-- 크기 제한 없이 전체 파일 읽기
```

`.env`에 `MAX_FILE_SIZE=10485760` (10MB)가 정의되어 있지만 실제 코드에서 **검증하지 않음**. Nginx에서 `client_max_body_size 16m`만 설정.

**위험도**: 대용량 파일 업로드로 메모리 고갈 공격(DoS) 가능.

**권장 조치**:
```python
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 10 * 1024 * 1024))

file_bytes = await file.read()
if len(file_bytes) > MAX_FILE_SIZE:
    raise HTTPException(status_code=413, detail="File too large")
```

---

### M-4. CORS 설정 불일치

**파일**: `docker-compose.yml:74`, `.env:20`

```yaml
# docker-compose.yml
CORS_ORIGINS: '["http://localhost:3000","http://localhost"]'

# .env
CORS_ORIGINS=["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"]
```

현재 `main.py`가 전체 주석 처리되어 있어 **CORS 미들웨어 자체가 동작하지 않음**. 활성 라우터(`routes_transcript.py`, `routes_nlp.py`)에는 CORS 설정이 없음.

**위험도**: CORS가 설정되지 않으면 브라우저에서의 cross-origin 요청이 차단될 수 있으나, API 키 기반 인증만 사용하므로 cURL 등으로 우회 가능. 프로덕션 배포 시 적절한 CORS 설정 필수.

---

### M-5. PostgreSQL SSL 미설정

**파일**: `docker-compose.yml:66`

```yaml
DATABASE_URL: postgresql+asyncpg://...@postgres:5432/prostatecancer_db
# SSL 파라미터 없음
```

Docker 내부 네트워크이므로 위험도는 상대적으로 낮으나, DB 연결에 SSL이 없으면 네트워크 스니핑 시 환자 데이터 노출 가능.

**권장 조치**: `?ssl=require` 또는 `sslmode=require` 파라미터 추가 (특히 외부 DB 사용 시).

---

### M-6. 의존성 관리 불량

**파일**: `requirements.txt`

```text
# 중복 패키지
pandas      # line 14
pandas      # line 43

fastapi     # line 2
fastapi     # line 44

asyncpg>=0.29  # line 40
asyncpg        # line 70

# 버전 고정 없음
fastapi        # 어떤 버전이든 설치됨
sqlalchemy     # 어떤 버전이든 설치됨
redis>=5.0.0   # 최소 버전만 지정
```

**위험도**:
- 버전 미고정 → 빌드 시점에 따라 다른 버전 설치 → 알려진 취약점이 있는 버전 설치 가능
- 중복 선언 → 유지보수 혼란

**권장 조치**: `pip freeze > requirements.txt`로 정확한 버전 고정. 또는 `pip-compile` 사용.

---

## Low Findings

### L-1. Health 엔드포인트 무인증 접근

**파일**: `routes_nlp.py:133-139`, `Dockerfile:64`

```python
@router.get("/health")      # API 키 불필요
async def nlp_health(): ...
```

Health check 엔드포인트는 인증 없이 접근 가능. 서비스 상태 정보(healthy/unhealthy, 에러 메시지)가 노출될 수 있음.

**권장 조치**: 내부 health check(Docker)용과 외부 확인용을 분리. 외부에는 최소 정보만 반환.

---

### L-2. DEBUG=True 설정

**파일**: `.env:12`

```bash
DEBUG=True
```

현재 `main.py`가 비활성화되어 직접적인 영향은 없으나, 프로덕션에서 DEBUG 모드가 활성화되면 상세 에러 페이지, 스택 트레이스 등이 노출됨.

---

### L-3. `wait_for_db.py`에서 print문 사용

**파일**: `wait_for_db.py:25-29`

```python
print("DB is ready")
print("DB not ready yet:", e)
```

보안 이슈는 아니지만, 구조화된 로깅(`logging` 모듈) 대신 `print`를 사용하면 로그 수집/모니터링이 어려움.

---

## Architecture Security Overview

### 현재 아키텍처

```
[Client Browser]
      │ HTTP (평문)
      ▼
[Nginx :80] ─── 보안 헤더 없음, Rate Limiting 없음
      │
      ├──► [Next.js Webapp :3000] ── API 키가 NEXT_PUBLIC으로 번들에 포함
      │
      └──► [FastAPI Backend :8000] ── Static API Key 인증만
              │
              ├──► [PostgreSQL :5432] ── 하드코딩된 비밀번호, SSL 없음
              │
              ├──► [Redis :6379] ── 인증 없음, TLS 없음
              │
              └──► [NLP Classifiers :8000 x3] ── 인증 없음 (내부 통신)
```

### Docker Network 보안

| 항목 | 현재 상태 | 권장 |
|------|-----------|------|
| Network Driver | bridge (단일) | 서비스별 분리된 네트워크 |
| 외부 포트 노출 | PostgreSQL(5433), Backend(8000), Nginx(3000) | Nginx만 노출 |
| 컨테이너 간 통신 | 모두 같은 네트워크 | frontend/backend/data 분리 |
| Non-root 실행 | Backend만 (appuser) | 모든 컨테이너에 적용 |
| Read-only 파일시스템 | 미적용 | `read_only: true` + tmpfs |

### 데이터베이스 보안

| 항목 | 현재 상태 | 권장 |
|------|-----------|------|
| 인증 | 하드코딩된 비밀번호 | 환경변수/Secrets |
| 암호화(전송 중) | 없음 | SSL/TLS |
| 암호화(저장 시) | 없음 | PostgreSQL TDE 또는 볼륨 암호화 |
| 접근 제어 | 단일 사용자, 전체 권한 | 역할 기반(읽기전용/쓰기 분리) |
| 백업 | 설정 없음 | 자동 백업 + 암호화 |
| 감사 로그 | 없음 | pg_audit 확장 |

---

## Compliance Considerations (HIPAA)

이 시스템은 환자 의료 데이터(진료 상담 녹취록, NLP 분석 결과)를 처리하므로 HIPAA 규정 고려가 필요합니다:

| HIPAA 요구사항 | 현재 상태 | 조치 필요 |
|----------------|-----------|-----------|
| 전송 중 암호화 (164.312(e)) | HTTP 평문 | TLS 필수 |
| 저장 시 암호화 (164.312(a)(2)(iv)) | 미적용 | 디스크/DB 암호화 |
| 접근 제어 (164.312(a)(1)) | Static API Key만 | 사용자별 인증/인가 |
| 감사 로그 (164.312(b)) | 기본 로깅만 | 접근 감사 로그 |
| 자동 로그오프 (164.312(a)(2)(iii)) | 해당 없음 (API) | 세션 만료 설정 |
| 데이터 무결성 (164.312(c)(1)) | DB 제약조건만 | 체크섬/서명 |

---

## Recommended Priority Actions

### Phase 1: 즉시 (1-2일)

1. **`docker-compose.yml`에서 모든 하드코딩된 시크릿 제거** → `.env` 변수 참조로 변경
2. **`NEXT_PUBLIC_API_KEY` 제거** → 서버 사이드 API 호출로 전환
3. **`patient_id` 입력 검증 추가** → Path Traversal 방지
4. **Redis 비밀번호 설정**
5. **API 키 재발급** (현재 키는 이미 Git에 노출)

### Phase 2: 단기 (1-2주)

6. **Nginx 보안 헤더 활성화** (주석 해제 + CSP 추가)
7. **TLS/HTTPS 설정** (Let's Encrypt 또는 내부 CA)
8. **PostgreSQL 외부 포트 제거**
9. **Rate Limiting 활성화** (Nginx 레벨)
10. **에러 메시지 일반화** (내부 정보 노출 방지)

### Phase 3: 중기 (1개월)

11. **JWT 기반 인증 도입** (주석 처리된 코드 활성화 + 개선)
12. **Docker 네트워크 분리** (frontend/backend/data tier)
13. **`requirements.txt` 정리 및 버전 고정**
14. **파일 업로드 크기 검증 구현**
15. **DB SSL 연결 설정**

### Phase 4: 장기 (분기)

16. **RBAC(역할 기반 접근 제어)** 구현 — 의사/환자/관리자 분리
17. **감사 로깅 시스템** 구축
18. **자동 보안 스캐닝** (CI/CD 파이프라인에 Trivy, Bandit 추가)
19. **DB 백업 및 재해 복구** 계획
20. **침투 테스트** 수행

---

## Positive Findings (잘 구현된 부분)

보안적으로 양호한 점도 다수 발견되었습니다:

- **Non-root 컨테이너 실행**: Dockerfile에서 `appuser`로 실행 (line 34, 41)
- **Tini PID 1**: 좀비 프로세스 방지를 위한 tini 사용 (line 68)
- **Health Check 구현**: 모든 서비스에 health check 설정
- **Graceful Degradation**: Redis 장애 시 캐싱만 비활성화, 서비스 계속 동작
- **Connection Pooling**: DB 커넥션 풀 적절히 설정 (pool_size=10, max_overflow=20)
- **pool_pre_ping**: 만료된 DB 연결 자동 감지/복구
- **`.gitignore`에 `.env` 포함**: 환경 변수 파일이 Git에 올라가지 않도록 설정
- **Pydantic 입력 검증**: NLP 라우트에서 `min_length`, `max_length`, `min_items`, `max_items` 검증
- **Gunicorn max-requests**: Worker 재시작으로 메모리 누수 방지 (max_requests=1000)
- **의존성 순서 관리**: `depends_on` + `condition: service_healthy`로 서비스 시작 순서 보장
- **Exponential Backoff**: NLP 서비스 호출 시 지수적 백오프 재시도

---

*Report generated by automated code analysis. Manual penetration testing is recommended for comprehensive security validation.*
