"""Survey API routes — submissions + REDCap synchronisation.

This is the largest router file in the codebase (1700+ lines, 14
endpoints) because it owns BOTH directions of the REDCap integration:
    - Local DB ← submission (POST /submit, READ /submissions*).
    - Local DB → REDCap (push paths under /redcap/*).

Patients fill out structured questionnaires (baseline, follow-up, etc.)
in the web UI; this module persists each submission to PostgreSQL and,
when REDCAP_ENABLED is true (see redcap_config.py), also pushes the
record to the project's REDCap instance.

Two storage layers:
    1. patient_survey_submission_log  : ALL submissions (canonical answer
                                payload as JSONB). Append-only; this
                                is the source of truth.
    2. REDCap                  : remote project. Synced via the REST
                                API in redcap_config.py. Sync state
                                is tracked in patient_survey_submission_log
                                (redcap_synced / redcap_record_id /
                                redcap_error).

Endpoint groups (all under the router prefix /api/surveys):
    /submit                                : write a new survey response
    /submissions, /submissions/{id}        : list / fetch / delete responses
    /by-speaker/, /by-file/, /by-type/     : filtered lookups
    /stats                                 : aggregate counts
    /redcap/records, /redcap/records/{id}  : list / fetch / delete REDCap rows
    /redcap/records/{id}/import            : push one record back into REDCap
    /redcap/import                         : bulk import path
    /redcap/records/{id}/import-sample     : test fixture for the import flow

Why such a large file:
    REDCap is heavyweight: each push requires multiple round-trips
    (project info, longitudinal events, field validation), and each
    survey type has its own field-mapping table. The size reflects
    that complexity rather than poor structure — endpoint splits
    follow a clean pattern (one endpoint per HTTP verb + resource).

Authentication: every endpoint requires a valid auth header. REDCap
endpoints additionally short-circuit to a clear error when
REDCAP_ENABLED is false so the UI can hide the integration cleanly.

Related modules:
    models.py        : PatientSurveySubmissionLog
    redcap_config.py : REDCAP_API_URL / REDCAP_API_TOKEN / REDCAP_ENABLED
    routes_patient.py: also has POST /api/redcap/import (alternate path)
"""

from typing import Dict, Any, Optional
from datetime import datetime
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from dotenv import load_dotenv

from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_db
from deid import unhash_patient_sid, unhash_doctor_num
from redcap_mapping import resolve_record_id
from patient_lookup import resolve_patient_summary_file
from models import PatientSurveySubmissionLog

logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# ──────────────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────────────
router = APIRouter(
    prefix="/api/surveys",
    tags=["Surveys"],
    dependencies=[Depends(get_current_user)],
)


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────────────────────────────────────
class SurveySubmission(BaseModel):
    """Survey submission request model"""
    survey_type: str
    file: str
    speaker: str
    answers: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None


class SurveyResponse(BaseModel):
    """Survey response model"""
    id: int
    file: str
    speaker: str
    survey_type: str
    answers: Dict[str, Any]
    extra_data: Optional[Dict[str, Any]]
    submitted_at: str
    redcap_synced: bool
    redcap_record_id: Optional[str]


# ──────────────────────────────────────────────────────────────────────────────
# REDCap Configuration — single source in redcap_config.py
# ──────────────────────────────────────────────────────────────────────────────
from redcap_config import REDCAP_API_URL, REDCAP_API_TOKEN, REDCAP_ENABLED  # noqa: E402

INSTRUMENT_MAP = {
    "baseline": "baseline_information",
    "sdm": "shared_decision_making",
    "dcs": "decisional_conflict_scale",
    "risk_perception": "risk_perception",
    "risk_perception_2": "post_risk_perception_2",
    "satisfaction": "patient_satisfaction",
    "questions": "patient_questions"
}

# ══════════════════════════════════════════════════════════════════════════════
# NEW: Survey Complete Field Mapping
# ══════════════════════════════════════════════════════════════════════════════
# Maps survey_type to REDCap instrument complete field name
# Values: "0" = Incomplete (red), "1" = Unverified (yellow), "2" = Complete (green)
# ══════════════════════════════════════════════════════════════════════════════
SURVEY_COMPLETE_FIELDS = {
    "dcs": "decisional_conflict_survey_complete",
    "sdm": "shared_decision_making_sdm_complete",
    "risk_perception": "risk_perception_complete",
    "risk_perception_2": "post_risk_perception_2_complete",
    "satisfaction": "patient_satisfaction_complete",
}

# Surveys with FREE-TEXT fields must sync with overwriteBehavior='overwrite' so that
# clearing the text and re-submitting blanks it in REDCap ('normal' ignores empty
# values, leaving the old text). Radio/scale surveys keep 'normal' (they never send
# empty strings; unanswered fields are already dropped by exclude_none).
_OVERWRITE_SURVEYS = {"satisfaction"}


# ══════════════════════════════════════════════════════════════════════════════
# Field Mapping: Frontend → REDCap
# ══════════════════════════════════════════════════════════════════════════════
#
# This mapping converts frontend field keys to REDCap field names.
#
# ══════════════════════════════════════════════════════════════════════════════

