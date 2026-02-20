"""
NLP Classifier API routes.

Proxies requests from the frontend through the FastAPI backend to the
R plumber NLP service, adding caching, rate-limiting, and validation.
"""

import logging
import os
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from nlp_service import (
    ALL_MODELS,
    CLASS_TO_MODEL,
    MODEL_TO_CLASS,
    NLPServiceError,
    nlp_health_check,
    predict_all_models,
    predict_batch,
    predict_single,
)

load_dotenv()
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/nlp", tags=["NLP Classifier"])

# API Key verification (self-contained to avoid circular import with main.py)
_API_KEY = os.getenv("API_KEY", "default-dev-key")
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _verify_api_key(api_key: str = Depends(_api_key_header)):
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing API Key")
    if api_key != _API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API Key")
    return api_key


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models — Request
# ──────────────────────────────────────────────────────────────────────────────

class NLPPredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Sentence to classify")
    model: str = Field(..., description="NLP model endpoint (cp, le, ed, inc, ius)")


class NLPBatchRequest(BaseModel):
    texts: List[str] = Field(..., min_items=1, max_items=50, description="Sentences to classify")
    model: str = Field(..., description="NLP model endpoint")


class NLPByClassRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    class_: str = Field(..., alias="class", description="Class number 1-5")

    class Config:
        populate_by_name = True


class NLPAllModelsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Sentence to classify against all models")


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic models — Response
# ──────────────────────────────────────────────────────────────────────────────

class NLPPredictResponse(BaseModel):
    text: str
    model: str
    pred_1: float
    pred_0: float
    cached: bool


class NLPBatchResponse(BaseModel):
    model: str
    count: int
    predictions: List[NLPPredictResponse]


class NLPAllModelsResponse(BaseModel):
    text: str
    predictions: Dict[str, dict]
    top_topic: str
    top_score: float


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _validate_model(model: str) -> str:
    """Validate and return the model name; raise 400 on invalid input."""
    if model not in ALL_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model '{model}'. Valid models: {ALL_MODELS}",
        )
    return model


def _class_to_model(class_: str) -> str:
    """Convert a class number to a model name; raise 400 on invalid input."""
    model = CLASS_TO_MODEL.get(class_)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid class '{class_}'. Valid classes: {list(CLASS_TO_MODEL.keys())}",
        )
    return model


async def _handle_nlp_error(exc: NLPServiceError):
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/health")
async def nlp_health():
    """Check if the NLP classifier service is reachable."""
    result = await nlp_health_check()
    if result["status"] == "unhealthy":
        raise HTTPException(status_code=503, detail=result["detail"])
    return result


@router.post("/predict", response_model=NLPPredictResponse)
async def predict(
    req: NLPPredictRequest,
    api_key: str = Depends(_verify_api_key),
):
    """Classify a single sentence with a specified model."""
    _validate_model(req.model)
    try:
        result = await predict_single(req.text, req.model)
        return NLPPredictResponse(**result)
    except NLPServiceError as exc:
        await _handle_nlp_error(exc)


@router.post("/predict/batch", response_model=NLPBatchResponse)
async def predict_batch_endpoint(
    req: NLPBatchRequest,
    api_key: str = Depends(_verify_api_key),
):
    """Classify multiple sentences (max 50) with a specified model."""
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
    api_key: str = Depends(_verify_api_key),
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
    api_key: str = Depends(_verify_api_key),
):
    """Classify a single sentence against all 5 models concurrently."""
    try:
        result = await predict_all_models(req.text)
        return NLPAllModelsResponse(**result)
    except NLPServiceError as exc:
        await _handle_nlp_error(exc)


@router.get("/models")
async def list_models(
    api_key: str = Depends(_verify_api_key),
):
    """Return available NLP models and their class mappings."""
    models = []
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
