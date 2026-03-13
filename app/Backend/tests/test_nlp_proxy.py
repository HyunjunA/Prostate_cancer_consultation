"""Tests for NLP proxy endpoints.

Endpoints tested:
  GET  /api/nlp/health          (no auth, proxies NLP health check)
  POST /api/nlp/predict          (auth, single model prediction)
  POST /api/nlp/predict/batch    (auth, batch prediction, max 50)
  POST /api/nlp/predict/by-class (auth, class number → model mapping)
  POST /api/nlp/predict/all      (auth, all 5 models concurrently)
  GET  /api/nlp/models           (auth, list available models)
"""

import pytest
import pytest_asyncio


# ── Shared mock helpers ──────────────────────────────────────────────────────

SAMPLE_TEXT = "The patient discussed cancer prognosis with the doctor."

ALL_MODELS = ["cp", "le", "ed", "inc", "ius"]


def _make_single_result(text: str, model: str, pred_1: float = 0.85, cached: bool = False):
    """Build the dict that predict_single would return."""
    return {
        "text": text,
        "model": model,
        "pred_1": pred_1,
        "pred_0": round(1.0 - pred_1, 2),
        "cached": cached,
    }


def _make_all_models_result(text: str):
    """Build the dict that predict_all_models would return."""
    predictions = {}
    top_topic = ""
    top_score = -1.0
    scores = {"cp": 0.90, "le": 0.60, "ed": 0.30, "inc": 0.20, "ius": 0.10}
    for model in ALL_MODELS:
        score = scores[model]
        pred = _make_single_result(text, model, pred_1=score, cached=False)
        predictions[model] = pred
        if score > top_score:
            top_score = score
            top_topic = model
    return {
        "text": text,
        "predictions": predictions,
        "top_topic": top_topic,
        "top_score": top_score,
    }


@pytest.fixture
def mock_nlp(monkeypatch):
    """Patch all NLP service functions in routes_nlp to use in-memory mocks.

    Yields a dict of call-tracking lists so tests can inspect what was called.
    """
    import routes_nlp

    calls = {"single": [], "batch": [], "all": [], "health": []}

    async def mock_predict_single(text, model):
        calls["single"].append((text, model))
        return _make_single_result(text, model)

    async def mock_predict_batch(texts, model):
        calls["batch"].append((texts, model))
        return [_make_single_result(t, model) for t in texts]

    async def mock_predict_all_models(text):
        calls["all"].append(text)
        return _make_all_models_result(text)

    async def mock_nlp_health_check():
        calls["health"].append(True)
        return {"status": "healthy", "detail": "pong"}

    monkeypatch.setattr(routes_nlp, "predict_single", mock_predict_single)
    monkeypatch.setattr(routes_nlp, "predict_batch", mock_predict_batch)
    monkeypatch.setattr(routes_nlp, "predict_all_models", mock_predict_all_models)
    monkeypatch.setattr(routes_nlp, "nlp_health_check", mock_nlp_health_check)

    return calls


# ── GET /api/nlp/health ──────────────────────────────────────────────────────

