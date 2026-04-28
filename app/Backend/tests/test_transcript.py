"""Tests for transcript analysis API endpoints.

Endpoints tested:
  POST /api/transcript/analyze          (single file upload + pipeline)
  POST /api/transcript/analyze-batch    (multiple file upload)
  GET  /api/transcript/download/{pid}   (xlsx download, DB fallback)
  GET  /api/transcript/download-batch   (zip download for multiple patients)
  GET  /api/transcript/history/{pid}    (paginated analysis history)
  GET  /api/transcript/predictions/{pid} (sentence-level predictions query)

The NLP pipeline (analyze_transcript) is mocked in every test that calls it
because it requires the r01-nlp-classifiers Docker container. Disk I/O
(_save_xlsx) is also mocked to avoid writing to the real filesystem.
"""

from typing import Optional

from tests.factories import TestDataFactory


# ── Helpers ──────────────────────────────────────────────────────────────────

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_MOCK_MODELS = {
    "cp": [
        {"index": 1, "i": 1, "i2": 1, "speaker": "Interviewer",
         "text": "test sentence cp", "pred_1": 0.92, "context": "before. <main>test sentence cp</main> after."},
    ],
    "le": [
        {"index": 2, "i": 2, "i2": 1, "speaker": "Patient",
         "text": "test sentence le", "pred_1": 0.88, "context": "x. <main>test sentence le</main> y."},
    ],
}


def _make_xlsx_file(filename: str = "REC001 (SID 01).xlsx", content: bytes = b"fake-xlsx-content"):
    """Build the (filename, bytes, mime) tuple expected by httpx multipart uploads."""
    return (filename, content, XLSX_MIME)


async def _setup_mock_pipeline(monkeypatch, *, patient_id: str = "sid-01",
                               total_sentences: int = 10,
                               models: Optional[dict] = None,
                               xlsx_bytes: bytes = b"fake-xlsx-output",
                               raise_exc: Optional[Exception] = None):
    """Patch analyze_transcript and _save_xlsx on the routes module.

    If ``raise_exc`` is provided, the mock will raise that exception instead
    of returning a result dict.
    """
    import routes_transcript

    if raise_exc is not None:
        async def _mock_analyze(file_bytes, filename, top_n=0, context_window=3):
            raise raise_exc
    else:
        async def _mock_analyze(file_bytes, filename, top_n=0, context_window=3):
            return {
                "patient_id": patient_id,
                "total_sentences": total_sentences,
                "models": models or _MOCK_MODELS,
                "xlsx_bytes": xlsx_bytes,
            }

    monkeypatch.setattr(routes_transcript, "analyze_transcript", _mock_analyze)
    monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)


# ── POST /api/transcript/analyze ─────────────────────────────────────────────

