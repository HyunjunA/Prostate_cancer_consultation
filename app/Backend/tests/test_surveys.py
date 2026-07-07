"""Tests for survey submission API endpoints.

Endpoints tested:
  POST   /api/surveys/submit                     (create submission)
  GET    /api/surveys/submissions                 (paginated list + filters)
  GET    /api/surveys/submissions/{id}            (detail by id)
  GET    /api/surveys/by-speaker/{speaker}        (grouped by survey_type)
  GET    /api/surveys/by-file/{file:path}         (all for a file)
  GET    /api/surveys/by-type/{survey_type}       (paginated by type)
  GET    /api/surveys/stats                       (aggregate statistics)
  DELETE /api/surveys/submissions/{id}            (remove submission)

Unit tests:
  transform_value()  (SDM, DCS, risk_perception, passthrough)
"""

from typing import Optional

import pytest
import pytest_asyncio

from tests.factories import TestDataFactory


# ── Helpers ──────────────────────────────────────────────────────────────────

def _survey_payload(
    survey_type: str = "baseline",
    file: str = "test-file.xlsx",
    speaker: str = "Patient_1",
    answers: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> dict:
    """Build a JSON body for POST /submit."""
    body: dict = {
        "survey_type": survey_type,
        "file": file,
        "speaker": speaker,
        "answers": answers if answers is not None else {"q1": "yes", "q2": "no"},
    }
    if metadata is not None:
        body["metadata"] = metadata
    return body


async def _seed_submissions(db, count: int = 1, **kwargs):
    """Insert survey submissions into the DB and return the list of ORM objects."""
    records = []
    for idx in range(count):
        defaults = {
            "file": kwargs.get("file", f"file-{idx}.xlsx"),
            "speaker": kwargs.get("speaker", "Patient_1"),
            "survey_type": kwargs.get("survey_type", "baseline"),
            "answers": kwargs.get("answers", '{"q1": "a"}'),
        }
        # Allow per-item overrides by making file unique when not explicitly set
        rec = TestDataFactory.survey_submission(**defaults)
        db.add(rec)
        records.append(rec)
    await db.commit()
    for r in records:
        await db.refresh(r)
    return records


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/surveys/submit
# ══════════════════════════════════════════════════════════════════════════════

class TestSubmitSurvey:
    """POST /api/surveys/submit"""

    @pytest_asyncio.fixture(autouse=True)
    async def _seed_parent(self, db):
        # submit_survey resolves a patient_summary parent (FK guard in
        # patient_lookup.resolve_patient_summary_file); seed the default
        # (file, speaker) so the endpoint can attach the survey.
        db.add(TestDataFactory.patient_summary())
        await db.commit()

    async def test_submit_baseline_returns_200(self, client, api_headers):
        resp = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(),
            headers=api_headers,
        )
        assert resp.status_code == 200

    async def test_response_includes_expected_fields(self, client, api_headers):
        resp = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(),
            headers=api_headers,
        )
        data = resp.json()
        assert data["status"] == "received"
        assert data["survey_type"] == "baseline"
        assert data["file"] == "test-file.xlsx"
        assert data["speaker"] == "Patient_1"
        assert data["answer_count"] == 2
        assert "received_at" in data
        assert "db" in data
        assert data["db"]["saved"] is True
        assert "redcap" in data

    async def test_saved_to_db(self, client, api_headers, db):
        resp = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(answers={"color": "blue"}),
            headers=api_headers,
        )
        record_id = resp.json()["db"]["id"]

        from sqlalchemy import select
        from models import PatientSurveySubmissionLog

        result = await db.execute(
            select(PatientSurveySubmissionLog).where(PatientSurveySubmissionLog.id == record_id)
        )
        row = result.scalar_one_or_none()
        assert row is not None
        # JSONB columns deserialise to Python dict at the ORM layer, so
        # row.answers is already a dict here — no json.loads needed.
        assert row.answers == {"color": "blue"}

    async def test_different_survey_types_accepted(self, client, api_headers):
        for st in ("sdm", "dcs", "risk_perception", "satisfaction"):
            resp = await client.post(
                "/api/surveys/submit",
                json=_survey_payload(survey_type=st),
                headers=api_headers,
            )
            assert resp.status_code == 200
            assert resp.json()["survey_type"] == st

    async def test_empty_answers_dict_accepted(self, client, api_headers):
        resp = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(answers={}),
            headers=api_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["answer_count"] == 0

    async def test_missing_required_field_returns_422(self, client, api_headers):
        body = {"survey_type": "baseline", "file": "f.xlsx"}
        resp = await client.post(
            "/api/surveys/submit", json=body, headers=api_headers
        )
        assert resp.status_code == 422

    async def test_no_auth_returns_403(self, client):
        resp = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(),
        )
        assert resp.status_code == 403

    async def test_metadata_is_optional(self, client, api_headers, db):
        from sqlalchemy import select
        from models import PatientSurveySubmissionLog

        async def _extra_data(resp):
            result = await db.execute(
                select(PatientSurveySubmissionLog).where(
                    PatientSurveySubmissionLog.id == resp.json()["db"]["id"]
                )
            )
            return result.scalar_one().extra_data

        # Without metadata → uniform default {partial: false}.
        resp1 = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(),
            headers=api_headers,
        )
        assert resp1.status_code == 200
        assert await _extra_data(resp1) == {"partial": False}

        # With metadata → client keys preserved, partial defaulted to false.
        resp2 = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(metadata={"source": "mobile"}),
            headers=api_headers,
        )
        assert resp2.status_code == 200
        assert await _extra_data(resp2) == {"source": "mobile", "partial": False}

        # An explicit progress-save (partial: true) is preserved.
        resp3 = await client.post(
            "/api/surveys/submit",
            json=_survey_payload(metadata={"partial": True}),
            headers=api_headers,
        )
        assert resp3.status_code == 200
        assert await _extra_data(resp3) == {"partial": True}


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/submissions
# ══════════════════════════════════════════════════════════════════════════════

