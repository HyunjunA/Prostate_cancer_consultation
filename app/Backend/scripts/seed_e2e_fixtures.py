"""
Seed minimal E2E test fixtures into the production DB.
Creates fake (non-PHI) patient data clearly labelled as E2E test records.

Usage:
  python seed_e2e_fixtures.py           # insert fixtures
  python seed_e2e_fixtures.py --delete  # remove fixtures
"""
import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://prostatecancer_user:secure_password_123"
    "@localhost:5432/prostatecancer_db_native",
)

# Strip async driver prefix if present
DB_URL = DATABASE_URL.replace("+asyncpg", "+psycopg2")

# ── Fixture definitions ───────────────────────────────────────────────────────
# One patient per E2E test section so tests don't pollute each other's
# survey-submission state. All prefixed E2E_ for easy identification/cleanup.
def _domain_data():
    return [
        {"domain": "cp",  "ai_score": 2, "reformat_sentence": "Cancer prognosis: low metastasis risk.", "extracted_estimate": "extremely low", "score_explanation": "CP communicated."},
        {"domain": "le",  "ai_score": 0, "reformat_sentence": "Life expectancy not discussed.", "extracted_estimate": None, "score_explanation": "Not discussed."},
        {"domain": "ed",  "ai_score": 2, "reformat_sentence": "Erectile dysfunction is a potential risk.", "extracted_estimate": "real risk", "score_explanation": "ED communicated."},
        {"domain": "inc", "ai_score": 1, "reformat_sentence": "Urinary incontinence is a potential risk.", "extracted_estimate": None, "score_explanation": "INC mentioned."},
        {"domain": "ius", "ai_score": 1, "reformat_sentence": "Irritative urinary symptoms are a potential risk.", "extracted_estimate": None, "score_explanation": "IUS mentioned."},
    ]

def _sentence_data():
    return [
        {"model": "cp",  "sentence_text": "The cancer is unlikely to metastasize.", "pred_score": 0.92},
        {"model": "ed",  "sentence_text": "Erectile dysfunction is a real risk after radiation.", "pred_score": 0.88},
        {"model": "inc", "sentence_text": "Urinary incontinence is a potential downside.", "pred_score": 0.75},
        {"model": "ius", "sentence_text": "Frequency and urgency may occur as side effects.", "pred_score": 0.71},
        {"model": "le",  "sentence_text": "Life expectancy was not discussed.", "pred_score": 0.55},
    ]

FIXTURES = [
    # Patient A — used for SDM E2E test
    {
        "file":       "E2E_TEST_FILE_PATIENT_A_DOC1_01012026.csv",
        "patient_id": "E2EPATIENT_A",
        "doctor_id":  "E2EDOC1",
        "speaker":    "Patient_E2E_TEST_FILE_PATIENT_A_DOC1_01012026",
        "domains":    _domain_data(),
        "sentences":  _sentence_data(),
    },
    # Patient B — used for DCS E2E test
    {
        "file":       "E2E_TEST_FILE_PATIENT_B_DOC1_01012026.csv",
        "patient_id": "E2EPATIENT_B",
        "doctor_id":  "E2EDOC1",
        "speaker":    "Patient_E2E_TEST_FILE_PATIENT_B_DOC1_01012026",
        "domains":    _domain_data(),
        "sentences":  _sentence_data(),
    },
    # Patient C — used for Risk Perception E2E test
    {
        "file":       "E2E_TEST_FILE_PATIENT_C_DOC1_01012026.csv",
        "patient_id": "E2EPATIENT_C",
        "doctor_id":  "E2EDOC1",
        "speaker":    "Patient_E2E_TEST_FILE_PATIENT_C_DOC1_01012026",
        "domains":    _domain_data(),
        "sentences":  _sentence_data(),
    },
    # Patient D — used for Satisfaction E2E test
    {
        "file":       "E2E_TEST_FILE_PATIENT_D_DOC1_01012026.csv",
        "patient_id": "E2EPATIENT_D",
        "doctor_id":  "E2EDOC1",
        "speaker":    "Patient_E2E_TEST_FILE_PATIENT_D_DOC1_01012026",
        "domains":    _domain_data(),
        "sentences":  _sentence_data(),
    },
    # Patient E — used for complete-flow E2E test (all 4 surveys in sequence)
    {
        "file":       "E2E_TEST_FILE_PATIENT_E_DOC1_01012026.csv",
        "patient_id": "E2EPATIENT_E",
        "doctor_id":  "E2EDOC1",
        "speaker":    "Patient_E2E_TEST_FILE_PATIENT_E_DOC1_01012026",
        "domains":    _domain_data(),
        "sentences":  _sentence_data(),
    },
]


