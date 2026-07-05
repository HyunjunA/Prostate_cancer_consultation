"""Integration tests for the first-visit -> REDCap sync wired into
PUT /api/patient/first-visit-answers.

These exercise the real HTTP endpoint (in-memory SQLite + ASGI client) and mock
only the outbound REDCap call via respx, asserting:
  - a domain Submit POSTs the correctly mapped/coded fields to REDCap,
  - the inc->ui / ius->il rename appears in the payload,
  - multi-select factors send every selection as a `field___<code>`=1 checkbox pair,
  - REDCap being disabled makes NO outbound call,
  - a REDCap failure never breaks the primary DB write (best-effort mirror).
"""

import json
from urllib.parse import parse_qs

import httpx
import pytest
import pytest_asyncio
import respx

from models import PatientSummary

URL_PUT = "/api/patient/first-visit-answers"
URL_GET = "/api/patient/first-visit-answers/{file}/{speaker}"

FAKE_REDCAP_URL = "https://redcap.example.com/api/"
FAKE_REDCAP_TOKEN = "FAKE_TOKEN_1234567890"


@pytest.fixture
def enable_redcap(monkeypatch):
    """Point routes_patient's REDCap config at the fake URL/token."""
    import routes_patient
    monkeypatch.setattr(routes_patient, "REDCAP_API_URL", FAKE_REDCAP_URL)
    monkeypatch.setattr(routes_patient, "REDCAP_API_TOKEN", FAKE_REDCAP_TOKEN)


@pytest.fixture
def disable_redcap(monkeypatch):
    """Force REDCap off (URL/TOKEN None) so the sync is a genuine no-op."""
    import routes_patient
    monkeypatch.setattr(routes_patient, "REDCAP_API_URL", None)
    monkeypatch.setattr(routes_patient, "REDCAP_API_TOKEN", None)


@pytest_asyncio.fixture
async def patient_row(db):
    row = PatientSummary(file="f.xlsx", speaker="Patient")
    db.add(row)
    await db.commit()
    return row


def _posted_record(route):
    """Extract the single REDCap record dict from the last mocked POST."""
    req = route.calls.last.request
    form = parse_qs(req.content.decode())
    return json.loads(form["data"][0])[0]


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_cp_submit_posts_mapped_payload(client, patient_row, api_headers, enable_redcap):
    route = respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(200, json={"count": 1}))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
        "answers": [
            {"question_id": "cp_risk_without_treatment", "field": "vas", "value": 35},
            {"question_id": "cp_risk_with_treatment", "field": "vas", "value": 60},
            {"question_id": "cp_timeline", "field": "timeline", "value": "Over next 5 years"},
        ],
    })

    assert resp.status_code == 200, resp.text
    assert route.called
    record = _posted_record(route)
    assert record["record_id"] == "Patient"
    assert record["cp_1_rp_v2"] == "35"
    assert record["cp_2_rp_v2"] == "60"
    assert record["cp_3_rp_v2"] == "2"  # "Over next 5 years" -> code 2
    assert record["risk_perception_2_complete"] == "2"


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_factor_multiselect_sends_all(client, patient_row, api_headers, enable_redcap):
    route = respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(200, json={"count": 1}))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "le",
        "answers": [
            {"question_id": "le_timeline", "field": "timeline", "value": "16-20 years"},
            {"question_id": "le_factors", "field": "factors", "value": ["Age", "Tumor stage"]},
        ],
    })

    assert resp.status_code == 200, resp.text
    record = _posted_record(route)
    assert record["le_1_rp_v2"] == "4"        # "16-20 years" -> 4
    # Both selected factors are sent as checkbox options (Age -> 2, Tumor stage -> 5).
    assert record["le_2_rp_v2___2"] == "1"
    assert record["le_2_rp_v2___5"] == "1"
    assert "le_2_rp_v2" not in record         # no plain radio field anymore


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_inc_domain_rename_in_payload(client, patient_row, api_headers, enable_redcap):
    route = respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(200, json={"count": 1}))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "inc",
        "answers": [
            {"question_id": "inc_risk", "field": "vas", "value": 20},
            {"question_id": "inc_timeline", "field": "timeline", "value": "6 months"},
            {"question_id": "inc_factors", "field": "factors", "value": ["Tumor stage"]},
        ],
    })

    assert resp.status_code == 200, resp.text
    record = _posted_record(route)
    # inc -> ui in REDCap; the dashboard-side "inc_*" names must not leak.
    assert record["ui_1_rp_v2"] == "20"
    assert record["ui_2_rp_v2"] == "2"        # "6 months" -> 2
    assert record["ui_3_rp_v2___3"] == "1"    # "Tumor stage" -> 3 (ed/inc/ius table), checkbox option
    assert not any(k.startswith("inc_") for k in record)


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock(assert_all_called=False)
async def test_redcap_disabled_makes_no_call(client, patient_row, api_headers):
    # No enable_redcap fixture -> REDCAP_API_URL/TOKEN are None -> sync is a no-op.
    route = respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(200, json={"count": 1}))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
        "answers": [{"question_id": "cp_timeline", "field": "timeline", "value": "Over my lifetime"}],
    })

    assert resp.status_code == 200, resp.text
    assert not route.called


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_redcap_failure_does_not_break_db(client, patient_row, api_headers, enable_redcap):
    # REDCap rejects the import, but the DB write (and the 200) must stand.
    respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(500, text="boom"))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "ius",
        "answers": [
            {"question_id": "ius_risk", "field": "vas", "value": 29},
            {"question_id": "ius_timeline", "field": "timeline", "value": "Lifetime"},
        ],
    })

    assert resp.status_code == 200, resp.text
    # The answer is persisted regardless of the REDCap outcome.
    got = await client.get(URL_GET.format(file="f.xlsx", speaker="Patient"), headers=api_headers)
    assert got.json()["responses"]["ius"]["ius_risk"]["value"] == 29


