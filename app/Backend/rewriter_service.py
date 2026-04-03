"""Patient Summary Rewriter client — calls Step 9 Docker service.

Sends top-K sentences per domain to the patient-summary-rewriter container
and receives patient-friendly summary text.
"""

import logging
from typing import Dict, List

import httpx
import config

logger = logging.getLogger(__name__)

REWRITER_API_URL = config.get("scoring.rewriter_url", "http://patient-summary-rewriter:8002")
REWRITER_TIMEOUT = int(config.get("scoring.rewriter_timeout", 30))


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


async def run_rewriting(final_results, summary_top_k, outcome_to_sheet, domain_short_map):
    """Step 9 pipeline entry — build rewrite input from final_results, call rewrite_batch.

    Returns dict mapping domain_short → summary text.
    """
    logger.info("  Step 9: Generating patient summaries...")
    domains_for_rewrite = []
    for outcome in outcome_to_sheet.keys():
        if outcome in final_results:
            top_sentences = final_results[outcome]["text"].head(summary_top_k).tolist()
            if top_sentences:
                domains_for_rewrite.append({
                    "sentences": top_sentences,
                    "domain": domain_short_map.get(outcome, ""),
                })

    summaries = await rewrite_batch(domains_for_rewrite) if domains_for_rewrite else {}
    logger.info("  Step 9: %d domain summaries generated", len(summaries))
    return summaries


async def rewriter_health() -> bool:
    """Check if rewriter service is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{REWRITER_API_URL}/ping")
            return resp.status_code == 200
    except Exception:
        return False
