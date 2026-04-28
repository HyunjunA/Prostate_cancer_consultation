"""NLP classifier API — proxy in front of the R plumber service.

The `r01-nlp-classifiers` Docker container hosts five binary classifiers
(cp, le, ed, inc, ius — the five domains the dashboard scores). The
frontend never talks to it directly; every request flows through this
proxy, which adds:
    - X-API-Key authentication (so the R container stays unexposed).
    - Redis-based response caching (cuts repeat calls to ~5 ms).
    - Per-user rate limiting via fastapi-limiter.
    - Pydantic validation (rejects malformed inputs before they hit R).

Why a proxy at all (vs. exposing the R container directly):
    - The R plumber container has no auth of its own — exposing it
      means anyone on the network can call it. Wrapping it behind
      this FastAPI router lets us reuse the X-API-Key infrastructure.
    - We can cache responses transparently: same sentence + same model
      hits Redis on the second call (5 ms instead of ~500 ms).
    - We get a consistent response shape across all five models even
      though the underlying R endpoints return slightly different
      payloads.

Endpoint groups:
    /health             : NLP container reachability + per-model status
    /predict            : single sentence vs. one model (cp by default)
    /predict/batch      : many sentences in one round-trip
    /predict/by-class   : single sentence vs. one specific model class
    /predict/all        : single sentence vs. all five models
    /models             : list available model IDs

Related modules:
    nlp_classifier_client.py : actual HTTP client + connection pool
    redis_client.py          : cache backend
"""

import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import get_current_user
from auth.base import AuthUser
from nlp_classifier_client import (
    ALL_MODELS,
    CLASS_TO_MODEL,
    NLPServiceError,
    nlp_health_check,
    predict_all_models,
    predict_batch,
    predict_single,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────────────
# tags="NLP Classifier" controls the section header in the auto-generated
# /docs UI. prefix means every endpoint below is mounted under /api/nlp.
router = APIRouter(prefix="/api/nlp", tags=["NLP Classifier"])


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models — Request
# ──────────────────────────────────────────────────────────────────────────────
# All request models use Field(...) constraints so FastAPI rejects bad
# input with a 422 BEFORE the handler runs, sparing the NLP container
# from useless calls and giving the client a clear error message.

class NLPPredictRequest(BaseModel):
    """Single-sentence prediction request body."""

    # 5000 chars is well above any realistic clinical sentence — set as
    # a defence against accidental gigantic payloads that would chew up
    # the NLP container's memory.
    text: str = Field(..., min_length=1, max_length=5000, description="Sentence to classify")
    model: str = Field(..., description="NLP model endpoint (cp, le, ed, inc, ius)")


class NLPBatchRequest(BaseModel):
    """Batch prediction request body."""

    # max_items=50 caps per-request work so one bad caller cannot tie
    # up all NLP container workers with a 10000-sentence batch.
    texts: List[str] = Field(..., min_items=1, max_items=50, description="Sentences to classify")
    model: str = Field(..., description="NLP model endpoint")


class NLPByClassRequest(BaseModel):
    """Single-sentence prediction request using a class number (1-5).

    The frontend uses class numbers ("1", "2", ...) for human-friendly
    UI labels, while the NLP container uses model codes ("cp", "le",
    ...). This shape lets the frontend send either; the resolver runs
    inside the handler.
    """

    text: str = Field(..., min_length=1, max_length=5000)
    # `class` is a Python keyword, so the field name is `class_` and
    # `alias="class"` makes JSON callers send `"class"` as the key.
    class_: str = Field(..., alias="class", description="Class number 1-5")

    class Config:
        # Allow Pydantic to accept BOTH `class_` and `class` from JSON
        # bodies (backwards-compat for any caller still on the old key).
        populate_by_name = True


class NLPAllModelsRequest(BaseModel):
    """Single-sentence request for the "fan-out to all 5 models" endpoint."""

    text: str = Field(..., min_length=1, max_length=5000, description="Sentence to classify against all models")


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models — Response
# ──────────────────────────────────────────────────────────────────────────────
# Locking the response shape with Pydantic means the OpenAPI docs at
# /docs always match what the API actually returns — accidental shape
# changes break the response model, not just the docs.

class NLPPredictResponse(BaseModel):
    """One prediction payload (also used as the inner shape inside batches)."""

    text: str
    model: str
    pred_1: float   # P(class=1) = probability the sentence is on-topic
    pred_0: float   # P(class=0) = probability it is off-topic. pred_0 + pred_1 == 1.0
    cached: bool    # True when the result came from Redis instead of the NLP container


class NLPBatchResponse(BaseModel):
    """Batch prediction wrapper — count + list of per-sentence results."""

    model: str
    count: int
    predictions: List[NLPPredictResponse]


class NLPAllModelsResponse(BaseModel):
    """Fan-out result: predictions for every model + the highest-scoring topic."""

    text: str
    predictions: Dict[str, dict]  # model_code -> { pred_1, pred_0, cached }
    top_topic: str                # name of the model with the highest pred_1
    top_score: float              # the pred_1 value of that winning model


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _validate_model(model: str) -> str:
    """Validate and return the model name; raise 400 on invalid input.

    `ALL_MODELS` is the canonical set defined in nlp_classifier_client;
    keeping the source of truth there means adding a new model is a
    single-file change.
    """
    if model not in ALL_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model. Use /api/nlp/models to see available models.",
        )
    return model