async def _fetch_risk2_row(db):
    """Read back the patient's single risk_perception_2 submission row."""
    from sqlalchemy import select
    from models import PatientSurveySubmissionLog

    db.expire_all()
    stmt = select(PatientSurveySubmissionLog).where(
        PatientSurveySubmissionLog.file == "f.xlsx",
        PatientSurveySubmissionLog.speaker == "Patient",
        PatientSurveySubmissionLog.survey_type == "risk_perception_2",
    )
    return (await db.execute(stmt)).scalars().first()


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_redcap_record_id_is_unhashed_sid(client, api_headers, enable_redcap, db):
    # A realistic hashed speaker must be posted to REDCap under its UN-HASHED SID,
    # and the row must store the attribution (sid/doctor).
    from models import PatientSummary
    db.add(PatientSummary(file="13511_13571_07022026.csv", speaker="Patient_13511_13571_07022026"))
    await db.commit()
    route = respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(200, json={"count": 1}))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "13511_13571_07022026.csv", "speaker": "Patient_13511_13571_07022026", "domain": "cp",
        "answers": [{"question_id": "cp_timeline", "field": "timeline", "value": "Over next 5 years"}],
    })

    assert resp.status_code == 200, resp.text
    record = _posted_record(route)
    assert record["record_id"] == "SID_22"  # un-hashed, NOT "Patient_13511_..."

    from sqlalchemy import select
    from models import PatientSurveySubmissionLog
    db.expire_all()
    row = (await db.execute(select(PatientSurveySubmissionLog).where(
        PatientSurveySubmissionLog.speaker == "Patient_13511_13571_07022026"))).scalars().first()
    assert row.sid == "SID_22"
    assert row.doctor == "doc2"
    assert row.redcap_record_id == "SID_22"


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_sync_success_recorded_on_row(client, patient_row, api_headers, enable_redcap, db):
    # A successful REDCap import records synced=True + record_id on the DB row.
    respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(200, json={"count": 1}))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
        "answers": [{"question_id": "cp_timeline", "field": "timeline", "value": "Over next 5 years"}],
    })

    assert resp.status_code == 200, resp.text
    row = await _fetch_risk2_row(db)
    assert row.redcap_synced is True
    assert row.redcap_record_id == "Patient"
    assert row.redcap_error is None


@pytest.mark.integration
@pytest.mark.asyncio
@respx.mock
async def test_sync_failure_recorded_on_row(client, patient_row, api_headers, enable_redcap, db):
    # A REDCap failure records synced=False + the error on the DB row (visible for retry).
    respx.post(FAKE_REDCAP_URL).mock(return_value=httpx.Response(500, text="boom"))

    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
        "answers": [{"question_id": "cp_timeline", "field": "timeline", "value": "Over next 5 years"}],
    })

    assert resp.status_code == 200, resp.text
    row = await _fetch_risk2_row(db)
    assert row.redcap_synced is False
    assert row.redcap_record_id == "Patient"
    assert "HTTP 500" in (row.redcap_error or "")


@pytest.mark.integration
@pytest.mark.asyncio
async def test_sync_disabled_leaves_flags_untouched(client, patient_row, api_headers, db, disable_redcap):
    # REDCap disabled -> no push attempted -> the row's sync flags stay at their defaults.
    resp = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
        "answers": [{"question_id": "cp_timeline", "field": "timeline", "value": "Over my lifetime"}],
    })

    assert resp.status_code == 200, resp.text
    row = await _fetch_risk2_row(db)
    assert row.redcap_synced is False
    assert row.redcap_record_id is None
    assert row.redcap_error is None
