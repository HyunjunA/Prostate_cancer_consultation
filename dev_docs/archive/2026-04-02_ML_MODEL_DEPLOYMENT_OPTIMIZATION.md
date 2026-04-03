# ML 모델 배포 최적화 종합 보고서

> **Date:** 2026-04-02
> **Scope:** NLP model serving architecture, prediction pipeline, Docker deployment
> **Analyzed files:** `nlp_service.py`, `transcript_service.py`, `routes_nlp.py`, `docker-compose.yml`, `r01-nlp-classifiers-docker-image/`

---

## 현재 아키텍처

```
Frontend → Nginx → FastAPI Backend → HTTP → NLP Docker (R plumber × 3 replicas)
                         ↕                         ↕
                      Redis Cache           ranger 모델 (.rds × 5)
                      PostgreSQL            (cp, le, ed, inc, ius)
```

### 모델 상세

| 모델 | 엔드포인트 | 주제 | 파일 크기 |
|------|----------|------|----------|
| cancer_prognosis | `/predict/cp` | 암 예후 | 2.7 MB |
| life_expectancy | `/predict/le` | 기대 수명 | 1.1 MB |
| erectile_dysfunction_potency | `/predict/ed` | 발기부전 | 2.2 MB |
| continence | `/predict/inc` | 요실금 | 2.8 MB |
| irritative_urinary_symptoms | `/predict/ius` | 자극 배뇨 증상 | 2.4 MB |
| **합계** | | | **11.2 MB** |

### 기술 스택

- **모델 알고리즘:** Random Forest (ranger) + tidymodels
- **텍스트 전처리:** textrecipes (TF-IDF, stemming, stopword removal) + SnowballC
- **모델 포맷:** .rds (R 직렬화 객체) via pins
- **API 프레임워크:** R plumber + vetiver
- **Docker 이미지:** 1.41GB (rocker/r-ver + R 4.5.1)
- **배포:** 3 replicas, 각 2GB 메모리 제한, 총 6GB

### 호출 흐름

```
transcript_service.py (Step 4)
  → nlp_service.predict_batch(sentences, model="cp")
    → Redis 캐시 확인 (hit → 즉시 반환)
    → HTTP POST http://nlp-classifiers:8000/predict/cp
      → Docker 로드밸런서 → replica 1/2/3 중 하나
        → R plumber → vetiver → ranger 모델 → .pred_1 반환
    → Redis에 결과 캐시 (TTL 1시간)
```

---

## 발견된 최적화 항목

### 1. 모델 예측 병렬화 (CRITICAL) — 예상 효과: 5배 속도 향상

**현재 문제:**

`transcript_service.py`에서 5개 모델을 **순차 실행**:

```python
for model in ALL_MODELS:           # cp → le → ed → inc → ius (5번 반복)
    for start in range(0, total, 50):  # 각 모델마다 배치 반복
        results = await predict_batch(chunk, model)
```

100문장 처리 시: 5모델 × 2배치 = **10번의 순차 HTTP 호출** (배치당 ~500ms = 총 5초)

**개선 방향:**

각 배치에서 5개 모델을 `asyncio.gather()`로 동시 실행:

```python
for start in range(0, total, batch_size):
    chunk = texts[start : start + batch_size]
    tasks = [predict_batch(chunk, model) for model in ALL_MODELS]
    results = await asyncio.gather(*tasks)  # 5모델 동시!
```

100문장 처리 시: 2배치 × 1회 (5모델 동시) = **2번의 병렬 호출** (총 ~1초)

**영향 범위:** `transcript_service.py` (Step 4 run_predictions 함수)

---

### 2. NLP 리플리카 수 및 리소스 (HIGH)

**현재:** 3 replicas × 2GB = 6GB, CPU 제한 없음

**문제:** 병렬화 후 동시 요청이 5배 증가 (모델 5개 동시 호출). 3 replicas에 5개 동시 요청이면 replica당 ~2개 동시 처리. 추가 사용자가 있으면 대기열 발생.

**개선 방향:**
```yaml
nlp-classifiers:
  deploy:
    replicas: 5                # 3 → 5
    resources:
      limits:
        memory: 2.5G           # 2G → 2.5G (R 모델 headroom)
        cpus: "2.0"            # 추가: CPU 제한
```