class TestNlpHealth:
    """GET /api/nlp/health — no auth required, proxies NLP container health."""

    async def test_returns_healthy_when_service_is_up(self, client, mock_nlp):
        resp = await client.get("/api/nlp/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "detail" in data

    async def test_returns_503_when_service_is_down(self, client, monkeypatch):
        import routes_nlp

        async def _unhealthy():
            return {"status": "unhealthy", "detail": "Connection refused"}

        monkeypatch.setattr(routes_nlp, "nlp_health_check", _unhealthy)

        resp = await client.get("/api/nlp/health")
        assert resp.status_code == 503
        data = resp.json()
        assert "Connection refused" in data["detail"]

    async def test_no_auth_required(self, client, mock_nlp):
        # No api_headers — should still succeed
        resp = await client.get("/api/nlp/health")
        assert resp.status_code == 200


# ── POST /api/nlp/predict ────────────────────────────────────────────────────

class TestNlpPredict:
    """POST /api/nlp/predict — single model prediction."""

    async def test_valid_prediction_returns_200(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict",
            json={"text": SAMPLE_TEXT, "model": "cp"},
            headers=api_headers,
        )
        assert resp.status_code == 200

    async def test_response_shape(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict",
            json={"text": SAMPLE_TEXT, "model": "le"},
            headers=api_headers,
        )
        data = resp.json()
        assert "text" in data
        assert "model" in data
        assert "pred_1" in data
        assert "pred_0" in data
        assert "cached" in data
        assert data["model"] == "le"
        assert data["text"] == SAMPLE_TEXT
        assert isinstance(data["pred_1"], float)
        assert isinstance(data["pred_0"], float)

    async def test_invalid_model_returns_400(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict",
            json={"text": SAMPLE_TEXT, "model": "nonexistent"},
            headers=api_headers,
        )
        assert resp.status_code == 400
        assert "Invalid model" in resp.json()["detail"]

    async def test_empty_text_returns_422(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict",
            json={"text": "", "model": "cp"},
            headers=api_headers,
        )
        assert resp.status_code == 422

    async def test_no_auth_returns_403(self, client, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict",
            json={"text": SAMPLE_TEXT, "model": "cp"},
        )
        assert resp.status_code == 403

    async def test_cached_flag_passed_through(self, client, api_headers, monkeypatch):
        import routes_nlp

        async def _cached_predict(text, model):
            return _make_single_result(text, model, cached=True)

        monkeypatch.setattr(routes_nlp, "predict_single", _cached_predict)

        resp = await client.post(
            "/api/nlp/predict",
            json={"text": SAMPLE_TEXT, "model": "cp"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["cached"] is True


# ── POST /api/nlp/predict/batch ──────────────────────────────────────────────

class TestNlpPredictBatch:
    """POST /api/nlp/predict/batch — batch model prediction (max 50 texts)."""

    async def test_valid_batch_returns_200(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/batch",
            json={"texts": [SAMPLE_TEXT, "Another sentence."], "model": "ed"},
            headers=api_headers,
        )
        assert resp.status_code == 200

    async def test_returns_correct_count(self, client, api_headers, mock_nlp):
        texts = ["Sentence one.", "Sentence two.", "Sentence three."]
        resp = await client.post(
            "/api/nlp/predict/batch",
            json={"texts": texts, "model": "inc"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["count"] == 3
        assert data["model"] == "inc"

    async def test_invalid_model_returns_400(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/batch",
            json={"texts": [SAMPLE_TEXT], "model": "bad_model"},
            headers=api_headers,
        )
        assert resp.status_code == 400
        assert "Invalid model" in resp.json()["detail"]

    async def test_empty_texts_returns_422(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/batch",
            json={"texts": [], "model": "cp"},
            headers=api_headers,
        )
        assert resp.status_code == 422

    async def test_no_auth_returns_403(self, client, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/batch",
            json={"texts": [SAMPLE_TEXT], "model": "cp"},
        )
        assert resp.status_code == 403

    async def test_response_contains_predictions_array(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/batch",
            json={"texts": [SAMPLE_TEXT, "Second text."], "model": "ius"},
            headers=api_headers,
        )
        data = resp.json()
        assert "predictions" in data
        assert isinstance(data["predictions"], list)
        assert len(data["predictions"]) == 2
        for pred in data["predictions"]:
            assert "text" in pred
            assert "model" in pred
            assert "pred_1" in pred
            assert "pred_0" in pred
            assert "cached" in pred


# ── POST /api/nlp/predict/by-class ───────────────────────────────────────────

class TestNlpPredictByClass:
    """POST /api/nlp/predict/by-class — class number maps to model name."""

    async def test_class_1_maps_to_cp(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/by-class",
            json={"text": SAMPLE_TEXT, "class": "1"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["model"] == "cp"

    async def test_class_5_maps_to_ius(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/by-class",
            json={"text": SAMPLE_TEXT, "class": "5"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["model"] == "ius"

    async def test_invalid_class_returns_400(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/by-class",
            json={"text": SAMPLE_TEXT, "class": "6"},
            headers=api_headers,
        )
        assert resp.status_code == 400
        assert "Invalid class" in resp.json()["detail"]

    async def test_response_shape(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/by-class",
            json={"text": SAMPLE_TEXT, "class": "3"},
            headers=api_headers,
        )
        data = resp.json()
        assert "text" in data
        assert "model" in data
        assert "pred_1" in data
        assert "pred_0" in data
        assert "cached" in data
        assert data["model"] == "ed"
        assert data["text"] == SAMPLE_TEXT

    async def test_no_auth_returns_403(self, client, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/by-class",
            json={"text": SAMPLE_TEXT, "class": "1"},
        )
        assert resp.status_code == 403


# ── POST /api/nlp/predict/all ────────────────────────────────────────────────

class TestNlpPredictAll:
    """POST /api/nlp/predict/all — predict against all 5 models."""

    async def test_returns_predictions_for_all_5_models(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/all",
            json={"text": SAMPLE_TEXT},
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["predictions"]) == 5
        for model in ALL_MODELS:
            assert model in data["predictions"]

    async def test_returns_top_topic_and_top_score(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/all",
            json={"text": SAMPLE_TEXT},
            headers=api_headers,
        )
        data = resp.json()
        assert "top_topic" in data
        assert "top_score" in data
        # Mock sets cp=0.90 as the highest
        assert data["top_topic"] == "cp"
        assert data["top_score"] == 0.90

    async def test_response_shape(self, client, api_headers, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/all",
            json={"text": SAMPLE_TEXT},
            headers=api_headers,
        )
        data = resp.json()
        assert "text" in data
        assert "predictions" in data
        assert "top_topic" in data
        assert "top_score" in data
        assert isinstance(data["predictions"], dict)
        assert isinstance(data["top_score"], float)
        assert data["text"] == SAMPLE_TEXT

    async def test_no_auth_returns_403(self, client, mock_nlp):
        resp = await client.post(
            "/api/nlp/predict/all",
            json={"text": SAMPLE_TEXT},
        )
        assert resp.status_code == 403

    async def test_works_with_single_sentence(self, client, api_headers, mock_nlp):
        short_text = "Brief statement."
        resp = await client.post(
            "/api/nlp/predict/all",
            json={"text": short_text},
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == short_text
        assert len(data["predictions"]) == 5


# ── GET /api/nlp/models ──────────────────────────────────────────────────────

class TestNlpModels:
    """GET /api/nlp/models — list available NLP models."""

    async def test_returns_5_models(self, client, api_headers):
        resp = await client.get("/api/nlp/models", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "models" in data
        assert len(data["models"]) == 5

    async def test_each_model_has_required_keys(self, client, api_headers):
        resp = await client.get("/api/nlp/models", headers=api_headers)
        models = resp.json()["models"]
        for item in models:
            assert "class" in item
            assert "model" in item
            assert "label" in item

    async def test_labels_match_expected_names(self, client, api_headers):
        resp = await client.get("/api/nlp/models", headers=api_headers)
        models = resp.json()["models"]
        labels = {m["model"]: m["label"] for m in models}
        assert labels["cp"] == "Cancer Prognosis"
        assert labels["le"] == "Life Expectancy"
        assert labels["ed"] == "Erectile Dysfunction"
        assert labels["inc"] == "Incontinence"
        assert labels["ius"] == "Irritative Urinary Symptoms"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/nlp/models")
        assert resp.status_code == 403
