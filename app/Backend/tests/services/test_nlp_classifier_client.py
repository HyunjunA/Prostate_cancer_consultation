"""Unit tests for nlp_classifier_client.py — HTTP client to the NLP Docker container.

Mocking strategy:
  - ``respx`` intercepts all httpx calls (the NLP Docker service)
  - ``get_redis()`` is monkeypatched to None for most tests (caching disabled)
  - ``nlp_classifier_client._client`` is reset before each test so respx can intercept
  - For cache tests, ``get_redis()`` returns a mock with async get/set

Test classes:
  - TestPredictSingle   (~7 tests)
  - TestPredictBatch    (~6 tests)
  - TestPredictAllModels(~5 tests)
  - TestNlpHealthCheck  (~3 tests)
  - TestCallNlpWithRetry(~4 tests)
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional
from unittest.mock import AsyncMock

import pytest
import respx
from httpx import Response

import nlp_classifier_client
from nlp_classifier_client import (
    NLPServiceError,
    predict_single,
    predict_batch,
    predict_all_models,
    nlp_health_check,
    _call_nlp_with_retry,
    ALL_MODELS,
)


NLP_BASE = "http://nlp-classifiers:8000"


# ── Helpers ──────────────────────────────────────────────────────────────────

def _disable_cache(monkeypatch) -> None:
    """Patch get_redis to return None (no caching)."""
    monkeypatch.setattr("nlp_classifier_client.get_redis", lambda: None)


def _reset_client() -> None:
    """Reset the module-level httpx client so respx can intercept."""
    nlp_classifier_client._client = None


class FakeRedis:
    """Minimal async Redis mock with in-memory dict storage."""

    def __init__(self, data: Optional[Dict[str, str]] = None):
        self._store: Dict[str, str] = data or {}

    async def get(self, key: str) -> Optional[str]:
        return self._store.get(key)

    async def set(self, key: str, value: str, ex: int = 0) -> None:
        self._store[key] = value


def _enable_cache(monkeypatch, fake_redis: FakeRedis) -> None:
    """Patch get_redis to return a FakeRedis instance."""
    monkeypatch.setattr("nlp_classifier_client.get_redis", lambda: fake_redis)


# ── TestPredictSingle ────────────────────────────────────────────────────────

class TestPredictSingle:
    """predict_single: single text × single model → prediction dict."""

    @respx.mock
    async def test_returns_prediction_when_nlp_responds(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/cp").mock(
            return_value=Response(200, json=[{".pred_1": 0.85, ".pred_0": 0.15}])
        )

        result = await predict_single("I have cancer concerns", "cp")

        assert result["text"] == "I have cancer concerns"
        assert result["model"] == "cp"
        assert result["pred_1"] == 0.85
        assert result["pred_0"] == 0.15

    @respx.mock
    async def test_handles_pred_key_without_dot_prefix(self, monkeypatch):
        """NLP response may use ``pred_1`` instead of ``.pred_1``."""
        _disable_cache(monkeypatch)
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/le").mock(
            return_value=Response(200, json=[{"pred_1": 0.72, "pred_0": 0.28}])
        )

        result = await predict_single("life expectancy discussion", "le")

        assert result["pred_1"] == 0.72
        assert result["pred_0"] == 0.28

    @respx.mock
    async def test_returns_cached_false_for_fresh_prediction(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/ed").mock(
            return_value=Response(200, json=[{".pred_1": 0.5, ".pred_0": 0.5}])
        )

        result = await predict_single("erectile dysfunction topic", "ed")

        assert result["cached"] is False

    @respx.mock
    async def test_returns_cached_true_on_cache_hit(self, monkeypatch):
        """When the prediction is already in Redis, return it with cached=True."""
        _reset_client()

        # Pre-populate fake Redis with a cached prediction
        cached_data = {
            "text": "cached sentence",
            "model": "cp",
            "pred_1": 0.99,
            "pred_0": 0.01,
        }
        cache_key = nlp_classifier_client._text_cache_key("cp", "cached sentence")
        fake_redis = FakeRedis({cache_key: json.dumps(cached_data)})
        _enable_cache(monkeypatch, fake_redis)

        # No respx mock needed — NLP should NOT be called
        result = await predict_single("cached sentence", "cp")

        assert result["cached"] is True
        assert result["pred_1"] == 0.99
        assert result["pred_0"] == 0.01

    @respx.mock
    async def test_raises_nlp_classifier_client_error_after_retries(self, monkeypatch):
        """NLP returns 500 on every attempt → NLPServiceError after retries."""
        _disable_cache(monkeypatch)
        _reset_client()
        monkeypatch.setattr("nlp_classifier_client.NLP_RETRIES", 2)

        respx.post(f"{NLP_BASE}/predict/inc").mock(
            return_value=Response(500, text="Internal Server Error")
        )

        # Also stub asyncio.sleep to avoid real delays
        monkeypatch.setattr(asyncio, "sleep", AsyncMock())

        with pytest.raises(NLPServiceError, match="unreachable after 2 attempts"):
            await predict_single("incontinence text", "inc")

    @respx.mock
    async def test_response_shape_has_required_keys(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/ius").mock(
            return_value=Response(200, json=[{".pred_1": 0.33, ".pred_0": 0.67}])
        )

        result = await predict_single("urinary symptoms", "ius")

        assert set(result.keys()) == {"text", "model", "pred_1", "pred_0", "cached"}

    @respx.mock
    async def test_empty_results_array_defaults_to_zero(self, monkeypatch):
        """If NLP returns an empty list, pred_1 and pred_0 default to 0.0."""
        _disable_cache(monkeypatch)
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/cp").mock(
            return_value=Response(200, json=[])
        )

        result = await predict_single("some text", "cp")

        assert result["pred_1"] == 0.0
        assert result["pred_0"] == 0.0


# ── TestPredictBatch ─────────────────────────────────────────────────────────

class TestPredictBatch:
    """predict_batch: multiple texts × single model → list of predictions."""

    @respx.mock
    async def test_returns_list_of_predictions(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        texts = ["sentence one", "sentence two", "sentence three"]
        respx.post(f"{NLP_BASE}/predict/cp").mock(
            return_value=Response(200, json=[
                {".pred_1": 0.9, ".pred_0": 0.1},
                {".pred_1": 0.3, ".pred_0": 0.7},
                {".pred_1": 0.6, ".pred_0": 0.4},
            ])
        )

        results = await predict_batch(texts, "cp")

        assert len(results) == 3
        assert all(r["model"] == "cp" for r in results)

    @respx.mock
    async def test_mix_of_cached_and_uncached(self, monkeypatch):
        """Cached texts come from Redis; uncached texts hit NLP."""
        _reset_client()

        # Pre-cache the second text
        cached_pred = {
            "text": "already cached",
            "model": "le",
            "pred_1": 0.88,
            "pred_0": 0.12,
        }
        cache_key = nlp_classifier_client._text_cache_key("le", "already cached")
        fake_redis = FakeRedis({cache_key: json.dumps(cached_pred)})
        _enable_cache(monkeypatch, fake_redis)

        texts = ["fresh text", "already cached"]

        # NLP should only be called for "fresh text"
        respx.post(f"{NLP_BASE}/predict/le").mock(
            return_value=Response(200, json=[{".pred_1": 0.55, ".pred_0": 0.45}])
        )

        results = await predict_batch(texts, "le")

        assert len(results) == 2
        assert results[0]["cached"] is False
        assert results[0]["pred_1"] == 0.55
        assert results[1]["cached"] is True
        assert results[1]["pred_1"] == 0.88

    @respx.mock
    async def test_only_calls_nlp_for_uncached_texts(self, monkeypatch):
        """When all texts are cached, NLP should not be called at all."""
        _reset_client()

        cached_pred = {"text": "cached", "model": "ed", "pred_1": 0.77, "pred_0": 0.23}
        cache_key = nlp_classifier_client._text_cache_key("ed", "cached")
        fake_redis = FakeRedis({cache_key: json.dumps(cached_pred)})
        _enable_cache(monkeypatch, fake_redis)

        # Set up a mock route that should NOT be called
        route = respx.post(f"{NLP_BASE}/predict/ed").mock(
            return_value=Response(200, json=[])
        )

        results = await predict_batch(["cached"], "ed")

        assert len(results) == 1
        assert results[0]["cached"] is True
        assert not route.called

    @respx.mock
    async def test_results_preserve_input_order(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        texts = ["alpha", "beta", "gamma"]
        respx.post(f"{NLP_BASE}/predict/inc").mock(
            return_value=Response(200, json=[
                {".pred_1": 0.1, ".pred_0": 0.9},
                {".pred_1": 0.2, ".pred_0": 0.8},
                {".pred_1": 0.3, ".pred_0": 0.7},
            ])
        )

        results = await predict_batch(texts, "inc")

        assert results[0]["text"] == "alpha"
        assert results[1]["text"] == "beta"
        assert results[2]["text"] == "gamma"
        assert results[0]["pred_1"] == 0.1
        assert results[2]["pred_1"] == 0.3

    @respx.mock
    async def test_empty_batch_returns_empty_list(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        results = await predict_batch([], "cp")

        assert results == []

    @respx.mock
    async def test_single_text_batch(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/ius").mock(
            return_value=Response(200, json=[{".pred_1": 0.44, ".pred_0": 0.56}])
        )

        results = await predict_batch(["single sentence"], "ius")

        assert len(results) == 1
        assert results[0]["text"] == "single sentence"
        assert results[0]["pred_1"] == 0.44


# ── TestPredictAllModels ─────────────────────────────────────────────────────

class TestPredictAllModels:
    """predict_all_models: single text × all 5 models concurrently."""

    @respx.mock
    async def test_returns_predictions_for_all_models(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        for model in ALL_MODELS:
            respx.post(f"{NLP_BASE}/predict/{model}").mock(
                return_value=Response(200, json=[{".pred_1": 0.5, ".pred_0": 0.5}])
            )

        result = await predict_all_models("test sentence")

        assert "predictions" in result
        for model in ALL_MODELS:
            assert model in result["predictions"]

    @respx.mock
    async def test_identifies_top_topic_correctly(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        scores = {"cp": 0.3, "le": 0.1, "ed": 0.95, "inc": 0.2, "ius": 0.4}
        for model, score in scores.items():
            respx.post(f"{NLP_BASE}/predict/{model}").mock(
                return_value=Response(200, json=[{".pred_1": score, ".pred_0": 1 - score}])
            )

        result = await predict_all_models("test sentence")

        assert result["top_topic"] == "ed"
        assert result["top_score"] == 0.95

    @respx.mock
    async def test_handles_partial_failure_gracefully(self, monkeypatch):
        """If one model errors, others still succeed. Error model has 'error' key."""
        _disable_cache(monkeypatch)
        _reset_client()
        monkeypatch.setattr("nlp_classifier_client.NLP_RETRIES", 1)
        monkeypatch.setattr(asyncio, "sleep", AsyncMock())

        for model in ALL_MODELS:
            if model == "inc":
                respx.post(f"{NLP_BASE}/predict/{model}").mock(
                    return_value=Response(500, text="model error")
                )
            else:
                respx.post(f"{NLP_BASE}/predict/{model}").mock(
                    return_value=Response(200, json=[{".pred_1": 0.6, ".pred_0": 0.4}])
                )

        result = await predict_all_models("test sentence")

        # Successful models should have predictions
        assert result["predictions"]["cp"]["pred_1"] == 0.6
        assert result["predictions"]["le"]["pred_1"] == 0.6
        # Failed model should have error key
        assert "error" in result["predictions"]["inc"]

    @respx.mock
    async def test_response_shape_validation(self, monkeypatch):
        _disable_cache(monkeypatch)
        _reset_client()

        for model in ALL_MODELS:
            respx.post(f"{NLP_BASE}/predict/{model}").mock(
                return_value=Response(200, json=[{".pred_1": 0.5, ".pred_0": 0.5}])
            )

        result = await predict_all_models("shape check")

        assert set(result.keys()) == {"text", "predictions", "top_topic", "top_score"}
        assert result["text"] == "shape check"
        assert isinstance(result["predictions"], dict)
        assert isinstance(result["top_score"], float)
        assert isinstance(result["top_topic"], str)

    @respx.mock
    async def test_all_models_called_concurrently(self, monkeypatch):
        """Verify that all 5 model endpoints are actually called."""
        _disable_cache(monkeypatch)
        _reset_client()

        routes = {}
        for model in ALL_MODELS:
            routes[model] = respx.post(f"{NLP_BASE}/predict/{model}").mock(
                return_value=Response(200, json=[{".pred_1": 0.5, ".pred_0": 0.5}])
            )

        await predict_all_models("concurrency test")

        for model, route in routes.items():
            assert route.called, f"Model {model} was not called"


# ── TestNlpHealthCheck ───────────────────────────────────────────────────────

class TestNlpHealthCheck:
    """nlp_health_check: GET /ping on the NLP service."""

    @respx.mock
    async def test_returns_healthy_when_ping_succeeds(self, monkeypatch):
        _reset_client()

        respx.get(f"{NLP_BASE}/ping").mock(
            return_value=Response(200, text="pong")
        )

        result = await nlp_health_check()

        assert result["status"] == "healthy"
        assert result["detail"] == "pong"

    @respx.mock
    async def test_returns_unhealthy_when_ping_fails(self, monkeypatch):
        _reset_client()

        respx.get(f"{NLP_BASE}/ping").mock(
            return_value=Response(503, text="Service Unavailable")
        )

        result = await nlp_health_check()

        assert result["status"] == "unhealthy"

    @respx.mock
    async def test_returns_unhealthy_with_detail_message(self, monkeypatch):
        """On connection error, detail contains the exception string."""
        _reset_client()

        respx.get(f"{NLP_BASE}/ping").mock(side_effect=ConnectionError("refused"))

        result = await nlp_health_check()

        assert result["status"] == "unhealthy"
        assert "refused" in result["detail"]


# ── TestCallNlpWithRetry ────────────────────────────────────────────────────

class TestCallNlpWithRetry:
    """_call_nlp_with_retry: POST /predict/{model} with exponential backoff."""

    @respx.mock
    async def test_succeeds_on_first_try(self, monkeypatch):
        _reset_client()

        respx.post(f"{NLP_BASE}/predict/cp").mock(
            return_value=Response(200, json=[{".pred_1": 0.8, ".pred_0": 0.2}])
        )

        result = await _call_nlp_with_retry("cp", [{"text": "hello"}])

        assert result == [{".pred_1": 0.8, ".pred_0": 0.2}]

    @respx.mock
    async def test_retries_on_failure_then_succeeds(self, monkeypatch):
        _reset_client()
        monkeypatch.setattr("nlp_classifier_client.NLP_RETRIES", 3)
        monkeypatch.setattr(asyncio, "sleep", AsyncMock())

        route = respx.post(f"{NLP_BASE}/predict/le")
        route.side_effect = [
            Response(500, text="error"),
            Response(500, text="error"),
            Response(200, json=[{".pred_1": 0.7, ".pred_0": 0.3}]),
        ]

        result = await _call_nlp_with_retry("le", [{"text": "retry me"}])

        assert result == [{".pred_1": 0.7, ".pred_0": 0.3}]
        assert route.call_count == 3

    @respx.mock
    async def test_raises_nlp_classifier_client_error_after_max_retries(self, monkeypatch):
        _reset_client()
        monkeypatch.setattr("nlp_classifier_client.NLP_RETRIES", 2)
        monkeypatch.setattr(asyncio, "sleep", AsyncMock())

        respx.post(f"{NLP_BASE}/predict/ed").mock(
            return_value=Response(500, text="Server Error")
        )

        with pytest.raises(NLPServiceError, match="unreachable after 2 attempts"):
            await _call_nlp_with_retry("ed", [{"text": "fail"}])

    @respx.mock
    async def test_respects_retry_count_from_config(self, monkeypatch):
        """With NLP_RETRIES=1, should only attempt once before raising."""
        _reset_client()
        monkeypatch.setattr("nlp_classifier_client.NLP_RETRIES", 1)
        monkeypatch.setattr(asyncio, "sleep", AsyncMock())

        route = respx.post(f"{NLP_BASE}/predict/ius").mock(
            return_value=Response(500, text="error")
        )

        with pytest.raises(NLPServiceError, match="unreachable after 1 attempts"):
            await _call_nlp_with_retry("ius", [{"text": "once"}])

        assert route.call_count == 1
