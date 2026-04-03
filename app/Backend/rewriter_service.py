"""Patient Summary Rewriter client — calls Step 9 Docker service.

Sends top-K sentences per domain to the patient-summary-rewriter container
and receives patient-friendly summary text.
"""

import logging
import os
from typing import Dict, List

import httpx

logger = logging.getLogger(__name__)

REWRITER_API_URL = os.getenv("REWRITER_API_URL", "http://patient-summary-rewriter:8002")
REWRITER_TIMEOUT = int(os.getenv("REWRITER_TIMEOUT", "30"))


async def rewrite_sentences(sentences: List[str], domain: str = "") -> str:
    """Rewrite sentences into a patient-friendly summary for one domain."""
    async with httpx.AsyncClient(timeout=REWRITER_TIMEOUT) as client:
        resp = await client.post(
            f"{REWRITER_API_URL}/rewrite",
            json={"sentences": sentences, "domain": domain},
        )
        resp.raise_for_status()
        return resp.json()["summary"]


async def rewrite_batch(domains: List[Dict]) -> Dict[str, str]:
    """Rewrite sentences for multiple domains.
    Each dict has 'sentences' (list of str) and 'domain' (str).
    Returns dict mapping domain → summary text.
    """
    async with httpx.AsyncClient(timeout=REWRITER_TIMEOUT) as client:
        resp = await client.post(
            f"{REWRITER_API_URL}/rewrite/batch",
            json={"domains": domains},
        )
        resp.raise_for_status()
        return {s["domain"]: s["summary"] for s in resp.json()["summaries"]}


async def rewriter_health() -> bool:
    """Check if rewriter service is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{REWRITER_API_URL}/ping")
            return resp.status_code == 200
    except Exception:
        return False
