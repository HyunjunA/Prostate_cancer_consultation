"""Tests for doctor interface CRUD endpoints.

Endpoints tested:
  GET  /api/doctor/sentences/{file}/{speaker}     (sentences for file+speaker, class != -1)
  GET  /api/doctor/rewrites                       (paginated rewrite history, optional filters)
  PUT  /api/doctor/rewrites                       (create new DoctorRewriteLog record)
  GET  /api/doctor/rewrites/{file}/{i}/{i2}/history  (revision history for a sentence)
  GET  /api/doctor/rewrites/{file}/{i}/{i2}/{class_} (specific rewrite by composite key)
  GET  /api/doctor/files                          (distinct files from DoctorSentenceView)
  GET  /api/doctor/scores/average                 (average scores with optional filters)
  GET  /api/stats/dashboard                       (dashboard stats from doctor + patient tables)
"""

from datetime import datetime, timezone, timedelta

from tests.factories import TestDataFactory


# ── GET /api/doctor/sentences/{file}/{speaker} ───────────────────────────────

class TestGetDoctorSentences:
    """GET /api/doctor/sentences/{file}/{speaker}"""

    async def test_returns_404_when_db_is_empty(self, client, api_headers):
        resp = await client.get(
            "/api/doctor/sentences/nonexistent.xlsx/Interviewer",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_returns_sentences_for_valid_file_and_speaker(self, client, db, api_headers):
        sentences = TestDataFactory.doctor_sentence_set(
            file="alpha.xlsx", count=3, speaker="Interviewer", class_="Cancer Prognosis",
        )
        db.add_all(sentences)
        await db.commit()

        resp = await client.get(
            "/api/doctor/sentences/alpha.xlsx/Interviewer",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["file"] == "alpha.xlsx"
        assert body["speaker"] == "Interviewer"
        assert body["total"] == 3
        assert len(body["data"]) == 3

    async def test_excludes_sentences_with_class_minus_one(self, client, db, api_headers):
        valid = TestDataFactory.doctor_sentence(file="f.xlsx", i=1, i2=1, class_="Cancer Prognosis")
        invalid = TestDataFactory.doctor_sentence(file="f.xlsx", i=2, i2=1, class_="-1")
        db.add_all([valid, invalid])
        await db.commit()

        resp = await client.get("/api/doctor/sentences/f.xlsx/Interviewer", headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["data"][0]["i"] == 1

    async def test_orders_by_i_then_i2(self, client, db, api_headers):
        s1 = TestDataFactory.doctor_sentence(file="ord.xlsx", i=2, i2=1)
        s2 = TestDataFactory.doctor_sentence(file="ord.xlsx", i=1, i2=2)
        s3 = TestDataFactory.doctor_sentence(file="ord.xlsx", i=1, i2=1)
        db.add_all([s1, s2, s3])
        await db.commit()

        resp = await client.get("/api/doctor/sentences/ord.xlsx/Interviewer", headers=api_headers)
        body = resp.json()
        indices = [(d["i"], d["i2"]) for d in body["data"]]
        assert indices == [(1, 1), (1, 2), (2, 1)]

    async def test_response_shape(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="shape.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/doctor/sentences/shape.xlsx/Interviewer", headers=api_headers)
        body = resp.json()
        row = body["data"][0]
        assert "i" in row
        assert "i2" in row
        assert "sentence" in row
        assert "score" in row
        assert "class" in row
        assert "time" in row

    async def test_returns_404_for_wrong_speaker(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="sp.xlsx", speaker="Interviewer"))
        await db.commit()

        resp = await client.get("/api/doctor/sentences/sp.xlsx/Patient_1", headers=api_headers)
        assert resp.status_code == 404

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/doctor/sentences/any.xlsx/Interviewer")
        assert resp.status_code == 403


# ── GET /api/doctor/rewrites ─────────────────────────────────────────────────

class TestGetDoctorRewrites:
    """GET /api/doctor/rewrites — paginated rewrite history with optional filters."""

    async def test_returns_empty_list_when_db_is_empty(self, client, api_headers):
        resp = await client.get("/api/doctor/rewrites", headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["data"] == []

    async def test_returns_rewrites_with_data(self, client, db, api_headers):
        # FK requires the parent sentence to exist first
        db.add(TestDataFactory.doctor_sentence(file="rw.xlsx", i=1, i2=1))
        await db.commit()
        db.add(TestDataFactory.doctor_rewrite(file="rw.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/doctor/rewrites", headers=api_headers)
        body = resp.json()
        assert body["total"] == 1
        assert len(body["data"]) == 1

    async def test_pagination_skip_and_limit(self, client, db, api_headers):
        # Create parent sentence
        db.add(TestDataFactory.doctor_sentence(file="pg.xlsx", i=1, i2=1))
        await db.commit()

        # Create 5 rewrites with distinct times
        base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for idx in range(5):
            rw = TestDataFactory.doctor_rewrite(file="pg.xlsx", i=1, i2=1)
            rw.time = base_time + timedelta(seconds=idx)
            db.add(rw)
        await db.commit()

        resp = await client.get("/api/doctor/rewrites?skip=2&limit=2", headers=api_headers)
        body = resp.json()
        assert body["total"] == 5
        assert body["skip"] == 2
        assert body["limit"] == 2
        assert len(body["data"]) == 2

    async def test_filter_by_file(self, client, db, api_headers):
        s1 = TestDataFactory.doctor_sentence(file="a.xlsx", i=1, i2=1)
        s2 = TestDataFactory.doctor_sentence(file="b.xlsx", i=1, i2=1)
        db.add_all([s1, s2])
        await db.commit()

        rw1 = TestDataFactory.doctor_rewrite(file="a.xlsx", i=1, i2=1)
        rw2 = TestDataFactory.doctor_rewrite(file="b.xlsx", i=1, i2=1)
        db.add_all([rw1, rw2])
        await db.commit()

        resp = await client.get("/api/doctor/rewrites?file=a.xlsx", headers=api_headers)
        body = resp.json()
        assert body["total"] == 1
        assert body["data"][0]["file"] == "a.xlsx"

    async def test_response_shape(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="rs.xlsx", i=1, i2=1))
        await db.commit()
        db.add(TestDataFactory.doctor_rewrite(file="rs.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/doctor/rewrites", headers=api_headers)
        body = resp.json()
        assert "total" in body
        assert "skip" in body
        assert "limit" in body
        assert "data" in body
        row = body["data"][0]
        for key in ("file", "i", "i2", "speaker", "time", "original_sentence",
                     "revised_sentence", "score", "class"):
            assert key in row, f"Missing key: {key}"

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/doctor/rewrites")
        assert resp.status_code == 403


# ── PUT /api/doctor/rewrites ─────────────────────────────────────────────────

class TestPutDoctorRewrites:
    """PUT /api/doctor/rewrites — create a new DoctorRewriteLog record."""

    async def test_creates_rewrite_for_existing_file(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="put.xlsx", i=1, i2=1))
        await db.commit()

        payload = {
            "file": "put.xlsx",
            "i": 1,
            "i2": 1,
            "speaker": "Interviewer",
            "time": "2026-01-15T10:00:00Z",
            "original_sentence": "Original text.",
            "revised_sentence": "Revised text.",
            "score": 0.65,
            "class_": "Cancer Prognosis",
        }
        resp = await client.put("/api/doctor/rewrites", json=payload, headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["file"] == "put.xlsx"
        assert body["revised_sentence"] == "Revised text."
        assert body["class"] == "Cancer Prognosis"

    async def test_returns_404_for_nonexistent_file(self, client, api_headers):
        payload = {
            "file": "ghost.xlsx",
            "i": 1,
            "i2": 1,
            "speaker": "Interviewer",
            "original_sentence": "Original.",
            "revised_sentence": "Revised.",
            "class_": "Cancer Prognosis",
        }
        resp = await client.put("/api/doctor/rewrites", json=payload, headers=api_headers)
        assert resp.status_code == 404

    async def test_explicit_time_is_stored(self, client, db, api_headers):
        """When time is provided in the payload, it should be stored and returned."""
        db.add(TestDataFactory.doctor_sentence(file="tdef.xlsx", i=1, i2=1))
        await db.commit()

        payload = {
            "file": "tdef.xlsx",
            "i": 1,
            "i2": 1,
            "speaker": "Interviewer",
            "time": "2026-03-01T12:30:00Z",
            "original_sentence": "Original.",
            "revised_sentence": "Revised.",
            "class_": "Cancer Prognosis",
        }
        resp = await client.put("/api/doctor/rewrites", json=payload, headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["time"] is not None

    async def test_score_is_optional(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="nosc.xlsx", i=1, i2=1))
        await db.commit()

        payload = {
            "file": "nosc.xlsx",
            "i": 1,
            "i2": 1,
            "speaker": "Interviewer",
            "time": "2026-04-01T08:00:00Z",
            "original_sentence": "Original.",
            "revised_sentence": "Revised.",
            "class_": "Cancer Prognosis",
            # score intentionally omitted
        }
        resp = await client.put("/api/doctor/rewrites", json=payload, headers=api_headers)
        assert resp.status_code == 200
        assert resp.json()["score"] is None

    async def test_response_shape(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="putshape.xlsx", i=1, i2=1))
        await db.commit()

        payload = {
            "file": "putshape.xlsx",
            "i": 1,
            "i2": 1,
            "speaker": "Interviewer",
            "time": "2026-05-01T09:00:00Z",
            "original_sentence": "Orig.",
            "revised_sentence": "Rev.",
            "score": 0.5,
            "class_": "Life Expectancy",
        }
        resp = await client.put("/api/doctor/rewrites", json=payload, headers=api_headers)
        body = resp.json()
        for key in ("file", "i", "i2", "speaker", "time", "original_sentence",
                     "revised_sentence", "score", "class"):
            assert key in body, f"Missing key: {key}"

    async def test_requires_authentication(self, client):
        payload = {
            "file": "auth.xlsx",
            "i": 1,
            "i2": 1,
            "speaker": "Interviewer",
            "time": "2026-06-01T10:00:00Z",
            "original_sentence": "Orig.",
            "revised_sentence": "Rev.",
            "class_": "CP",
        }
        resp = await client.put("/api/doctor/rewrites", json=payload)
        assert resp.status_code == 403


# ── GET /api/doctor/rewrites/{file}/{i}/{i2}/history ─────────────────────────

class TestGetDoctorRewriteHistory:
    """GET /api/doctor/rewrites/{file}/{i}/{i2}/history"""

    async def test_returns_404_when_no_history(self, client, api_headers):
        resp = await client.get(
            "/api/doctor/rewrites/missing.xlsx/1/1/history",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_returns_history_for_existing_rewrites(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="hist.xlsx", i=1, i2=1))
        await db.commit()

        base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for idx in range(3):
            rw = TestDataFactory.doctor_rewrite(
                file="hist.xlsx", i=1, i2=1,
                revised_sentence=f"Revision {idx + 1}",
            )
            rw.time = base_time + timedelta(hours=idx)
            db.add(rw)
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/hist.xlsx/1/1/history",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_revisions"] == 3
        assert len(body["history"]) == 3

    async def test_history_ordered_oldest_to_newest(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="ord2.xlsx", i=1, i2=1))
        await db.commit()

        base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)
        for idx in range(3):
            rw = TestDataFactory.doctor_rewrite(file="ord2.xlsx", i=1, i2=1)
            rw.time = base_time + timedelta(hours=idx)
            db.add(rw)
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/ord2.xlsx/1/1/history",
            headers=api_headers,
        )
        body = resp.json()
        revision_numbers = [h["revision_number"] for h in body["history"]]
        assert revision_numbers == [1, 2, 3]

    async def test_response_shape(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="hshape.xlsx", i=5, i2=2))
        await db.commit()
        rw = TestDataFactory.doctor_rewrite(file="hshape.xlsx", i=5, i2=2)
        db.add(rw)
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/hshape.xlsx/5/2/history",
            headers=api_headers,
        )
        body = resp.json()
        assert body["file"] == "hshape.xlsx"
        assert body["i"] == 5
        assert body["i2"] == 2
        assert "speaker" in body
        assert "class" in body
        assert "original_sentence" in body
        assert "original_score" in body
        assert "total_revisions" in body
        assert "history" in body
        entry = body["history"][0]
        for key in ("revision_number", "time", "revised_sentence", "score", "class"):
            assert key in entry, f"Missing key in history entry: {key}"

    async def test_includes_original_score_from_sentence_view(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="oscore.xlsx", i=1, i2=1, score=0.92))
        await db.commit()
        db.add(TestDataFactory.doctor_rewrite(file="oscore.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/oscore.xlsx/1/1/history",
            headers=api_headers,
        )
        body = resp.json()
        assert body["original_score"] == 0.92

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/doctor/rewrites/any.xlsx/1/1/history")
        assert resp.status_code == 403


# ── GET /api/doctor/rewrites/{file}/{i}/{i2}/{class_} ────────────────────────

class TestGetDoctorRewriteByKey:
    """GET /api/doctor/rewrites/{file}/{i}/{i2}/{class_}"""

    async def test_returns_404_when_not_found(self, client, api_headers):
        resp = await client.get(
            "/api/doctor/rewrites/nope.xlsx/1/1/Cancer Prognosis",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_returns_rewrite_by_composite_key(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="key.xlsx", i=3, i2=2))
        await db.commit()
        rw = TestDataFactory.doctor_rewrite(
            file="key.xlsx", i=3, i2=2, class_="Life Expectancy",
        )
        db.add(rw)
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/key.xlsx/3/2/Life Expectancy",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["file"] == "key.xlsx"
        assert body["i"] == 3
        assert body["i2"] == 2
        assert body["class"] == "Life Expectancy"

    async def test_wrong_class_returns_404(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="wc.xlsx", i=1, i2=1))
        await db.commit()
        rw = TestDataFactory.doctor_rewrite(file="wc.xlsx", i=1, i2=1, class_="Cancer Prognosis")
        db.add(rw)
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/wc.xlsx/1/1/Life Expectancy",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_response_shape(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="kshape.xlsx", i=1, i2=1))
        await db.commit()
        db.add(TestDataFactory.doctor_rewrite(file="kshape.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get(
            "/api/doctor/rewrites/kshape.xlsx/1/1/Cancer Prognosis",
            headers=api_headers,
        )
        body = resp.json()
        for key in ("file", "i", "i2", "speaker", "time", "original_sentence",
                     "revised_sentence", "score", "class"):
            assert key in body, f"Missing key: {key}"

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/doctor/rewrites/any.xlsx/1/1/Cancer Prognosis")
        assert resp.status_code == 403


# ── GET /api/doctor/files ────────────────────────────────────────────────────

class TestGetDoctorFiles:
    """GET /api/doctor/files"""

    async def test_returns_empty_list_when_db_is_empty(self, client, api_headers):
        resp = await client.get("/api/doctor/files", headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["files"] == []

    async def test_returns_distinct_files(self, client, db, api_headers):
        # Same file, different i values
        s1 = TestDataFactory.doctor_sentence(file="one.xlsx", i=1, i2=1)
        s2 = TestDataFactory.doctor_sentence(file="one.xlsx", i=2, i2=1)
        s3 = TestDataFactory.doctor_sentence(file="two.xlsx", i=1, i2=1)
        db.add_all([s1, s2, s3])
        await db.commit()

        resp = await client.get("/api/doctor/files", headers=api_headers)
        body = resp.json()
        assert sorted(body["files"]) == ["one.xlsx", "two.xlsx"]

    async def test_files_are_sorted_alphabetically(self, client, db, api_headers):
        for name in ["charlie.xlsx", "alpha.xlsx", "bravo.xlsx"]:
            db.add(TestDataFactory.doctor_sentence(file=name, i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/doctor/files", headers=api_headers)
        body = resp.json()
        assert body["files"] == ["alpha.xlsx", "bravo.xlsx", "charlie.xlsx"]

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/doctor/files")
        assert resp.status_code == 403


# ── GET /api/doctor/scores/average ───────────────────────────────────────────

class TestGetDoctorScoresAverage:
    """GET /api/doctor/scores/average — with optional file/speaker/class filters."""

    async def test_returns_empty_when_db_is_empty(self, client, api_headers):
        resp = await client.get("/api/doctor/scores/average", headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_groups"] == 0
        assert body["data"] == []

    async def test_returns_average_scores_with_data(self, client, db, api_headers):
        sentences = TestDataFactory.doctor_sentence_set(
            file="avg.xlsx", count=4, speaker="Interviewer", class_="Cancer Prognosis",
        )
        db.add_all(sentences)
        await db.commit()

        resp = await client.get("/api/doctor/scores/average", headers=api_headers)
        body = resp.json()
        assert body["total_groups"] >= 1
        assert len(body["data"]) >= 1
        group = body["data"][0]
        assert group["file"] == "avg.xlsx"
        assert group["avg_score"] is not None
        assert group["count"] == 4

    async def test_filter_by_file(self, client, db, api_headers):
        db.add_all(TestDataFactory.doctor_sentence_set(file="fa.xlsx", count=2))
        db.add_all(TestDataFactory.doctor_sentence_set(file="fb.xlsx", count=2))
        await db.commit()

        resp = await client.get("/api/doctor/scores/average?file=fa.xlsx", headers=api_headers)
        body = resp.json()
        assert all(g["file"] == "fa.xlsx" for g in body["data"])

    async def test_filter_by_speaker(self, client, db, api_headers):
        db.add_all(TestDataFactory.doctor_sentence_set(file="sp.xlsx", count=2, speaker="Dr_A"))
        # Use different i values (starting at 100) to avoid PK collision
        for idx in range(2):
            s = TestDataFactory.doctor_sentence(
                file="sp.xlsx", i=100 + idx, i2=1, speaker="Dr_B",
                score=0.7, class_="Cancer Prognosis",
            )
            db.add(s)
        await db.commit()

        resp = await client.get("/api/doctor/scores/average?speaker=Dr_A", headers=api_headers)
        body = resp.json()
        assert all(g["speaker"] == "Dr_A" for g in body["data"])

    async def test_filter_by_class(self, client, db, api_headers):
        s1 = TestDataFactory.doctor_sentence(file="cl.xlsx", i=1, i2=1, class_="Cancer Prognosis")
        s2 = TestDataFactory.doctor_sentence(file="cl.xlsx", i=2, i2=1, class_="Life Expectancy")
        db.add_all([s1, s2])
        await db.commit()

        resp = await client.get(
            "/api/doctor/scores/average?class=Cancer Prognosis",
            headers=api_headers,
        )
        body = resp.json()
        assert all(g["class"] == "Cancer Prognosis" for g in body["data"])

    async def test_excludes_class_minus_one(self, client, db, api_headers):
        valid = TestDataFactory.doctor_sentence(file="exc.xlsx", i=1, i2=1, class_="Cancer Prognosis")
        invalid = TestDataFactory.doctor_sentence(file="exc.xlsx", i=2, i2=1, class_="-1")
        db.add_all([valid, invalid])
        await db.commit()

        resp = await client.get("/api/doctor/scores/average", headers=api_headers)
        body = resp.json()
        classes_returned = [g["class"] for g in body["data"]]
        assert "-1" not in classes_returned

    async def test_response_shape(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="rshape.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/doctor/scores/average", headers=api_headers)
        body = resp.json()
        assert "total_groups" in body
        assert "filters" in body
        assert "data" in body
        if body["data"]:
            group = body["data"][0]
            for key in ("file", "speaker", "class", "avg_score", "count",
                         "rewritten_count", "original_count", "min_score", "max_score"):
                assert key in group, f"Missing key: {key}"

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/doctor/scores/average")
        assert resp.status_code == 403


# ── GET /api/stats/dashboard ─────────────────────────────────────────────────

class TestGetDashboardStats:
    """GET /api/stats/dashboard — counts from doctor and patient tables."""

    async def test_returns_zeros_when_db_is_empty(self, client, api_headers):
        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["doctor_interface"]["total_sentences"] == 0
        assert body["doctor_interface"]["total_rewrites"] == 0
        assert body["doctor_interface"]["unique_files"] == 0
        assert body["patient_interface"]["total_summaries"] == 0
        assert body["patient_interface"]["unique_files"] == 0

    async def test_counts_doctor_sentences(self, client, db, api_headers):
        db.add_all(TestDataFactory.doctor_sentence_set(file="ds.xlsx", count=5))
        await db.commit()

        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        body = resp.json()
        assert body["doctor_interface"]["total_sentences"] == 5

    async def test_counts_doctor_rewrites(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="drw.xlsx", i=1, i2=1))
        await db.commit()
        db.add(TestDataFactory.doctor_rewrite(file="drw.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        body = resp.json()
        assert body["doctor_interface"]["total_rewrites"] == 1

    async def test_counts_unique_files(self, client, db, api_headers):
        db.add(TestDataFactory.doctor_sentence(file="uf1.xlsx", i=1, i2=1))
        db.add(TestDataFactory.doctor_sentence(file="uf1.xlsx", i=2, i2=1))
        db.add(TestDataFactory.doctor_sentence(file="uf2.xlsx", i=1, i2=1))
        await db.commit()

        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        body = resp.json()
        assert body["doctor_interface"]["unique_files"] == 2

    async def test_counts_patient_summaries(self, client, db, api_headers):
        db.add(TestDataFactory.patient_summary(file="ps.xlsx", speaker="Patient_1"))
        await db.commit()

        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        body = resp.json()
        assert body["patient_interface"]["total_summaries"] == 1

    async def test_patient_average_scores_null_when_no_data(self, client, api_headers):
        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        body = resp.json()
        avg = body["patient_interface"]["average_scores"]
        for key in ("class_1", "class_2", "class_3", "class_4", "class_5"):
            assert avg[key] is None

    async def test_response_shape(self, client, api_headers):
        resp = await client.get("/api/stats/dashboard", headers=api_headers)
        body = resp.json()
        assert "doctor_interface" in body
        assert "patient_interface" in body
        di = body["doctor_interface"]
        assert "total_sentences" in di
        assert "total_rewrites" in di
        assert "unique_files" in di
        pi = body["patient_interface"]
        assert "total_summaries" in pi
        assert "unique_files" in pi
        assert "average_scores" in pi

    async def test_requires_authentication(self, client):
        resp = await client.get("/api/stats/dashboard")
        assert resp.status_code == 403
