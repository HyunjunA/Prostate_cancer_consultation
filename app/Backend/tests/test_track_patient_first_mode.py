"""Tests for the session-level `mode` field on first-visit tracking.

The patient first-visit page was split into two entry modes that share the
same component and the same table:

  - report  (1st visit) : read-only overview
  - survey  (2nd visit) : questionnaire

`mode` is a session-level discriminator (same for every event in a batch) so
the admin tracking UI and the research analysis can separate the two flows.
Covers: persistence, surfacing in the read endpoints, API-boundary validation,
and backward compatibility for pre-split clients that omit it.
"""

import pytest

PREFIX = "/api/track/patient-first"

# The /aggregate and /session endpoints require an admin JWT; this suite uses
# the X-API-Key fixture, so stub admin auth for every test in this module.
pytestmark = pytest.mark.usefixtures("stub_admin_auth")


def _page_view(**overrides):
    ev = {
        "event_type": "page_view",
        "metadata": {"page": "first_visit_report"},
        "client_timestamp": "2026-06-04T12:00:00Z",
    }
    ev.update(overrides)
    return ev


def _batch(events, *, mode=None, session_id="sess-mode", file="MODEREC", speaker="patient"):
    batch = {
        "session_id": session_id,
        "file": file,
        "speaker": speaker,
        "events": events,
    }
    if mode is not None:
        batch["mode"] = mode
    return batch


@pytest.mark.integration
@pytest.mark.asyncio
async def test_survey_mode_stored_and_returned_in_sessions(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_page_view()], mode="survey"), headers=api_headers
    )
    assert resp.status_code == 200, resp.text

    sessions = await client.get(f"{PREFIX}/sessions", params={"file": "MODEREC"}, headers=api_headers)
    assert sessions.status_code == 200, sessions.text
    rows = sessions.json()["sessions"]
    assert len(rows) == 1
    assert rows[0]["mode"] == "survey"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_report_mode_surfaced_in_aggregate_and_session_detail(client, api_headers):
    resp = await client.post(
        PREFIX,
        json=_batch([_page_view()], mode="report", session_id="sess-report"),
        headers=api_headers,
    )
    assert resp.status_code == 200, resp.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "MODEREC"}, headers=api_headers)
    assert agg.status_code == 200, agg.text
    assert agg.json()["sessions"][0]["mode"] == "report"

    detail = await client.get(f"{PREFIX}/session/sess-report", headers=api_headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["mode"] == "report"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_invalid_mode_is_rejected(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_page_view()], mode="bogus"), headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mode_is_optional_and_defaults_to_null(client, api_headers):
    # Pre-split clients omit `mode` entirely — the event must still store, with
    # mode surfaced as null ("pre-split" in the admin UI).
    resp = await client.post(PREFIX, json=_batch([_page_view()]), headers=api_headers)
    assert resp.status_code == 200, resp.text

    sessions = await client.get(f"{PREFIX}/sessions", params={"file": "MODEREC"}, headers=api_headers)
    assert sessions.json()["sessions"][0]["mode"] is None
