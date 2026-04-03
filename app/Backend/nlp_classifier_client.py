"""
NLP Classifier API Client — HTTP interface to Michael's ML models.

This module is the sole communication layer between the FastAPI backend and the
``r01-nlp-classifiers`` Docker container, which hosts five R-plumber-based
binary text-classification models trained to detect clinical discussion topics
in prostate-cancer consultation transcripts.

Models
------
Each model predicts the probability (``.pred_1``) that a given sentence
discusses a specific clinical topic:

==== ================================================ ===========
Code Full outcome name                                 Endpoint
==== ================================================ ===========
cp   Cancer Prognosis                                  /predict/cp
le   Life Expectancy                                   /predict/le
ed   Erectile Dysfunction / Potency                    /predict/ed
inc  Incontinence                                      /predict/inc
ius  Irritative Urinary Symptoms (frequency/urgency)   /predict/ius
==== ================================================ ===========

Prediction result structure
---------------------------
Each prediction returns ``{".pred_1": float, ".pred_0": float}`` where
``.pred_1`` is the positive-class probability and ``.pred_0 = 1 - .pred_1``.

Architecture
------------
* **Connection pooling** — A single ``httpx.AsyncClient`` instance is reused
  across all requests with configurable connection limits (20 max / 10 keepalive).
* **Retry logic** — ``_call_nlp_with_retry`` implements exponential backoff
  (1 s → 2 s) for up to ``NLP_RETRIES`` (default 3) attempts on transient
  HTTP errors.
* **Redis caching** — Individual text+model predictions are cached with a
  configurable TTL (default 1 hour). Cache keys are generated via
  ``redis_client.make_cache_key``. Cache misses are the only texts sent to the
  NLP service.

Environment variables
---------------------
``NLP_API_URL``   Base URL of the NLP container (default ``http://nlp-classifiers:8000``).
``NLP_TIMEOUT``   HTTP request timeout in seconds (default 30).
``NLP_RETRIES``   Max retry attempts per request (default 3).
``NLP_CACHE_TTL`` Redis cache TTL in seconds (default 3600).
"""

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

from redis_client import get_redis, make_cache_key

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────
NLP_API_URL: str = os.getenv("NLP_API_URL", "http://nlp-classifiers:8000")
NLP_TIMEOUT: int = int(os.getenv("NLP_TIMEOUT", "30"))
NLP_RETRIES: int = int(os.getenv("NLP_RETRIES", "3"))
CACHE_TTL: int = int(os.getenv("NLP_CACHE_TTL", "3600"))  # 1 hour

# Class number → model endpoint mapping
CLASS_TO_MODEL: Dict[str, str] = {
    "1": "cp",   # Cancer Prognosis
    "2": "le",   # Life Expectancy
    "3": "ed",   # Erectile Dysfunction
    "4": "inc",  # Incontinence
    "5": "ius",  # Irritative Urinary Symptoms
}

MODEL_TO_CLASS: Dict[str, str] = {v: k for k, v in CLASS_TO_MODEL.items()}

ALL_MODELS: List[str] = list(CLASS_TO_MODEL.values())  # ["cp", "le", "ed", "inc", "ius"]

# ──────────────────────────────────────────────────────────────────────────────
# Exceptions
# ──────────────────────────────────────────────────────────────────────────────

class NLPServiceError(Exception):
    """Raised when the NLP service cannot fulfil a request."""

    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