**영향 범위:** `docker-compose.yml`

---

### 3. 연결 풀 최적화 (HIGH)

**현재:** `nlp_service.py`
```python
httpx.AsyncClient(
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)
)
```

**문제:** 병렬화 후 5개 모델 동시 호출 시 연결 부족 가능. keepalive=10이 max=20의 50%로 불필요한 연결 재생성.

**개선 방향:**
```python
httpx.Limits(
    max_connections=30,              # 20 → 30
    max_keepalive_connections=20,    # 10 → 20
    keepalive_expiry=30.0            # 추가: 유휴 연결 30초 후 만료
)
```

**영향 범위:** `nlp_service.py` (클라이언트 초기화)

---

### 4. 재시도 로직 개선 (HIGH)

**현재:** `nlp_service.py`
```python
for attempt in range(NLP_RETRIES):  # 3회
    try:
        resp = await client.post(url, json=payload)
    except:
        wait = 2 ** attempt  # 1s → 2s (jitter 없음)
```

**문제:**
- jitter 없음 → 다수 요청이 동시 실패 시 동시에 재시도 (thundering herd)
- 모든 에러를 동일 처리 → 400 Bad Request도 재시도 (의미 없음)

**개선 방향:**
```python
# Exponential backoff + jitter
wait = min(2 ** attempt * 0.5 + random.uniform(0, 0.1), 5.0)

# 에러 분류: transient(5xx, timeout)만 재시도, permanent(4xx)는 즉시 실패
if resp.status_code >= 500:  # transient → 재시도
elif resp.status_code >= 400:  # permanent → 즉시 실패, 재시도 안 함
```

**영향 범위:** `nlp_service.py` (`_call_nlp_with_retry`)

---

### 5. 적응형 타임아웃 (MEDIUM)

**현재:** 모든 요청에 30초 고정 타임아웃

**문제:**
- 단일 문장: 100-500ms이면 충분 → 30초는 과도
- 50문장 배치: 느린 하드웨어에서 30초 초과 가능

**개선 방향:**
```python
def _get_timeout(payload_size: int) -> float:
    if payload_size <= 1:
        return 5.0        # 단일 문장: 5초
    elif payload_size <= 30:
        return 10.0       # 중간 배치: 10초
    else:
        return 15.0       # 큰 배치: 15초
```

**영향 범위:** `nlp_service.py` (`_call_nlp_with_retry`)

---

### 6. 캐시 전략 개선 (MEDIUM)

**현재:**
- TTL: 3600초 (1시간)
- 텍스트 정규화 없음 (대소문자 차이로 캐시 미스)
- 캐시 통계 없음 (hit/miss 모니터링 불가)

**개선 방향:**
```python
# TTL 단축
NLP_CACHE_TTL = 1800  # 1시간 → 30분

# 캐시 키 정규화
def _text_cache_key(model: str, text: str) -> str:
    normalized = text.strip().lower()
    return make_cache_key(f"nlp:v1:{model}", {"text": normalized})

# 캐시 통계 추적
await redis.incr(f"stats:cache:hit:{model}")   # hit 카운터
await redis.incr(f"stats:cache:miss:{model}")  # miss 카운터
```

**영향 범위:** `nlp_service.py`, `redis_client.py`

---

### 7. 에러 분류 강화 (MEDIUM)

**현재:** 모든 NLP 에러를 `NLPServiceError(503)` 하나로 처리

**개선 방향:**
```python
class NLPTransientError(NLPServiceError):
    """Timeout, 5xx — 재시도 가능"""

class NLPPermanentError(NLPServiceError):
    """400, 422 — 재시도 불필요"""
```

재시도 로직에서 transient만 재시도, permanent는 즉시 실패 → 불필요한 대기 제거.

**영향 범위:** `nlp_service.py`

---

### 8. NLP Docker 이미지 최적화 (LOW) — 장기적 대안

**현재:** R plumber Docker 이미지 **1.41GB** (11.2MB 모델을 서빙하기 위해)

**장기적 대안: ONNX 변환**

