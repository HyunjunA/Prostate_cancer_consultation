"""NLP Classifier API Client — HTTP interface to the ML model service.

This module is the SOLE communication layer between the FastAPI backend
and the ``r01-nlp-classifiers`` Docker container, which hosts five R-
plumber-based binary text-classification models trained to detect
clinical discussion topics in prostate-cancer consultation transcripts.

Why a dedicated client module:
    Routes (routes_nlp.py, routes_transcript.py) call THIS module —
    they never touch httpx, retries, or Redis directly. Centralising
    the HTTP plumbing here means:
      - One connection pool shared across the whole backend (cheap).
      - Retry / timeout / cache policy lives in ONE place.
      - Swapping the underlying ML container (different URL, gRPC,
        whatever) is a single-file change.

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
# Imported here (not at the top) because config.get() lazily loads the
# YAML on first call; keeping the import next to the constants makes
# the dependency obvious.
import config as _cfg
NLP_API_URL: str = _cfg.get("nlp.api_url", "http://nlp-classifiers:8000")
NLP_TIMEOUT: int = int(_cfg.get("nlp.timeout", 30))
NLP_RETRIES: int = int(_cfg.get("nlp.retries", 3))
CACHE_TTL: int = int(_cfg.get("nlp.cache_ttl", 3600))  # 1 hour

# Class number → model endpoint mapping. The frontend uses the numeric
# class names ("1".."5") for human-friendly labels; the NLP container
# uses the short codes (cp, le, ...). We keep the mapping here so the
# HTTP routes (routes_nlp.py) can translate between the two without
# duplicating the constant.
CLASS_TO_MODEL: Dict[str, str] = {
    "1": "cp",   # Cancer Prognosis
    "2": "le",   # Life Expectancy
    "3": "ed",   # Erectile Dysfunction
    "4": "inc",  # Incontinence
    "5": "ius",  # Irritative Urinary Symptoms
}

# Reverse map for callers going the other direction.
MODEL_TO_CLASS: Dict[str, str] = {v: k for k, v in CLASS_TO_MODEL.items()}

# Canonical list of model codes — used by validators and by
# `predict_all_models` below to fan out across every model.
ALL_MODELS: List[str] = list(CLASS_TO_MODEL.values())  # ["cp", "le", "ed", "inc", "ius"]

# ──────────────────────────────────────────────────────────────────────────────
# Exceptions
# ──────────────────────────────────────────────────────────────────────────────

class NLPServiceError(Exception):
    """Raised when the NLP service cannot fulfil a request.

    `status_code` lets callers (routes_nlp.py) translate the failure
    into the HTTP status they want to surface. Default 503 because
    "NLP unreachable" maps cleanly to "service unavailable".
    """

    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


# ──────────────────────────────────────────────────────────────────────────────
# Shared HTTP client (connection pooling)
# ──────────────────────────────────────────────────────────────────────────────
# Single client instance shared by every caller in the process. Created
# lazily so test code that swaps NLP_API_URL via monkeypatch sees the
# patched value when it makes the first call.
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    """Return the shared httpx.AsyncClient, recreating if closed."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=NLP_API_URL,
            timeout=httpx.Timeout(NLP_TIMEOUT),
            # max_connections caps total parallelism to the NLP container;
            # max_keepalive_connections=10 keeps the most common bunch
            # warm so we do not pay TCP handshake on every request.
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_http_client() -> None:
    """Close the shared HTTP client. Call at app shutdown.

    Wired into app_lifespan.py so SIGTERM does not leave half-open
    sockets to the NLP container.
    """
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
            # Catch HTTPStatusError (4xx/5xx) AND RequestError (TCP /
            # DNS / timeout). NOT a generic except — anything else
            # (e.g. JSON decode error) is a programming bug and should
            # bubble up rather than be silently retried.
            last_exc = exc
            if attempt < NLP_RETRIES - 1:
                # Exponential back-off: 1s, 2s. Caps at 4s total wait
                # for the default 3 retries — enough to ride out a
                # short hiccup, short enough not to delay real outages.
                wait = 2 ** attempt  # 1s, 2s
                logger.warning(
                    "NLP %s attempt %d failed (%s), retrying in %ds",
                    url, attempt + 1, exc, wait,
                )
                await asyncio.sleep(wait)

    # All attempts exhausted — surface as NLPServiceError so routes_nlp.py
    # can convert it to a clean HTTP error for the client.
    raise NLPServiceError(
        f"NLP service unreachable after {NLP_RETRIES} attempts: {last_exc}"
    )


# ──────────────────────────────────────────────────────────────────────────────
# Cache helpers
# ──────────────────────────────────────────────────────────────────────────────

def _text_cache_key(model: str, text: str) -> str:
    """Compose the Redis key for one (model, text) pair.

    Namespaced by `nlp:<model>` so we can invalidate one model's cache
    without nuking the others (e.g. `redis-cli SCAN cache:nlp:cp:*`).
    """
    return make_cache_key(f"nlp:{model}", {"text": text})


