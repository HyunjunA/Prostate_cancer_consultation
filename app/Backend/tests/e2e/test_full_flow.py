"""
End-to-end tests against the live Docker environment.

These tests require all Docker containers to be running and healthy.
Run with: pytest tests/e2e/ -v -m e2e

Skip in CI without Docker:
    pytest -m "not e2e"
"""

import pytest
import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
BASE_URL = "http://localhost:8000"
API_KEY = "REDACTED_API_KEY"
AUTH_HEADERS = {"X-API-Key": API_KEY}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get(path: str, headers=None, params=None) -> httpx.Response:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as c:
        return await c.get(path, headers=headers, params=params)


async def _post(path: str, headers=None, json=None) -> httpx.Response:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as c:
        return await c.post(path, headers=headers, json=json)


# ---------------------------------------------------------------------------
# Skip guard
# ---------------------------------------------------------------------------

def _backend_reachable() -> bool:
    try:
        import httpx as hx
        resp = hx.get(f"{BASE_URL}/health", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.e2e,
    pytest.mark.asyncio,
    pytest.mark.skipif(not _backend_reachable(), reason="Backend not reachable"),
]


# ===========================================================================
# 1. Health / Readiness
# ===========================================================================

async def test_health_returns_ok():
    """GET /health should return 200 with component statuses."""
    resp = await _get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert "components" in body
    assert body["components"]["database"] == "healthy"


async def test_ready_returns_ok():
    """GET /ready should return 200 with a 'ready' boolean."""
    resp = await _get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert "ready" in body
    assert isinstance(body["ready"], bool)


# ===========================================================================
# 2. Auth
# ===========================================================================

async def test_auth_mode():
    """GET /api/auth/mode returns the current auth mode."""
    resp = await _get("/api/auth/mode")
    assert resp.status_code == 200
    body = resp.json()
    assert body["auth_mode"] == "api_key"


async def test_root_requires_auth():
    """GET / without API key should return 403."""
    resp = await _get("/")
    assert resp.status_code == 403


async def test_root_with_wrong_key():
    """GET / with a wrong API key should return 403."""
    resp = await _get("/", headers={"X-API-Key": "bad-key-value"})
    assert resp.status_code == 403