class TestGetSubmissions:
    """GET /api/surveys/submissions"""

    async def test_empty_db_returns_empty_list(self, client, api_headers):
        resp = await client.get("/api/surveys/submissions", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["data"] == []

    async def test_returns_seeded_submissions(self, client, api_headers, db):
        await _seed_submissions(db, count=3, file="same.xlsx")
        resp = await client.get("/api/surveys/submissions", headers=api_headers)
        data = resp.json()
        assert data["total"] == 3
        assert len(data["data"]) == 3

    async def test_pagination_works(self, client, api_headers, db):
        await _seed_submissions(db, count=5)
        resp = await client.get(
            "/api/surveys/submissions",
            params={"page": 2, "size": 2},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 5
        assert data["page"] == 2
        assert data["size"] == 2
        assert len(data["data"]) == 2

    async def test_has_next_has_prev_logic(self, client, api_headers, db):
        await _seed_submissions(db, count=5)

        # Page 1 of 3 (size=2): has_next=True, has_prev=False
        r1 = await client.get(
            "/api/surveys/submissions",
            params={"page": 1, "size": 2},
            headers=api_headers,
        )
        d1 = r1.json()
        assert d1["has_next"] is True
        assert d1["has_prev"] is False

        # Page 2 of 3 (size=2): has_next=True, has_prev=True
        r2 = await client.get(
            "/api/surveys/submissions",
            params={"page": 2, "size": 2},
            headers=api_headers,
        )
        d2 = r2.json()
        assert d2["has_next"] is True
        assert d2["has_prev"] is True

        # Page 3 of 3 (size=2): has_next=False, has_prev=True
        r3 = await client.get(
            "/api/surveys/submissions",
            params={"page": 3, "size": 2},
            headers=api_headers,
        )
        d3 = r3.json()
        assert d3["has_next"] is False
        assert d3["has_prev"] is True

    async def test_filter_by_file(self, client, api_headers, db):
        await _seed_submissions(db, count=1, file="target.xlsx")
        await _seed_submissions(db, count=1, file="other.xlsx")
        resp = await client.get(
            "/api/surveys/submissions",
            params={"file": "target.xlsx"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["file"] == "target.xlsx"

    async def test_filter_by_survey_type(self, client, api_headers, db):
        await _seed_submissions(db, count=1, file="a.xlsx", survey_type="dcs")
        await _seed_submissions(db, count=1, file="b.xlsx", survey_type="sdm")
        resp = await client.get(
            "/api/surveys/submissions",
            params={"survey_type": "dcs"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["survey_type"] == "dcs"

    async def test_filter_by_speaker(self, client, api_headers, db):
        await _seed_submissions(db, count=1, file="a.xlsx", speaker="Alice")
        await _seed_submissions(db, count=1, file="b.xlsx", speaker="Bob")
        resp = await client.get(
            "/api/surveys/submissions",
            params={"speaker": "Alice"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["speaker"] == "Alice"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/submissions")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/submissions/{submission_id}
# ══════════════════════════════════════════════════════════════════════════════

class TestGetSubmissionById:
    """GET /api/surveys/submissions/{submission_id}"""

    async def test_returns_404_for_nonexistent_id(self, client, api_headers):
        resp = await client.get(
            "/api/surveys/submissions/99999", headers=api_headers
        )
        assert resp.status_code == 404

    async def test_returns_correct_submission(self, client, api_headers, db):
        records = await _seed_submissions(db, count=1, file="detail.xlsx")
        rid = records[0].id
        resp = await client.get(
            f"/api/surveys/submissions/{rid}", headers=api_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == rid
        assert data["file"] == "detail.xlsx"

    async def test_response_shape(self, client, api_headers, db):
        records = await _seed_submissions(db, count=1)
        rid = records[0].id
        resp = await client.get(
            f"/api/surveys/submissions/{rid}", headers=api_headers
        )
        data = resp.json()
        for key in ("id", "file", "speaker", "survey_type", "answers",
                     "extra_data", "submitted_at", "redcap_synced",
                     "redcap_record_id", "redcap_error"):
            assert key in data, f"Missing key: {key}"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/submissions/1")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/by-speaker/{speaker}
# ══════════════════════════════════════════════════════════════════════════════

class TestGetBySpeaker:
    """GET /api/surveys/by-speaker/{speaker}"""

    async def test_returns_grouped_by_survey_type(self, client, api_headers, db):
        await _seed_submissions(db, count=1, file="a.xlsx", speaker="Pat1", survey_type="dcs")
        await _seed_submissions(db, count=1, file="b.xlsx", speaker="Pat1", survey_type="sdm")
        resp = await client.get(
            "/api/surveys/by-speaker/Pat1", headers=api_headers
        )
        data = resp.json()
        assert set(data["survey_types"]) == {"dcs", "sdm"}
        assert "dcs" in data["submissions_by_type"]
        assert "sdm" in data["submissions_by_type"]

    async def test_empty_results(self, client, api_headers):
        resp = await client.get(
            "/api/surveys/by-speaker/nobody", headers=api_headers
        )
        data = resp.json()
        assert data["total_submissions"] == 0
        assert data["survey_types"] == []
        assert data["submissions_by_type"] == {}

    async def test_multiple_survey_types_for_same_speaker(self, client, api_headers, db):
        for st in ("dcs", "sdm", "satisfaction"):
            await _seed_submissions(
                db, count=1, file=f"f-{st}.xlsx", speaker="Pat2", survey_type=st
            )
        resp = await client.get(
            "/api/surveys/by-speaker/Pat2", headers=api_headers
        )
        data = resp.json()
        assert data["total_submissions"] == 3
        assert len(data["survey_types"]) == 3

    async def test_response_shape(self, client, api_headers, db):
        await _seed_submissions(db, count=1, speaker="ShapeP")
        resp = await client.get(
            "/api/surveys/by-speaker/ShapeP", headers=api_headers
        )
        data = resp.json()
        for key in ("speaker", "total_submissions", "survey_types", "submissions_by_type"):
            assert key in data, f"Missing key: {key}"

    async def test_rows_expose_extra_data(self, client, api_headers, db):
        # The client uses extra_data.partial to tell partial auto-saves from final
        # submits when restoring survey state, so each row must carry extra_data.
        await _seed_submissions(db, count=1, speaker="ExtraP", survey_type="sdm")
        resp = await client.get(
            "/api/surveys/by-speaker/ExtraP", headers=api_headers
        )
        row = resp.json()["submissions_by_type"]["sdm"][0]
        assert "extra_data" in row

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/by-speaker/anyone")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/by-file/{file:path}
# ══════════════════════════════════════════════════════════════════════════════

class TestGetByFile:
    """GET /api/surveys/by-file/{file:path}"""

    async def test_returns_submissions_for_file(self, client, api_headers, db):
        await _seed_submissions(db, count=2, file="target.xlsx")
        await _seed_submissions(db, count=1, file="other.xlsx")
        resp = await client.get(
            "/api/surveys/by-file/target.xlsx", headers=api_headers
        )
        data = resp.json()
        assert data["file"] == "target.xlsx"
        assert data["total_submissions"] == 2

    async def test_empty_results(self, client, api_headers):
        resp = await client.get(
            "/api/surveys/by-file/nonexistent.xlsx", headers=api_headers
        )
        data = resp.json()
        assert data["total_submissions"] == 0
        assert data["data"] == []

    async def test_response_shape(self, client, api_headers, db):
        await _seed_submissions(db, count=1, file="shape.xlsx")
        resp = await client.get(
            "/api/surveys/by-file/shape.xlsx", headers=api_headers
        )
        data = resp.json()
        for key in ("file", "total_submissions", "data"):
            assert key in data, f"Missing key: {key}"
        sub = data["data"][0]
        for key in ("id", "speaker", "survey_type", "answers", "submitted_at", "redcap_synced"):
            assert key in sub, f"Missing submission key: {key}"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/by-file/any.xlsx")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/by-type/{survey_type}
# ══════════════════════════════════════════════════════════════════════════════

class TestGetByType:
    """GET /api/surveys/by-type/{survey_type}"""

    async def test_returns_submissions_of_given_type(self, client, api_headers, db):
        await _seed_submissions(db, count=2, file="a.xlsx", survey_type="dcs")
        await _seed_submissions(db, count=1, file="b.xlsx", survey_type="sdm")
        resp = await client.get(
            "/api/surveys/by-type/dcs", headers=api_headers
        )
        data = resp.json()
        assert data["survey_type"] == "dcs"
        assert data["total"] == 2
        assert len(data["data"]) == 2

    async def test_pagination(self, client, api_headers, db):
        for idx in range(5):
            await _seed_submissions(
                db, count=1, file=f"f-{idx}.xlsx", survey_type="sdm"
            )
        resp = await client.get(
            "/api/surveys/by-type/sdm",
            params={"page": 2, "size": 2},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 5
        assert data["page"] == 2
        assert data["size"] == 2
        assert len(data["data"]) == 2

    async def test_response_shape(self, client, api_headers, db):
        await _seed_submissions(db, count=1, survey_type="dcs")
        resp = await client.get("/api/surveys/by-type/dcs", headers=api_headers)
        data = resp.json()
        for key in ("survey_type", "total", "page", "size", "data"):
            assert key in data, f"Missing key: {key}"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/by-type/dcs")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/stats
# ══════════════════════════════════════════════════════════════════════════════

class TestGetStats:
    """GET /api/surveys/stats"""

    async def test_empty_db_stats(self, client, api_headers):
        resp = await client.get("/api/surveys/stats", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_submissions"] == 0

    async def test_stats_with_data(self, client, api_headers, db):
        await _seed_submissions(db, count=2, file="f1.xlsx", survey_type="dcs", speaker="P1")
        await _seed_submissions(db, count=1, file="f2.xlsx", survey_type="sdm", speaker="P2")
        resp = await client.get("/api/surveys/stats", headers=api_headers)
        data = resp.json()
        assert data["total_submissions"] == 3
        assert data["by_survey_type"]["dcs"] == 2
        assert data["by_survey_type"]["sdm"] == 1

    async def test_response_shape(self, client, api_headers, db):
        await _seed_submissions(db, count=1)
        resp = await client.get("/api/surveys/stats", headers=api_headers)
        data = resp.json()
        for key in ("total_submissions", "unique_speakers", "unique_files",
                     "redcap_synced", "redcap_pending", "by_survey_type",
                     "recent_submissions"):
            assert key in data, f"Missing key: {key}"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/stats")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# DELETE /api/surveys/submissions/{submission_id}
# ══════════════════════════════════════════════════════════════════════════════

class TestDeleteSubmission:
    """DELETE /api/surveys/submissions/{submission_id}"""

    async def test_delete_existing_returns_200(self, client, api_headers, db):
        records = await _seed_submissions(db, count=1)
        rid = records[0].id
        resp = await client.delete(
            f"/api/surveys/submissions/{rid}", headers=api_headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

    async def test_delete_nonexistent_returns_404(self, client, api_headers):
        resp = await client.delete(
            "/api/surveys/submissions/99999", headers=api_headers
        )
        assert resp.status_code == 404

    async def test_actually_removes_from_db(self, client, api_headers, db):
        records = await _seed_submissions(db, count=1)
        rid = records[0].id

        await client.delete(
            f"/api/surveys/submissions/{rid}", headers=api_headers
        )

        # Verify gone
        resp = await client.get(
            f"/api/surveys/submissions/{rid}", headers=api_headers
        )
        assert resp.status_code == 404

    async def test_no_auth_returns_403(self, client):
        resp = await client.delete("/api/surveys/submissions/1")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# Unit tests: transform_value()
# ══════════════════════════════════════════════════════════════════════════════

class TestTransformValue:
    """Unit tests for the transform_value helper in routes_surveys."""

    async def test_sdm_yes_no_to_1_0(self):
        from routes_surveys import transform_value
        assert transform_value("sdm", "q1", "yes") == "1"
        assert transform_value("sdm", "q1", "no") == "0"
        assert transform_value("sdm", "q4", "Yes") == "1"
        assert transform_value("sdm", "q4", "No") == "0"

    async def test_dcs_0_4_to_1_5(self):
        from routes_surveys import transform_value
        assert transform_value("dcs", "q1", 0) == "1"
        assert transform_value("dcs", "q1", 1) == "2"
        assert transform_value("dcs", "q1", 4) == "5"

    async def test_risk_perception_passthrough(self):
        from routes_surveys import transform_value
        # Currently risk_perception has no active transformations
        result = transform_value("risk_perception", "cancerRiskUntreated", "50")
        assert result == "50"

    async def test_passthrough_for_unknown(self):
        from routes_surveys import transform_value
        assert transform_value("satisfaction", "feedbackText", "great") == "great"
        assert transform_value("unknown_type", "field", "val") == "val"


# ══════════════════════════════════════════════════════════════════════════════
# REDCap overwriteBehavior: free-text (satisfaction) must clear on blank re-submit
# ══════════════════════════════════════════════════════════════════════════════

class TestRedcapOverwriteBehavior:
    """Free-text surveys sync with overwriteBehavior='overwrite' so clearing the
    text blanks it in REDCap; radio/scale surveys keep 'normal'.

    Mocks import_to_redcap_record so we assert the overwrite_behavior it is called
    with (the real POST + verify re-read is not exercised here)."""

    @pytest_asyncio.fixture(autouse=True)
    async def _seed_parent(self, db):
        db.add(TestDataFactory.patient_summary())
        await db.commit()

    @pytest.fixture
    def _capture_redcap(self, monkeypatch):
        import routes_surveys
        monkeypatch.setattr(routes_surveys, "REDCAP_ENABLED", True)

        async def _resolve(_sid):
            return "3"
        monkeypatch.setattr(routes_surveys, "resolve_record_id", _resolve)

        captured: dict = {}

        async def _fake_import_record(record_id, import_data, overwrite_behavior="normal"):
            captured["overwrite_behavior"] = overwrite_behavior
            captured["data"] = import_data.model_dump(exclude_none=True)
            return {"status": "success"}
        monkeypatch.setattr(routes_surveys, "import_to_redcap_record", _fake_import_record)
        return captured

    @pytest.mark.asyncio
    async def test_satisfaction_blank_uses_overwrite(self, client, api_headers, _capture_redcap):
        # Clearing the free-text and re-submitting must use overwriteBehavior=overwrite
        # AND include the (empty) field so REDCap actually clears it.
        resp = await client.post("/api/surveys/submit", headers=api_headers,
            json=_survey_payload(survey_type="satisfaction", answers={"feedbackText": ""}))
        assert resp.status_code == 200, resp.text
        assert _capture_redcap["overwrite_behavior"] == "overwrite"
        assert _capture_redcap["data"].get("pt_satisfaction") == ""

    @pytest.mark.asyncio
    async def test_radio_survey_uses_normal(self, client, api_headers, _capture_redcap):
        # A radio/scale survey (sdm) keeps overwriteBehavior=normal (unchanged).
        resp = await client.post("/api/surveys/submit", headers=api_headers,
            json=_survey_payload(survey_type="sdm", answers={"q1": "no"}))
        assert resp.status_code == 200, resp.text
        assert _capture_redcap["overwrite_behavior"] == "normal"
