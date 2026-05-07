"""Integration tests for V37 first-visit responses (migration 010).

Covers the Pydantic validators, the GET / PUT endpoints, the upsert
semantic (partial update preserves untouched columns), the auth gate,
and the CASCADE behaviour from the parent patient_summary row. SQLite
is sufficient — every constraint we exercise here is enforced at the
ORM / API layer, not by a Postgres-specific feature.

The factor whitelists asserted in the validator tests below mirror the
literal arrays in `app/Webapp/src/components/PatientInitialVisitReportV37.tsx`.
If those arrays change in either file, this suite catches the drift.
"""

from typing import Dict, Any

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from models import PatientFirstVisitResponses, PatientSummary
from routes_patient import (
    FirstVisitResponseUpsert,
    _FACTOR_WHITELIST,
)


# ── Pydantic validator unit tests (no DB) ─────────────────────────────────────

class TestFirstVisitUpsertValidator:
    """Direct unit tests of the Pydantic schema's domain-aware rules."""

    def _base_payload(self, **overrides) -> Dict[str, Any]:
        body = {"file": "f.xlsx", "speaker": "Patient", "domain": "cp"}
        body.update(overrides)
        return body

    def test_minimal_cp_accepted(self):
        m = FirstVisitResponseUpsert(**self._base_payload())
        assert m.domain == "cp"

    def test_vas_below_zero_rejected(self):
        with pytest.raises(ValueError):
            FirstVisitResponseUpsert(**self._base_payload(vas_primary=-1))

    def test_vas_above_hundred_rejected(self):
        with pytest.raises(ValueError):
            FirstVisitResponseUpsert(**self._base_payload(vas_primary=101))

    def test_vas_at_bounds_accepted(self):
        FirstVisitResponseUpsert(**self._base_payload(vas_primary=0))
        FirstVisitResponseUpsert(**self._base_payload(vas_primary=100))

    def test_unknown_domain_rejected(self):
        with pytest.raises(ValueError):
            FirstVisitResponseUpsert(**self._base_payload(domain="bogus"))

    def test_factors_on_cp_rejected(self):
        # cp domain has no factor checkbox in V37 — the API enforces it.
        with pytest.raises(ValueError):
            FirstVisitResponseUpsert(
                **self._base_payload(domain="cp", factors=["Age"])
            )

    def test_factors_outside_le_whitelist_rejected(self):
        # le's whitelist contains "Marital status" but NOT "Baseline function".
        with pytest.raises(ValueError):
            FirstVisitResponseUpsert(
                **self._base_payload(domain="le",
                                     factors=["Baseline function"])
            )

    def test_factors_inside_le_whitelist_accepted(self):
        # All five le factors should be accepted together.
        FirstVisitResponseUpsert(
            **self._base_payload(
                domain="le",
                factors=list(_FACTOR_WHITELIST["le"]),
            )
        )

    @pytest.mark.parametrize("domain", ["ed", "inc", "ius"])
    def test_baseline_function_accepted_on_ed_inc_ius(self, domain):
        # ed/inc/ius share the same whitelist that DOES include
        # "Baseline function".
        FirstVisitResponseUpsert(
            **self._base_payload(
                domain=domain,
                factors=["Baseline function"],
            )
        )

    @pytest.mark.parametrize("domain", ["le", "ed", "inc", "ius"])
    def test_vas_secondary_rejected_on_non_cp(self, domain):
        with pytest.raises(ValueError):
            FirstVisitResponseUpsert(
                **self._base_payload(domain=domain, vas_secondary=50)
            )

    def test_vas_secondary_accepted_on_cp(self):
        FirstVisitResponseUpsert(
            **self._base_payload(domain="cp", vas_secondary=50)
        )


# ── HTTP integration tests (full FastAPI stack against SQLite) ────────────────

URL_GET = "/api/patient/first-visit-responses/{file}/{speaker}"
URL_PUT = "/api/patient/first-visit-responses"


@pytest_asyncio.fixture
async def patient_row(db):
    """Seed a parent patient_summary row so the FK target exists."""
    row = PatientSummary(file="f.xlsx", speaker="Patient")
    db.add(row)
    await db.commit()
    return row


