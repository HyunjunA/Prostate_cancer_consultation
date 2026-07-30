"""Behavior tracking must accept a de-identified speaker.

De-identification turns the speaker into
``Patient_<patient hash>_<doctor hash>_<date hash>`` — 105 characters. The DB
columns were widened to VARCHAR(255) in migration 034, but the request models
still capped speaker at 100, so every event from a de-identified visit was
rejected with a 422 that the frontend swallows: the admin dashboards stayed
empty while the pages looked fine.

One test per tracking endpoint, plus the first-visit answers upsert that carries
the same speaker.
"""

import pytest

pytestmark = pytest.mark.usefixtures("stub_admin_auth")

# A real de-identified speaker: 8 + 28 + 1 + 28 + 1 + 39 = 105 chars.
DEID_SPEAKER = (
    "Patient_CSSVYHV2TN5HB4LQIJDHQY3MVD4A_RWDRXT64VEWNAFAIH6XAJMFIJO2Q"
    "_TRJXRK6QTCVJTO5BN7E2L7JLIE6GB3H7LJ3SPVY"
)
DEID_FILE = (
    "CSSVYHV2TN5HB4LQIJDHQY3MVD4A_RWDRXT64VEWNAFAIH6XAJMFIJO2Q"
    "_TRJXRK6QTCVJTO5BN7E2L7JLIE6GB3H7LJ3SPVY.csv"
)


def test_deid_speaker_is_longer_than_the_old_cap():
    # Guards the premise: if this ever drops back under 100 the tests below
    # would pass without exercising the regression.
    assert len(DEID_SPEAKER) > 100


@pytest.mark.integration
@pytest.mark.asyncio
async def test_patient_report_accepts_deid_speaker(client, api_headers):
    resp = await client.post("/api/track/patient-report", headers=api_headers, json={
        "session_id": "sess-deid-1",
        "file": DEID_FILE,
        "speaker": DEID_SPEAKER,
        "events": [{
            "event_type": "page_view",
            "metadata": {"page": "patient_report_page"},
            "client_timestamp": "2026-07-30T12:00:00Z",
        }],
    })

    assert resp.status_code == 200, resp.text
    assert resp.json()["events_stored"] == 1


@pytest.mark.integration
@pytest.mark.asyncio
async def test_patient_followup_accepts_deid_speaker(client, api_headers):
    resp = await client.post("/api/track/patient-followup", headers=api_headers, json={
        "session_id": "sess-deid-2",
        "file": DEID_FILE,
        "speaker": DEID_SPEAKER,
        "events": [{
            "event_type": "page_view",
            "survey_type": "risk_perception",
            "metadata": {},
            "client_timestamp": "2026-07-30T12:00:00Z",
        }],
    })

    assert resp.status_code == 200, resp.text


@pytest.mark.integration
@pytest.mark.asyncio
async def test_doctor_accepts_deid_speaker(client, api_headers):
    resp = await client.post("/api/track/doctor", headers=api_headers, json={
        "session_id": "sess-deid-3",
        "file": DEID_FILE,
        "speaker": DEID_SPEAKER,
        "events": [{
            "event_type": "page_view",
            "metadata": {},
            "client_timestamp": "2026-07-30T12:00:00Z",
        }],
    })

    assert resp.status_code == 200, resp.text