# ──────────────────────────────────────────────────────────────────────────────
# Shared HTTP client (connection pooling)
# ──────────────────────────────────────────────────────────────────────────────
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=NLP_API_URL,
            timeout=httpx.Timeout(NLP_TIMEOUT),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_http_client() -> None:
    """Close the shared HTTP client. Call at app shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
        logger.info("NLP HTTP client closed")


# ──────────────────────────────────────────────────────────────────────────────
# Low-level: POST with retry
# ──────────────────────────────────────────────────────────────────────────────

async def _call_nlp_with_retry(
    model: str,
    payload: List[Dict[str, str]],
) -> List[Dict[str, Any]]:
    """POST ``/predict/{model}`` with exponential backoff.

    Returns the parsed JSON list from the NLP service.
    Raises ``NLPServiceError`` after all retries are exhausted.
    """
    client = _get_client()
    url = f"/predict/{model}"
    last_exc: Optional[Exception] = None

    for attempt in range(NLP_RETRIES):
        try:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            last_exc = exc
            if attempt < NLP_RETRIES - 1:
                wait = 2 ** attempt  # 1s, 2s
                logger.warning(
                    "NLP %s attempt %d failed (%s), retrying in %ds",
                    url, attempt + 1, exc, wait,
                )
                await asyncio.sleep(wait)

    raise NLPServiceError(
        f"NLP service unreachable after {NLP_RETRIES} attempts: {last_exc}"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Cache helpers
# ──────────────────────────────────────────────────────────────────────────────

def _text_cache_key(model: str, text: str) -> str:
    return make_cache_key(f"nlp:{model}", {"text": text})


async def _get_cached(key: str) -> Optional[Dict[str, Any]]:
    redis = get_redis()
    if redis is None:
        return None
    try:
        raw = await redis.get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception:
        logger.debug("Cache read error for %s", key)
    return None


async def _set_cached(key: str, value: Dict[str, Any]) -> None:
    redis = get_redis()
    if redis is None:
        return
    try:
        await redis.set(key, json.dumps(value), ex=CACHE_TTL)
    except Exception:
        logger.debug("Cache write error for %s", key)


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

async def predict_single(text: str, model: str) -> Dict[str, Any]:
    """Predict a single text against a single model.

    Returns ``{"text": ..., "model": ..., "pred_1": ..., "pred_0": ..., "cached": bool}``.
    """
    cache_key = _text_cache_key(model, text)

    cached = await _get_cached(cache_key)
    if cached is not None:
        cached["cached"] = True
        return cached

    results = await _call_nlp_with_retry(model, [{"text": text}])
    row = results[0] if results else {}

    prediction = {
        "text": text,
        "model": model,
        "pred_1": row.get(".pred_1", row.get("pred_1", 0.0)),
        "pred_0": row.get(".pred_0", row.get("pred_0", 0.0)),
        "cached": False,
    }
    await _set_cached(cache_key, {k: v for k, v in prediction.items() if k != "cached"})
    return prediction


async def predict_batch(texts: List[str], model: str) -> List[Dict[str, Any]]:
    """Predict multiple texts against a single model.

    Checks the cache for each text individually. Only uncached texts hit the NLP service.
    """
    results: List[Optional[Dict[str, Any]]] = [None] * len(texts)
    uncached_indices: List[int] = []

    # 1. Check cache for each text
    for i, text in enumerate(texts):
        cache_key = _text_cache_key(model, text)
        cached = await _get_cached(cache_key)
        if cached is not None:
            cached["cached"] = True
            results[i] = cached
        else:
            uncached_indices.append(i)

    # 2. Call NLP for uncached texts
    if uncached_indices:
        payload = [{"text": texts[i]} for i in uncached_indices]
        nlp_results = await _call_nlp_with_retry(model, payload)

        for idx, row in zip(uncached_indices, nlp_results):
            prediction = {
                "text": texts[idx],
                "model": model,
                "pred_1": row.get(".pred_1", row.get("pred_1", 0.0)),
                "pred_0": row.get(".pred_0", row.get("pred_0", 0.0)),
                "cached": False,
            }
            await _set_cached(
                _text_cache_key(model, texts[idx]),
                {k: v for k, v in prediction.items() if k != "cached"},
            )
            results[idx] = prediction

    return results  # type: ignore[return-value]


async def predict_all_models(text: str) -> Dict[str, Any]:
    """Predict a single text against all 5 models concurrently.

    Returns ``{"text": ..., "predictions": {model: {...}}, "top_topic": ..., "top_score": ...}``.
    """
    tasks = [predict_single(text, m) for m in ALL_MODELS]
    preds = await asyncio.gather(*tasks, return_exceptions=True)

    predictions: Dict[str, Dict[str, Any]] = {}
    top_topic = ""
    top_score = -1.0

    for model, result in zip(ALL_MODELS, preds):
        if isinstance(result, Exception):
            predictions[model] = {"error": str(result)}
        else:
            predictions[model] = result
            score = result.get("pred_1", 0.0)
            if score > top_score:
                top_score = score
                top_topic = model

    return {
        "text": text,
        "predictions": predictions,
        "top_topic": top_topic,
        "top_score": top_score,
    }


async def nlp_health_check() -> Dict[str, Any]:
    """Check if the NLP service is reachable (via /ping)."""
    client = _get_client()
    try:
        resp = await client.get("/ping", timeout=5.0)
        resp.raise_for_status()
        return {"status": "healthy", "detail": resp.text.strip()}
    except Exception as exc:
        return {"status": "unhealthy", "detail": str(exc)}
