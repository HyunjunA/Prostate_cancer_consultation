"""Tests for the admin transcript-upload endpoints.

    POST /api/admin/upload-transcript   queue a de-identified transcript
    GET  /api/admin/upload-gate         is the pipeline busy?
    GET  /api/admin/upload-precheck     has this file already been processed?
    GET  /api/admin/upload-log          recent upload attempts

None of these had any coverage, which is uncomfortable for the one route on the
whole surface that accepts a file and writes it to disk: the guard that keeps a
raw, still-identifiable transcript off the server is a filename check with
nothing asserting it holds.

Every test points `pipeline_drop_dir` at a tmp_path. The real drop folder is
watched by a live pipeline — writing into it from a test run would kick off an
actual NLP + GPT-4o run.
"""

import io
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from core.settings import get_settings
from models import AdminUploadLog, TranscriptAnalysisLog

pytestmark = pytest.mark.usefixtures("stub_admin_auth")

DEID_NAME = "6FEOHLRCFJGMAVVFHTPOZ7MBBJWTQ_LSHPHMYISJUTM77G6OTKTGH3LR2Q_07162026.csv"
CSV_BYTES = b"speaker,text\nInterviewer:,Hello.\n"


@pytest.fixture
def drop_dir(tmp_path, monkeypatch):
    """Redirect the pipeline drop folder at a throwaway directory."""
    folder = tmp_path / "incoming"
    folder.mkdir()
    monkeypatch.setenv("PIPELINE_DROP_DIR", str(folder))
    get_settings.cache_clear()
    yield folder
    get_settings.cache_clear()


def _upload(name: str = DEID_NAME, content: bytes = CSV_BYTES):
    return {"file": (name, io.BytesIO(content), "text/csv")}


def _age(path, seconds: int) -> None:
    """Backdate a queued file so the gate sees it as older than it is."""
    import os
    stamp = path.stat().st_mtime - seconds
    os.utime(path, (stamp, stamp))


# ── POST /upload-transcript ──────────────────────────────────────────────────

