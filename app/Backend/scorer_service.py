"""Consultation Quality Scorer client — calls Step 8 Docker service.

Sends sentences to the consultation-scorer container and receives
0-5 integer consultation quality scores.
"""

import logging
import os
from typing import Dict, List

import httpx

logger = logging.getLogger(__name__)

SCORER_API_URL = os.getenv("SCORER_API_URL", "http://consultation-scorer:8001")
SCORER_TIMEOUT = int(os.getenv("SCORER_TIMEOUT", "30"))


async def score_sentence(text: str, domain: str = "") -> int:
    """Score a single sentence. Returns 0-5 integer."""
    async with httpx.AsyncClient(timeout=SCORER_TIMEOUT) as client:
        resp = await client.post(
            f"{SCORER_API_URL}/score",
            json={"text": text, "domain": domain},
        )
        resp.raise_for_status()
        return resp.json()["score"]


async def score_batch(sentences: List[Dict[str, str]]) -> List[int]:
    """Score multiple sentences. Each dict has 'text' and optional 'domain'.
    Returns list of 0-5 integers in same order.
    """
    async with httpx.AsyncClient(timeout=SCORER_TIMEOUT) as client:
        resp = await client.post(
            f"{SCORER_API_URL}/score/batch",
            json={"sentences": sentences},
        )
        resp.raise_for_status()
        return [s["score"] for s in resp.json()["scores"]]


async def scorer_health() -> bool:
    """Check if scorer service is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{SCORER_API_URL}/ping")
            return resp.status_code == 200
    except Exception:
        return False
