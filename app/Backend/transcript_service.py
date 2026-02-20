"""
Transcript Analysis Pipeline Service.

Python implementation of Guillermo's R script (``process-data-guille.R``).
This module reproduces the full transcript-processing pipeline that converts
a raw consultation transcript (xlsx with *speaker* and *text* columns) into
per-topic scored sentence sheets suitable for the Doctor Interface.

Pipeline stages
---------------
Step 1 — **Read transcript**
    Parse the uploaded xlsx, extract the patient ID from the filename
    (``processed_transcripts_<patient_id>.xlsx``), and add a 1-based row index.
Step 2 — **Filter interviewer utterances**
    Keep only rows whose *speaker* matches a known physician/interviewer ID
    (e.g. ``INTERVIEWER``, ``Q``, ``Q1``).
Step 3 — **Split into sentences**
    Tokenize each utterance into individual sentences using regex-based
    splitting (mirrors R ``tidytext::unnest_tokens('sentences')``).
Step 4 — **NLP prediction** *(delegated to nlp_service.py)*
    Send every sentence to the five NLP classification models hosted in
    Michael's ``r01-nlp-classifiers`` Docker container. Each model returns
    a probability score (``.pred_1``) indicating how relevant the sentence
    is to its clinical topic.
Step 5 — **Select top-N sentences**
    For each model, rank sentences by ``.pred_1`` descending and keep the
    top *N* (with tie inclusion, matching R ``slice_max``). When *N = 0*
    all sentences are kept (sorted by score).
Step 6 — **Generate context**
    For each selected sentence, extract a window of ±*context_window*
    surrounding sentences, wrapping the target in ``<main>`` tags.
Step 7 — **Export to xlsx**
    Write five sheets (``cp``, ``inc``, ``ed``, ``ius``, ``le``) into an
    in-memory xlsx workbook and return the bytes.

Input / Output
--------------
* **Input**: raw xlsx bytes + original filename.
* **Output**: a dict containing ``patient_id``, ``total_sentences``,
  ``models`` (JSON-serializable per-model results), and ``xlsx_bytes``.

Dependencies
------------
* ``nlp_service.predict_batch`` — batch HTTP calls to the NLP Docker service.
* ``pandas``, ``openpyxl`` — Excel I/O and data manipulation.
"""

import logging
import re
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from nlp_service import ALL_MODELS, predict_batch

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

PHYSICIAN_IDS = [
    "INTERVIEWER",
    "INTERVIEWER 1",
    "INTERVIEWER 2",
    "Interviewer",
    "Q",
    "Q1",
    "Q2",
    "Q:",
]

# R script outcome names → sheet abbreviations
# (matches process-data-guille.R lines 151-169)
OUTCOME_TO_SHEET = {
    "cancer_prognosis": "cp",
    "continence": "inc",
    "erectile_dysfunction_potency": "ed",
    "irritative_urinary_symptoms_frequency_urgency_nocturnia": "ius",
    "life_expectancy": "le",
}

# Model endpoint → full outcome name
MODEL_TO_OUTCOME = {
    "cp": "cancer_prognosis",
    "le": "life_expectancy",
    "ed": "erectile_dysfunction_potency",
    "inc": "continence",
    "ius": "irritative_urinary_symptoms_frequency_urgency_nocturnia",
}

BATCH_SIZE = 50  # nlp_service.predict_batch() max

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: Read transcript xlsx
# ──────────────────────────────────────────────────────────────────────────────

def read_transcript(file_bytes: bytes, filename: str) -> Tuple[pd.DataFrame, str]:
    """Read an xlsx file and extract patient ID from filename.

    Args:
        file_bytes: Raw xlsx file content.
        filename: Original filename (e.g. "processed_transcripts_sid-01.xlsx").

    Returns:
        Tuple of (DataFrame with columns [speaker, text], patient_id string).
    """
    df = pd.read_excel(BytesIO(file_bytes), engine="openpyxl")

    # Validate required columns
    required = {"speaker", "text"}
    if not required.issubset(df.columns):
        raise ValueError(
            f"xlsx must have columns {required}, got {set(df.columns)}"
        )

    # Extract patient ID: "processed_transcripts_sid-01.xlsx" → "sid-01"
    patient_id = re.sub(r"^processed_transcripts_", "", Path(filename).stem)

    # Add 1-based row index (matches R line 28: mutate(index = row_number()))
    df = df[["speaker", "text"]].copy()
    df.insert(0, "index", range(1, len(df) + 1))

    logger.info("Step 1: Read %d rows, patient_id=%s", len(df), patient_id)
    return df, patient_id