class TestAnalyze:
    """POST /api/transcript/analyze — single file upload + NLP pipeline."""

    async def test_successful_analysis_returns_200(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch)
        resp = await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
            data={"top_n": "5", "context_window": "3"},
            headers=api_headers,
        )
        assert resp.status_code == 200

    async def test_response_includes_expected_fields(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch, patient_id="sid-42", total_sentences=55)
        resp = await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
            data={"top_n": "0", "context_window": "3"},
            headers=api_headers,
        )
        body = resp.json()
        assert body["patient_id"] == "sid-42"
        assert body["total_sentences"] == 55
        assert "models" in body
        assert body["output_file"] == "sid-42_predictions.xlsx"

    async def test_non_xlsx_file_returns_400(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch)
        resp = await client.post(
            "/api/transcript/analyze",
            files={"file": ("data.csv", b"col1,col2", "text/csv")},
            data={"top_n": "0"},
            headers=api_headers,
        )
        assert resp.status_code == 400
        assert "xlsx" in resp.json()["detail"].lower()

    async def test_no_auth_returns_403(self, client, db, monkeypatch):
        await _setup_mock_pipeline(monkeypatch)
        resp = await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
        )
        assert resp.status_code == 403

    async def test_top_n_parameter_is_passed_through(self, client, db, api_headers, monkeypatch):
        """Verify top_n reaches the pipeline and is stored in DB."""
        import routes_transcript

        captured: dict = {}

        async def _mock(file_bytes, filename, top_n=0, context_window=3):
            captured["top_n"] = top_n
            return {
                "patient_id": "sid-01",
                "total_sentences": 10,
                "models": _MOCK_MODELS,
                "xlsx_bytes": b"fake",
            }

        monkeypatch.setattr(routes_transcript, "analyze_transcript", _mock)
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
            data={"top_n": "42", "context_window": "3"},
            headers=api_headers,
        )
        assert captured["top_n"] == 42

    async def test_context_window_parameter_is_passed_through(self, client, db, api_headers, monkeypatch):
        import routes_transcript

        captured: dict = {}

        async def _mock(file_bytes, filename, top_n=0, context_window=3):
            captured["context_window"] = context_window
            return {
                "patient_id": "sid-01",
                "total_sentences": 10,
                "models": _MOCK_MODELS,
                "xlsx_bytes": b"fake",
            }

        monkeypatch.setattr(routes_transcript, "analyze_transcript", _mock)
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
            data={"top_n": "0", "context_window": "7"},
            headers=api_headers,
        )
        assert captured["context_window"] == 7

    async def test_pipeline_runtime_error_returns_500(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch, raise_exc=RuntimeError("NLP container down"))
        resp = await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
            headers=api_headers,
        )
        assert resp.status_code == 500
        assert "analysis failed" in resp.json()["detail"].lower()

    async def test_pipeline_value_error_returns_400(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch, raise_exc=ValueError("Missing 'text' column"))
        resp = await client.post(
            "/api/transcript/analyze",
            files={"file": _make_xlsx_file()},
            headers=api_headers,
        )
        assert resp.status_code == 400
        assert "text" in resp.json()["detail"].lower()


# ── POST /api/transcript/analyze-batch ────────────────────────────────────────