```
현재: R에서 학습 (.rds) → R에서만 실행 → R Docker 필수 (1.41GB)
변환 후: R에서 학습 (.rds) → ONNX로 변환 (.onnx) → Python에서 실행 → R 불필요 (~200MB)
```

| 항목 | R plumber (현재) | ONNX + Python (변환 후) |
|------|-----------------|----------------------|
| Docker 이미지 | 1.41GB × 3 = **4.23GB** | ~200MB × 3 = **0.6GB** |
| 시작 시간 | 10-20초 | 2-3초 |
| 추론 속도 | R ranger | onnxruntime (C++ 최적화, 2-10배 빠름) |
| 메모리 | 2GB/replica (6GB 총) | ~500MB/replica (1.5GB 총) |
| 언어 | Python + R (두 언어) | Python만 |

**리스크:**
- textrecipes (TF-IDF, stemming, stopword) 파이프라인을 Python에서 재구현 필요
- 변환 후 예측값 동일성 검증 필수
- 모델 업데이트 시 R → ONNX 재변환 단계 추가

**현재 불필요한 이유:** 연구 프로젝트 규모에서 이미지 크기/메모리는 큰 문제 아님. 사용자 100명 이상 또는 클라우드 배포 시 고려.

---

## 우선순위 요약

| 순위 | 항목 | 현재 값 | 개선 값 | 효과 | 심각도 |
|------|------|--------|--------|------|--------|
| **1** | 모델 예측 병렬화 | 순차 (5× loop) | asyncio.gather | **5배 속도 향상** | CRITICAL |
| **2** | NLP 리플리카 수 | 3 replicas | 5 replicas + CPU 제한 | 동시 처리 용량 67% 증가 | HIGH |
| **3** | 연결 풀 | max=20, keepalive=10 | max=30, keepalive=20 | +15-20% 처리량 | HIGH |
| **4** | 재시도 jitter | 1s 고정 백오프 | 0.5s + jitter + 에러 분류 | thundering herd 방지 | HIGH |
| **5** | 적응형 타임아웃 | 30초 고정 | 5/10/15초 동적 | 불필요한 대기 제거 | MEDIUM |
| **6** | 캐시 개선 | TTL 1시간, 통계 없음 | TTL 30분, 정규화, 통계 | +25-40% hit rate | MEDIUM |
| **7** | 에러 분류 | 단일 NLPServiceError | Transient/Permanent 분리 | 불필요한 재시도 제거 | MEDIUM |
| **8** | ONNX 변환 | R Docker 1.41GB | Python 200MB | 이미지 85% 축소 | LOW (장기) |

---

## 현재 시스템 메트릭 (run_all.sh 스트레스 테스트 결과)

```
Total requests : 1000
Success (200)  : 1000 (100%)
Failed         : 0
Cached hits    : 224
Wall time      : 130.2s
Throughput     : 7.7 req/s

Endpoint        Total     OK   Fail    Avg(ms)
single            415    415      0       1139
batch             230    230      0       4249
all-models        194    194      0       4230
by-class          161    161      0        865
```

**관찰:**
- batch와 all-models 평균 4.2초 → 병렬화 시 ~0.8초로 예상
- 캐시 히트율 22.4% → 정규화 + 텍스트 처리 개선 시 40%+ 예상
- single 평균 1.1초 → 적응형 타임아웃으로 tail latency 감소 예상

---

## 참고: 파일 경로

| 파일 | 역할 |
|------|------|
| `app/Backend/nlp_service.py` | NLP Docker 호출 클라이언트 (캐시, 재시도, 연결 풀) |
| `app/Backend/transcript_service.py` | 7-step 분석 파이프라인 (Step 4에서 NLP 호출) |
| `app/Backend/routes_nlp.py` | NLP 프록시 API 엔드포인트 |
| `app/Backend/redis_client.py` | Redis 캐시 클라이언트 |
| `app/Backend/docker-compose.yml` | NLP replicas, 리소스 제한, 헬스체크 |
| `prostate_cancer_R01_NLP_classifiers_Michael/` | NLP Docker 이미지, 학습 데이터, 파이프라인 스크립트 |