# ──────────────────────────────────────────────────────────────────────────────
# Step 2: Filter interviewer utterances
# ──────────────────────────────────────────────────────────────────────────────

def filter_interviewer(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only interviewer/physician rows and re-index.

    Matches process-data-guille.R lines 32-47.
    """
    filtered = df[df["speaker"].isin(PHYSICIAN_IDS)].copy()
    filtered["index"] = range(1, len(filtered) + 1)
    filtered = filtered.reset_index(drop=True)

    logger.info("Step 2: Filtered to %d interviewer rows", len(filtered))
    return filtered


# ──────────────────────────────────────────────────────────────────────────────
# Step 3: Split into sentences
# ──────────────────────────────────────────────────────────────────────────────

def _sent_tokenize(text: str) -> List[str]:
    """Split text into sentences using regex.

    Splits on sentence-ending punctuation (.!?) followed by whitespace,
    similar to R's tidytext::unnest_tokens('sentences').
    """
    # Split on .!? followed by space (or end of string), keeping abbreviations intact
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def split_sentences(df: pd.DataFrame) -> pd.DataFrame:
    """Split each utterance into individual sentences.

    Matches process-data-guille.R lines 49-66:
    - unnest_tokens('text', text, 'sentences')
    - i = original utterance number
    - i2 = sentence number within utterance
    - index = global sentence sequence number
    """
    rows: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        text = str(row["text"]).strip()
        if not text:
            continue

        sentences = _sent_tokenize(text)
        utterance_idx = int(row["index"])

        for sent_num, sentence in enumerate(sentences, start=1):
            sentence = sentence.strip().lower()  # R unnest_tokens: to_lower=TRUE
            if sentence:
                rows.append({
                    "i": utterance_idx,
                    "i2": sent_num,
                    "speaker": row["speaker"],
                    "text": sentence,
                })

    result = pd.DataFrame(rows)
    result.insert(0, "index", range(1, len(result) + 1))

    logger.info("Step 3: Split into %d sentences", len(result))
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Step 4: NLP prediction (uses existing nlp_service.py → Docker container)
# ──────────────────────────────────────────────────────────────────────────────

async def run_predictions(df: pd.DataFrame) -> pd.DataFrame:
    """Run all 5 NLP models on each sentence via r01-nlp-classifiers Docker.

    Calls nlp_service.predict_batch() in chunks of BATCH_SIZE.
    Returns the original DataFrame with 5 new columns (one per model).
    """
    texts = df["text"].tolist()
    total = len(texts)

    for model in ALL_MODELS:
        outcome = MODEL_TO_OUTCOME[model]
        all_preds: List[float] = []

        # Chunk into batches of BATCH_SIZE
        for start in range(0, total, BATCH_SIZE):
            chunk = texts[start : start + BATCH_SIZE]
            results = await predict_batch(chunk, model)
            all_preds.extend(r["pred_1"] for r in results)

        df[outcome] = all_preds
        logger.info("Step 4: Model %s (%s) — %d predictions", model, outcome, total)

    return df


# ──────────────────────────────────────────────────────────────────────────────
# Step 5: Select top N sentences per model
# ──────────────────────────────────────────────────────────────────────────────

def select_top_n(
    df: pd.DataFrame, n: int = 0
) -> Dict[str, pd.DataFrame]:
    """Select top N sentences by pred_1 for each model.

    Args:
        df: DataFrame with prediction columns.
        n: Number of top sentences per model. 0 = all sentences (sorted by score).

    Returns dict mapping outcome name to DataFrame of sentences sorted by score.
    """
    outcome_cols = list(MODEL_TO_OUTCOME.values())
    base_cols = ["index", "i", "i2", "speaker", "text"]

    top_by_model: Dict[str, pd.DataFrame] = {}

    for outcome in outcome_cols:
        subset = df[base_cols + [outcome]].copy()
        subset = subset.rename(columns={outcome: ".pred_1"})
        subset = subset.sort_values(".pred_1", ascending=False)
        if n > 0:
            # Match R slice_max: include ties at the nth position
            threshold = subset[".pred_1"].iloc[n - 1] if len(subset) >= n else None
            if threshold is not None:
                subset = subset[subset[".pred_1"] >= threshold]
        top_by_model[outcome] = subset.reset_index(drop=True)

    count = n if n > 0 else len(df)
    logger.info("Step 5: Selected %d sentences per model", count)
    return top_by_model


# ──────────────────────────────────────────────────────────────────────────────
# Step 6: Generate context (±window sentences with <main> tag)
# ──────────────────────────────────────────────────────────────────────────────

def generate_context(
    full_df: pd.DataFrame,
    top_df: pd.DataFrame,
    window: int = 3,
) -> List[str]:
    """Generate context strings for each top sentence.

    Matches process-data-guille.R lines 119-136:
    - For each top sentence at index x, take sentences from (x-window) to (x+window)
    - Wrap the target sentence in <main>...</main> tags
    - Join with "."
    """
    contexts: List[str] = []

    for _, top_row in top_df.iterrows():
        target_idx = int(top_row["index"])
        low = target_idx - window
        high = target_idx + window

        # Get surrounding sentences
        neighborhood = full_df[
            (full_df["index"] >= low) & (full_df["index"] <= high)
        ].copy()

        # Wrap target sentence with <main> tag
        parts: List[str] = []
        for _, row in neighborhood.iterrows():
            if int(row["index"]) == target_idx:
                parts.append(f"<main>{row['text']}</main>")
            else:
                parts.append(str(row["text"]))

        contexts.append(".".join(parts))

    logger.info("Step 6: Generated %d context strings", len(contexts))
    return contexts


# ──────────────────────────────────────────────────────────────────────────────
# Step 7: Export to xlsx with 5 sheets
# ──────────────────────────────────────────────────────────────────────────────

def export_to_xlsx(
    results: Dict[str, pd.DataFrame],
    patient_id: str,
) -> bytes:
    """Export results to xlsx with 5 sheets (cp, inc, ed, ius, le).

    Matches process-data-guille.R lines 151-175.
    Returns xlsx file as bytes.
    """
    output = BytesIO()

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for outcome, sheet_name in OUTCOME_TO_SHEET.items():
            if outcome in results:
                df = results[outcome].copy()
                df.insert(0, "name", patient_id)
                df.to_excel(writer, sheet_name=sheet_name, index=False)

    logger.info("Step 7: Exported xlsx with %d sheets", len(results))
    return output.getvalue()


# ──────────────────────────────────────────────────────────────────────────────
# Orchestrator: Full pipeline (Step 1 → 7)
# ──────────────────────────────────────────────────────────────────────────────

async def analyze_transcript(
    file_bytes: bytes,
    filename: str,
    top_n: int = 0,
    context_window: int = 3,
) -> Dict[str, Any]:
    """Run the full transcript analysis pipeline.

    Steps:
        1. Read xlsx
        2. Filter interviewer utterances
        3. Split into sentences
        4. Run 5 NLP models (via r01-nlp-classifiers Docker)
        5. Select top N per model
        6. Generate context
        7. Export to xlsx

    Returns dict with patient_id, total_sentences, per-model results, and xlsx bytes.
    """
    # Step 1
    df_raw, patient_id = read_transcript(file_bytes, filename)

    # Step 2
    df_filtered = filter_interviewer(df_raw)

    # Step 3
    df_sentences = split_sentences(df_filtered)

    # Step 4
    df_predicted = await run_predictions(df_sentences)

    # Step 5
    top_by_model = select_top_n(df_predicted, n=top_n)

    # Step 6 + assemble final results
    final_results: Dict[str, pd.DataFrame] = {}
    response_models: Dict[str, List[Dict[str, Any]]] = {}

    for outcome, top_df in top_by_model.items():
        # Generate context for this model's top sentences
        contexts = generate_context(df_sentences, top_df, window=context_window)
        top_df = top_df.copy()
        top_df["context"] = contexts
        final_results[outcome] = top_df

        # Build JSON response
        sheet = OUTCOME_TO_SHEET[outcome]
        response_models[sheet] = [
            {
                "index": int(row["index"]),
                "i": int(row["i"]),
                "i2": int(row["i2"]),
                "speaker": row["speaker"],
                "text": row["text"],
                "pred_1": round(float(row[".pred_1"]), 6),
                "context": row["context"],
            }
            for _, row in top_df.iterrows()
        ]

    # Step 7
    xlsx_bytes = export_to_xlsx(final_results, patient_id)

    return {
        "patient_id": patient_id,
        "total_sentences": len(df_sentences),
        "models": response_models,
        "xlsx_bytes": xlsx_bytes,
    }