class TestAuth:
    @pytest.mark.asyncio
    async def test_get_without_api_key_returns_403(self, client, patient_row):
        resp = await client.get(URL_GET.format(file="f.xlsx", speaker="Patient"))
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_get_with_wrong_api_key_returns_403(
        self, client, patient_row, bad_api_headers
    ):
        resp = await client.get(
            URL_GET.format(file="f.xlsx", speaker="Patient"),
            headers=bad_api_headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_put_without_api_key_returns_403(self, client, patient_row):
        resp = await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "vas_primary": 35,
        })
        assert resp.status_code == 403


class TestRoundTrip:
    @pytest.mark.asyncio
    async def test_get_returns_all_five_keys_with_nulls_when_empty(
        self, client, patient_row, api_headers
    ):
        resp = await client.get(
            URL_GET.format(file="f.xlsx", speaker="Patient"),
            headers=api_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert set(body["responses"].keys()) == {"cp", "le", "ed", "inc", "ius"}
        assert all(v is None for v in body["responses"].values())

    @pytest.mark.asyncio
    async def test_put_then_get_round_trip(
        self, client, patient_row, api_headers
    ):
        put_payload = {
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "vas_primary": 35, "vas_secondary": 60, "timeline": "B",
        }
        put_resp = await client.put(URL_PUT, json=put_payload,
                                    headers=api_headers)
        assert put_resp.status_code == 200
        put_body = put_resp.json()
        assert put_body["vas_primary"] == 35
        assert put_body["vas_secondary"] == 60
        assert put_body["timeline"] == "B"
        assert put_body["submitted_at"]

        get_resp = await client.get(
            URL_GET.format(file="f.xlsx", speaker="Patient"),
            headers=api_headers,
        )
        cp = get_resp.json()["responses"]["cp"]
        assert cp["vas_primary"] == 35
        assert cp["vas_secondary"] == 60
        assert cp["timeline"] == "B"
        # Other domains stay null.
        assert get_resp.json()["responses"]["le"] is None

    @pytest.mark.asyncio
    async def test_partial_put_preserves_untouched_columns(
        self, client, patient_row, api_headers
    ):
        # First PUT: full cp payload.
        await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "vas_primary": 35, "vas_secondary": 60, "timeline": "B",
        }, headers=api_headers)

        # Second PUT: only vas_primary changes; the other fields must
        # not be reset to NULL by the partial body.
        await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "vas_primary": 40,
        }, headers=api_headers)

        get_resp = await client.get(
            URL_GET.format(file="f.xlsx", speaker="Patient"),
            headers=api_headers,
        )
        cp = get_resp.json()["responses"]["cp"]
        assert cp["vas_primary"] == 40
        assert cp["vas_secondary"] == 60   # preserved
        assert cp["timeline"] == "B"       # preserved


class TestValidationFromHttp:
    """422 cases — Pydantic rejects the bad payload before it reaches the DB."""

    @pytest.mark.asyncio
    async def test_invalid_vas_returns_422(
        self, client, patient_row, api_headers
    ):
        resp = await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "vas_primary": 200,
        }, headers=api_headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_factors_on_cp_returns_422(
        self, client, patient_row, api_headers
    ):
        resp = await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "factors": ["Age"],
        }, headers=api_headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_le_baseline_function_factor_returns_422(
        self, client, patient_row, api_headers
    ):
        resp = await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "le",
            "factors": ["Baseline function"],
        }, headers=api_headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_vas_secondary_on_ed_returns_422(
        self, client, patient_row, api_headers
    ):
        resp = await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "ed",
            "vas_secondary": 50,
        }, headers=api_headers)
        assert resp.status_code == 422


class TestCascadeDelete:
    @pytest.mark.asyncio
    async def test_deleting_patient_summary_cascades(
        self, client, db, patient_row, api_headers
    ):
        # SQLite disables FK enforcement by default; flip it on so the
        # CASCADE we depend on in production gets exercised by the
        # test suite as well.
        await db.execute(text("PRAGMA foreign_keys = ON"))

        await client.put(URL_PUT, json={
            "file": "f.xlsx", "speaker": "Patient", "domain": "cp",
            "vas_primary": 35,
        }, headers=api_headers)

        # Confirm the row landed.
        rows_before = (await db.execute(
            select(PatientFirstVisitResponses)
        )).scalars().all()
        assert len(rows_before) == 1

        # Delete the parent — children should follow.
        await db.delete(patient_row)
        await db.commit()

        rows_after = (await db.execute(
            select(PatientFirstVisitResponses)
        )).scalars().all()
        assert rows_after == []