def _class_to_model(class_: str) -> str:
    """Convert a class number to a model name; raise 400 on invalid input.

    Backs the /predict/by-class endpoint: callers that prefer class
    numbers (e.g. legacy frontend code) get translated to the canonical
    model code before hitting the proxy.
    """
    model = CLASS_TO_MODEL.get(class_)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid class. Use /api/nlp/models to see available classes.",
        )
    return model


async def _handle_nlp_error(exc: NLPServiceError):
    """Translate an NLP client error into a FastAPI HTTPException.

    The client-side exception carries its own status_code (502 for
    upstream connection failure, 504 for timeout, etc.); we surface it
    as-is rather than collapsing every NLP issue into a generic 500.
    """
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/health")
async def nlp_health():
    """Check if the NLP classifier service is reachable.

    Intentionally unauthenticated — this is one of the components
    /health (in routes_system.py) reads, and that endpoint already
    aggregates auth-free probes. The reachability check is cheap, so
    leaving it open does not create a DoS vector.
    """
    result = await nlp_health_check()
    if result["status"] == "unhealthy":
        # 503 Service Unavailable so monitoring tools alert on NLP
        # being down even when the rest of the backend is fine.
        raise HTTPException(status_code=503, detail=result["detail"])
    return result


@router.post("/predict", response_model=NLPPredictResponse)
async def predict(
    req: NLPPredictRequest,
    user: AuthUser = Depends(get_current_user),
):
    """Classify a single sentence with a specified model."""
    _validate_model(req.model)
    try:
        # predict_single handles caching internally — first call hits
        # the NLP container, subsequent identical calls hit Redis.
        result = await predict_single(req.text, req.model)
        return NLPPredictResponse(**result)
    except NLPServiceError as exc:
        await _handle_nlp_error(exc)


@router.post("/predict/batch", response_model=NLPBatchResponse)
async def predict_batch_endpoint(
    req: NLPBatchRequest,
    user: AuthUser = Depends(get_current_user),
):
    """Classify multiple sentences (max 50) with a specified model.

    Batching saves N-1 round-trips when the frontend has many sentences
    to score (typical for a transcript scrub). Per-sentence cache hits
    inside the batch are still effective.
    """
    _validate_model(req.model)
    try:
        results = await predict_batch(req.texts, req.model)
        return NLPBatchResponse(
            model=req.model,
            count=len(results),
            predictions=[NLPPredictResponse(**r) for r in results],
        )
    except NLPServiceError as exc:
        await _handle_nlp_error(exc)


@router.post("/predict/by-class", response_model=NLPPredictResponse)
async def predict_by_class(
    req: NLPByClassRequest,
    user: AuthUser = Depends(get_current_user),
):
    """Classify a sentence using a class number (1-5) instead of model name."""
    model = _class_to_model(req.class_)
    try:
        result = await predict_single(req.text, model)
        return NLPPredictResponse(**result)
    except NLPServiceError as exc:
        await _handle_nlp_error(exc)


@router.post("/predict/all", response_model=NLPAllModelsResponse)
async def predict_all(
    req: NLPAllModelsRequest,
    user: AuthUser = Depends(get_current_user),
):
    """Classify a single sentence against all 5 models concurrently.

    Used by features that need an "is this on-topic for ANY domain?"
    answer (e.g. the doctor-side topic chip). predict_all_models fans
    the request out across all 5 models in parallel via asyncio.gather,
    so latency is roughly the slowest single call instead of the sum.
    """
    try:
        result = await predict_all_models(req.text)
        return NLPAllModelsResponse(**result)
    except NLPServiceError as exc:
        await _handle_nlp_error(exc)


@router.get("/models")
async def list_models(
    user: AuthUser = Depends(get_current_user),
):
    """Return available NLP models and their class mappings.

    Used by the frontend to render the model picker — keeping this on
    the server means adding a model only requires a single deploy, not
    a coordinated frontend/backend release.
    """
    models = []
    # Human-friendly labels live HERE rather than in the NLP container
    # because they are presentation concerns, not classification concerns.
    model_labels = {
        "cp": "Cancer Prognosis",
        "le": "Life Expectancy",
        "ed": "Erectile Dysfunction",
        "inc": "Incontinence",
        "ius": "Irritative Urinary Symptoms",
    }
    for class_num, model_code in CLASS_TO_MODEL.items():
        models.append({
            "class": class_num,
            "model": model_code,
            "label": model_labels.get(model_code, model_code),
        })
    return {"models": models}