class TestUploadTranscript:
    async def test_stores_a_de_identified_file(self, client, db, drop_dir, api_headers):
        resp = await client.post(
            "/api/admin/upload-transcript", files=_upload(), headers=api_headers
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["queued"] == DEID_NAME
        assert body["bytes"] == len(CSV_BYTES)
        assert body["replaced"] is False
        assert (drop_dir / DEID_NAME).read_bytes() == CSV_BYTES

    @pytest.mark.parametrize("raw", [
        "13511-smith.csv",                 # hyphen, not the app's separator
        "raw_transcript_13511_smith.csv",  # four segments
        "patient smith.csv",               # space
        "transcript.csv",                  # single segment
    ])
    async def test_rejects_a_raw_transcript(self, client, db, drop_dir, api_headers, raw):
        """A raw study-id filename must never reach the drop folder.

        De-identification happens in the clinical-side app, before upload. The
        server cannot do it — it could hash the name but not scrub PHI out of the
        body, which would look clean while leaking.
        """
        resp = await client.post(
            "/api/admin/upload-transcript", files=_upload(name=raw), headers=api_headers
        )
        assert resp.status_code == 400
        assert "not been de-identified" in resp.json()["detail"]
        assert list(drop_dir.iterdir()) == []

    @pytest.mark.parametrize("raw", ["13511_smith.csv", "13511_smith_july.csv", "AB_CD.csv"])
    async def test_known_gap_a_raw_name_shaped_like_the_app_output_passes(
        self, client, db, drop_dir, api_headers, raw
    ):
        """KNOWN LIMITATION, pinned here so it cannot regress unnoticed.

        The gate is a filename pattern — two or three alphanumeric segments —
        and nothing inspects the file body. A raw transcript named
        `<studyid>_<surname>.csv`, or any raw file simply renamed to that shape,
        is accepted and lands in the drop folder carrying PHI.

        Closing this needs provenance the server can verify (e.g. the
        preparation app signing its output), not a stricter regex. Until then
        this test documents the exposure rather than pretending it is covered.
        """
        resp = await client.post(
            "/api/admin/upload-transcript", files=_upload(name=raw), headers=api_headers
        )
        assert resp.status_code == 200
        assert (drop_dir / raw).exists()

    async def test_rejection_is_logged_without_the_filename(self, client, db, drop_dir, api_headers):
        """A raw filename IS a real study id, so it must not be persisted."""
        raw = "13511-smith.csv"
        await client.post(
            "/api/admin/upload-transcript", files=_upload(name=raw), headers=api_headers
        )
        rows = (await db.execute(
            AdminUploadLog.__table__.select()
        )).mappings().all()
        assert [r["status"] for r in rows] == ["error"]
        assert rows[0]["queued_filename"] is None
        assert raw not in (rows[0]["message"] or "")

    async def test_overwrite_reports_replaced(self, client, db, drop_dir, api_headers):
        await client.post("/api/admin/upload-transcript", files=_upload(), headers=api_headers)
        resp = await client.post(
            "/api/admin/upload-transcript",
            files=_upload(content=b"speaker,text\nInterviewer:,Second.\n"),
            headers=api_headers,
        )
        assert resp.json()["replaced"] is True

    async def test_rejects_a_file_over_the_size_cap(self, client, db, drop_dir, api_headers):
        resp = await client.post(
            "/api/admin/upload-transcript",
            files=_upload(content=b"x" * (25 * 1024 * 1024 + 1)),
            headers=api_headers,
        )
        assert resp.status_code == 413
        # The partial write must not be left behind as a queued transcript.
        assert [p.name for p in drop_dir.iterdir()] == []

    async def test_path_traversal_cannot_escape_the_drop_folder(self, client, db, drop_dir, api_headers):
        """A traversal name is stripped to its basename before anything else."""
        resp = await client.post(
            "/api/admin/upload-transcript",
            files=_upload(name=f"../../{DEID_NAME}"),
            headers=api_headers,
        )
        assert resp.status_code == 200
        assert (drop_dir / DEID_NAME).exists()
        assert not (drop_dir.parent.parent / DEID_NAME).exists()

    async def test_busy_pipeline_is_rejected(self, client, db, drop_dir, api_headers):
        """A second upload during a run would queue behind it invisibly."""
        queued = drop_dir / "AAAAAAAA_BBBBBBBB.csv"
        queued.write_bytes(CSV_BYTES)
        _age(queued, 120)

        resp = await client.post(
            "/api/admin/upload-transcript", files=_upload(), headers=api_headers
        )
        assert resp.status_code == 409
        assert "still processing" in resp.json()["detail"]
        assert not (drop_dir / DEID_NAME).exists()

    async def test_a_batch_is_not_blocked_by_its_own_first_file(self, client, db, drop_dir, api_headers):
        """The endpoint takes one file per request, so a multi-file batch would
        409 itself without the grace window."""
        just_arrived = drop_dir / "AAAAAAAA_BBBBBBBB.csv"
        just_arrived.write_bytes(CSV_BYTES)

        resp = await client.post(
            "/api/admin/upload-transcript", files=_upload(), headers=api_headers
        )
        assert resp.status_code == 200

    async def test_a_stuck_queue_does_not_block_forever(self, client, db, drop_dir, api_headers):
        """A file the watcher can never process must not disable uploading."""
        stuck = drop_dir / "AAAAAAAA_BBBBBBBB.csv"
        stuck.write_bytes(CSV_BYTES)
        _age(stuck, get_settings().upload_gate_stale_seconds + 60)

        resp = await client.post(
            "/api/admin/upload-transcript", files=_upload(), headers=api_headers
        )
        assert resp.status_code == 200


# ── GET /upload-gate ─────────────────────────────────────────────────────────

class TestUploadGate:
    async def test_empty_folder_is_idle(self, client, drop_dir, api_headers):
        body = (await client.get("/api/admin/upload-gate", headers=api_headers)).json()
        assert body["busy"] is False
        assert body["stale"] is False
        assert body["queued"] == []

    async def test_a_queued_file_is_busy(self, client, drop_dir, api_headers):
        (drop_dir / DEID_NAME).write_bytes(CSV_BYTES)
        body = (await client.get("/api/admin/upload-gate", headers=api_headers)).json()
        assert body["busy"] is True
        assert body["stale"] is False
        assert body["queued"] == [DEID_NAME]

    async def test_a_long_wait_is_stale(self, client, drop_dir, api_headers):
        f = drop_dir / DEID_NAME
        f.write_bytes(CSV_BYTES)
        _age(f, get_settings().upload_gate_stale_seconds + 60)
        body = (await client.get("/api/admin/upload-gate", headers=api_headers)).json()
        assert body["busy"] is True
        assert body["stale"] is True

    async def test_a_partial_upload_is_not_counted(self, client, drop_dir, api_headers):
        """_stream_to writes <name>.part first; that is not queued work yet."""
        (drop_dir / f"{DEID_NAME}.part").write_bytes(CSV_BYTES)
        body = (await client.get("/api/admin/upload-gate", headers=api_headers)).json()
        assert body["busy"] is False


# ── GET /upload-precheck ─────────────────────────────────────────────────────

class TestUploadPrecheck:
    @pytest_asyncio.fixture
    async def processed(self, db):
        analysis = TranscriptAnalysisLog(
            patient_id="GCZ3FKMI", source_filename=DEID_NAME,
            total_sentences=10, top_n=5, context_window=3,
            xlsx_data=b"x", processed=True,
        )
        db.add(analysis)
        await db.commit()
        await db.refresh(analysis)
        return analysis

    async def test_reports_an_already_processed_name(self, client, processed, api_headers):
        body = (await client.get(
            "/api/admin/upload-precheck", params={"name": DEID_NAME}, headers=api_headers
        )).json()
        assert body["duplicate"] is True
        assert body["analysis_id"] == processed.id
        assert body["processed"] is True

    async def test_an_unseen_name_is_not_a_duplicate(self, client, db, api_headers):
        body = (await client.get(
            "/api/admin/upload-precheck",
            params={"name": "NEWAAAA_NEWBBBB_NEWCCCC.csv"},
            headers=api_headers,
        )).json()
        assert body["duplicate"] is False

    async def test_strips_path_components(self, client, db, api_headers):
        body = (await client.get(
            "/api/admin/upload-precheck",
            params={"name": "../../etc/passwd"},
            headers=api_headers,
        )).json()
        assert body["name"] == "passwd"
        assert body["duplicate"] is False

    async def test_empty_name_is_rejected(self, client, db, api_headers):
        resp = await client.get(
            "/api/admin/upload-precheck", params={"name": ""}, headers=api_headers
        )
        assert resp.status_code == 400


# ── GET /upload-log ──────────────────────────────────────────────────────────

class TestUploadLog:
    @pytest_asyncio.fixture
    async def logged(self, db):
        base = datetime(2026, 7, 31, 9, 0, tzinfo=timezone.utc)
        for idx in range(3):
            db.add(AdminUploadLog(
                queued_filename=f"F{idx}_AAAAAAAA_BBBBBBBB.csv",
                status="queued", uploaded_by="admin",
                uploaded_at=base + timedelta(minutes=idx),
            ))
        await db.commit()

    async def test_returns_newest_first(self, client, logged, api_headers):
        body = (await client.get("/api/admin/upload-log", headers=api_headers)).json()
        assert [u["queued"] for u in body["uploads"]] == [
            "F2_AAAAAAAA_BBBBBBBB.csv",
            "F1_AAAAAAAA_BBBBBBBB.csv",
            "F0_AAAAAAAA_BBBBBBBB.csv",
        ]

    async def test_limit_is_honoured(self, client, logged, api_headers):
        body = (await client.get(
            "/api/admin/upload-log", params={"limit": 2}, headers=api_headers
        )).json()
        assert len(body["uploads"]) == 2

    async def test_limit_is_clamped(self, client, logged, api_headers):
        """Out-of-range limits are clamped, not rejected — the page passes its own."""
        for limit in (0, 10_000):
            resp = await client.get(
                "/api/admin/upload-log", params={"limit": limit}, headers=api_headers
            )
            assert resp.status_code == 200