async def _get_cached(key: str) -> Optional[Dict[str, Any]]:
    """Fetch and decode a cached prediction. None on any failure."""
    redis = get_redis()
    if redis is None:
        # No Redis means caching is silently disabled. Caller treats
        # None as cache miss and proceeds to call the NLP service.
        return None
    try:
        raw = await redis.get(key)
        if raw is not None:
            return json.loads(raw)
    except Exception:
        # Any cache error (network blip, malformed JSON) -> debug log
        # only. We do NOT surface cache errors as request failures.
        logger.debug("Cache read error for %s", key)
    return None


async def _set_cached(key: str, value: Dict[str, Any]) -> None:
    """Store a prediction in Redis with the configured TTL."""
    redis = get_redis()
    if redis is None:
        return
    try:
        # ex= sets the expiry so old predictions evict themselves; lets
        # us upgrade the model without having to manually invalidate
        # cached entries.
        await redis.set(key, json.dumps(value), ex=CACHE_TTL)
    except Exception:
        logger.debug("Cache write error for %s", key)


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

async def predict_single(text: str, model: str) -> Dict[str, Any]:
    """Predict a single text against a single model.

    Returns ``{"text": ..., "model": ..., "pred_1": ..., "pred_0": ..., "cached": bool}``.
    The `cached` field tells the caller whether the answer came from
    Redis (true, ~5 ms) or the NLP container (false, ~500 ms).
    """
    cache_key = _text_cache_key(model, text)

    cached = await _get_cached(cache_key)
    if cached is not None:
        # Tag with cached=True ON RETRIEVAL so we do not have to store
        # the bool itself in Redis (it would always be False at write
        # time anyway).
        cached["cached"] = True
        return cached

    # Cache miss → real NLP call (with retries).
    results = await _call_nlp_with_retry(model, [{"text": text}])
    row = results[0] if results else {}

    # The R container returns columns prefixed with `.` (R convention),
    # but some upstream variants use plain `pred_1`. Accept either.
    prediction = {
        "text": text,
        "model": model,
        "pred_1": row.get(".pred_1", row.get("pred_1", 0.0)),
        "pred_0": row.get(".pred_0", row.get("pred_0", 0.0)),
        "cached": False,
    }
    # Strip `cached` before storing — see comment above.
    await _set_cached(cache_key, {k: v for k, v in prediction.items() if k != "cached"})
    return prediction


async def predict_batch(texts: List[str], model: str) -> List[Dict[str, Any]]:
    """Predict multiple texts against a single model.

    Checks the cache for each text individually. Only uncached texts
    hit the NLP service — typical transcript scrubs see 50-90% cache
    hit rates because the same sentences appear across many patients.
    """
    results: List[Optional[Dict[str, Any]]] = [None] * len(texts)
    uncached_indices: List[int] = []

    # ── 1. Check cache for each text ────────────────────────────────
    # Fill in cache hits immediately; collect cache misses by index so
    # we can splice the NLP results back into the right positions later.
    for i, text in enumerate(texts):
        cache_key = _text_cache_key(model, text)
        cached = await _get_cached(cache_key)
        if cached is not None:
            cached["cached"] = True
            results[i] = cached
        else:
            uncached_indices.append(i)

    # ── 2. Call NLP for uncached texts ──────────────────────────────
    # Single batch POST for all misses — far cheaper than one POST per
    # miss. The NLP container is itself optimised for batch input.
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

    # results has been fully populated by now; the type checker just
    # cannot prove it because of the Optional in the initialiser.
    return results  # type: ignore[return-value]


async def predict_all_models(text: str) -> Dict[str, Any]:
    """Predict a single text against all 5 models concurrently.

    Returns ``{"text": ..., "predictions": {model: {...}}, "top_topic": ..., "top_score": ...}``.
    Latency is roughly the slowest single call, NOT the sum, because
    the 5 calls run in parallel via `asyncio.gather`.
    """
    tasks = [predict_single(text, m) for m in ALL_MODELS]
    # return_exceptions=True so one failed model does not cancel the
    # other four — partial results are still useful to the caller.
    preds = await asyncio.gather(*tasks, return_exceptions=True)

    predictions: Dict[str, Dict[str, Any]] = {}
    top_topic = ""
    top_score = -1.0

    for model, result in zip(ALL_MODELS, preds):
        if isinstance(result, Exception):
            # Per-model failure encoded in the response. Caller can see
            # `error` and decide whether to retry just this model.
            predictions[model] = {"error": str(result)}
        else:
            predictions[model] = result
            # Track the highest-scoring model so callers do not have
            # to re-walk the dict to find the "winning" topic.
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
    """Check if the NLP service is reachable (via /ping).

    Used by routes_system.py /health and routes_nlp.py /health. Stays
    cheap (5-second timeout, no retry) so frequent probes never tie up
    the NLP container.
    """
    client = _get_client()
    try:
        resp = await client.get("/ping", timeout=5.0)
        resp.raise_for_status()
        return {"status": "healthy", "detail": resp.text.strip()}
    except Exception as exc:
        # Broad except: any failure -> "unhealthy" with the error string
        # in `detail` so the operator can read what went wrong.
        return {"status": "unhealthy", "detail": str(exc)}
