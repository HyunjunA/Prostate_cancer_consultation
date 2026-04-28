"""Tests for patient interface CRUD endpoints.

Endpoints tested:
  GET  /api/patient/summaries              (paginated list, optional filters)
  GET  /api/patient/summaries/{file}/{speaker}  (detail with scoring)
  GET  /api/patient/scoring                (list scoring data)
  PUT  /api/patient/scoring                (upsert scoring)
  GET  /api/patient/responses              (list responses)
  PUT  /api/patient/responses              (upsert responses)
  GET  /api/patient/files                  (distinct file names)
"""


from tests.factories import TestDataFactory


# ── GET /api/patient/summaries ───────────────────────────────────────────────

class TestGetPatientSummaries:
    """GET /api/patient/summaries — paginated list with optional filters."""

    async def test_empty_db_returns_empty_list(self, client, api_headers):
        resp = await client.get("/api/patient/summaries", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["data"] == []
        assert data["skip"] == 0
        assert data["limit"] == 100

    async def test_returns_seeded_summaries(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="file-A.xlsx", speaker="Patient_1"))
        db.add(TestDataFactory.patient_summary(file="file-B.xlsx", speaker="Patient_2"))
        await db.commit()

        resp = await client.get("/api/patient/summaries", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["data"]) == 2

    async def test_response_shape_has_classes_array(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary())
        await db.commit()

        resp = await client.get("/api/patient/summaries", headers=api_headers)
        item = resp.json()["data"][0]
        assert "file" in item
        assert "speaker" in item
        assert "classes" in item
        assert len(item["classes"]) == 5
        for cls in item["classes"]:
            assert "class_name" in cls

    async def test_pagination_skip(self, client, api_headers, db):
        for i in range(5):
            db.add(TestDataFactory.patient_summary(file=f"file-{i}.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries", params={"skip": 3, "limit": 10},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 5
        assert len(data["data"]) == 2  # 5 - 3 skipped = 2 remaining

    async def test_pagination_limit(self, client, api_headers, db):
        for i in range(5):
            db.add(TestDataFactory.patient_summary(file=f"file-{i}.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries", params={"limit": 2},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 5
        assert len(data["data"]) == 2
        assert data["limit"] == 2

    async def test_filter_by_file(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="target.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_summary(file="other.xlsx", speaker="P2"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries", params={"file": "target.xlsx"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["file"] == "target.xlsx"

    async def test_filter_by_speaker(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="Alice"))
        db.add(TestDataFactory.patient_summary(file="f2.xlsx", speaker="Bob"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries", params={"speaker": "Alice"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["speaker"] == "Alice"

    async def test_filter_by_file_and_speaker(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="Alice"))
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="Bob"))
        db.add(TestDataFactory.patient_summary(file="other.xlsx", speaker="Alice"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries",
            params={"file": "f.xlsx", "speaker": "Alice"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["file"] == "f.xlsx"
        assert data["data"][0]["speaker"] == "Alice"

    async def test_filter_returns_empty_when_no_match(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="exists.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries", params={"file": "nonexistent.xlsx"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 0
        assert data["data"] == []

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/patient/summaries")
        assert resp.status_code == 403

    async def test_wrong_api_key_returns_403(self, client, bad_api_headers):
        resp = await client.get("/api/patient/summaries", headers=bad_api_headers)
        assert resp.status_code == 403


# ── GET /api/patient/summaries/{file}/{speaker} ─────────────────────────────

class TestGetPatientSummaryDetail:
    """GET /api/patient/summaries/{file}/{speaker} — detail view with scoring."""

    async def test_not_found_returns_404(self, client, api_headers):
        resp = await client.get(
            "/api/patient/summaries/missing.xlsx/Nobody",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_returns_detail_without_scoring(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries/f.xlsx/P1", headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["file"] == "f.xlsx"
        assert data["speaker"] == "P1"
        assert "summary" in data
        # Without scoring, all scores should be None
        for cls in data["summary"]["classes"]:
            assert cls["score"] is None

    async def test_returns_detail_with_scoring(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_scoring(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries/f.xlsx/P1", headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        classes = data["summary"]["classes"]
        assert classes[0]["score"] == 5
        assert classes[1]["score"] == 6
        assert classes[2]["score"] == 7
        assert classes[3]["score"] == 8
        assert classes[4]["score"] == 9

    async def test_detail_response_shape(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries/f.xlsx/P1", headers=api_headers,
        )
        data = resp.json()
        assert "file" in data
        assert "speaker" in data
        summary = data["summary"]
        assert "classes" in summary
        assert len(summary["classes"]) == 5
        for cls in summary["classes"]:
            assert "class_name" in cls
            assert "score" in cls

    async def test_detail_class_names_match_factory(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get(
            "/api/patient/summaries/f.xlsx/P1", headers=api_headers,
        )
        classes = resp.json()["summary"]["classes"]
        expected_names = [
            "Cancer Prognosis", "Life Expectancy", "Erectile Dysfunction",
            "Incontinence", "Irritative Urinary Symptoms",
        ]
        actual_names = [c["class_name"] for c in classes]
        assert actual_names == expected_names


# ── GET /api/patient/scoring ─────────────────────────────────────────────────

class TestGetPatientScoring:
    """GET /api/patient/scoring — list scoring data."""

    async def test_empty_db_returns_empty_list(self, client, api_headers):
        resp = await client.get("/api/patient/scoring", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["data"] == []

    async def test_returns_scoring_with_computed_average(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_scoring(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get("/api/patient/scoring", headers=api_headers)
        data = resp.json()
        assert data["total"] == 1
        item = data["data"][0]
        assert item["file"] == "f.xlsx"
        assert item["speaker"] == "P1"
        assert item["scores"]["class_1"] == 5
        assert item["scores"]["class_2"] == 6
        assert item["scores"]["class_3"] == 7
        assert item["scores"]["class_4"] == 8
        assert item["scores"]["class_5"] == 9
        # Average of 5,6,7,8,9 = 7.0
        assert item["average"] == 7.0

    async def test_filter_by_file(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="a.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_summary(file="b.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_scoring(file="a.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_scoring(file="b.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get(
            "/api/patient/scoring", params={"file": "a.xlsx"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["file"] == "a.xlsx"

    async def test_filter_by_speaker(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_summary(file="f2.xlsx", speaker="P2"))
        db.add(TestDataFactory.patient_scoring(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_scoring(file="f2.xlsx", speaker="P2"))
        await db.commit()

        resp = await client.get(
            "/api/patient/scoring", params={"speaker": "P1"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["speaker"] == "P1"

    async def test_scoring_response_shape(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_scoring(file="f.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get("/api/patient/scoring", headers=api_headers)
        item = resp.json()["data"][0]
        assert "file" in item
        assert "speaker" in item
        assert "scores" in item
        assert "average" in item
        scores = item["scores"]
        for key in ("class_1", "class_2", "class_3", "class_4", "class_5"):
            assert key in scores


# ── PUT /api/patient/scoring ─────────────────────────────────────────────────

class TestUpdatePatientScoring:
    """PUT /api/patient/scoring — upsert scoring record."""

    async def test_create_new_scoring(self, client, api_headers, db):
        # FK requires PatientSummary to exist first
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/scoring",
            json={
                "file": "f.xlsx",
                "speaker": "P1",
                "class_1_patient_scoring": 3,
                "class_2_patient_scoring": 4,
                "class_3_patient_scoring": 5,
                "class_4_patient_scoring": 6,
                "class_5_patient_scoring": 7,
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["scores"]["class_1"] == 3
        assert data["scores"]["class_5"] == 7
        assert data["average"] == 5.0

    async def test_update_existing_scoring(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_scoring(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/scoring",
            json={
                "file": "f.xlsx",
                "speaker": "P1",
                "class_1_patient_scoring": 10,
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # class_1 updated to 10; others unchanged (6,7,8,9)
        assert data["scores"]["class_1"] == 10
        assert data["scores"]["class_2"] == 6
        # Average: (10+6+7+8+9)/5 = 8.0
        assert data["average"] == 8.0

    async def test_partial_update_only_one_field(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/scoring",
            json={
                "file": "f.xlsx",
                "speaker": "P1",
                "class_3_patient_scoring": 8,
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["scores"]["class_3"] == 8
        # Other fields remain None
        assert data["scores"]["class_1"] is None
        assert data["scores"]["class_2"] is None
        # Average based only on the one provided score
        assert data["average"] == 8.0

    async def test_scoring_put_returns_file_and_speaker(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/scoring",
            json={"file": "f.xlsx", "speaker": "P1", "class_1_patient_scoring": 5},
            headers=api_headers,
        )
        data = resp.json()
        assert data["file"] == "f.xlsx"
        assert data["speaker"] == "P1"

    async def test_no_auth_returns_403(self, client):
        resp = await client.put(
            "/api/patient/scoring",
            json={"file": "f.xlsx", "speaker": "P1", "class_1_patient_scoring": 5},
        )
        assert resp.status_code == 403


# ── GET /api/patient/responses ───────────────────────────────────────────────

class TestGetPatientResponses:
    """GET /api/patient/responses — list patient responses."""

    async def test_empty_db_returns_empty_list(self, client, api_headers):
        resp = await client.get("/api/patient/responses", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["data"] == []

    async def test_returns_seeded_responses(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_responses(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get("/api/patient/responses", headers=api_headers)
        data = resp.json()
        assert data["total"] == 1
        item = data["data"][0]
        assert item["answers"]["answer_1"] == "Answer to question 1"
        assert item["answers"]["answer_5"] == "Answer to question 5"

    async def test_filter_by_file(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="a.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_summary(file="b.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_responses(file="a.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_responses(file="b.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get(
            "/api/patient/responses", params={"file": "a.xlsx"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["file"] == "a.xlsx"

    async def test_filter_by_speaker(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_summary(file="f2.xlsx", speaker="P2"))
        db.add(TestDataFactory.patient_responses(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_responses(file="f2.xlsx", speaker="P2"))
        await db.commit()

        resp = await client.get(
            "/api/patient/responses", params={"speaker": "P2"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["total"] == 1
        assert data["data"][0]["speaker"] == "P2"

    async def test_responses_shape(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_responses(file="f.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get("/api/patient/responses", headers=api_headers)
        item = resp.json()["data"][0]
        assert "file" in item
        assert "speaker" in item
        assert "answers" in item
        for key in ("answer_1", "answer_2", "answer_3", "answer_4", "answer_5"):
            assert key in item["answers"]


# ── PUT /api/patient/responses ───────────────────────────────────────────────

class TestUpdatePatientResponses:
    """PUT /api/patient/responses — upsert patient responses."""

    async def test_create_new_responses(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/responses",
            json={
                "file": "f.xlsx",
                "speaker": "P1",
                "answer_1": "My first answer",
                "answer_2": "My second answer",
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answers"]["answer_1"] == "My first answer"
        assert data["answers"]["answer_2"] == "My second answer"
        assert data["answers"]["answer_3"] is None

    async def test_update_existing_responses(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_responses(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/responses",
            json={
                "file": "f.xlsx",
                "speaker": "P1",
                "answer_1": "Updated answer 1",
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answers"]["answer_1"] == "Updated answer 1"
        # Other answers remain unchanged from factory defaults
        assert data["answers"]["answer_2"] == "Answer to question 2"

    async def test_partial_update_only_some_fields(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/responses",
            json={
                "file": "f.xlsx",
                "speaker": "P1",
                "answer_3": "Only third",
                "answer_5": "Only fifth",
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answers"]["answer_3"] == "Only third"
        assert data["answers"]["answer_5"] == "Only fifth"
        assert data["answers"]["answer_1"] is None
        assert data["answers"]["answer_2"] is None
        assert data["answers"]["answer_4"] is None

    async def test_responses_put_returns_file_and_speaker(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="f.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.put(
            "/api/patient/responses",
            json={"file": "f.xlsx", "speaker": "P1", "answer_1": "test"},
            headers=api_headers,
        )
        data = resp.json()
        assert data["file"] == "f.xlsx"
        assert data["speaker"] == "P1"

    async def test_no_auth_returns_403(self, client):
        resp = await client.put(
            "/api/patient/responses",
            json={"file": "f.xlsx", "speaker": "P1", "answer_1": "x"},
        )
        assert resp.status_code == 403


# ── GET /api/patient/files ───────────────────────────────────────────────────

class TestGetPatientFiles:
    """GET /api/patient/files — distinct file names from PatientSummary."""

    async def test_empty_db_returns_empty_list(self, client, api_headers):
        resp = await client.get("/api/patient/files", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["files"] == []

    async def test_returns_distinct_files(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="alpha.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_summary(file="alpha.xlsx", speaker="P2"))
        db.add(TestDataFactory.patient_summary(file="beta.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get("/api/patient/files", headers=api_headers)
        data = resp.json()
        assert len(data["files"]) == 2
        assert set(data["files"]) == {"alpha.xlsx", "beta.xlsx"}

    async def test_files_sorted_alphabetically(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="zebra.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_summary(file="apple.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_summary(file="mango.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get("/api/patient/files", headers=api_headers)
        files = resp.json()["files"]
        assert files == sorted(files)

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/patient/files")
        assert resp.status_code == 403
