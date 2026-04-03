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


async def run_scoring(df_sentences, final_results, doctor_speaker, domain_short_map):
    """Step 8 pipeline entry — build scorer input from final_results, call score_batch.

    Returns (scorer_keys, scores) where:
      scorer_keys = [(i, i2, domain_full, text, speaker), ...]
      scores = [int, ...] matching scorer_keys order
    """
    logger.info("  Step 8: Scoring sentences (0-5)...")

    # For each (i, i2), pick the domain with highest pred_score
    sentence_domain_map = {}
    for outcome, top_df in final_results.items():
        for _, row in top_df.iterrows():
            key = (int(row["i"]), int(row["i2"]))
            pred = float(row[".pred_1"])
            if key not in sentence_domain_map or pred > sentence_domain_map[key][1]:
                sentence_domain_map[key] = (outcome, pred)

    scorer_input = []
    scorer_keys = []
    for (i, i2), (domain_full, _) in sentence_domain_map.items():
        text_row = df_sentences[(df_sentences["i"] == i) & (df_sentences["i2"] == i2)]
        if len(text_row) > 0:
            text = text_row.iloc[0]["text"]
            scorer_input.append({"text": text, "domain": domain_short_map.get(domain_full, "")})
            scorer_keys.append((i, i2, domain_full, text, doctor_speaker))

    scores = await score_batch(scorer_input)
    logger.info("  Step 8: %d sentences scored", len(scores))
    return scorer_keys, scores


async def scorer_health() -> bool:
    """Check if scorer service is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{SCORER_API_URL}/ping")
            return resp.status_code == 200
    except Exception:
        return False