FRONTEND_TO_REDCAP_MAPPING = {
    "dcs": {
        "q1": "dcs1_v2",
        "q2": "dcs2_v2",
        "q3": "dcs3_v2",
        "q4": "dcs4_v2",
        "q5": "dcs5_v2",
        "q6": "dcs6_v2",
        "q7": "dcs7_v2",
        "q8": "dcs8_v2",
        "q9": "dcs9_v2",
        "q10": "dcs10_v2",
        "q11": "dcs11_v2",
        "q12": "dcs12_v2",
        "q13": "dcs13_v2",
        "q14": "dcs14_v2",
        "q15": "dcs15_v2",
        "q16": "dcs16_v2",
    },
    "sdm": {
        "q1": "sdmp_options",
        "q2": "sdm_ptos",
        "q3": "sdm_cons",
        "q4": "sdm_pref",
    },
    "risk_perception": {
        "cancerRiskUntreated": "risk_percep_1_1",
        "cancerRiskTreated": "risk_percept2_2",
        "erectileDysfunctionRisk": "risk_percept_3_3",
        "urinaryIncontinenceRisk": "risk_percept_4_4",
        "irritativeUrinaryRisk": "risk_percep_5_5",
    },
    # Post Risk Perception 2 (instrument: post_risk_perception_2, 14 fields).
    # Frontend keys are identical to the REDCap field names (1:1 pass-through):
    # sliders carry a 0-100 integer, radios carry the REDCap choice code (1-N),
    # so no value transformation is needed (see transform_value).
    "risk_perception_2": {
        "cp_1_rp_v2": "cp_1_rp_v2",   # slider 0-100
        "cp_2_rp_v2": "cp_2_rp_v2",   # slider 0-100
        "cp_3_rp_v2": "cp_3_rp_v2",   # radio 1-6 (timeline)
        "le_1_rp_v2": "le_1_rp_v2",   # radio 1-5 (life expectancy range)
        "le_2_rp_v2": "le_2_rp_v2",   # radio 1-5 (most influential factor)
        "ed_1_rp_v2": "ed_1_rp_v2",   # slider 0-100
        "ed_2_rp_v2": "ed_2_rp_v2",   # radio 1-5 (timeline)
        "ed_3_rp_v2": "ed_3_rp_v2",   # radio 1-5 (most influential factor)
        "ui_1_rp_v2": "ui_1_rp_v2",   # slider 0-100
        "ui_2_rp_v2": "ui_2_rp_v2",   # radio 1-5 (timeline)
        "ui_3_rp_v2": "ui_3_rp_v2",   # radio 1-5 (most influential factor)
        "il_1_rp_v2": "il_1_rp_v2",   # slider 0-100
        "il_2_rp_v2": "il_2_rp_v2",   # radio 1-5 (timeline)
        "il_3_rp_v2": "il_3_rp_v2",   # radio 1-5 (most influential factor)
    },
    "satisfaction": {
        "feedbackText": "pt_satisfaction",
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# Value Transformation Maps
# ══════════════════════════════════════════════════════════════════════════════

# SDM Q2, Q3: text value → REDCap number
SDM_SCALE_MAP = {
    "a_lot": "1",
    "some": "2",
    "a_little": "3",
    "not_at_all": "4",
}

# Risk Perception Q2: Cancer risk if treated (5, 10, 20, 30, 40)
RISK_Q2_MAP = {
    "5": "1",
    "10": "2",
    "20": "3",
    "30": "4",
    "40": "5",
}

# Risk Perception Q3: Erectile dysfunction (10, 25, 50, 75, 90)
RISK_Q3_MAP = {
    "10": "1",
    "25": "2",
    "50": "3",
    "75": "4",
    "90": "5",
}

# Risk Perception Q4: Urinary incontinence (5, 10, 20, 30, 50)
RISK_Q4_MAP = {
    "5": "1",
    "10": "2",
    "20": "3",
    "30": "4",
    "50": "5",
}

# Risk Perception Q5: Irritative urinary symptoms (5, 10, 15, 20, 30)
RISK_Q5_MAP = {
    "5": "1",
    "10": "2",
    "15": "3",
    "20": "4",
    "30": "5",
}


# ══════════════════════════════════════════════════════════════════════════════
# Transform Function
# ══════════════════════════════════════════════════════════════════════════════

def transform_value(survey_type: str, field_key: str, value) -> str:
    """
    Transform frontend values to REDCap format

    Transformations:
    - SDM Q1, Q4: "yes"/"no" → "1"/"0"
    - SDM Q2, Q3: "a_lot"/"some"/"a_little"/"not_at_all" → "1"/"2"/"3"/"4"
    - DCS Q1-Q16: 0-4 → 1-5 (0-based to 1-based)
    - Risk Q1: slider 0-100 → category 1-5
    - Risk Q2-Q5: percentage string → category 1-5
    - Satisfaction: no transformation (free text)
    """

    original_value = value
    str_value = str(value) if value is not None else ""

    # ──────────────────────────────────────────────────────────────────────────
    # SDM Transformations
    # ──────────────────────────────────────────────────────────────────────────
    if survey_type == "sdm":
        # Q1, Q4: yes/no → 1/0
        if field_key in ["q1", "q4"]:
            if str_value.lower() == "yes":
                print(f"   [TRANSFORM] SDM yes/no: '{original_value}' → '1'")
                return "1"
            elif str_value.lower() == "no":
                print(f"   [TRANSFORM] SDM yes/no: '{original_value}' → '0'")
                return "0"
            return str_value

        # Q2, Q3: a_lot/some/a_little/not_at_all → 1/2/3/4
        if field_key in ["q2", "q3"]:
            if str_value.lower() in SDM_SCALE_MAP:
                transformed = SDM_SCALE_MAP[str_value.lower()]
                print(f"   [TRANSFORM] SDM scale: '{original_value}' → '{transformed}'")
                return transformed
            return str_value

    # ──────────────────────────────────────────────────────────────────────────
    # DCS Transformations (0-4 → 1-5)
    # ──────────────────────────────────────────────────────────────────────────
    if survey_type == "dcs":
        try:
            int_value = int(str_value)
            if 0 <= int_value <= 4:
                transformed = str(int_value + 1)
                print(f"   [TRANSFORM] DCS 0-based→1-based: '{original_value}' → '{transformed}'")
                return transformed
        except ValueError:
            pass

    # ──────────────────────────────────────────────────────────────────────────
    # Risk Perception Transformations
    # ──────────────────────────────────────────────────────────────────────────
    if survey_type == "risk_perception":




        # # Q2: Cancer risk if treated (5, 10, 20, 30, 40) → (1, 2, 3, 4, 5)
        # if field_key == "cancerRiskTreated":
        #     if str_value in RISK_Q2_MAP:
        #         transformed = RISK_Q2_MAP[str_value]
        #         print(f"   [TRANSFORM] Risk Q2: '{original_value}' → '{transformed}'")
        #         return transformed

        # # Q3: Erectile dysfunction (10, 25, 50, 75, 90) → (1, 2, 3, 4, 5)
        # if field_key == "erectileDysfunctionRisk":
        #     if str_value in RISK_Q3_MAP:
        #         transformed = RISK_Q3_MAP[str_value]
        #         print(f"   [TRANSFORM] Risk Q3: '{original_value}' → '{transformed}'")
        #         return transformed

        # Q4: Urinary incontinence (5, 10, 20, 30, 50) → (1, 2, 3, 4, 5)
        # if field_key == "urinaryIncontinenceRisk":
        #     if str_value in RISK_Q4_MAP:
        #         transformed = RISK_Q4_MAP[str_value]
        #         print(f"   [TRANSFORM] Risk Q4: '{original_value}' → '{transformed}'")
        #         return transformed

        # # Q5: Irritative urinary (5, 10, 15, 20, 30) → (1, 2, 3, 4, 5)
        # if field_key == "irritativeUrinaryRisk":
        #     if str_value in RISK_Q5_MAP:
        #         transformed = RISK_Q5_MAP[str_value]
        #         print(f"   [TRANSFORM] Risk Q5: '{original_value}' → '{transformed}'")
        #         return transformed

        print("[TRANSFORM] Risk Perception: No transformation applied")

    # ──────────────────────────────────────────────────────────────────────────
    # No transformation needed (satisfaction free text, etc.)
    # ──────────────────────────────────────────────────────────────────────────
    return str_value


# ══════════════════════════════════════════════════════════════════════════════
# Import to REDCap Function
# ══════════════════════════════════════════════════════════════════════════════

async def import_to_redcap(submission: SurveySubmission, timestamp: str) -> dict:
    """
    Import survey data to REDCap by converting frontend fields to REDCap fields

    Flow:
    1. Check if REDCap is enabled
    2. Get field mapping for survey type
    3. Transform each answer to REDCap format
    4. Add complete field for the instrument
    5. Create REDCapImportData object
    6. Call import_to_redcap_record() for actual API call
    """

    print("\n" + "=" * 70)
    print("[REDCAP IMPORT] Starting import_to_redcap()")
    print("=" * 70)
    print(f"[INPUT] survey_type: {submission.survey_type}")
    print(f"[INPUT] speaker (record_id): {submission.speaker}")
    print(f"[INPUT] file: {submission.file}")
    print(f"[INPUT] timestamp: {timestamp}")
    print(f"[INPUT] answers: {submission.answers}")
    print("-" * 70)

    if not REDCAP_ENABLED:
        print("[ERROR] [ERROR] REDCap is not enabled (missing API URL or TOKEN)")
        return {"success": False, "error": "REDCap not configured", "record_id": None}

    print("[CONFIG] [OK] REDCap is enabled")

    # Un-hash the composite speaker to its study SID, then resolve that SID to
    # REDCap's own auto-numbered record_id (production: the coordinator registered
    # the patient in REDCap and stored the SID in redcap_sid_field). If the SID is
    # not registered in REDCap yet, do NOT push — the caller records it as pending.
    sid = unhash_patient_sid(submission.speaker)
    record_id = await resolve_record_id(sid)
    if not record_id:
        return {"success": False, "record_id": None,
                "error": f"SID {sid or submission.speaker!r} not registered in REDCap"}
    survey_type = submission.survey_type

    # Step 1: Get field mapping
    print(f"\n[STEP 1] Getting field mapping for survey_type: '{survey_type}'")
    field_mapping = FRONTEND_TO_REDCAP_MAPPING.get(survey_type, {})

    if not field_mapping:
        print(f"[ERROR] [ERROR] No field mapping found for survey_type: {survey_type}")
        print(f"[INFO] Available survey types: {list(FRONTEND_TO_REDCAP_MAPPING.keys())}")
        return {"success": False, "error": f"No mapping for {survey_type}", "record_id": record_id}

    print(f"[STEP 1] [OK] Found mapping with {len(field_mapping)} fields")
    print(f"[MAPPING] {field_mapping}")

    # Step 2: Convert frontend answers to REDCap fields
    print("\n[STEP 2] Converting frontend answers to REDCap fields")
    print("-" * 70)

    redcap_fields = {}
    for frontend_key, value in submission.answers.items():
        redcap_field = field_mapping.get(frontend_key)
        if redcap_field:
            transformed_value = transform_value(survey_type, frontend_key, value)
            redcap_fields[redcap_field] = transformed_value
            print(f"[CONVERT] [OK] {frontend_key}: '{value}' → {redcap_field}: '{transformed_value}'")
        else:
            print(f"[CONVERT] [WARN]  No mapping for field: '{frontend_key}' (value: '{value}') - SKIPPED")

    # ══════════════════════════════════════════════════════════════════════════
    # NEW: Step 2.5 - Add complete field for this survey type
    # ══════════════════════════════════════════════════════════════════════════
    complete_field = SURVEY_COMPLETE_FIELDS.get(survey_type)
    if complete_field:
        redcap_fields[complete_field] = "2"  # 2 = Complete (green checkmark)
        print(f"[COMPLETE] [OK] Adding {complete_field} = '2' (Complete - Green)")
    else:
        print(f"[COMPLETE] [WARN]  No complete field mapping for survey_type: {survey_type}")

    print("-" * 70)
    print(f"[STEP 2] Converted {len(redcap_fields)}/{len(submission.answers)} fields (+ complete field)")

    if not redcap_fields:
        print("[ERROR] [ERROR] No valid fields to import after conversion")
        return {"success": False, "error": "No valid fields to import", "record_id": record_id}

    print("\n[STEP 3] Final REDCap fields to import:")
    for field, value in redcap_fields.items():
        print(f"   • {field}: '{value}'")

    # Step 4: Create REDCapImportData and call import_to_redcap_record
    print("\n[STEP 4] Creating REDCapImportData object...")
    try:
        import_data = REDCapImportData(**redcap_fields)
        print("[STEP 4] [OK] REDCapImportData created successfully")
        print(f"[DATA] {import_data.model_dump(exclude_none=True)}")

        print(f"\n[STEP 5] Calling import_to_redcap_record(record_id='{record_id}', import_data=...)")
        print("-" * 70)

        # Free-text surveys must use overwriteBehavior='overwrite' so that clearing
        # the text and re-submitting actually blanks it in REDCap ('normal' ignores
        # empty values). Radio/scale surveys keep 'normal' (they never send empty
        # strings; unanswered fields are already dropped by exclude_none).
        overwrite = "overwrite" if survey_type in _OVERWRITE_SURVEYS else "normal"
        result = await import_to_redcap_record(
            record_id, import_data, overwrite_behavior=overwrite
        )

        print("-" * 70)
        print("[STEP 5] import_to_redcap_record() returned")
        print(f"[RESULT] status: {result.get('status')}")

        success = result.get("status") == "success"

        if success:
            print("\n[FINAL] [OK] REDCap import SUCCESSFUL")
        else:
            print("\n[FINAL] [ERROR] REDCap import FAILED")
            print(f"[FINAL] Error: {result.get('error', 'Unknown error')}")

        print("=" * 70 + "\n")

        return {
            "success": success,
            "error": None if success else result.get("error"),
            "record_id": record_id,
            "fields_imported": len(redcap_fields)
        }

    except Exception as e:
        # CLAUDE.md forbids print() in production code; this used to dump
        # the exception via print() and lost the traceback. logger.error
        # with exc_info=True keeps the full stack and routes through the
        # configured log level instead of polluting stdout.
        logger.error(
            "REDCap survey import failed (record_id=%s): %s",
            record_id, e, exc_info=True,
        )
        return {"success": False, "error": str(e), "record_id": record_id}

# ══════════════════════════════════════════════════════════════════════════════
# POST - Submit Survey
# ══════════════════════════════════════════════════════════════════════════════
@router.post("/submit")
async def submit_survey(
    submission: SurveySubmission,
    db: AsyncSession = Depends(get_db)
):
    """
    Submit a survey response
    - Saves to PostgreSQL
    - Optionally syncs to REDCap
    """
    timestamp = datetime.now().isoformat()

    # Console log
    print("\n" + "=" * 80)
    print("[SURVEY] SUBMISSION RECEIVED")
    print("=" * 80)
    print(f"[TIME]    {timestamp}")
    print(f"[FILE]    {submission.file}")
    print(f"[SPEAKER] {submission.speaker}")
    print(f"[TYPE]    {submission.survey_type.upper()}")
    print("-" * 80)
    print("[ANSWERS]")
    print(json.dumps(submission.answers, indent=2, ensure_ascii=False))
    print("=" * 80 + "\n")

    # Resolve the patient_summary parent tolerantly so a file-extension/format drift
    # (frontend sends "<stem>.csv", pipeline may have stored "<stem>.xlsx") never
    # trips the FK. If the patient genuinely does not exist, return a clear 404
    # instead of a raw 500 "Failed to submit".
    parent_file = await resolve_patient_summary_file(db, submission.file, submission.speaker)
    if parent_file is None:
        raise HTTPException(status_code=404,
                            detail=f"No patient record for speaker '{submission.speaker}'")

    # Uniform extra_data shape across all survey types: always {partial: bool}.
    # A submission is "completed" (partial=false) unless the client explicitly
    # marked it a progress auto-save (metadata={"partial": true}). Any other
    # client metadata keys are preserved alongside.
    extra_meta = dict(submission.metadata or {})
    extra_meta.setdefault("partial", False)

    # Save to PostgreSQL. sid/doctor are the real-subject attribution recovered by
    # un-hashing the composite speaker (see deid.py).
    db_record = PatientSurveySubmissionLog(
        file=parent_file,
        speaker=submission.speaker,
        survey_type=submission.survey_type,
        answers=submission.answers,        # JSONB column — dict stored directly
        extra_data=extra_meta,             # JSONB — always {partial: bool} (+ any client meta)
        sid=unhash_patient_sid(submission.speaker),
        doctor=unhash_doctor_num(submission.speaker),
        redcap_synced=False
    )

    db.add(db_record)
    await db.commit()
    await db.refresh(db_record)

    print(f"[DB] Saved with ID: {db_record.id}")

    # REDCap sync (optional)
    redcap_result = None
    if REDCAP_ENABLED:
        redcap_result = await import_to_redcap(submission, timestamp)
        db_record.redcap_synced = redcap_result["success"]
        db_record.redcap_record_id = redcap_result["record_id"]
        db_record.redcap_error = redcap_result["error"]
        await db.commit()

    return {
        "status": "received",
        "survey_type": submission.survey_type,
        "file": submission.file,
        "speaker": submission.speaker,
        "answer_count": len(submission.answers),
        "received_at": timestamp,
        "db": {"id": db_record.id, "saved": True},
        "redcap": redcap_result if redcap_result else {"enabled": False}
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - List All Submissions (with filters & pagination)
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/submissions")
async def get_submissions(
    file: Optional[str] = Query(None, description="Filter by file"),
    speaker: Optional[str] = Query(None, description="Filter by speaker"),
    survey_type: Optional[str] = Query(None, description="Filter by survey type"),
    redcap_synced: Optional[bool] = Query(None, description="Filter by REDCap sync status"),
    status: Optional[str] = Query(None, description="REDCap sync status: synced | pending | error"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Page size"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all survey submissions with optional filters and pagination
    """
    # Build query
    query = select(PatientSurveySubmissionLog)
    count_query = select(func.count(PatientSurveySubmissionLog.id))

    # Apply filters
    filters = []
    if file:
        filters.append(PatientSurveySubmissionLog.file == file)
    if speaker:
        filters.append(PatientSurveySubmissionLog.speaker == speaker)
    if survey_type:
        filters.append(PatientSurveySubmissionLog.survey_type == survey_type)
    if redcap_synced is not None:
        filters.append(PatientSurveySubmissionLog.redcap_synced == redcap_synced)
    # Tri-state sync status (synced / errored / pending = neither).
    if status == "synced":
        filters.append(PatientSurveySubmissionLog.redcap_synced.is_(True))
    elif status == "error":
        filters.append(PatientSurveySubmissionLog.redcap_error.isnot(None))
    elif status == "pending":
        filters.append(PatientSurveySubmissionLog.redcap_synced.isnot(True))
        filters.append(PatientSurveySubmissionLog.redcap_error.is_(None))

    if filters:
        query = query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Apply pagination and ordering
    offset = (page - 1) * size
    query = query.order_by(desc(PatientSurveySubmissionLog.submitted_at)).offset(offset).limit(size)

    result = await db.execute(query)
    records = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size,
        "has_next": page * size < total,
        "has_prev": page > 1,
        "data": [
            {
                "id": r.id,
                "file": r.file,
                "speaker": r.speaker,
                "survey_type": r.survey_type,
                "answers": r.answers,            # JSONB — already a dict
                "extra_data": r.extra_data,      # JSONB — already a dict or None
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "sid": r.sid,
                "doctor": r.doctor,
                "redcap_synced": r.redcap_synced,
                "redcap_record_id": r.redcap_record_id,
                "redcap_error": r.redcap_error
            }
            for r in records
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - Single Submission by ID
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/submissions/{submission_id}")
async def get_submission_by_id(
    submission_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a specific survey submission by ID"""
    result = await db.execute(
        select(PatientSurveySubmissionLog).where(PatientSurveySubmissionLog.id == submission_id)
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Submission not found")

    return {
        "id": record.id,
        "file": record.file,
        "speaker": record.speaker,
        "survey_type": record.survey_type,
        "answers": record.answers,            # JSONB — already a dict
        "extra_data": record.extra_data,      # JSONB — already a dict or None
        "submitted_at": record.submitted_at.isoformat() if record.submitted_at else None,
        "redcap_synced": record.redcap_synced,
        "redcap_record_id": record.redcap_record_id,
        "redcap_error": record.redcap_error
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - Submissions by Speaker (Patient)
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/by-speaker/{speaker}")
async def get_submissions_by_speaker(
    speaker: str,
    db: AsyncSession = Depends(get_db)
):
    """Get all survey submissions for a specific speaker/patient"""
    result = await db.execute(
        select(PatientSurveySubmissionLog)
        .where(PatientSurveySubmissionLog.speaker == speaker)
        .order_by(desc(PatientSurveySubmissionLog.submitted_at))
    )
    records = result.scalars().all()

    # Group by survey type
    grouped = {}
    for r in records:
        if r.survey_type not in grouped:
            grouped[r.survey_type] = []
        grouped[r.survey_type].append({
            "id": r.id,
            "file": r.file,
            "answers": r.answers,  # JSONB — already a dict
            "extra_data": r.extra_data,  # {partial: bool} — lets the client tell partial vs final
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "redcap_synced": r.redcap_synced
        })

    return {
        "speaker": speaker,
        "total_submissions": len(records),
        "survey_types": list(grouped.keys()),
        "submissions_by_type": grouped
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - Submissions by File
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/by-file/{file:path}")
async def get_submissions_by_file(
    file: str,
    db: AsyncSession = Depends(get_db)
):
    """Get all survey submissions for a specific file"""
    result = await db.execute(
        select(PatientSurveySubmissionLog)
        .where(PatientSurveySubmissionLog.file == file)
        .order_by(desc(PatientSurveySubmissionLog.submitted_at))
    )
    records = result.scalars().all()

    return {
        "file": file,
        "total_submissions": len(records),
        "data": [
            {
                "id": r.id,
                "speaker": r.speaker,
                "survey_type": r.survey_type,
                "answers": r.answers,  # JSONB — already a dict
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "redcap_synced": r.redcap_synced
            }
            for r in records
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - Submissions by Survey Type
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/by-type/{survey_type}")
async def get_submissions_by_type(
    survey_type: str,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Get all submissions for a specific survey type"""
    # Count
    count_result = await db.execute(
        select(func.count(PatientSurveySubmissionLog.id))
        .where(PatientSurveySubmissionLog.survey_type == survey_type)
    )
    total = count_result.scalar()

    # Data
    offset = (page - 1) * size
    result = await db.execute(
        select(PatientSurveySubmissionLog)
        .where(PatientSurveySubmissionLog.survey_type == survey_type)
        .order_by(desc(PatientSurveySubmissionLog.submitted_at))
        .offset(offset)
        .limit(size)
    )
    records = result.scalars().all()

    return {
        "survey_type": survey_type,
        "total": total,
        "page": page,
        "size": size,
        "data": [
            {
                "id": r.id,
                "file": r.file,
                "speaker": r.speaker,
                "answers": r.answers,  # JSONB — already a dict
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "redcap_synced": r.redcap_synced
            }
            for r in records
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - Statistics / Dashboard
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/stats")
async def get_survey_stats(
    db: AsyncSession = Depends(get_db)
):
    """Get survey submission statistics"""

    # Total count
    total_result = await db.execute(
        select(func.count(PatientSurveySubmissionLog.id))
    )
    total = total_result.scalar()

    # Count by survey type
    type_result = await db.execute(
        select(
            PatientSurveySubmissionLog.survey_type,
            func.count(PatientSurveySubmissionLog.id)
        )
        .group_by(PatientSurveySubmissionLog.survey_type)
    )
    by_type = {row[0]: row[1] for row in type_result.all()}

    # Count by REDCap sync status
    synced_result = await db.execute(
        select(func.count(PatientSurveySubmissionLog.id))
        .where(PatientSurveySubmissionLog.redcap_synced.is_(True))
    )
    synced_count = synced_result.scalar()

    # Count of errored syncs (redcap_error set). Disjoint from synced (a failed push
    # leaves synced=false + error set); frontend shows pending = total - synced - error.
    error_result = await db.execute(
        select(func.count(PatientSurveySubmissionLog.id))
        .where(PatientSurveySubmissionLog.redcap_error.isnot(None))
    )
    error_count = error_result.scalar()

    # Unique speakers
    speakers_result = await db.execute(
        select(func.count(func.distinct(PatientSurveySubmissionLog.speaker)))
    )
    unique_speakers = speakers_result.scalar()

    # Unique files
    files_result = await db.execute(
        select(func.count(func.distinct(PatientSurveySubmissionLog.file)))
    )
    unique_files = files_result.scalar()

    # Recent submissions (last 5)
    recent_result = await db.execute(
        select(PatientSurveySubmissionLog)
        .order_by(desc(PatientSurveySubmissionLog.submitted_at))
        .limit(5)
    )
    recent = recent_result.scalars().all()

    return {
        "total_submissions": total,
        "unique_speakers": unique_speakers,
        "unique_files": unique_files,
        "redcap_synced": synced_count,
        "redcap_pending": total - synced_count,
        "redcap_error": error_count,
        "by_survey_type": by_type,
        "recent_submissions": [
            {
                "id": r.id,
                "file": r.file,
                "speaker": r.speaker,
                "survey_type": r.survey_type,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None
            }
            for r in recent
        ]
    }


# ══════════════════════════════════════════════════════════════════════════════
# DELETE - Remove Submission
# ══════════════════════════════════════════════════════════════════════════════
@router.delete("/submissions/{submission_id}")
async def delete_submission(
    submission_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a survey submission"""
    result = await db.execute(
        select(PatientSurveySubmissionLog).where(PatientSurveySubmissionLog.id == submission_id)
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Submission not found")

    await db.delete(record)
    await db.commit()

    return {"status": "deleted", "id": submission_id}


# ══════════════════════════════════════════════════════════════════════════════
# GET - View REDCap Record IDs and Target Instrument Data Status
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/redcap/records")
async def view_redcap_records():
    """
    Get all record IDs from REDCap project and check target instrument data status

    Returns:
        - Project information
        - All record IDs
        - Data status for target instruments (DCS, SDM, Risk Perception, Satisfaction)
    """
    import httpx

    print("\n" + "=" * 70)
    print("[API] GET /redcap/records")
    print("=" * 70)

    if not REDCAP_ENABLED:
        print("[ERROR] REDCap not configured")
        raise HTTPException(
            status_code=503,
            detail="REDCap not configured. Please set REDCAP_API_URL and REDCAP_API_TOKEN in .env"
        )

    print(f"[CONFIG] REDCap URL: {REDCAP_API_URL}")
    print(f"[CONFIG] Token: {REDCAP_API_TOKEN[:8]}...{REDCAP_API_TOKEN[-4:]}")

    # Target instruments configuration
    target_instruments = [
        'Decisional Conflict Survey',
        'Shared Decision Making (SDM)',
        'Post Risk Perception',
        'Patient Satisfaction'
    ]

    # Target fields to check (first field of each instrument)
    target_fields = {
        'dcs1_v2': 'Decisional Conflict Survey',
        'sdmp_options': 'Shared Decision Making',
        'risk_percep_1_1': 'Risk Perception',
        'pt_satisfaction': 'Patient Satisfaction'
    }

    async with httpx.AsyncClient() as client:

        # ═══════════════════════════════════════════════════════════════════
        # 1. Get Project Information
        # ═══════════════════════════════════════════════════════════════════
        print("\n" + "-" * 50)
        print("[STEP 1] Getting Project Information...")
        print("-" * 50)

        response = await client.post(REDCAP_API_URL, data={
            'token': REDCAP_API_TOKEN,
            'content': 'project',
            'format': 'json'
        })

        print(f"[HTTP] Status: {response.status_code}")

        if response.status_code != 200:
            print(f"[ERROR] Failed to get project info: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=response.text)

        project_info = response.json()
        is_longitudinal = project_info.get('is_longitudinal', 0) == 1

        print(f"[PROJECT] Title: {project_info.get('project_title')}")
        print(f"[PROJECT] Longitudinal: {is_longitudinal}")

        # Get event info if longitudinal
        event_name = None
        if is_longitudinal:
            print("[INFO] Project is longitudinal, fetching events...")
            event_response = await client.post(REDCAP_API_URL, data={
                'token': REDCAP_API_TOKEN,
                'content': 'event',
                'format': 'json'
            })
            if event_response.status_code == 200:
                events = event_response.json()
                if events:
                    event_name = events[0]['unique_event_name']
                    print(f"[PROJECT] Event: {event_name}")

        # ═══════════════════════════════════════════════════════════════════
        # 2. Get All Record IDs
        # ═══════════════════════════════════════════════════════════════════
        print("\n" + "-" * 50)
        print("[STEP 2] Getting All Record IDs...")
        print("-" * 50)

        response = await client.post(REDCAP_API_URL, data={
            'token': REDCAP_API_TOKEN,
            'content': 'record',
            'format': 'json',
            'type': 'flat',
            'fields[0]': 'record_id',
            'returnFormat': 'json'
        })

        print(f"[HTTP] Status: {response.status_code}")

        if response.status_code != 200:
            print(f"[ERROR] Failed to get records: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=response.text)

        all_records = response.json()
        unique_ids = sorted(list(set(r.get('record_id') for r in all_records)))

        print(f"[RECORDS] Total unique IDs: {len(unique_ids)}")
        if unique_ids:
            print(f"[RECORDS] First 10: {unique_ids[:10]}")
            if len(unique_ids) > 10:
                print(f"[RECORDS] ... and {len(unique_ids) - 10} more")

        # ═══════════════════════════════════════════════════════════════════
        # 3. Get Target Instrument Data Status
        # ═══════════════════════════════════════════════════════════════════
        print("\n" + "-" * 50)
        print("[STEP 3] Checking Target Instrument Data Status...")
        print("-" * 50)
        print(f"[FIELDS] Checking: {list(target_fields.keys())}")

        field_params = {
            'token': REDCAP_API_TOKEN,
            'content': 'record',
            'format': 'json',
            'type': 'flat',
            'fields[0]': 'record_id',
            'returnFormat': 'json'
        }

        # Add target fields
        for i, field in enumerate(target_fields.keys(), 1):
            field_params[f'fields[{i}]'] = field

        response = await client.post(REDCAP_API_URL, data=field_params)

        print(f"[HTTP] Status: {response.status_code}")

        records_status = []
        records_with_data = 0

        if response.status_code == 200:
            records = response.json()
            seen_ids = set()

            print("\n[DATA STATUS]")
            print(f"   {'Record ID':<20} {'DCS':<6} {'SDM':<6} {'Risk':<6} {'Sat':<6}")
            print("   " + "-" * 50)

            for record in records:
                record_id = record.get('record_id', '')
                if record_id in seen_ids:
                    continue
                seen_ids.add(record_id)

                # Check each target field
                dcs_filled = bool(record.get('dcs1_v2'))
                sdm_filled = bool(record.get('sdmp_options'))
                risk_filled = bool(record.get('risk_percep_1_1'))
                satisfaction_filled = bool(record.get('pt_satisfaction'))

                has_any_data = any([dcs_filled, sdm_filled, risk_filled, satisfaction_filled])

                if has_any_data:
                    records_with_data += 1

                # Print status for each record
                dcs_str = "✓" if dcs_filled else "✗"
                sdm_str = "✓" if sdm_filled else "✗"
                risk_str = "✓" if risk_filled else "✗"
                sat_str = "✓" if satisfaction_filled else "✗"

                print(f"   {record_id:<20} {dcs_str:<6} {sdm_str:<6} {risk_str:<6} {sat_str:<6}")

                records_status.append({
                    "record_id": record_id,
                    "dcs": dcs_filled,
                    "sdm": sdm_filled,
                    "risk_perception": risk_filled,
                    "satisfaction": satisfaction_filled,
                    "has_any_target_data": has_any_data
                })

            print("   " + "-" * 50)
            print(f"   Records with target data: {records_with_data} / {len(seen_ids)}")

    # Final summary
    print("\n" + "=" * 70)
    print("[SUMMARY]")
    print("=" * 70)
    print(f"   Project: {project_info.get('project_title')}")
    print(f"   Longitudinal: {is_longitudinal}")
    if is_longitudinal:
        print(f"   Event: {event_name}")
    print(f"   Total Records: {len(unique_ids)}")
    print(f"   Records with Target Data: {records_with_data}")
    print(f"   Records without Target Data: {len(unique_ids) - records_with_data}")
    print("=" * 70 + "\n")

    return {
        "project": {
            "title": project_info.get('project_title'),
            "is_longitudinal": is_longitudinal,
            "event": event_name
        },
        "summary": {
            "total_records": len(unique_ids),
            "records_with_target_data": records_with_data,
            "records_without_target_data": len(unique_ids) - records_with_data
        },
        "target_instruments": target_instruments,
        "target_fields": target_fields,
        "record_ids": unique_ids,
        "records_status": records_status
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET - View Specific Record Details from REDCap
# ══════════════════════════════════════════════════════════════════════════════
@router.get("/redcap/records/{record_id}")
async def view_redcap_record_detail(record_id: str):
    """
    Get detailed data for a specific record from REDCap
    Shows all target instrument fields with their values
    """
    import httpx

    print("\n" + "=" * 70)
    print(f"[API] GET /redcap/records/{record_id}")
    print("=" * 70)

    if not REDCAP_ENABLED:
        print("[ERROR] REDCap not configured")
        raise HTTPException(
            status_code=503,
            detail="REDCap not configured"
        )

    print(f"[REQUEST] Record ID: {record_id}")

    # All target fields
    export_fields = [
        'record_id',
        # DCS (16 fields)
        'dcs1_v2', 'dcs2_v2', 'dcs3_v2', 'dcs4_v2', 'dcs5_v2',
        'dcs6_v2', 'dcs7_v2', 'dcs8_v2', 'dcs9_v2', 'dcs10_v2',
        'dcs11_v2', 'dcs12_v2', 'dcs13_v2', 'dcs14_v2', 'dcs15_v2', 'dcs16_v2',
        # SDM (4 fields)
        'sdmp_options', 'sdm_ptos', 'sdm_cons', 'sdm_pref',
        # Risk Perception (5 fields)
        'risk_percep_1_1', 'risk_percept2_2', 'risk_percept_3_3',
        'risk_percept_4_4', 'risk_percep_5_5',
        # Satisfaction (1 field)
        'pt_satisfaction'
    ]

    print(f"[FIELDS] Requesting {len(export_fields)} fields")

    # Value labels for display
    dcs_labels = {
        '1': 'Strongly Agree',
        '2': 'Agree',
        '3': 'Neither',
        '4': 'Disagree',
        '5': 'Strongly Disagree'
    }

    sdm_yesno_labels = {'1': 'Yes', '0': 'No'}
    sdm_scale_labels = {'1': 'A lot', '2': 'Some', '3': 'A little', '4': 'Not at all'}

    async with httpx.AsyncClient() as client:
        # Build request
        print("\n" + "-" * 50)
        print("[STEP 1] Fetching record from REDCap...")
        print("-" * 50)

        data = {
            'token': REDCAP_API_TOKEN,
            'content': 'record',
            'format': 'json',
            'type': 'flat',
            'records[0]': record_id,
            'returnFormat': 'json'
        }

        for i, field in enumerate(export_fields):
            data[f'fields[{i}]'] = field

        response = await client.post(REDCAP_API_URL, data=data)

        print(f"[HTTP] Status: {response.status_code}")

        if response.status_code != 200:
            print(f"[ERROR] REDCap API error: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=response.text)

        records = response.json()

        if not records:
            print(f"[ERROR] Record '{record_id}' not found")
            raise HTTPException(status_code=404, detail=f"Record '{record_id}' not found")

        record = records[0]
        print("[SUCCESS] Record found")

        # Build structured response
        print("\n" + "-" * 50)
        print("[STEP 2] Processing record data...")
        print("-" * 50)

        result = {
            "record_id": record_id,
            "decisional_conflict_survey": {
                "instrument_name": "decisional_conflict_survey",
                "field_count": 16,
                "fields": {}
            },
            "shared_decision_making": {
                "instrument_name": "shared_decision_making_sdm",
                "field_count": 4,
                "fields": {}
            },
            "risk_perception": {
                "instrument_name": "risk_perception",
                "field_count": 5,
                "fields": {}
            },
            "patient_satisfaction": {
                "instrument_name": "patient_satisfaction",
                "field_count": 1,
                "fields": {}
            }
        }

        # DCS fields
        print("\n[DCS] Decisional Conflict Survey (16 fields)")
        print("   " + "-" * 45)
        for i in range(1, 17):
            field_name = f'dcs{i}_v2'
            value = record.get(field_name, '')
            label = dcs_labels.get(value, '') if value else None
            filled = bool(value)

            status = "✓" if filled else "✗"
            print(f"   {status} {field_name}: {value} ({label if label else 'empty'})")

            result["decisional_conflict_survey"]["fields"][field_name] = {
                "value": value,
                "label": label,
                "filled": filled
            }

        # SDM fields
        print("\n[SDM] Shared Decision Making (4 fields)")
        print("   " + "-" * 45)
        for field_name, labels in [
            ('sdmp_options', sdm_yesno_labels),
            ('sdm_ptos', sdm_scale_labels),
            ('sdm_cons', sdm_scale_labels),
            ('sdm_pref', sdm_yesno_labels)
        ]:
            value = record.get(field_name, '')
            label = labels.get(value, '') if value else None
            filled = bool(value)

            status = "✓" if filled else "✗"
            print(f"   {status} {field_name}: {value} ({label if label else 'empty'})")

            result["shared_decision_making"]["fields"][field_name] = {
                "value": value,
                "label": label,
                "filled": filled
            }

        # Risk Perception fields
        print("\n[RISK] Post Risk Perception (5 fields)")
        print("   " + "-" * 45)
        for field_name in ['risk_percep_1_1', 'risk_percept2_2', 'risk_percept_3_3',
                          'risk_percept_4_4', 'risk_percep_5_5']:
            value = record.get(field_name, '')
            filled = bool(value)

            status = "✓" if filled else "✗"
            print(f"   {status} {field_name}: {value if value else 'empty'}")

            result["risk_perception"]["fields"][field_name] = {
                "value": value,
                "filled": filled
            }

        # Satisfaction
        print("\n[SAT] Patient Satisfaction (1 field)")
        print("   " + "-" * 45)
        value = record.get('pt_satisfaction', '')
        filled = bool(value)

        status = "✓" if filled else "✗"
        display_value = value[:50] + "..." if value and len(value) > 50 else (value if value else 'empty')
        print(f"   {status} pt_satisfaction: {display_value}")

        result["patient_satisfaction"]["fields"]["pt_satisfaction"] = {
            "value": value,
            "filled": filled
        }

        # Calculate completion status
        print("\n" + "-" * 50)
        print("[STEP 3] Calculating completion status...")
        print("-" * 50)

        for section in ["decisional_conflict_survey", "shared_decision_making",
                       "risk_perception", "patient_satisfaction"]:
            fields = result[section]["fields"]
            filled_count = sum(1 for f in fields.values() if f["filled"])
            total_count = len(fields)
            complete = filled_count == total_count

            result[section]["filled_count"] = filled_count
            result[section]["total_count"] = total_count
            result[section]["complete"] = complete

            status = "✓ Complete" if complete else f"○ {filled_count}/{total_count}"
            print(f"   {section}: {status}")

        # Final summary
        print("\n" + "=" * 70)
        print("[SUMMARY]")
        print("=" * 70)
        print(f"   Record ID: {record_id}")
        print(f"   DCS: {result['decisional_conflict_survey']['filled_count']}/16 fields")
        print(f"   SDM: {result['shared_decision_making']['filled_count']}/4 fields")
        print(f"   Risk: {result['risk_perception']['filled_count']}/5 fields")
        print(f"   Satisfaction: {result['patient_satisfaction']['filled_count']}/1 fields")
        print("=" * 70 + "\n")

        return result


# ══════════════════════════════════════════════════════════════════════════════
# DELETE - Delete Record from REDCap
# ══════════════════════════════════════════════════════════════════════════════
@router.delete("/redcap/records/{record_id}")
async def delete_redcap_record(record_id: str):
    """
    Delete a record from REDCap project

    WARNING: This permanently deletes the record from REDCap
    """
    import httpx

    print("\n" + "=" * 70)
    print(f"[API] DELETE /redcap/records/{record_id}")
    print("=" * 70)
    print("[WARNING] [WARN]  This will permanently delete the record!")

    if not REDCAP_ENABLED:
        print("[ERROR] REDCap not configured")
        raise HTTPException(
            status_code=503,
            detail="REDCap not configured"
        )

    print(f"[REQUEST] Record ID to delete: {record_id}")

    async with httpx.AsyncClient() as client:
        # First verify record exists
        print("\n" + "-" * 50)
        print("[STEP 1] Verifying record exists...")
        print("-" * 50)

        check_response = await client.post(REDCAP_API_URL, data={
            'token': REDCAP_API_TOKEN,
            'content': 'record',
            'format': 'json',
            'type': 'flat',
            'records[0]': record_id,
            'fields[0]': 'record_id',
            'returnFormat': 'json'
        })

        print(f"[HTTP] Status: {check_response.status_code}")

        if check_response.status_code == 200:
            records = check_response.json()
            if not records:
                print(f"[ERROR] Record '{record_id}' not found - cannot delete")
                raise HTTPException(status_code=404, detail=f"Record '{record_id}' not found")
            print(f"[SUCCESS] Record '{record_id}' exists")
        else:
            print(f"[ERROR] Failed to verify record: {check_response.text}")

        # Delete the record
        print("\n" + "-" * 50)
        print("[STEP 2] Deleting record...")
        print("-" * 50)

        response = await client.post(REDCAP_API_URL, data={
            'token': REDCAP_API_TOKEN,
            'action': 'delete',
            'content': 'record',
            'records[0]': record_id,
            'returnFormat': 'json'
        })

        print(f"[HTTP] Status: {response.status_code}")
        print(f"[HTTP] Response: {response.text}")

        if response.status_code == 200:
            result = response.json()

            # Verify deletion
            print("\n" + "-" * 50)
            print("[STEP 3] Verifying deletion...")
            print("-" * 50)

            verify_response = await client.post(REDCAP_API_URL, data={
                'token': REDCAP_API_TOKEN,
                'content': 'record',
                'format': 'json',
                'type': 'flat',
                'records[0]': record_id,
                'fields[0]': 'record_id',
                'returnFormat': 'json'
            })

            if verify_response.status_code == 200:
                remaining = verify_response.json()
                if not remaining:
                    print(f"[SUCCESS] [OK] Record '{record_id}' successfully deleted")
                else:
                    print("[WARNING] [WARN] Record may still exist")

            # Final summary
            print("\n" + "=" * 70)
            print("[SUMMARY]")
            print("=" * 70)
            print("   Action: DELETE")
            print(f"   Record ID: {record_id}")
            print("   Status: [OK] Deleted")
            print(f"   Records affected: {result}")
            print("=" * 70 + "\n")

            return {
                "status": "deleted",
                "record_id": record_id,
                "records_deleted": result
            }
        else:
            print(f"[ERROR] [ERROR] Failed to delete record: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Failed to delete record: {response.text}"
            )


# ══════════════════════════════════════════════════════════════════════════════
# Pydantic Models for REDCap Import
# ══════════════════════════════════════════════════════════════════════════════
class REDCapImportData(BaseModel):
    """REDCap import data model - direct field names"""

    # ═══════════════════════════════════════════════════════════════════════
    # NEW: Instrument Complete Fields
    # Values: "0" = Incomplete (red), "1" = Unverified (yellow), "2" = Complete (green)
    # ═══════════════════════════════════════════════════════════════════════
    decisional_conflict_survey_complete: Optional[str] = None
    shared_decision_making_sdm_complete: Optional[str] = None
    risk_perception_complete: Optional[str] = None
    post_risk_perception_2_complete: Optional[str] = None
    patient_satisfaction_complete: Optional[str] = None

    # Decisional Conflict Survey (16 fields) - Optional
    dcs1_v2: Optional[str] = None
    dcs2_v2: Optional[str] = None
    dcs3_v2: Optional[str] = None
    dcs4_v2: Optional[str] = None
    dcs5_v2: Optional[str] = None
    dcs6_v2: Optional[str] = None
    dcs7_v2: Optional[str] = None
    dcs8_v2: Optional[str] = None
    dcs9_v2: Optional[str] = None
    dcs10_v2: Optional[str] = None
    dcs11_v2: Optional[str] = None
    dcs12_v2: Optional[str] = None
    dcs13_v2: Optional[str] = None
    dcs14_v2: Optional[str] = None
    dcs15_v2: Optional[str] = None
    dcs16_v2: Optional[str] = None

    # Shared Decision Making (4 fields) - Optional
    sdmp_options: Optional[str] = None  # yesno: 1=Yes, 0=No
    sdm_ptos: Optional[str] = None      # 1=A lot, 2=Some, 3=A little, 4=Not at all
    sdm_cons: Optional[str] = None      # 1=A lot, 2=Some, 3=A little, 4=Not at all
    sdm_pref: Optional[str] = None      # yesno: 1=Yes, 0=No

    # Post Risk Perception (5 fields) - Optional
    risk_percep_1_1: Optional[str] = None
    risk_percept2_2: Optional[str] = None
    risk_percept_3_3: Optional[str] = None
    risk_percept_4_4: Optional[str] = None
    risk_percep_5_5: Optional[str] = None

    # Post Risk Perception 2 (14 fields) - Optional
    # Sliders carry a 0-100 integer; radios carry the REDCap choice code (1-N).
    cp_1_rp_v2: Optional[str] = None
    cp_2_rp_v2: Optional[str] = None
    cp_3_rp_v2: Optional[str] = None
    le_1_rp_v2: Optional[str] = None
    le_2_rp_v2: Optional[str] = None
    ed_1_rp_v2: Optional[str] = None
    ed_2_rp_v2: Optional[str] = None
    ed_3_rp_v2: Optional[str] = None
    ui_1_rp_v2: Optional[str] = None
    ui_2_rp_v2: Optional[str] = None
    ui_3_rp_v2: Optional[str] = None
    il_1_rp_v2: Optional[str] = None
    il_2_rp_v2: Optional[str] = None
    il_3_rp_v2: Optional[str] = None

    # Patient Satisfaction (1 field) - Optional
    pt_satisfaction: Optional[str] = None


class REDCapBulkImportRequest(BaseModel):
    """Bulk import request with record_id"""
    record_id: str
    data: REDCapImportData
    overwrite: Optional[bool] = False  # If True, overwrite existing data


# ══════════════════════════════════════════════════════════════════════════════
# POST - Import Data to REDCap for Specific Record ID
# ══════════════════════════════════════════════════════════════════════════════
@router.post("/redcap/records/{record_id}/import")
async def import_to_redcap_record(
    record_id: str,
    import_data: REDCapImportData,
    overwrite_behavior: str = "normal",
):
    """
    Import survey data to REDCap for a specific record ID

    Uses direct REDCap field names:
    - DCS: dcs1_v2 ~ dcs16_v2 (1=Strongly Agree, 2=Agree, 3=Neither, 4=Disagree, 5=Strongly Disagree)
    - SDM: sdmp_options, sdm_ptos, sdm_cons, sdm_pref
    - Risk: risk_percep_1_1, risk_percept2_2, risk_percept_3_3, risk_percept_4_4, risk_percep_5_5
    - Satisfaction: pt_satisfaction (free text)

    NEW: Automatically sets _complete fields to "2" (Complete/Green) for instruments with data
    """
    import httpx

    print("\n" + "=" * 70)
    print(f"[API] POST /redcap/records/{record_id}/import")
    print("=" * 70)

    if not REDCAP_ENABLED:
        print("[ERROR] REDCap not configured")
        raise HTTPException(
            status_code=503,
            detail="REDCap not configured. Please set REDCAP_API_URL and REDCAP_API_TOKEN in .env"
        )

    print(f"[CONFIG] REDCap URL: {REDCAP_API_URL}")
    print(f"[CONFIG] Token: {REDCAP_API_TOKEN[:8]}...{REDCAP_API_TOKEN[-4:]}")
    print(f"[REQUEST] Record ID: {record_id}")

    # ═══════════════════════════════════════════════════════════════════════
    # 1. Check if project is longitudinal
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "-" * 50)
    print("[STEP 1] Checking project configuration...")
    print("-" * 50)

    async with httpx.AsyncClient() as client:
        response = await client.post(REDCAP_API_URL, data={
            'token': REDCAP_API_TOKEN,
            'content': 'project',
            'format': 'json'
        })

        print(f"[HTTP] Status: {response.status_code}")

        if response.status_code != 200:
            print(f"[ERROR] Failed to get project info: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=response.text)

        project_info = response.json()
        is_longitudinal = project_info.get('is_longitudinal', 0) == 1

        print(f"[PROJECT] Title: {project_info.get('project_title')}")
        print(f"[PROJECT] Longitudinal: {is_longitudinal}")

        # Get event info if longitudinal
        event_name = None
        if is_longitudinal:
            print("[INFO] Project is longitudinal, fetching events...")
            event_response = await client.post(REDCAP_API_URL, data={
                'token': REDCAP_API_TOKEN,
                'content': 'event',
                'format': 'json'
            })
            if event_response.status_code == 200:
                events = event_response.json()
                if events:
                    event_name = events[0]['unique_event_name']
                    print(f"[PROJECT] Event: {event_name}")

        # ═══════════════════════════════════════════════════════════════════
        # 2. Build REDCap record
        # ═══════════════════════════════════════════════════════════════════
        print("\n" + "-" * 50)
        print("[STEP 2] Building REDCap record...")
        print("-" * 50)

        # Convert Pydantic model to dict, excluding None values
        data_dict = import_data.model_dump(exclude_none=True)

        # Build REDCap record
        redcap_record = {"record_id": record_id}

        # Add event name if longitudinal
        if is_longitudinal and event_name:
            redcap_record["redcap_event_name"] = event_name

        # Add all non-None fields
        redcap_record.update(data_dict)

        # Count fields by category (excluding _complete fields)
        dcs_count = sum(1 for k in data_dict.keys() if k.startswith('dcs') and not k.endswith('_complete'))
        sdm_count = sum(1 for k in data_dict.keys() if k.startswith('sdm') and not k.endswith('_complete'))
        risk_count = sum(1 for k in data_dict.keys() if k.startswith('risk') and not k.endswith('_complete'))
        risk2_count = sum(1 for k in data_dict.keys() if k.endswith('_rp_v2'))
        sat_count = sum(1 for k in data_dict.keys() if k.startswith('pt_') and not k.endswith('_complete'))

        # ═══════════════════════════════════════════════════════════════════
        # NEW: Auto-set complete fields based on which data is provided
        # ═══════════════════════════════════════════════════════════════════
        print("\n[STEP 2.5] Auto-setting instrument complete fields...")

        if dcs_count > 0 and 'decisional_conflict_survey_complete' not in data_dict:
            redcap_record['decisional_conflict_survey_complete'] = '2'
            print("[AUTO-COMPLETE] [OK] decisional_conflict_survey_complete = '2' (Green)")

        if sdm_count > 0 and 'shared_decision_making_sdm_complete' not in data_dict:
            redcap_record['shared_decision_making_sdm_complete'] = '2'
            print("[AUTO-COMPLETE] [OK] shared_decision_making_sdm_complete = '2' (Green)")

        if risk_count > 0 and 'risk_perception_complete' not in data_dict:
            redcap_record['risk_perception_complete'] = '2'
            print("[AUTO-COMPLETE] [OK] risk_perception_complete = '2' (Green)")

        if risk2_count > 0 and 'post_risk_perception_2_complete' not in data_dict:
            redcap_record['post_risk_perception_2_complete'] = '2'
            print("[AUTO-COMPLETE] [OK] post_risk_perception_2_complete = '2' (Green)")

        if sat_count > 0 and 'patient_satisfaction_complete' not in data_dict:
            redcap_record['patient_satisfaction_complete'] = '2'
            print("[AUTO-COMPLETE] [OK] patient_satisfaction_complete = '2' (Green)")

        print(f"\n[RECORD] Record ID: {record_id}")
        print(f"[RECORD] Total fields to import: {len(redcap_record) - 1}")  # -1 for record_id
        print(f"   • DCS fields: {dcs_count}")
        print(f"   • SDM fields: {sdm_count}")
        print(f"   • Risk Perception fields: {risk_count}")
        print(f"   • Risk Perception 2 fields: {risk2_count}")
        print(f"   • Satisfaction fields: {sat_count}")

        if is_longitudinal:
            print(f"   • Event: {event_name}")

        # Print field details
        print("\n[FIELDS] Data to import:")
        for key, value in redcap_record.items():
            if key != 'record_id':
                display_value = value[:40] + "..." if isinstance(value, str) and len(value) > 40 else value
                print(f"   {key}: {display_value}")

        # ═══════════════════════════════════════════════════════════════════
        # 3. Import to REDCap
        # ═══════════════════════════════════════════════════════════════════
        print("\n" + "-" * 50)
        print("[STEP 3] Importing to REDCap...")
        print("-" * 50)

        response = await client.post(REDCAP_API_URL, data={
            'token': REDCAP_API_TOKEN,
            'content': 'record',
            'format': 'json',
            'type': 'flat',
            'overwriteBehavior': overwrite_behavior,
            'forceAutoNumber': 'false',
            'data': json.dumps([redcap_record]),
            'returnContent': 'ids',
            'returnFormat': 'json'
        })

        print(f"[HTTP] Status: {response.status_code}")
        print(f"[HTTP] Response: {response.text}")

        if response.status_code != 200:
            print(f"[ERROR] [ERROR] Import failed: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"REDCap import failed: {response.text}"
            )

        import_result = response.json()
        print("[SUCCESS] [OK] Import successful!")
        print(f"[RESULT] Imported record IDs: {import_result}")

        # ═══════════════════════════════════════════════════════════════════
        # 4. Verify imported data
        # ═══════════════════════════════════════════════════════════════════
        print("\n" + "-" * 50)
        print("[STEP 4] Verifying imported data...")
        print("-" * 50)

        # Get the imported fields back (including _complete fields)
        verify_fields = list(redcap_record.keys())

        verify_data = {
            'token': REDCAP_API_TOKEN,
            'content': 'record',
            'format': 'json',
            'type': 'flat',
            'records[0]': record_id,
            'returnFormat': 'json'
        }

        for i, field in enumerate(verify_fields):
            verify_data[f'fields[{i}]'] = field

        verify_response = await client.post(REDCAP_API_URL, data=verify_data)

        verified_data = {}
        if verify_response.status_code == 200:
            records = verify_response.json()
            if records:
                verified_data = records[0]
                print("[VERIFY] Record found in REDCap")

                # Check each field
                verified_count = 0
                for key in redcap_record.keys():
                    if key == 'record_id':
                        continue
                    expected = redcap_record[key]
                    actual = verified_data.get(key, '')
                    match = expected == actual
                    if match:
                        verified_count += 1
                    status = "✓" if match else "✗"
                    print(f"   {status} {key}: {actual[:30]}{'...' if len(str(actual)) > 30 else ''}")

                print(f"\n[VERIFY] Verified {verified_count}/{len(redcap_record) - 1} fields")
        else:
            print(f"[WARNING] Could not verify: {verify_response.text}")

        # Final summary
        print("\n" + "=" * 70)
        print("[SUMMARY]")
        print("=" * 70)
        print("   Action: IMPORT")
        print(f"   Record ID: {record_id}")
        print("   Status: [OK] Success")
        print(f"   Fields imported: {len(redcap_record) - 1}")
        print(f"      • DCS: {dcs_count}/16")
        print(f"      • SDM: {sdm_count}/4")
        print(f"      • Risk: {risk_count}/5")
        print(f"      • Satisfaction: {sat_count}/1")
        print("      • Complete fields: auto-set ✓")
        print("=" * 70 + "\n")

        return {
            "status": "success",
            "record_id": record_id,
            "project": {
                "title": project_info.get('project_title'),
                "is_longitudinal": is_longitudinal,
                "event": event_name
            },
            "import_summary": {
                "total_fields": len(redcap_record) - 1,
                "dcs_fields": dcs_count,
                "sdm_fields": sdm_count,
                "risk_fields": risk_count,
                "satisfaction_fields": sat_count,
                "complete_fields_auto_set": True
            },
            "imported_data": {k: v for k, v in redcap_record.items() if k != 'record_id'},
            "verified_data": verified_data,
            "redcap_response": import_result
        }


# ══════════════════════════════════════════════════════════════════════════════
# POST - Bulk Import Complete Survey Data to REDCap
# ══════════════════════════════════════════════════════════════════════════════
@router.post("/redcap/import")
async def bulk_import_to_redcap(request: REDCapBulkImportRequest):
    """
    Bulk import survey data to REDCap
    Alternative endpoint that accepts record_id in request body
    """
    print("\n" + "=" * 70)
    print("[API] POST /redcap/import")
    print("=" * 70)
    print(f"[REQUEST] Record ID: {request.record_id}")
    print(f"[REQUEST] Overwrite: {request.overwrite}")

    # Delegate to the path parameter version
    return await import_to_redcap_record(request.record_id, request.data)


# ══════════════════════════════════════════════════════════════════════════════
# POST - Import All Target Instruments with Sample Data (for Testing)
# ══════════════════════════════════════════════════════════════════════════════
@router.post("/redcap/records/{record_id}/import-sample")
async def import_sample_data(record_id: str):
    """
    Import sample/test data for all target instruments
    Useful for testing REDCap integration

    Creates complete sample responses for:
    - Decisional Conflict Survey (16 questions)
    - Shared Decision Making (4 questions)
    - Post Risk Perception (5 questions)
    - Patient Satisfaction (1 question)

    NEW: Also sets all _complete fields to "2" (Complete/Green)
    """
    print("\n" + "=" * 70)
    print(f"[API] POST /redcap/records/{record_id}/import-sample")
    print("=" * 70)
    print("[INFO] Generating sample data for all instruments...")

    # Create sample data with complete fields
    sample_data = REDCapImportData(
        # ═══════════════════════════════════════════════════════════════════
        # NEW: Complete Fields - Sets green checkmark in REDCap
        # ═══════════════════════════════════════════════════════════════════
        decisional_conflict_survey_complete="2",  # 2 = Complete (Green)
        shared_decision_making_sdm_complete="2",
        risk_perception_complete="2",
        patient_satisfaction_complete="2",

        # DCS (16 questions) - 1=Strongly Agree to 5=Strongly Disagree
        dcs1_v2="1",   # I know which options are available to me.
        dcs2_v2="2",   # I know the benefits of each option.
        dcs3_v2="2",   # I know the risks and side effects.
        dcs4_v2="2",   # I am clear about which benefits matter most.
        dcs5_v2="3",   # I am clear about which risks matter most.
        dcs6_v2="2",   # Clear about what is more important.
        dcs7_v2="1",   # I have enough support from others.
        dcs8_v2="1",   # I am choosing without pressure.
        dcs9_v2="2",   # I have enough advice.
        dcs10_v2="2",  # I am clear about the best choice.
        dcs11_v2="3",  # I feel sure about what to choose.
        dcs12_v2="4",  # This decision is easy for me.
        dcs13_v2="2",  # I feel I have made an informed choice.
        dcs14_v2="1",  # My decision shows what is important.
        dcs15_v2="2",  # I expect to stick with my decision.
        dcs16_v2="2",  # I am satisfied with my decision.

        # SDM (4 questions)
        sdmp_options="1",  # Did provider explain choices? (Yes)
        sdm_ptos="1",      # Reasons TO have intervention? (A lot)
        sdm_cons="2",      # Reasons NOT to have intervention? (Some)
        sdm_pref="1",      # Did provider ask preference? (Yes)

        # Risk Perception (5 questions)
        risk_percep_1_1="3",   # Risk if don't treat (20/100)
        risk_percept2_2="1",   # Risk if do treat (5/100)
        risk_percept_3_3="3",  # Erectile dysfunction risk (50/100)
        risk_percept_4_4="2",  # Urinary incontinence risk (10/100)
        risk_percep_5_5="2",   # Irritative urinary symptoms risk (10/100)

        # Satisfaction (1 question)
        pt_satisfaction="[SAMPLE DATA] The NLP report was very helpful in understanding my treatment options. It clearly explained the risks and benefits of each approach."
    )

    print("[INFO] Sample data generated:")
    print("   • DCS: 16 questions (Strongly Agree to Disagree)")
    print("   • SDM: 4 questions")
    print("   • Risk Perception: 5 questions")
    print("   • Satisfaction: 1 free text response")
    print("   • Complete fields: ALL set to '2' (Green) ✓")

    # Delegate to the main import function
    return await import_to_redcap_record(record_id, sample_data)
