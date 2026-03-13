"""Generate real NLP scores for doctor_sentence_view seed data.

Reads docter_interface_render.csv, sends each sentence to all 5 NLP
models (cp, le, ed, inc, ius), and assigns:
  - class = model with highest .pred_1
  - score = that model's .pred_1

Produces docter_interface_render_scored.csv ready for DB seeding.

Usage (run inside Backend Docker container):
  docker exec prostatecancer-backend python /app/fake_csv_files/generate_real_scores.py
"""

import csv
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

NLP_BASE_URL = "http://nlp-classifiers:8000"
MODELS = ["cp", "le", "ed", "inc", "ius"]
MODEL_TO_CLASS = {"cp": "1", "le": "2", "ed": "3", "inc": "4", "ius": "5"}
BATCH_SIZE = 50  # sentences per API call


def predict_batch(sentences: list[str], model: str) -> list[float]:
    """Send a batch of sentences to one NLP model, return .pred_1 scores."""
    url = f"{NLP_BASE_URL}/predict/{model}"
    payload = json.dumps([{"text": s} for s in sentences]).encode("utf-8")
    req = Request(url, data=payload, headers={"Content-Type": "application/json"})

    resp = urlopen(req, timeout=60)
    results = json.loads(resp.read().decode("utf-8"))
    return [r.get(".pred_1", r.get("pred_1", 0.0)) for r in results]


def main():
    base_dir = Path(__file__).parent
    input_path = base_dir / "docter_interface_render.csv"
    output_path = base_dir / "docter_interface_render_scored.csv"

    # Read input CSV
    with open(input_path, encoding="latin1") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total = len(rows)
    print(f"Loaded {total} sentences from {input_path.name}")

    # Extract all sentence texts
    sentences = [row["sentences"] for row in rows]

    # Score all sentences with each model
    all_scores: dict[str, list[float]] = {}

    for model in MODELS:
        print(f"  Scoring with model '{model}'...", end="", flush=True)
        model_scores = []

        for start in range(0, total, BATCH_SIZE):
            batch = sentences[start : start + BATCH_SIZE]
            try:
                scores = predict_batch(batch, model)
                model_scores.extend(scores)
            except (URLError, Exception) as e:
                print(f"\n  ERROR at batch {start}: {e}")
                # Fill with 0.0 for failed batch
                model_scores.extend([0.0] * len(batch))

            # Progress indicator
            done = min(start + BATCH_SIZE, total)
            print(f"\r  Scoring with model '{model}'... {done}/{total}", end="", flush=True)

        all_scores[model] = model_scores
        print(f" -> done ({len(model_scores)} scores)")

    # Assign class and score based on highest .pred_1
    start_time = datetime(2025, 1, 1, 9, 0, 0)

    output_rows = []
    class_counts = {c: 0 for c in MODEL_TO_CLASS.values()}
    score_sum = 0.0
    scored_count = 0

    for idx, row in enumerate(rows):
        # Find model with highest score for this sentence
        best_model = None
        best_score = -1.0

        for model in MODELS:
            s = all_scores[model][idx]
            if s > best_score:
                best_score = s
                best_model = model

        # Assign class and score
        assigned_class = MODEL_TO_CLASS[best_model]
        assigned_score = round(best_score, 6)

        # Time: sequential 1-minute intervals
        t = start_time + timedelta(minutes=idx)

        output_rows.append({
            "file": row["file"],
            "i": row["i"],
            "i2": row["i2"],
            "speaker": row["speaker"],
            "sentences": row["sentences"],
            "score": assigned_score,
            "class": assigned_class,
            "time": t.strftime("%Y-%m-%d %H:%M:%S"),
        })

        class_counts[assigned_class] += 1
        score_sum += assigned_score
        scored_count += 1

    # Write output CSV
    fieldnames = ["file", "i", "i2", "speaker", "sentences", "score", "class", "time"]
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    # Summary
    avg_score = score_sum / scored_count if scored_count > 0 else 0
    print(f"\nOutput written to: {output_path.name}")
    print(f"Total sentences: {total}")
    print(f"Average score: {avg_score:.4f}")
    print(f"Class distribution: {class_counts}")

    # Show sample high scores
    sorted_rows = sorted(output_rows, key=lambda r: r["score"], reverse=True)
    print(f"\nTop 5 highest scored sentences:")
    for r in sorted_rows[:5]:
        print(f"  score={r['score']:.4f} class={r['class']} | {r['sentences'][:80]}...")


if __name__ == "__main__":
    main()
