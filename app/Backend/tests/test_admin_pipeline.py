"""Tests for the admin pipeline/integrity probes.

    GET /api/admin/pipeline-status   did each pipeline run write all 7 tables?
    GET /api/admin/integrity         data-integrity checks over the whole DB

Both are monitoring endpoints: something polls them and alerts on 5xx. That
makes their FAILURE behaviour the load-bearing part — a probe that cannot
distinguish "healthy" from "broken" is worse than no probe, because it reads as
a green light. Neither had any coverage.

The happy path is deliberately not asserted end to end here: passing every check
means seeding seven tables at exact counts (50 sentence_predictions across 5
models, 4 JSONB steps, 5 LLM domains, 5-25 final rows), which is a fixture large
enough to become its own maintenance problem. What is pinned instead is that an
incomplete run is reported as failing, with the right check named.
"""

import pytest
import pytest_asyncio

from models import NLPAllPredictions, TranscriptAnalysisLog

pytestmark = pytest.mark.usefixtures("stub_admin_auth")


def _check(body, name):
    """One named check out of a single analysis's report."""
    analysis = body["analyses"][0]
    return next(c for c in analysis["checks"] if c["name"] == name)


@pytest_asyncio.fixture
async def analysis(db):
    """A run header with none of its child rows — an incomplete pipeline."""
    row = TranscriptAnalysisLog(
        patient_id="sid-01", source_filename="probe.csv",
        total_sentences=10, top_n=5, context_window=3,
        xlsx_data=b"x", processed=True, ai_overall_score=2.0,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# ── GET /pipeline-status ─────────────────────────────────────────────────────

class TestPipelineStatus:
    async def test_empty_db_is_not_a_failure(self, client, db, api_headers):
        """A fresh install has no analyses. Alerting on that would cry wolf."""
        resp = await client.get("/api/admin/pipeline-status", headers=api_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "EMPTY"
        assert body["analyses_checked"] == 0

    async def test_incomplete_run_fails_with_503(self, client, analysis, api_headers):
        """A run header with no child rows must alert, not pass quietly."""
        resp = await client.get("/api/admin/pipeline-status", headers=api_headers)
        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "FAIL"
        assert body["summary"]["analyses_checked"] == 1
        assert body["summary"]["checks_failed"] > 0

    async def test_names_the_checks_that_failed(self, client, analysis, api_headers):
        """The payload has to say WHICH storage step is missing, or an operator
        is left diffing tables by hand."""
        body = (await client.get("/api/admin/pipeline-status", headers=api_headers)).json()
        failed = {c["name"] for c in body["analyses"][0]["checks"] if not c["pass"]}
        assert "nlp_step3_predictions_no_null_leak" in failed
        assert "nlp_step5_top_with_context" in failed
        assert "ai_final_summary_rows" in failed

    async def test_detects_a_null_leak_in_one_model_column(self, client, db, analysis, api_headers):
        """The regression this check exists for: four model columns populated,
        one silently NULL. Row counts alone would look fine.
        """
        db.add(NLPAllPredictions(
            analysis_id=analysis.id, patient_id="sid-01",
            sentence_index=1, utterance_index=1, sentence_in_utterance=1,
            speaker="Interviewer", sentence_text="s",
            pred_cp=0.5, pred_le=0.5, pred_ed=0.5, pred_inc=0.5,
            pred_ius=None,  # the leak
        ))
        await db.commit()

        body = (await client.get("/api/admin/pipeline-status", headers=api_headers)).json()
        leak = _check(body, "nlp_step3_predictions_no_null_leak")
        assert leak["pass"] is False
        assert leak["observed"]["null_in"] == ["ius_nn"]

    async def test_single_analysis_probe(self, client, analysis, api_headers):
        """analysis_id scopes the walk — the cheap probe monitoring should use."""
        body = (await client.get(
            "/api/admin/pipeline-status",
            params={"analysis_id": analysis.id},
            headers=api_headers,
        )).json()
        assert body["summary"]["analyses_checked"] == 1
        assert body["analyses"][0]["analysis_id"] == analysis.id

    async def test_unknown_analysis_id_does_not_crash(self, client, db, analysis, api_headers):
        resp = await client.get(
            "/api/admin/pipeline-status", params={"analysis_id": 999999}, headers=api_headers
        )
        assert resp.status_code in (200, 503)
        assert resp.json()["analyses"][0]["exists"] is False


# ── GET /integrity ───────────────────────────────────────────────────────────

class TestIntegrity:
    async def test_clean_db_passes(self, client, db, api_headers):
        resp = await client.get(
            "/api/admin/integrity", params={"skip_redcap": True}, headers=api_headers
        )
        assert resp.status_code == 200
        assert resp.json()["overall"] in ("pass", "warn")

    async def test_skip_redcap_is_reported_not_silently_dropped(self, client, db, api_headers):
        """A skipped check must be visible; otherwise the report claims coverage
        it does not have."""
        body = (await client.get(
            "/api/admin/integrity", params={"skip_redcap": True}, headers=api_headers
        )).json()
        recon = next(r for r in body["results"] if r["name"] == "redcap_reconciliation")
        assert "skip" in recon["detail"].lower()

    async def test_reports_every_db_check(self, client, db, api_headers):
        body = (await client.get(
            "/api/admin/integrity", params={"skip_redcap": True}, headers=api_headers
        )).json()
        names = {r["name"] for r in body["results"]}
        assert {"survey_orphan_rows", "survey_empty_answers", "survey_bad_type"} <= names