def seed(engine):
    with engine.begin() as conn:
        for fix in FIXTURES:
            file = fix["file"]
            speaker = fix["speaker"]

            # patient_summary
            conn.execute(text(
                "INSERT INTO patient_summary (file, speaker) VALUES (:f, :s) "
                "ON CONFLICT DO NOTHING"
            ), {"f": file, "s": speaker})

            # transcript_analysis_log
            row = conn.execute(text(
                "INSERT INTO transcript_analysis_log "
                "(patient_id, doctor_id, source_filename, total_sentences, top_n, "
                " processed, processed_at, ai_overall_score) "
                "VALUES (:pid, :did, :fn, 20, 5, TRUE, NOW(), 1.2) "
                "ON CONFLICT DO NOTHING "
                "RETURNING id"
            ), {"pid": fix["patient_id"], "did": fix["doctor_id"], "fn": file})
            result = row.fetchone()
            if result is None:
                # already seeded — fetch existing id
                result = conn.execute(text(
                    "SELECT id FROM transcript_analysis_log WHERE source_filename=:fn"
                ), {"fn": file}).fetchone()
            analysis_id = result[0]

            # llm_domain_scoring_and_summary
            for d in fix["domains"]:
                conn.execute(text(
                    "INSERT INTO llm_domain_scoring_and_summary "
                    "(analysis_id, patient_id, domain, ai_score, score_explanation, "
                    " extracted_estimate, reformat_sentence, source_filename) "
                    "VALUES (:aid, :pid, :dom, :score, :exp, :est, :ref, :fn) "
                    "ON CONFLICT DO NOTHING"
                ), {
                    "aid": analysis_id,
                    "pid": fix["patient_id"],
                    "dom": d["domain"],
                    "score": d["ai_score"],
                    "exp": d["score_explanation"],
                    "est": d["extracted_estimate"],
                    "ref": d["reformat_sentence"],
                    "fn": file,
                })

            # sentence_prediction
            for i, sent in enumerate(fix["sentences"]):
                conn.execute(text(
                    "INSERT INTO sentence_prediction "
                    "(analysis_id, patient_id, model, sentence_index, utterance_index, "
                    " sentence_in_utterance, speaker, sentence_text, pred_score) "
                    "VALUES (:aid, :pid, :model, :sidx, :uidx, :sinutt, :spk, :txt, :score) "
                    "ON CONFLICT DO NOTHING"
                ), {
                    "aid": analysis_id,
                    "pid": fix["patient_id"],
                    "model": sent["model"],
                    "sidx": i,
                    "uidx": i,
                    "sinutt": 0,
                    "spk": "Interviewer:",
                    "txt": sent["sentence_text"],
                    "score": sent["pred_score"],
                })

            print(f"  ✅ Seeded: {file}")

    print("E2E fixtures seeded successfully.")


def delete(engine):
    with engine.begin() as conn:
        for fix in FIXTURES:
            file = fix["file"]
            pid = fix["patient_id"]

            # Delete in FK order
            aid_row = conn.execute(text(
                "SELECT id FROM transcript_analysis_log WHERE source_filename=:fn"
            ), {"fn": file}).fetchone()
            if aid_row:
                aid = aid_row[0]
                conn.execute(text("DELETE FROM sentence_prediction WHERE analysis_id=:aid"), {"aid": aid})
                conn.execute(text("DELETE FROM llm_domain_scoring_and_summary WHERE analysis_id=:aid"), {"aid": aid})
                conn.execute(text("DELETE FROM llm_pipeline_intermediate WHERE analysis_id=:aid"), {"aid": aid})
                conn.execute(text("DELETE FROM nlp_pipeline_intermediate WHERE analysis_id=:aid"), {"aid": aid})
                conn.execute(text("DELETE FROM nlp_all_predictions WHERE analysis_id=:aid"), {"aid": aid})
                conn.execute(text("DELETE FROM transcript_analysis_log WHERE id=:aid"), {"aid": aid})

            conn.execute(text(
                "DELETE FROM patient_survey_submission_log WHERE file=:f"
            ), {"f": file})
            conn.execute(text(
                "DELETE FROM patient_report_page_behavior WHERE file=:f"
            ), {"f": file})
            conn.execute(text(
                "DELETE FROM patient_followup_survey_page_behavior WHERE file=:f"
            ), {"f": file})
            conn.execute(text(
                "DELETE FROM patient_summary WHERE file=:f"
            ), {"f": file})

            print(f"  🗑️  Deleted: {file}")

    print("E2E fixtures removed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="Remove E2E fixtures")
    args = parser.parse_args()

    engine = create_engine(DB_URL)
    if args.delete:
        delete(engine)
    else:
        seed(engine)
