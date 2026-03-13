"""Integration tests: batch analysis -> zip download flow.

Tests the end-to-end flow of:
  1. Seeding TranscriptAnalysisLog records in the DB
  2. Downloading results via /api/transcript/download-batch
  3. DB fallback when disk files are missing
  4. Mixed found/missing patient scenarios

The NLP pipeline (analyze_transcript) and disk I/O (_save_xlsx) are mocked
because they require the r01-nlp-classifiers Docker container and real FS.
"""

import zipfile
from io import BytesIO

import pytest

from tests.factories import TestDataFactory


pytestmark = pytest.mark.integration

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_MOCK_MODELS = {
    "cp": [
        {"index": 1, "i": 1, "i2": 1, "speaker": "Interviewer",
         "text": "test sentence cp", "pred_1": 0.92,
         "context": "before. <main>test sentence cp</main> after."},
    ],
}


def _make_xlsx_file(filename: str = "REC001 (SID 01).xlsx", content: bytes = b"fake-xlsx"):
    """Build the (filename, bytes, mime) tuple expected by httpx multipart uploads."""
    return (filename, content, XLSX_MIME)


class TestBatchDownloadFromDb:
    """Seed DB records, then test /download-batch retrieves them as a zip."""

    async def test_batch_download_returns_zip(self, client, db, api_headers, monkeypatch):
        """Seeded DB records are returned as a zip file via download-batch."""
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        for pid in ("sid-b1", "sid-b2"):
            record = TestDataFactory.transcript_analysis(
                patient_id=pid,
                xlsx_data=f"xlsx-data-{pid}".encode(),
            )
            db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-b1,sid-b2",
            headers=api_headers,
        )
        assert resp.status_code == 200
        assert "application/zip" in resp.headers.get("content-type", "")

        zf = zipfile.ZipFile(BytesIO(resp.content))
        names = zf.namelist()
        assert "sid-b1_predictions.xlsx" in names
        assert "sid-b2_predictions.xlsx" in names

    async def test_zip_file_contents_match_seeded_data(self, client, db, api_headers, monkeypatch):
        """The binary content in the zip matches what was stored in the DB."""
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        xlsx_content = b"PK-real-xlsx-binary-content"
        record = TestDataFactory.transcript_analysis(
            patient_id="sid-bc",
            xlsx_data=xlsx_content,
        )
        db.add(record)
        await db.commit()

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-bc",
            headers=api_headers,
        )
        assert resp.status_code == 200

        zf = zipfile.ZipFile(BytesIO(resp.content))
        extracted = zf.read("sid-bc_predictions.xlsx")
        assert extracted == xlsx_content

    async def test_single_patient_batch_download(self, client, db, api_headers, monkeypatch):
        """Batch download with a single patient_id works."""
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        db.add(TestDataFactory.transcript_analysis(
            patient_id="sid-single", xlsx_data=b"single-data",
        ))
        await db.commit()

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-single",
            headers=api_headers,
        )
        assert resp.status_code == 200
        zf = zipfile.ZipFile(BytesIO(resp.content))
        assert "sid-single_predictions.xlsx" in zf.namelist()


class TestBatchDownloadDbFallback:
    """DB fallback: when disk files are missing, download from DB."""

    async def test_all_missing_returns_404(self, client, db, api_headers, monkeypatch):
        """When no patients have results (disk or DB), return 404."""
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=ghost-1,ghost-2",
            headers=api_headers,
        )
        assert resp.status_code == 404

    async def test_mixed_found_and_missing(self, client, db, api_headers, monkeypatch):
        """When some patients exist and others do not, return a zip with found ones."""
        import routes_transcript
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        # Only seed sid-found, not sid-missing
        db.add(TestDataFactory.transcript_analysis(
            patient_id="sid-found", xlsx_data=b"found-data",
        ))
        await db.commit()

        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-found,sid-missing",
            headers=api_headers,
        )
        assert resp.status_code == 200
        zf = zipfile.ZipFile(BytesIO(resp.content))
        names = zf.namelist()
        assert "sid-found_predictions.xlsx" in names
        assert "sid-missing_predictions.xlsx" not in names


class TestBatchDownloadEdgeCases:
    """Edge cases for batch download."""

    async def test_empty_patient_ids_returns_400(self, client, db, api_headers):
        """Empty patient_ids parameter returns 400."""
        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=",
            headers=api_headers,
        )
        assert resp.status_code == 400

    async def test_no_auth_returns_403(self, client, db):
        """Missing auth header returns 403."""
        resp = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-01"
        )
        assert resp.status_code == 403


class TestBatchAnalyzeFlow:
    """Full flow: batch analyze -> DB records created -> batch download."""

    async def test_analyze_batch_then_download(self, client, db, api_headers, monkeypatch):
        """analyze-batch creates records that download-batch can retrieve."""
        import routes_transcript

        call_count = 0

        async def _mock_analyze(file_bytes, filename, top_n=0, context_window=3):
            nonlocal call_count
            call_count += 1
            pid = f"sid-flow-{call_count:02d}"
            return {
                "patient_id": pid,
                "total_sentences": 10,
                "models": _MOCK_MODELS,
                "xlsx_bytes": f"xlsx-{pid}".encode(),
            }

        monkeypatch.setattr(routes_transcript, "analyze_transcript", _mock_analyze)
        monkeypatch.setattr(routes_transcript, "_save_xlsx", lambda pid, data: None)

        # Step 1: Batch analyze
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
        assert body["successful"] == 2

        # Step 2: Batch download the results
        resp2 = await client.get(
            "/api/transcript/download-batch?patient_ids=sid-flow-01,sid-flow-02",
            headers=api_headers,
        )
        assert resp2.status_code == 200
        assert "application/zip" in resp2.headers.get("content-type", "")

        zf = zipfile.ZipFile(BytesIO(resp2.content))
        names = zf.namelist()
        assert "sid-flow-01_predictions.xlsx" in names
        assert "sid-flow-02_predictions.xlsx" in names
