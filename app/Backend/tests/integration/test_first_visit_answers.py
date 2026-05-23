"""Integration tests for the row-per-question first-visit answers (migration 014).

Covers the question_id-keyed Pydantic validation, the GET / PUT endpoints, the
per-question upsert (re-Submit overwrites one row), and the headline capability:
two questions of the SAME type in one domain stay apart by question_id — which
the legacy fixed-column responses table could not represent.
"""

import pytest
import pytest_asyncio

from models import PatientSummary
from routes_patient import AnswerItem, FirstVisitAnswersUpsert


URL_GET = "/api/patient/first-visit-answers/{file}/{speaker}"
URL_PUT = "/api/patient/first-visit-answers"


# ── Pydantic validation (no DB) ───────────────────────────────────────────────

class TestAnswerValidation:
    def test_vas_out_of_range_rejected(self):
        with pytest.raises(ValueError):
            AnswerItem(question_id="cp_risk_without_treatment", field="vas", value=101)

    def test_vas_non_int_rejected(self):
        with pytest.raises(ValueError):
            AnswerItem(question_id="cp_risk_without_treatment", field="vas", value="50")

    def test_vas_at_bounds_accepted(self):
        AnswerItem(question_id="x", field="vas", value=0)
        AnswerItem(question_id="x", field="vas", value=100)

    def test_factors_must_be_string_list(self):
        with pytest.raises(ValueError):
            AnswerItem(question_id="le_factors", field="factors", value="Age")

    def test_cp_factors_rejected_at_domain_level(self):
        with pytest.raises(ValueError):
            FirstVisitAnswersUpsert(
                file="f.xlsx", speaker="Patient", domain="cp",
                answers=[AnswerItem(question_id="cp_factors", field="factors", value=["Age"])],
            )

    def test_factors_outside_whitelist_rejected(self):
        with pytest.raises(ValueError):
            FirstVisitAnswersUpsert(
                file="f.xlsx", speaker="Patient", domain="le",
                answers=[AnswerItem(question_id="le_factors", field="factors",
                                    value=["Baseline function"])],
            )


# ── HTTP integration ──────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def patient_row(db):
    row = PatientSummary(file="f.xlsx", speaker="Patient")
    db.add(row)
    await db.commit()
    return row


@pytest.mark.asyncio
async def test_get_empty_returns_all_domains(client, patient_row, api_headers):
    resp = await client.get(URL_GET.format(file="f.xlsx", speaker="Patient"),
                            headers=api_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["responses"].keys()) == {"cp", "le", "ed", "inc", "ius"}
    assert all(v == {} for v in body["responses"].values())


@pytest.mark.asyncio
async def test_put_then_get_round_trip(client, patient_row, api_headers):
    put = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
        "answers": [
            {"question_id": "cp_risk_without_treatment", "field": "vas", "value": 35},
            {"question_id": "cp_risk_with_treatment", "field": "vas", "value": 60},
            {"question_id": "cp_timeline", "field": "timeline", "value": "Over next 5 years"},
        ],
    })
    assert put.status_code == 200, put.text
    cp = put.json()["responses"]["cp"]
    assert cp["cp_risk_without_treatment"]["value"] == 35
    assert cp["cp_risk_with_treatment"]["value"] == 60
    assert cp["cp_timeline"]["value"] == "Over next 5 years"

    get = await client.get(URL_GET.format(file="f.xlsx", speaker="Patient"),
                           headers=api_headers)
    assert get.json()["responses"]["cp"]["cp_timeline"]["field"] == "timeline"


@pytest.mark.asyncio
async def test_resubmit_overwrites_one_question(client, patient_row, api_headers):
    base = {"file": "f.xlsx", "speaker": "Patient", "domain": "ed"}
    await client.put(URL_PUT, headers=api_headers, json={
        **base, "answers": [{"question_id": "ed_baseline_return", "field": "vas", "value": 40}],
    })
    out = await client.put(URL_PUT, headers=api_headers, json={
        **base, "answers": [{"question_id": "ed_baseline_return", "field": "vas", "value": 75}],
    })
    ed = out.json()["responses"]["ed"]
    assert ed["ed_baseline_return"]["value"] == 75  # overwritten, not duplicated
    assert len(ed) == 1


@pytest.mark.asyncio
async def test_two_same_type_questions_in_one_domain_kept_apart(
    client, patient_row, api_headers
):
    # The whole point of question_id: two timeline-type questions in ed,
    # impossible to store in the old single-`timeline`-column table.
    out = await client.put(URL_PUT, headers=api_headers, json={
        "file": "f.xlsx", "speaker": "Patient", "domain": "ed",
        "answers": [
            {"question_id": "ed_timeline", "field": "timeline", "value": "6 months after treatment"},
            {"question_id": "ed_timeline_secondary", "field": "timeline", "value": "Lifetime"},
        ],
    })
    ed = out.json()["responses"]["ed"]
    assert ed["ed_timeline"]["value"] == "6 months after treatment"
    assert ed["ed_timeline_secondary"]["value"] == "Lifetime"