class TestAnalyzeBatch:
    """POST /api/transcript/analyze-batch — multiple file upload."""

    async def test_multiple_files_processed(self, client, db, api_headers, monkeypatch):
        """Two valid xlsx files both succeed."""
        import routes_transcript

        call_count = 0

        async def _mock(file_bytes, filename, top_n=0, context_window=3):
            nonlocal call_count
            call_count += 1
            pid = f"sid-{call_count:02d}"
            return {
                "patient_id": pid,
                "total_sentences": 10,
                "models": _MOCK_MODELS,
                "xlsx_bytes": b"fake",
            }

        monkeypatch.setattr(routes_transcript, "analyze_transcript", _mock)
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        resp = await client.post(
            "/api/transcript/analyze-batch",
            files=[
                ("files", _make_xlsx_file("file1.xlsx")),
                ("files", _make_xlsx_file("file2.xlsx")),
            ],
            data={"top_n": "5", "context_window": "3"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_files"] == 2
        assert body["successful"] == 2
        assert body["failed"] == 0
        assert len(body["results"]) == 2

    async def test_mix_of_success_and_failure(self, client, db, api_headers, monkeypatch):
        """First file succeeds, second file triggers a pipeline error."""
        import routes_transcript

        call_count = 0

        async def _mock(file_bytes, filename, top_n=0, context_window=3):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("bad file")
            return {
                "patient_id": "sid-01",
                "total_sentences": 10,
                "models": _MOCK_MODELS,
                "xlsx_bytes": b"fake",
            }

        monkeypatch.setattr(routes_transcript, "analyze_transcript", _mock)
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        resp = await client.post(
            "/api/transcript/analyze-batch",
            files=[
                ("files", _make_xlsx_file("good.xlsx")),
                ("files", _make_xlsx_file("bad.xlsx")),
            ],
            data={"top_n": "0"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["successful"] == 1
        assert body["failed"] == 1

    async def test_non_xlsx_file_in_batch_is_skipped(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch)
        resp = await client.post(
            "/api/transcript/analyze-batch",
            files=[
                ("files", _make_xlsx_file("good.xlsx")),
                ("files", ("notes.txt", b"plain text", "text/plain")),
            ],
            data={"top_n": "0"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["successful"] == 1
        assert body["failed"] == 1
        # The failed entry should mention xlsx
        failed_result = [r for r in body["results"] if r["status"] == "error"][0]
        assert "xlsx" in failed_result["detail"].lower()

    async def test_all_files_failing_returns_500(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch, raise_exc=RuntimeError("all broken"))
        resp = await client.post(
            "/api/transcript/analyze-batch",
            files=[
                ("files", _make_xlsx_file("bad1.xlsx")),
                ("files", _make_xlsx_file("bad2.xlsx")),
            ],
            headers=api_headers,
        )
        assert resp.status_code == 500

    async def test_response_has_expected_top_level_keys(self, client, db, api_headers, monkeypatch):
        await _setup_mock_pipeline(monkeypatch)
        resp = await client.post(
            "/api/transcript/analyze-batch",
            files=[("files", _make_xlsx_file())],
            data={"top_n": "0"},
            headers=api_headers,
        )
        body = resp.json()
        for key in ("total_files", "successful", "failed", "results"):
            assert key in body, f"Missing key: {key}"


# ── GET /api/transcript/download/{patient_id} ────────────────────────────────

class TestDownload:
    """GET /api/transcript/download/{patient_id} — xlsx download with DB fallback."""

    async def test_returns_404_when_no_results_exist(self, client, db, api_headers, monkeypatch):
        import routes_transcript
        # Ensure no file exists on disk either
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        resp = await client.get(
            "/api/transcript/download/sid-99",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_returns_xlsx_from_db_when_seeded(self, client, db, api_headers, monkeypatch):
        import routes_transcript
        # Mock _save_xlsx so DB fallback re-save does not hit real FS
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        xlsx_content = b"PK\x03\x04fake-xlsx-binary"
        record = TestDataFactory.transcript_analysis(
            patient_id="sid-01",
            xlsx_data=xlsx_content,
        )
        db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/download/sid-01",
            headers=api_headers,
        )
        assert resp.status_code == 200
        assert resp.content == xlsx_content

    async def test_no_auth_returns_403(self, client, db):
        resp = await client.get("/api/transcript/download/sid-01")
        assert resp.status_code == 403

    async def test_response_content_type_is_xlsx(self, client, db, api_headers, monkeypatch):
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        record = TestDataFactory.transcript_analysis(patient_id="sid-ct", xlsx_data=b"PK-fake")
        db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/download/sid-ct",
            headers=api_headers,
        )
        assert XLSX_MIME in resp.headers.get("content-type", "")

    async def test_patient_id_in_download_filename(self, client, db, api_headers, monkeypatch):
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        record = TestDataFactory.transcript_analysis(patient_id="sid-fn", xlsx_data=b"PK-data")
        db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/download/sid-fn",
            headers=api_headers,
        )
        content_disp = resp.headers.get("content-disposition", "")
        assert "sid-fn" in content_disp


# ── GET /api/transcript/download-batch ────────────────────────────────────────

class TestDownloadBatch:
    """GET /api/transcript/download-batch — zip download for multiple patients."""

    async def test_returns_zip_with_multiple_files(self, client, db, api_headers, monkeypatch):
        import zipfile
        from io import BytesIO
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        for pid in ("sid-z1", "sid-z2"):
            record = TestDataFactory.transcript_analysis(
                patient_id=pid,
                xlsx_data=f"xlsx-{pid}".encode(),
            )
            db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-z1,sid-z2",
            headers=api_headers,
        )
        assert resp.status_code == 200
        assert "application/zip" in resp.headers.get("content-type", "")

        zf = zipfile.ZipFile(BytesIO(resp.content))
        names = zf.namelist()
        assert "sid-z1_predictions.xlsx" in names
        assert "sid-z2_predictions.xlsx" in names

    async def test_missing_patient_ids_returns_400(self, client, db, api_headers):
        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=",
            headers=api_headers,
        )
        assert resp.status_code == 400

    async def test_returns_404_for_patients_with_no_results(self, client, db, api_headers, monkeypatch):
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=ghost-01,ghost-02",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_no_auth_returns_403(self, client, db):
        resp = await client.get("/api/transcript/download-batch?patient_ids=sid-01")
        assert resp.status_code == 403


# ── GET /api/transcript/history/{patient_id} ──────────────────────────────────

class TestHistory:
    """GET /api/transcript/history/{patient_id} — paginated analysis history."""

    async def test_empty_history_returns_empty_list(self, client, db, api_headers):
        resp = await client.get(
            "/api/transcript/history/sid-empty",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 0
        assert body["items"] == []

    async def test_returns_history_records_from_db(self, client, db, api_headers):
        for i in range(3):
            record = TestDataFactory.transcript_analysis(
                patient_id="sid-h1",
                total_sentences=100 + i,
                source_filename=f"transcript_{i}.xlsx",
            )
            db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/history/sid-h1",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert len(body["items"]) == 3

    async def test_pagination_with_page_and_size(self, client, db, api_headers):
        for i in range(5):
            db.add(TestDataFactory.transcript_analysis(
                patient_id="sid-pg",
                total_sentences=50 + i,
            ))
        await db.commit()

        resp = await client.get(
            "/api/transcript/history/sid-pg?page=2&size=2",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 5
        assert body["page"] == 2
        assert body["size"] == 2
        assert len(body["items"]) == 2

    async def test_response_shape_validation(self, client, db, api_headers):
        db.add(TestDataFactory.transcript_analysis(patient_id="sid-sh"))
        await db.commit()

        resp = await client.get(
            "/api/transcript/history/sid-sh",
            headers=api_headers,
        )
        body = resp.json()
        assert "patient_id" in body
        assert "total" in body
        assert "page" in body
        assert "size" in body
        assert "items" in body
        item = body["items"][0]
        for key in ("id", "patient_id", "total_sentences", "top_n",
                     "context_window", "source_filename", "analyzed_at", "has_xlsx"):
            assert key in item, f"Missing key in history item: {key}"

    async def test_no_auth_returns_403(self, client, db):
        resp = await client.get("/api/transcript/history/sid-01")
        assert resp.status_code == 403


# ── GET /api/transcript/predictions/{patient_id} ─────────────────────────────

class TestPredictions:
    """GET /api/transcript/predictions/{patient_id} — sentence-level predictions."""

    async def test_empty_returns_404_no_analysis(self, client, db, api_headers):
        """When no analysis exists at all, expect 404."""
        resp = await client.get(
            "/api/transcript/predictions/sid-none",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_returns_predictions_from_db(self, client, db, api_headers):
        record = TestDataFactory.transcript_analysis(patient_id="sid-p1")
        db.add(record)
        await db.flush()

        preds = TestDataFactory.prediction_set(
            analysis_id=record.id, patient_id="sid-p1", model="cp", count=3,
        )
        db.add_all(preds)
        await db.commit()

        resp = await client.get(
            "/api/transcript/predictions/sid-p1",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["patient_id"] == "sid-p1"
        assert body["total"] == 3
        assert len(body["predictions"]) == 3

    async def test_filter_by_model(self, client, db, api_headers):
        record = TestDataFactory.transcript_analysis(patient_id="sid-fm")
        db.add(record)
        await db.flush()

        # Add predictions for two different models
        cp_preds = TestDataFactory.prediction_set(
            analysis_id=record.id, patient_id="sid-fm", model="cp", count=3,
        )
        le_preds = TestDataFactory.prediction_set(
            analysis_id=record.id, patient_id="sid-fm", model="le", count=2,
        )
        db.add_all(cp_preds + le_preds)
        await db.commit()

        resp = await client.get(
            "/api/transcript/predictions/sid-fm?model=cp",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert all(p["model"] == "cp" for p in body["predictions"])

    async def test_filter_by_min_score(self, client, db, api_headers):
        record = TestDataFactory.transcript_analysis(patient_id="sid-ms")
        db.add(record)
        await db.flush()

        # prediction_set creates scores 0.85, 0.80, 0.75, 0.70, 0.65
        preds = TestDataFactory.prediction_set(
            analysis_id=record.id, patient_id="sid-ms", model="cp", count=5,
        )
        db.add_all(preds)
        await db.commit()

        resp = await client.get(
            "/api/transcript/predictions/sid-ms?min_score=0.8",
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        # Only scores >= 0.8 should be returned (0.85, 0.80)
        assert body["total"] == 2
        assert all(p["pred_score"] >= 0.8 for p in body["predictions"])

    async def test_no_auth_returns_403(self, client, db):
        resp = await client.get("/api/transcript/predictions/sid-01")
        assert resp.status_code == 403
