"""Unit tests for the data-integrity verifiers (integrity_checks.py).

Seed good + deliberately-broken rows and assert each checker flags exactly the broken
ones. REDCap (C2) is mocked with respx.
"""
from datetime import datetime, timezone

import httpx
import pytest
import respx
from sqlalchemy.exc import IntegrityError

import integrity_checks as ic
from models import (
    PatientSummary, PatientSurveySubmissionLog, PatientFollowupSurveyPageBehavior,
)

pytestmark = pytest.mark.asyncio

FAKE_URL = "https://redcap.example.com/api/"
FAKE_TOKEN = "TOK"


def _by_name(results, name):
    return next(r for r in results if r.name == name)


async def _add_summary(db, file, speaker):
    db.add(PatientSummary(file=file, speaker=speaker))
    await db.commit()


# ── C1 ──────────────────────────────────────────────────────────────────────
class TestDbIntegrity:
    async def test_empty_answers_flagged(self, db):
        await _add_summary(db, "13511_13571_07022026.csv", "Patient_13511_13571_07022026")
        # good row (has answers)
        db.add(PatientSurveySubmissionLog(
            file="13511_13571_07022026.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={"q1": "yes"}))
        # broken row: submitted with nothing in it
        db.add(PatientSurveySubmissionLog(
            file="13511_13571_07022026.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={}))
        await db.commit()

        results = await ic.check_db_integrity(db)
        assert _by_name(results, "survey_empty_answers").count == 1
        assert _by_name(results, "survey_orphan_rows").count == 0
        assert _by_name(results, "survey_bad_type").status == "pass"

    async def test_orphan_survey_row_is_rejected_by_the_database(self, db):
        """The survey_orphan_rows check can only ever surface legacy rows.

        patient_survey_submission_log carries a (file, speaker) foreign key into
        patient_summary, so the database refuses to create a new orphan at all.
        This used to be tested by inserting one and asserting the checker found
        it — which only worked because the suite ran on SQLite, where foreign
        keys are not enforced.
        """
        db.add(PatientSurveySubmissionLog(
            file="orphan.csv", speaker="Patient_99999_88888_07022026",
            survey_type="sdm", answers={}))
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    async def test_bad_survey_type_flagged(self, db):
        await _add_summary(db, "f.csv", "Patient_13511_13571_07022026")
        db.add(PatientSurveySubmissionLog(
            file="f.csv", speaker="Patient_13511_13571_07022026",
            survey_type="not_a_real_type", answers={"a": 1}))
        await db.commit()
        results = await ic.check_db_integrity(db)
        assert _by_name(results, "survey_bad_type").count == 1

    async def test_close_without_open_is_warn(self, db):
        now = datetime.now(timezone.utc)
        # a session with 2 summary_close but only 1 summary_open
        for et in ["page_view", "summary_open", "summary_close", "summary_close", "session_end"]:
            db.add(PatientFollowupSurveyPageBehavior(
                session_id="sess_x", file="f.csv", speaker="Patient_1", event_type=et,
                client_timestamp=now))
        await db.commit()
        results = await ic.check_db_integrity(db)
        r = _by_name(results, "behavior_close_without_open")
        assert r.status == "warn" and r.count == 1
        # this well-formed session has both bookends
        assert _by_name(results, "behavior_session_missing_page_view").count == 0
        assert _by_name(results, "behavior_session_missing_session_end").count == 0


# ── C2 ──────────────────────────────────────────────────────────────────────
class TestRedcapReconciliation:
    @respx.mock
    async def test_missing_record_and_mismatch(self, db):
        await _add_summary(db, "13511_13571_07022026.csv", "Patient_13511_13571_07022026")
        # synced follow-up survey → expects sdm fields in REDCap under SID_22
        db.add(PatientSurveySubmissionLog(
            file="13511_13571_07022026.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={"q2": "yes"}, redcap_synced=True, redcap_record_id="SID_22"))
        # a second synced row whose record is absent in REDCap
        await _add_summary(db, "g.csv", "Patient_63514_63574_07022026")
        db.add(PatientSurveySubmissionLog(
            file="g.csv", speaker="Patient_63514_63574_07022026",
            survey_type="sdm", answers={"q2": "yes"}, redcap_synced=True, redcap_record_id="SID_21"))
        await db.commit()

        # REDCap returns SID_22 but with the WRONG value for the mapped field, and no SID_21.
        from routes_surveys import FRONTEND_TO_REDCAP_MAPPING
        sdm_field = FRONTEND_TO_REDCAP_MAPPING["sdm"]["q2"]
        respx.post(FAKE_URL).mock(return_value=httpx.Response(
            200, json=[{"record_id": "SID_22", sdm_field: "9"}]))  # wrong value → mismatch

        results = await ic.check_redcap_reconciliation(db, FAKE_URL, FAKE_TOKEN)
        assert _by_name(results, "redcap_missing_record").count == 1   # SID_21 absent
        assert _by_name(results, "redcap_field_mismatch").count == 1   # SID_22 wrong value

    @respx.mock
    async def test_resubmission_reconciles_latest_only(self, db):
        # Two synced sdm submissions for the SAME record — an older one (q2=no) then a
        # newer one (q2=yes). REDCap holds the last write (yes). The older resubmission
        # must NOT be flagged: only the latest per (record_id, survey_type) is compared.
        await _add_summary(db, "13511_13571_07022026.csv", "Patient_13511_13571_07022026")
        db.add(PatientSurveySubmissionLog(
            file="13511_13571_07022026.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={"q2": "no"}, redcap_synced=True, redcap_record_id="SID_22"))
        await db.commit()  # lower id → older
        db.add(PatientSurveySubmissionLog(
            file="13511_13571_07022026.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={"q2": "yes"}, redcap_synced=True, redcap_record_id="SID_22"))
        await db.commit()  # higher id → latest

        from routes_surveys import FRONTEND_TO_REDCAP_MAPPING
        sdm_field = FRONTEND_TO_REDCAP_MAPPING["sdm"]["q2"]
        latest_value = ic._expected_fields("sdm", {"q2": "yes"})[sdm_field]
        respx.post(FAKE_URL).mock(return_value=httpx.Response(
            200, json=[{"record_id": "SID_22", sdm_field: latest_value}]))

        results = await ic.check_redcap_reconciliation(db, FAKE_URL, FAKE_TOKEN)
        assert _by_name(results, "redcap_field_mismatch").count == 0

    @respx.mock
    async def test_field_absent_from_export_is_unverifiable(self, db):
        # A de-identified export strips free-text fields (pt_satisfaction) — the key is
        # absent from the payload. That must surface as "unverifiable", not a mismatch.
        await _add_summary(db, "s.csv", "Patient_13511_13571_07022026")
        db.add(PatientSurveySubmissionLog(
            file="s.csv", speaker="Patient_13511_13571_07022026",
            survey_type="satisfaction", answers={"feedbackText": "test"},
            redcap_synced=True, redcap_record_id="SID_22"))
        await db.commit()

        # Record present, but pt_satisfaction key stripped (only the complete-flag returns).
        respx.post(FAKE_URL).mock(return_value=httpx.Response(
            200, json=[{"record_id": "SID_22", "patient_satisfaction_complete": "2"}]))

        results = await ic.check_redcap_reconciliation(db, FAKE_URL, FAKE_TOKEN)
        assert _by_name(results, "redcap_field_mismatch").count == 0
        unver = _by_name(results, "redcap_unverifiable_fields")
        assert unver.count == 1 and unver.status == "warn"

    async def test_skipped_when_unconfigured(self, db):
        results = await ic.check_redcap_reconciliation(db, None, None)
        assert results[0].status == "warn" and "not configured" in results[0].detail


# ── C3 ──────────────────────────────────────────────────────────────────────
class TestActivityCrosscheck:
    async def test_submission_without_behavior_trail_flagged(self, db):
        await _add_summary(db, "f.csv", "Patient_13511_13571_07022026")
        db.add(PatientSurveySubmissionLog(
            file="f.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={"a": 1}))
        await db.commit()
        results = await ic.check_activity_crosscheck(db)
        assert results[0].count == 1 and results[0].status == "warn"

    async def test_submission_with_behavior_trail_ok(self, db):
        now = datetime.now(timezone.utc)
        await _add_summary(db, "f.csv", "Patient_13511_13571_07022026")
        db.add(PatientSurveySubmissionLog(
            file="f.csv", speaker="Patient_13511_13571_07022026",
            survey_type="sdm", answers={"a": 1}))
        db.add(PatientFollowupSurveyPageBehavior(
            session_id="s1", file="f.csv", speaker="Patient_13511_13571_07022026",
            event_type="survey_complete", client_timestamp=now))
        await db.commit()
        results = await ic.check_activity_crosscheck(db)
        assert results[0].count == 0 and results[0].status == "pass"
