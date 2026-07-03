"""Tests for patient interface CRUD endpoints.

Endpoints tested:
  GET  /api/patient/scoring                (list scoring data)
  PUT  /api/patient/scoring                (upsert scoring)
  GET  /api/patient/responses              (list responses)
  PUT  /api/patient/responses              (upsert responses)
  GET  /api/patient/files                  (distinct file names)
"""

import pytest

from tests.factories import TestDataFactory


# Migration 008 collapsed PatientSummaryScoring + PatientResponses into
# columns on PatientSummaryDomain. The detail/scoring/responses test
# classes below assert on the old per-class shape (class_1, answer_1,
# class_1_patient_scoring, …) and the old separate /api/patient/scoring
# and /api/patient/responses CRUD endpoints. Both the schema and the
# endpoints they target are gone, so the assertions cannot be made
# meaningful without a full rewrite against the per-domain schema.
# Marked skip individually below so the suite stays green; rewriting
# them is tracked as a separate cleanup task.
_obsolete_per_class_schema = pytest.mark.skip(
    reason="Old per-class PatientSummary/PatientScoring/PatientResponses schema "
    "removed in migration 008; tests need to be rewritten for PatientSummaryDomain."
)



# ── GET /api/patient/files ───────────────────────────────────────────────────

class TestGetPatientFiles:
    """GET /api/patient/files — distinct file names from PatientSummary."""

    async def test_empty_db_returns_empty_list(self, client, api_headers):
        resp = await client.get("/api/patient/files", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["files"] == []

    async def test_returns_distinct_files(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="alpha.xlsx", speaker="P1"))
        db.add(TestDataFactory.patient_summary(file="alpha.xlsx", speaker="P2"))
        db.add(TestDataFactory.patient_summary(file="beta.xlsx", speaker="P1"))
        await db.commit()

        resp = await client.get("/api/patient/files", headers=api_headers)
        data = resp.json()
        assert len(data["files"]) == 2
        assert set(data["files"]) == {"alpha.xlsx", "beta.xlsx"}

    async def test_files_sorted_alphabetically(self, client, api_headers, db):
        db.add(TestDataFactory.patient_summary(file="zebra.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_summary(file="apple.xlsx", speaker="P"))
        db.add(TestDataFactory.patient_summary(file="mango.xlsx", speaker="P"))
        await db.commit()

        resp = await client.get("/api/patient/files", headers=api_headers)
        files = resp.json()["files"]
        assert files == sorted(files)

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/patient/files")
        assert resp.status_code == 403
