# R01 NLP Classifiers — Prostate Cancer Consultation

Docker image containing 5 NLP classification models that predict clinical topic relevance from prostate cancer consultation transcripts.

**Author:** Michael
**Built:** 2025-11-01
**Framework:** R 4.5.1 + vetiver + plumber
**Image:** `r01-nlp-classifiers:latest`

---

## Overview

This system takes sentences from doctor-patient prostate cancer consultation transcripts and predicts the probability that each sentence belongs to one of 5 clinical topics. The models are [ranger](https://cran.r-project.org/package=ranger) (random forest) classifiers trained with text preprocessing (stemming, stopword removal) via the [tidymodels](https://www.tidymodels.org/) + [vetiver](https://rstudio.github.io/vetiver-r/) ecosystem.

### 5 Prediction Models

| Endpoint | Model Name | Predicts | Model Size |
|----------|-----------|----------|------------|
| `/predict/cp` | `cancer_prognosis` | Sentence discusses cancer prognosis | 2.7 MB |
| `/predict/ed` | `erectile_dysfunction_potency` | Sentence discusses erectile dysfunction / potency | 2.2 MB |
| `/predict/inc` | `continence` | Sentence discusses continence / urinary leakage | 2.8 MB |
| `/predict/ius` | `irritative_urinary_symptoms_frequency_urgency_nocturnia` | Sentence discusses irritative urinary symptoms | 2.4 MB |
| `/predict/le` | `life_expectancy` | Sentence discusses life expectancy | 1.1 MB |

---

## Prerequisites

- **Docker Desktop** installed and running
- macOS, Linux, or Windows with Docker support
- ~660 MB disk space for the image
- Note: Image is built for `linux/amd64`. On Apple Silicon (M1/M2/M3), it runs via Rosetta emulation (slower but functional)

---

## Quick Start

### 1. Load the Docker Image

```bash
# Navigate to the project directory
cd prostate_cancer_R01_NLP_classifiers_Michael

# Create tar from OCI image directory and load into Docker
tar -cf /tmp/r01-nlp-classifiers.tar -C r01-nlp-classifiers-docker-image .
docker load -i /tmp/r01-nlp-classifiers.tar

# Verify
docker images | grep r01-nlp-classifiers
```

Expected output:
```
r01-nlp-classifiers   latest   xxxxxxxxxx   xx months ago   1.41GB
Loaded image: r01-nlp-classifiers:latest
```

### 2. Run the Container

```bash
# Run in foreground (see logs directly)
docker run -p 8000:8000 r01-nlp-classifiers:latest

# OR run in background (detached)
docker run -d --name r01-nlp -p 8000:8000 r01-nlp-classifiers:latest
```

Startup takes ~10-20 seconds (longer on Apple Silicon). Wait until you see:
```
Running plumber API at http://0.0.0.0:8000
Running rapidoc Docs at http://127.0.0.1:8000/__docs__/
```

### 3. Verify It's Running

```bash
curl http://localhost:8000/ping
```

Expected response:
```json
{"status":"online","time":"2026-02-10 18:41:33"}
```

---

## API Reference

### Base URL: `http://localhost:8000`

### Utility Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ping` | Health check — returns `{"status":"online","time":"..."}` |
| GET | `/metadata` | Model metadata — returns required R packages |
| GET | `/prototype` | Input schema — returns expected input format |
| GET | `/__docs__/` | Interactive API documentation (RapiDoc UI, open in browser) |

### Prediction Endpoints

All prediction endpoints accept **POST** requests with JSON body.

| Method | Endpoint | Topic |
|--------|----------|-------|
| POST | `/predict/cp` | Cancer Prognosis |
| POST | `/predict/ed` | Erectile Dysfunction / Potency |
| POST | `/predict/inc` | Continence |
| POST | `/predict/ius` | Irritative Urinary Symptoms |
| POST | `/predict/le` | Life Expectancy |

### Input Format

JSON array of objects, each with a `text` field:

```json
[
  {"text": "sentence to classify"}
]
```

### Output Format

JSON array of prediction probabilities:

```json
[
  {
    ".pred_1": 0.9525,   // probability sentence IS about this topic
    ".pred_0": 0.0475    // probability sentence is NOT about this topic
  }
]
```

---

## Usage Examples

### Single Sentence Prediction

```bash
# Cancer Prognosis
curl -X POST http://localhost:8000/predict/cp \
  -H "Content-Type: application/json" \
  -d '[{"text": "prostate cancer is slow-growing and often doesnt cause harm until 15 years out from diagnosis"}]'
```

Response:
```json
[{".pred_1": 0.9634, ".pred_0": 0.0366}]
```

### Batch Prediction (Multiple Sentences)

```bash
curl -X POST http://localhost:8000/predict/cp \
  -H "Content-Type: application/json" \
  -d '[
    {"text": "this is rolling. excellent, okay."},
    {"text": "what is the risk of this cancer in my life?"},
    {"text": "prostate cancer is slow-growing and often doesnt cause harm until 15 years out from diagnosis"}
  ]'
```

Response:
```json
[
  {".pred_1": 0.1034, ".pred_0": 0.8966},
  {".pred_1": 0.7729, ".pred_0": 0.2271},
  {".pred_1": 0.9634, ".pred_0": 0.0366}
]
```

### All 5 Models on the Same Text

```bash
TEXT='[{"text": "prostate cancer is slow-growing and often doesnt cause harm until 15 20 years out from the diagnosis"}]'

echo "Cancer Prognosis:" && curl -s -X POST http://localhost:8000/predict/cp -H "Content-Type: application/json" -d "$TEXT"
echo "\nErectile Dysfunction:" && curl -s -X POST http://localhost:8000/predict/ed -H "Content-Type: application/json" -d "$TEXT"
echo "\nContinence:" && curl -s -X POST http://localhost:8000/predict/inc -H "Content-Type: application/json" -d "$TEXT"
echo "\nUrinary Symptoms:" && curl -s -X POST http://localhost:8000/predict/ius -H "Content-Type: application/json" -d "$TEXT"
echo "\nLife Expectancy:" && curl -s -X POST http://localhost:8000/predict/le -H "Content-Type: application/json" -d "$TEXT"
```

Example results for the sentence above:

| Model | `.pred_1` | Interpretation |
|-------|-----------|----------------|
| Cancer Prognosis | **95.3%** | Highly relevant |
| Life Expectancy | **62.8%** | Moderately relevant |
| Erectile Dysfunction | 25.8% | Not relevant |
| Irritative Urinary | 24.2% | Not relevant |
| Continence | 15.4% | Not relevant |

### Python Example

```python
import requests

url = "http://localhost:8000/predict/cp"
data = [
    {"text": "what is the risk of this cancer in my life?"},
    {"text": "the surgery may affect urinary control for several months"}
]

response = requests.post(url, json=data)
results = response.json()

for sentence, pred in zip(data, results):
    print(f"Text: {sentence['text'][:60]}...")
    print(f"  Probability: {pred['.pred_1']:.1%}")
```

### R Example

```r
library(httr2)

resp <- request("http://localhost:8000/predict/cp") |>
  req_body_json(list(
    list(text = "what is the risk of this cancer in my life?")
  )) |>
  req_perform() |>
  resp_body_json()

print(resp)
```

---

## Container Management

### View Logs
```bash
# If running in background
docker logs r01-nlp

# Follow logs in real-time
docker logs -f r01-nlp
```

### Stop the Container
```bash
docker stop r01-nlp
```

### Restart the Container
```bash
docker start r01-nlp
```

### Remove the Container
```bash
docker stop r01-nlp
docker rm r01-nlp
```

### Remove the Image (to free disk space)
```bash
docker rmi r01-nlp-classifiers:latest
```

---

## Internal Architecture

### Docker Image Structure

```
/ (container root)
├── opt/ml/
│   ├── plumber.R                  ← API endpoint definitions
│   └── board/                     ← vetiver model storage (pins)
│       ├── cancer_prognosis/
│       │   └── *.rds              ← serialized ranger model
│       ├── erectile_dysfunction_potency/
│       │   └── *.rds
│       ├── continence/
│       │   └── *.rds
│       ├── irritative_urinary_symptoms_frequency_urgency_nocturnia/
│       │   └── *.rds
│       └── life_expectancy/
│           └── *.rds
└── usr/local/lib/R/               ← R 4.5.1 installation
```

### Source Code (`plumber.R`)

```r
# Generated by the vetiver package; edit with care

library(pins)
library(plumber)
library(rapidoc)
library(vetiver)
board <- pins::board_folder('board')

cp <- pins::pin_read(board, 'cancer_prognosis')
ed <- pins::pin_read(board, 'erectile_dysfunction_potency')
inc <- pins::pin_read(board, 'continence')
ius <- pins::pin_read(
  board,
  'irritative_urinary_symptoms_frequency_urgency_nocturnia'
)
le <- pins::pin_read(board, 'life_expectancy')

#* @plumber
function(pr) {
pr |>
  vetiver_api(cp, path = '/predict/cp', type = 'prob') |>
  vetiver_api(ed, path = '/predict/ed', type = 'prob') |>
  vetiver_api(inc, path = '/predict/inc', type = 'prob') |>
  vetiver_api(ius, path = '/predict/ius', type = 'prob') |>
  vetiver_api(le, path = '/predict/le', type = 'prob')
}
```

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Base Image | Ubuntu Noble (24.04) | via rocker/r-ver |
| Language | R | 4.5.1 |
| API Framework | plumber | - |
| ML Framework | tidymodels (ranger) | - |
| Model Deployment | vetiver | - |
| Model Storage | pins (board_folder) | - |
| Text Processing | textrecipes, SnowballC, stopwords | - |
| Class Balancing | themis | - |
| API Docs | rapidoc | - |
| Package Management | renv | - |

### ML Pipeline

```
Input Text
  → textrecipes (tokenization, stemming, stopword removal, TF-IDF)
  → themis (class balancing via SMOTE or similar)
  → ranger (random forest classification)
  → probability output (.pred_0, .pred_1)
```

---

## Data & Files

The models were trained on manually scored prostate cancer consultation transcripts. Each sentence in a transcript was scored 0-5 by annotators for relevance to each clinical topic.

### Repository Structure

```
prostate_cancer_R01_NLP_classifiers_Michael/
├── README.md
├── r01-nlp-classifiers-docker-image/          ← Docker 이미지 (660MB)
├── prediction_pipeline_and_results/           ← 모델 예측 파이프라인 + 결과
│   ├── readme.txt
│   ├── process-data-guille.R
│   ├── processed_transcripts_sid-01.xlsx
│   └── original-study-physician-predictions-top-context.xlsx
└── manual_scoring_ground_truth/               ← 수동 채점 데이터 (Ground Truth)
    └── nlp-pilot-manual-scores(cp).csv
```

---

### `prediction_pipeline_and_results/` — NLP 모델 예측 파이프라인

Michael이 Guillermo에게 공유한 데이터 처리 코드와 입출력 파일입니다.

#### `readme.txt`
Michael이 팀에게 보낸 안내 메시지입니다. 스크립트 사용법과 Turboscribe 입력 시 전처리 수정이 필요하다는 점을 설명합니다.

#### `process-data-guille.R` (처리 스크립트, 176줄)
5개 NLP 모델로 녹취록을 분석하는 R 스크립트입니다. 처리 흐름:

1. `data/transcripts/` 폴더에서 Excel 녹취록 파일들을 로드
2. 의사(Interviewer) 발화만 필터링
3. 문장 단위로 분리 (`tidytext::unnest_tokens`)
4. `board/`에서 5개 NLP 모델 로드 (`pins::pin_read`)
5. 각 문장에 대해 5개 모델의 확률 예측 수행
6. 각 토픽별 상위 5개 문장 선택 (`slice_max`)
7. 앞뒤 3문장의 컨텍스트 포함
8. 결과를 Excel로 저장 (시트별: cp, inc, ed, ius, le)

사용 라이브러리: `tidyverse`, `tidymodels`, `textrecipes`, `ranger`, `pins`, `themis`, `tidytext`, `writexl`

#### `processed_transcripts_sid-01.xlsx` (입력 예시)
환자 1명(sid-01)의 상담 녹취록입니다.

| 항목 | 값 |
|------|-----|
| 시트 | Sheet1 |
| 행 수 | 193 |
| 열 | `speaker`, `text` |
| 내용 | 의사-환자 간 전립선암 상담 대화 (문장 단위) |

#### `original-study-physician-predictions-top-context.xlsx` (출력 결과)
`process-data-guille.R` 실행 결과입니다. 5개 시트(cp, inc, ed, ius, le)로 구성되며, 각 시트는 해당 토픽에 대해 모델이 가장 높은 확률로 예측한 문장들입니다.

| 시트 | 토픽 | 행 수 |
|------|------|-------|
| cp | Cancer Prognosis | 252 |
| inc | Continence | 252 |
| ed | Erectile Dysfunction | 254 |
| ius | Irritative Urinary Symptoms | 255 |
| le | Life Expectancy | 254 |

각 시트의 열 구조:

| 열 | 설명 |
|----|------|
| `name` | 환자 ID (sid-01, sid-02, ...) |
| `index` | 전체 문장 순번 |
| `i` | 발화 인덱스 |
| `i2` | 발화 내 문장 인덱스 |
| `speaker` | 발화자 (항상 Interviewer) |
| `text` | 원본 문장 |
| `.pred_1` | 해당 토픽에 대한 모델 예측 확률 (0~1) |
| `context` | 앞뒤 3문장을 포함한 맥락 텍스트, 핵심 문장은 `<main>...</main>` 태그로 표시 |

---

### `manual_scoring_ground_truth/` — 수동 채점 데이터

#### `nlp-pilot-manual-scores(cp).csv`
사람이 직접 채점한 Cancer Prognosis 관련성 점수입니다. 모델 성능 평가를 위한 Ground Truth 데이터입니다.

| 항목 | 값 |
|------|-----|
| 총 문장 수 | 9,543 |
| 녹취록 수 | 20개 환자 |
| 인코딩 | Windows-1252 (Latin-1) |

열 구조:

| 열 | 설명 |
|----|------|
| `file` | 원본 녹취록 파일명 (quality-coded-nlp-pilot-sid-*.xlsx) |
| `i` | 발화 인덱스 |
| `i2` | 발화 내 문장 인덱스 |
| `speaker` | 발화자 (Interviewer, Patient, Patient's Wife/Husband/Daughter 등) |
| `sentences` | 문장 텍스트 |
| `score` | 수동 채점 점수 (0-5, 높을수록 cancer prognosis와 관련성 높음) |

점수 분포:

| Score | 건수 | 비율 |
|-------|------|------|
| 0 (무관) | 9,318 | 97.6% |
| 1 | 11 | 0.1% |
| 2 | 107 | 1.1% |
| 3 | 77 | 0.8% |
| 4 | 17 | 0.2% |
| 5 | 13 | 0.1% |

녹취록별 통계 (20개):

| 파일 | 문장 수 | 채점된 문장 |
|------|---------|------------|
| sid-1 | 649 | 16 |
| sid-2 | 350 | 23 |
| sid-3 | 425 | 12 |
| sid-4 | 527 | 15 |
| sid-5 | 640 | 20 |
| sid-6 | 495 | 16 |
| sid-7 | 237 | 0 |
| sid-8 | 363 | 0 |
| sid-9 | 519 | 13 |
| sid-11 | 447 | 14 |
| sid-12 | 290 | 18 |
| sid-13 | 435 | 8 |
| sid-14 | 747 | 12 |
| sid-15 | 143 | 6 |
| sid-16 | 527 | 12 |
| sid-17 | 364 | 11 |
| sid-18 | 778 | 11 |
| sid-19 | 557 | 9 |
| sid-19.2 | 379 | 0 |
| sid-20 | 671 | 9 |

---

### 두 폴더의 관계

```
manual_scoring_ground_truth/
  nlp-pilot-manual-scores(cp).csv     ← 사람이 채점한 정답 (Ground Truth)
                  ↕ 비교하여 모델 성능 평가
prediction_pipeline_and_results/
  process-data-guille.R               ← NLP 모델 예측 파이프라인 (코드)
  processed_transcripts_sid-01.xlsx   ← 원본 녹취록 (입력)
  original-study-...-top-context.xlsx ← NLP 모델 예측 결과 (출력)
                  ↕ 모델은 Docker 이미지에 포함
r01-nlp-classifiers-docker-image/
  (5개 ranger 분류 모델이 vetiver로 패키징됨)
```

---

## Troubleshooting

### "platform mismatch" warning on Apple Silicon Mac
```
WARNING: The requested image's platform (linux/amd64) does not match the detected host platform (linux/arm64/v8)
```
This is expected. The image runs via Rosetta emulation. Startup is slower (~20-30s) but works correctly.

### Container starts but API doesn't respond
R package loading takes time on emulated architectures. Wait 20-30 seconds after `docker run`, then check logs:
```bash
docker logs r01-nlp
```
Look for: `Running plumber API at http://0.0.0.0:8000`

### Port 8000 already in use
```bash
# Find what's using port 8000
lsof -i :8000

# Use a different port
docker run -p 9000:8000 r01-nlp-classifiers:latest
# Then access at http://localhost:9000
```

### "No such image" error
Re-load the image:
```bash
tar -cf /tmp/r01-nlp-classifiers.tar -C r01-nlp-classifiers-docker-image .
docker load -i /tmp/r01-nlp-classifiers.tar
```
