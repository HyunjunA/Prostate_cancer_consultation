# Load Testing Guide

## 📦 Installation

```bash
# Method 1: For asyncio test
pip install aiohttp

# Method 2: For Locust test
pip install locust
```

---

## 🚀 How to Run

### Method 1: Simple asyncio Test

```bash
# Check if server is running
curl http://localhost:8000/health

# Run test
python load_test.py
```

### Method 2: Locust (Web UI)

```bash
# Start Locust server
locust -f locustfile.py --host=http://localhost:8000

# Access in browser
open http://localhost:8089
```

**Web UI Settings:**
| Setting | Recommended | Description |
|---------|-------------|-------------|
| Number of users | 50-100 | Concurrent users |
| Spawn rate | 5-10 | Users added per second |

### Method 3: Locust (CLI/CI)

```bash
# 50 users, spawn 10/sec, run for 2 minutes
locust -f locustfile.py \
    --host=http://localhost:8000 \
    --headless \
    -u 50 \
    -r 10 \
    -t 120s \
    --csv=load_test_results
```

---

## 📊 Test Scenarios

### Scenario 1: Basic Concurrent Access Test

```
Goal: Check response time with 50 concurrent users
Settings: 50 users, spawn rate 10
Expected: Avg response < 200ms, error rate 0%
```

### Scenario 2: DB Connection Pool Limit Test

```
Goal: Check behavior when exceeding 30 pool connections
Settings: 100 users, spawn rate 20
Observe: Point where response time spikes
```

### Scenario 3: Peak Time Simulation

```
Goal: 25 doctors + 250 patients simultaneous activity
Settings: 100 users (30% doctors, 70% patients)
Duration: 5 minutes continuous
```

---

## 📈 Result Interpretation

### Success Criteria

| Metric       | 🟢 Normal | 🟡 Warning | 🔴 Problem |
| ------------ | --------- | ---------- | ---------- |
| Error Rate   | < 0.1%    | 0.1-1%     | > 1%       |
| Avg Response | < 200ms   | 200-500ms  | > 500ms    |
| P95 Response | < 500ms   | 500-1000ms | > 1000ms   |
| P99 Response | < 1000ms  | 1-2s       | > 2s       |

### Bottleneck Diagnosis

```
Symptom: Response time suddenly spikes
         (e.g., 100ms until 30 users → 2000ms at 40 users)

Cause: DB Connection Pool exhaustion

Verify:
  - Compare concurrent requests vs Pool size (30)
  - PostgreSQL: SELECT count(*) FROM pg_stat_activity;

Solution:
  ENV DATABASE_POOL_SIZE=20
  ENV DATABASE_MAX_OVERFLOW=30
```

```
Symptom: Timeout errors at consistent rate

Cause: Insufficient workers or CPU bottleneck

Verify:
  - Check CPU usage with docker stats
  - Check worker process status with htop

Solution:
  ENV WEB_CONCURRENCY=6  # Increase worker count
```

```
Symptom: Memory usage continuously increasing

Cause: Memory leak or max-requests setting needed

Verify:
  - Monitor memory trend with docker stats

Solution:
  --max-requests 1000 (already configured)
```

---

## 🧪 Step-by-Step Test Plan

### Phase 1: Baseline Measurement

```bash
# Measure baseline with 10 users
locust -f locustfile.py --host=http://localhost:8000 \
    --headless -u 10 -r 5 -t 60s --csv=baseline
```

### Phase 2: Gradual Increase

```bash
# 20 users
locust ... -u 20 -r 5 -t 60s --csv=phase2_20users

# 50 users
locust ... -u 50 -r 10 -t 60s --csv=phase2_50users

# 100 users
locust ... -u 100 -r 10 -t 60s --csv=phase2_100users
```

### Phase 3: Find Breaking Point

```bash
# 150 users (near expected limit)
locust ... -u 150 -r 20 -t 120s --csv=phase3_limit
```

### Phase 4: Endurance Test

```bash
# 50 users for 30 minutes
locust ... -u 50 -r 10 -t 1800s --csv=phase4_endurance
```

---

## 📋 Result Files

Files generated when using Locust `--csv` option:

| File                  | Content                 |
| --------------------- | ----------------------- |
| `*_stats.csv`         | Statistics per endpoint |
| `*_stats_history.csv` | Statistics over time    |
| `*_failures.csv`      | Failed request details  |

### Visualization

```python
import pandas as pd
import matplotlib.pyplot as plt

# Load results
stats = pd.read_csv('load_test_results_stats_history.csv')

# Response time trend chart
plt.figure(figsize=(12, 6))
plt.plot(stats['Timestamp'], stats['Total Average Response Time'])
plt.xlabel('Time')
plt.ylabel('Response Time (ms)')
plt.title('Response Time Over Time')
plt.savefig('response_time_chart.png')
```

---

## ⚙️ Current Settings vs Recommended Settings

| Setting               | Current | Recommended (275 users) |
| --------------------- | ------- | ----------------------- |
| WEB_CONCURRENCY       | 3       | 3-4 (sufficient)        |
| DATABASE_POOL_SIZE    | 10      | 20                      |
| DATABASE_MAX_OVERFLOW | 20      | 30                      |
| GUNICORN_TIMEOUT      | 60      | 60 (appropriate)        |

### How to Change Settings

```bash
# docker-compose.yml or environment variables
environment:
  - DATABASE_POOL_SIZE=20
  - DATABASE_MAX_OVERFLOW=30
```

---

## 🔍 Real-time Monitoring

### Server-side Monitoring

```bash
# Container resources
docker stats

# PostgreSQL connection count
docker exec -it <postgres_container> psql -U <user> -d <db> -c \
  "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Gunicorn worker status
docker exec -it <app_container> ps aux | grep gunicorn
```

### Client-side

```bash
# Locust Web UI: http://localhost:8089
# Real-time charts for RPS, response time, error rate
```

---

## 🎯 Key Test Points

```
┌─────────────────────────────────────────────────────────────┐
│                    Key Test Questions                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Q1: What happens when >30 concurrent DB requests?          │
│      → Verify with DB Pool stress test                      │
│      → Expected: 31st request waits or times out            │
│                                                             │
│  Q2: No issues with 275 user pattern?                       │
│      → Verify with Mixed Workload test                      │
│      → Assuming 10-20% concurrent = 30-55 users             │
│                                                             │
│  Q3: How much can it handle during peak time?               │
│      → Gradual increase test up to 100 users with Locust    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Quick Start

**Recommendation**: Start with `load_test.py` for quick assessment, then use `locust` for detailed analysis if needed.

```bash
# Quick test (takes about 2 minutes)
pip install aiohttp
python load_test.py

# Detailed test (interactive)
pip install locust
locust -f locustfile.py --host=http://localhost:8000
# Open http://localhost:8089 and configure test parameters
```
