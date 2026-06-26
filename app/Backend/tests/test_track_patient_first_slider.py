"""Tests for the `slider_moved` first-visit behavior event.

Covers the new event type added so the admin can tell, per domain, whether
a patient actually moved a VAS slider (answered) or left it at the default
of 50. Exercises three layers:

  - Pydantic validation at the API boundary (domain + metadata.slider_name
    are mandatory for slider_moved).
  - Persistence into patient_first_behavior.
  - The /aggregate rollup, which lists the distinct slider names moved per
    domain in a session.
"""

import pytest

PREFIX = "/api/track/patient-first"

# The /aggregate and /session endpoints require an admin JWT; this suite uses
# the X-API-Key fixture, so stub admin auth for every test in this module.
pytestmark = pytest.mark.usefixtures("stub_admin_auth")


def _event(**overrides):
    """Build a minimal slider_moved event payload, with overrides."""
    ev = {
        "event_type": "slider_moved",
        "domain": "cp",
        "metadata": {"slider_name": "cp_risk_without_treatment", "value": 73},
        "client_timestamp": "2026-05-21T12:00:00Z",
    }
    ev.update(overrides)
    return ev


def _batch(events, session_id="sess-1", file="REC001", speaker="patient"):
    return {
        "session_id": session_id,
        "file": file,
        "speaker": speaker,
        "events": events,
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_slider_moved_event_is_accepted_and_stored(client, api_headers):
    resp = await client.post(PREFIX, json=_batch([_event()]), headers=api_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["events_stored"] == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_slider_moved_requires_domain(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_event(domain=None)]), headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_slider_moved_requires_slider_name(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_event(metadata={"value": 73})]), headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_lists_distinct_sliders_moved_per_domain(client, api_headers):
    # cp has two sliders; move one of them twice (dedup) and the other once.
    events = [
        _event(metadata={"slider_name": "cp_risk_without_treatment", "value": 40}),
        _event(metadata={"slider_name": "cp_risk_without_treatment", "value": 55}),
        _event(metadata={"slider_name": "cp_risk_with_treatment", "value": 20}),
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    assert agg.status_code == 200, agg.text
    sessions = agg.json()["sessions"]
    assert len(sessions) == 1
    cp = sessions[0]["by_domain"]["cp"]
    assert sorted(cp["sliders"]) == [
        "cp_risk_with_treatment",
        "cp_risk_without_treatment",
    ]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_records_slider_history_in_order(client, api_headers):
    # The same slider committed three times (e.g. an initial answer then two
    # re-edits after Submit). The trajectory must be preserved in time order,
    # with every value — not deduped like the `sliders` list.
    events = [
        _event(
            metadata={"slider_name": "cp_risk_without_treatment", "value": 50},
            client_timestamp="2026-05-21T12:00:00Z",
        ),
        _event(
            metadata={"slider_name": "cp_risk_without_treatment", "value": 70},
            client_timestamp="2026-05-21T12:05:00Z",
        ),
        _event(
            metadata={"slider_name": "cp_risk_without_treatment", "value": 65},
            client_timestamp="2026-05-21T12:06:00Z",
        ),
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    assert agg.status_code == 200, agg.text
    cp = agg.json()["sessions"][0]["by_domain"]["cp"]

    # Touched once distinct, but the full trajectory has all three values.
    assert cp["sliders"] == ["cp_risk_without_treatment"]
    history = cp["slider_history"]["cp_risk_without_treatment"]
    assert [h["value"] for h in history] == [50, 70, 65]
    assert [h["ts"] for h in history] == sorted(h["ts"] for h in history)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_keys_sliders_by_question_id_when_present(client, api_headers):
    # When the event carries question_id, the aggregator keys by it (unified
    # with the other question types). For sliders question_id == slider_name.
    events = [
        _event(metadata={"slider_name": "cp_risk_without_treatment",
                         "question_id": "cp_risk_without_treatment", "value": 42}),
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    cp = agg.json()["sessions"][0]["by_domain"]["cp"]
    assert cp["sliders"] == ["cp_risk_without_treatment"]
    assert cp["slider_history"]["cp_risk_without_treatment"][0]["value"] == 42


def _submit_event(**overrides):
    """Build a minimal domain_submitted event payload, with overrides.

    metadata.answers is the question_id-keyed snapshot the frontend sends.
    """
    ev = {
        "event_type": "domain_submitted",
        "domain": "le",
        "metadata": {"answers": [
            {"question_id": "le_timeline", "field": "timeline", "value": "5-10 years"},
            {"question_id": "le_factors", "field": "factors", "value": ["age"]},
        ]},
        "client_timestamp": "2026-05-21T12:00:00Z",
    }
    ev.update(overrides)
    return ev


@pytest.mark.integration
@pytest.mark.asyncio
async def test_domain_submitted_event_is_accepted_and_stored(client, api_headers):
    resp = await client.post(PREFIX, json=_batch([_submit_event()]), headers=api_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["events_stored"] == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_domain_submitted_requires_domain(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_submit_event(domain=None)]), headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_records_submission_history_in_order(client, api_headers):
    # First submit, then a re-submit after editing the answers. Both land as
    # separate submissions in time order, each with its own answer snapshot.
    events = [
        _submit_event(
            metadata={"answers": [
                {"question_id": "le_timeline", "field": "timeline", "value": "5-10 years"},
            ]},
            client_timestamp="2026-05-21T12:00:00Z",
        ),
        _submit_event(
            metadata={"answers": [
                {"question_id": "le_timeline", "field": "timeline", "value": "10-15 years"},
                {"question_id": "le_factors", "field": "factors", "value": ["age", "comorbidity"]},
            ]},
            client_timestamp="2026-05-21T12:05:00Z",
        ),
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    assert agg.status_code == 200, agg.text
    le = agg.json()["sessions"][0]["by_domain"]["le"]

    submissions = le["submissions"]
    assert len(submissions) == 2
    # answers is now the question_id-keyed list the frontend sent.
    assert submissions[0]["answers"][0]["value"] == "5-10 years"
    assert submissions[1]["answers"][0]["value"] == "10-15 years"
    assert submissions[1]["answers"][1]["value"] == ["age", "comorbidity"]
    assert [s["ts"] for s in submissions] == sorted(s["ts"] for s in submissions)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_summary_toggle_events_accepted_and_counted(client, api_headers):
    # The AI-summary panel toggle now emits summary_open/close, carrying the
    # screen (page) it happened on. Two opens on different screens for the same
    # domain are both stored; the aggregate counts them per domain.
    events = [
        {"event_type": "summary_open", "domain": "cp",
         "metadata": {"screen": "overview"}, "client_timestamp": "2026-05-21T12:00:00Z"},
        {"event_type": "summary_close", "domain": "cp",
         "metadata": {"screen": "overview"}, "client_timestamp": "2026-05-21T12:01:00Z"},
        {"event_type": "summary_open", "domain": "cp",
         "metadata": {"screen": "cp"}, "client_timestamp": "2026-05-21T12:02:00Z"},
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    cp = agg.json()["sessions"][0]["by_domain"]["cp"]
    assert cp["summary_open"] == 2
    assert cp["summary_close"] == 1

    # The aggregate now breaks the counts down by page (screen).
    assert cp["summary_by_screen"]["overview"] == {"open": 1, "close": 1}
    assert cp["summary_by_screen"]["cp"] == {"open": 1, "close": 0}

    # The per-screen distinction is also preserved in the raw session events.
    session = await client.get(f"{PREFIX}/session/sess-1", headers=api_headers)
    screens = [e["metadata"].get("screen") for e in session.json()["events"]
               if e["event_type"] in ("summary_open", "summary_close")]
    assert sorted(screens) == ["cp", "overview", "overview"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_summary_open_requires_domain(client, api_headers):
    resp = await client.post(PREFIX, json=_batch([
        {"event_type": "summary_open", "metadata": {"screen": "overview"},
         "client_timestamp": "2026-05-21T12:00:00Z"},
    ]), headers=api_headers)
    assert resp.status_code == 422


def _answer_event(**overrides):
    """Build a minimal answer_changed event payload, with overrides."""
    ev = {
        "event_type": "answer_changed",
        "domain": "ed",
        "metadata": {"field": "timeline", "value": "1-2 years"},
        "client_timestamp": "2026-05-21T12:00:00Z",
    }
    ev.update(overrides)
    return ev


@pytest.mark.integration
@pytest.mark.asyncio
async def test_answer_changed_event_is_accepted_and_stored(client, api_headers):
    resp = await client.post(PREFIX, json=_batch([_answer_event()]), headers=api_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["events_stored"] == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_answer_changed_requires_domain(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_answer_event(domain=None)]), headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_answer_changed_requires_field(client, api_headers):
    resp = await client.post(
        PREFIX, json=_batch([_answer_event(metadata={"value": "x"})]), headers=api_headers
    )
    assert resp.status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_records_answer_history_per_field(client, api_headers):
    # A timeline radio changed twice, and a factor multi-select toggled twice.
    # Each field's change history is kept separately, in time order.
    events = [
        _answer_event(
            metadata={"field": "timeline", "value": "1-2 years"},
            client_timestamp="2026-05-21T12:00:00Z",
        ),
        _answer_event(
            metadata={"field": "factors", "factors": ["age"]},
            client_timestamp="2026-05-21T12:01:00Z",
        ),
        _answer_event(
            metadata={"field": "timeline", "value": "3-5 years"},
            client_timestamp="2026-05-21T12:02:00Z",
        ),
        _answer_event(
            metadata={"field": "factors", "factors": ["age", "smoking"]},
            client_timestamp="2026-05-21T12:03:00Z",
        ),
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    assert agg.status_code == 200, agg.text
    ed = agg.json()["sessions"][0]["by_domain"]["ed"]["answer_history"]

    # No question_id sent -> aggregator falls back to "{domain}_{field}" keys.
    assert [h["value"] for h in ed["ed_timeline"]] == ["1-2 years", "3-5 years"]
    assert [h["factors"] for h in ed["ed_factors"]] == [["age"], ["age", "smoking"]]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_keys_answer_history_by_question_id(client, api_headers):
    # Two timeline questions in the SAME domain, told apart only by question_id.
    # Without per-question ids both would collapse into one trajectory.
    events = [
        _answer_event(
            metadata={"field": "timeline", "value": "A1", "question_id": "ed_timeline_primary"},
            client_timestamp="2026-05-21T12:00:00Z",
        ),
        _answer_event(
            metadata={"field": "timeline", "value": "B1", "question_id": "ed_timeline_secondary"},
            client_timestamp="2026-05-21T12:01:00Z",
        ),
        _answer_event(
            metadata={"field": "timeline", "value": "A2", "question_id": "ed_timeline_primary"},
            client_timestamp="2026-05-21T12:02:00Z",
        ),
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    ed = agg.json()["sessions"][0]["by_domain"]["ed"]["answer_history"]

    assert [h["value"] for h in ed["ed_timeline_primary"]] == ["A1", "A2"]
    assert [h["value"] for h in ed["ed_timeline_secondary"]] == ["B1"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_aggregate_records_rating_history_by_question_id(client, api_headers):
    # Two rating questions in one domain, kept apart by question_id; each
    # question's value history is preserved in time order.
    events = [
        {
            "event_type": "rating_click", "domain": "cp", "rating": 3,
            "metadata": {"question_id": "cp_helpfulness"},
            "client_timestamp": "2026-05-21T12:00:00Z",
        },
        {
            "event_type": "rating_click", "domain": "cp", "rating": 5,
            "metadata": {"question_id": "cp_clarity"},
            "client_timestamp": "2026-05-21T12:01:00Z",
        },
        {
            "event_type": "rating_click", "domain": "cp", "rating": 4,
            "metadata": {"question_id": "cp_helpfulness"},
            "client_timestamp": "2026-05-21T12:02:00Z",
        },
    ]
    post = await client.post(PREFIX, json=_batch(events), headers=api_headers)
    assert post.status_code == 200, post.text

    agg = await client.get(f"{PREFIX}/aggregate", params={"file": "REC001"}, headers=api_headers)
    cp = agg.json()["sessions"][0]["by_domain"]["cp"]["rating_history"]

    assert [h["value"] for h in cp["cp_helpfulness"]] == [3, 4]
    assert [h["value"] for h in cp["cp_clarity"]] == [5]