async def test_root_with_valid_key():
    """GET / with a valid API key should return 200."""
    resp = await _get("/", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "message" in body
    assert "version" in body


# ===========================================================================
# 3. Doctor Interface
# ===========================================================================

async def test_doctor_files():
    """GET /api/doctor/files should return a file list."""
    resp = await _get("/api/doctor/files", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "files" in body
    assert isinstance(body["files"], list)


async def test_doctor_sentences_no_auth():
    """GET /api/doctor/sentences without auth should return 403."""
    resp = await _get("/api/doctor/sentences/test_file/test_speaker")
    assert resp.status_code == 403


async def test_doctor_sentences_nonexistent():
    """GET /api/doctor/sentences with nonexistent file returns error."""
    resp = await _get(
        "/api/doctor/sentences/nonexistent_file_xyz/speaker1",
        headers=AUTH_HEADERS,
    )
    # Backend returns 404 or 200 with detail message for missing data
    assert resp.status_code in (200, 404)


async def test_doctor_rewrites():
    """GET /api/doctor/rewrites should return paginated results."""
    resp = await _get("/api/doctor/rewrites", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "data" in body
    assert isinstance(body["data"], list)


async def test_doctor_scores_average():
    """GET /api/doctor/scores/average should return grouped scores."""
    resp = await _get("/api/doctor/scores/average", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total_groups" in body
    assert "data" in body
    assert isinstance(body["data"], list)


async def test_doctor_class_distribution():
    """GET /api/doctor/class-distribution should return distribution data."""
    resp = await _get("/api/doctor/class-distribution", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total_files" in body
    assert "data" in body


async def test_doctor_score_sentence():
    """POST /api/doctor/score-sentence should return a score."""
    resp = await _post(
        "/api/doctor/score-sentence",
        headers=AUTH_HEADERS,
        json={"sentence": "You have a low risk of cancer progression.", "class_": "1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "score" in body
    assert "sentence" in body
    assert isinstance(body["score"], (int, float))


async def test_doctor_ai_rewrite():
    """POST /api/doctor/ai-rewrite should return a rewritten sentence."""
    resp = await _post(
        "/api/doctor/ai-rewrite",
        headers=AUTH_HEADERS,
        json={
            "sentence": "The cancer might spread.",
            "class_": "1",
            "target_score": 5,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "original_sentence" in body
    assert "rewritten_sentence" in body


async def test_doctor_improvement_suggestions():
    """GET /api/doctor/improvement-suggestions should return all classes."""
    resp = await _get("/api/doctor/improvement-suggestions", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total_classes" in body
    assert body["total_classes"] == 5
    assert "data" in body


# ===========================================================================
# 4. Patient Interface
# ===========================================================================

async def test_patient_files():
    """GET /api/patient/files should return a file list."""
    resp = await _get("/api/patient/files", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "files" in body
    assert isinstance(body["files"], list)


async def test_patient_summaries():
    """GET /api/patient/summaries should return paginated summaries."""
    resp = await _get("/api/patient/summaries", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "data" in body
    assert isinstance(body["data"], list)


async def test_patient_scoring():
    """GET /api/patient/scoring should return scoring data."""
    resp = await _get("/api/patient/scoring", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "data" in body


async def test_patient_responses():
    """GET /api/patient/responses should return response data."""
    resp = await _get("/api/patient/responses", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "data" in body


# ===========================================================================
# 5. Surveys
# ===========================================================================

async def test_survey_submit():
    """POST /api/surveys/submit should accept and store a survey."""
    payload = {
        "survey_type": "sdm",
        "file": "e2e_test_file",
        "speaker": "e2e_test_speaker",
        "answers": {"sdm_q1": "1", "sdm_q2": "2"},
        "metadata": {"source": "e2e_test"},
    }
    resp = await _post("/api/surveys/submit", headers=AUTH_HEADERS, json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "received"
    assert body["survey_type"] == "sdm"
    assert body["answer_count"] == 2


async def test_survey_submissions_list():
    """GET /api/surveys/submissions should return paginated list."""
    resp = await _get("/api/surveys/submissions", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "submissions" in body
    assert isinstance(body["submissions"], list)


async def test_survey_stats():
    """GET /api/surveys/stats should return aggregated stats."""
    resp = await _get("/api/surveys/stats", headers=AUTH_HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, dict)


# ===========================================================================
# 6. REDCap
# ===========================================================================

async def test_redcap_import_sample():
    """POST /api/surveys/redcap/records/{id}/import-sample should push sample data."""
    resp = await _post(
        "/api/surveys/redcap/records/e2e_test_record/import-sample",
        headers=AUTH_HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "success"
    assert body["record_id"] == "e2e_test_record"


# ===========================================================================
# 7. Full Flow: submit survey then verify it appears in submissions
# ===========================================================================

async def test_full_flow_submit_and_retrieve():
    """Submit a survey and verify it appears in the submissions list."""
    unique_speaker = "e2e_full_flow_test_speaker"
    payload = {
        "survey_type": "dcs",
        "file": "e2e_flow_file",
        "speaker": unique_speaker,
        "answers": {"dcs_q1": "3", "dcs_q2": "4"},
    }

    # Step 1: Submit
    submit_resp = await _post("/api/surveys/submit", headers=AUTH_HEADERS, json=payload)
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "received"

    # Step 2: Retrieve by speaker
    list_resp = await _get(
        f"/api/surveys/by-speaker/{unique_speaker}",
        headers=AUTH_HEADERS,
    )
    assert list_resp.status_code == 200
    list_body = list_resp.json()
    assert list_body["speaker"] == unique_speaker
    assert list_body["total_submissions"] >= 1
    assert "dcs" in list_body["survey_types"]
