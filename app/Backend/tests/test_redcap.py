"""Tests for REDCap integration endpoints under /api/surveys/redcap.

Endpoints tested:
  GET    /api/surveys/redcap/records                         (list REDCap records)
  GET    /api/surveys/redcap/records/{record_id}             (single record detail)
  POST   /api/surveys/redcap/records/{record_id}/import      (import data)
  DELETE /api/surveys/redcap/records/{record_id}             (delete record)
  POST   /api/surveys/redcap/import                          (bulk import)

All REDCap endpoints make external HTTP calls via httpx.  Tests mock these calls
using monkeypatch on the routes_surveys module-level flags and httpx responses
via the `respx` library.
"""


import httpx
import pytest
import respx


# ── Helpers ──────────────────────────────────────────────────────────────────

FAKE_REDCAP_URL = "https://redcap.example.com/api/"
FAKE_REDCAP_TOKEN = "FAKE_TOKEN_1234567890"


@pytest.fixture(autouse=True)
def _enable_redcap(monkeypatch):
    """Enable REDCap for all tests in this module by default."""
    import routes_surveys
    monkeypatch.setattr(routes_surveys, "REDCAP_ENABLED", True)
    monkeypatch.setattr(routes_surveys, "REDCAP_API_URL", FAKE_REDCAP_URL)
    monkeypatch.setattr(routes_surveys, "REDCAP_API_TOKEN", FAKE_REDCAP_TOKEN)


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/redcap/records
# ══════════════════════════════════════════════════════════════════════════════

class TestRedcapRecords:
    """GET /api/surveys/redcap/records"""

    @respx.mock
    async def test_returns_records(self, client, api_headers):
        # Mock 3 calls: project info, record_ids, target field status
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            httpx.Response(200, json={
                "project_title": "Test Project",
                "is_longitudinal": 0,
            }),
            httpx.Response(200, json=[
                {"record_id": "P001"},
                {"record_id": "P002"},
            ]),
            httpx.Response(200, json=[
                {"record_id": "P001", "dcs1_v2": "1", "sdmp_options": "", "risk_percep_1_1": "", "pt_satisfaction": ""},
                {"record_id": "P002", "dcs1_v2": "", "sdmp_options": "", "risk_percep_1_1": "", "pt_satisfaction": ""},
            ]),
        ])

        resp = await client.get("/api/surveys/redcap/records", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["total_records"] == 2
        assert "P001" in data["record_ids"]
        assert "P002" in data["record_ids"]

    @respx.mock
    async def test_empty_records(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            httpx.Response(200, json={
                "project_title": "Empty Project",
                "is_longitudinal": 0,
            }),
            httpx.Response(200, json=[]),
            httpx.Response(200, json=[]),
        ])

        resp = await client.get("/api/surveys/redcap/records", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["summary"]["total_records"] == 0
        assert data["record_ids"] == []

    @respx.mock
    async def test_response_shape(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            httpx.Response(200, json={
                "project_title": "Shape Test",
                "is_longitudinal": 0,
            }),
            httpx.Response(200, json=[{"record_id": "P001"}]),
            httpx.Response(200, json=[
                {"record_id": "P001", "dcs1_v2": "", "sdmp_options": "", "risk_percep_1_1": "", "pt_satisfaction": ""},
            ]),
        ])

        resp = await client.get("/api/surveys/redcap/records", headers=api_headers)
        data = resp.json()
        for key in ("project", "summary", "target_instruments", "target_fields",
                     "record_ids", "records_status"):
            assert key in data, f"Missing key: {key}"

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/redcap/records")
        assert resp.status_code == 403

    async def test_redcap_disabled_returns_503(self, client, api_headers, monkeypatch):
        import routes_surveys
        monkeypatch.setattr(routes_surveys, "REDCAP_ENABLED", False)

        resp = await client.get("/api/surveys/redcap/records", headers=api_headers)
        assert resp.status_code == 503


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/surveys/redcap/records/{record_id}
# ══════════════════════════════════════════════════════════════════════════════

class TestRedcapRecordDetail:
    """GET /api/surveys/redcap/records/{record_id}"""

    @respx.mock
    async def test_returns_single_record(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(
            return_value=httpx.Response(200, json=[{
                "record_id": "P001",
                "dcs1_v2": "1",
                "dcs2_v2": "2",
                "dcs3_v2": "",
                "dcs4_v2": "",
                "dcs5_v2": "",
                "dcs6_v2": "",
                "dcs7_v2": "",
                "dcs8_v2": "",
                "dcs9_v2": "",
                "dcs10_v2": "",
                "dcs11_v2": "",
                "dcs12_v2": "",
                "dcs13_v2": "",
                "dcs14_v2": "",
                "dcs15_v2": "",
                "dcs16_v2": "",
                "sdmp_options": "1",
                "sdm_ptos": "",
                "sdm_cons": "",
                "sdm_pref": "",
                "risk_percep_1_1": "",
                "risk_percept2_2": "",
                "risk_percept_3_3": "",
                "risk_percept_4_4": "",
                "risk_percep_5_5": "",
                "pt_satisfaction": "",
            }]),
        )

        resp = await client.get(
            "/api/surveys/redcap/records/P001", headers=api_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_id"] == "P001"
        assert data["decisional_conflict_survey"]["fields"]["dcs1_v2"]["value"] == "1"

    @respx.mock
    async def test_not_found(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(
            return_value=httpx.Response(200, json=[]),
        )

        resp = await client.get(
            "/api/surveys/redcap/records/MISSING", headers=api_headers
        )
        assert resp.status_code == 404

    @respx.mock
    async def test_response_shape(self, client, api_headers):
        # Build a full empty record response
        record = {"record_id": "P001"}
        for i in range(1, 17):
            record[f"dcs{i}_v2"] = ""
        for f in ("sdmp_options", "sdm_ptos", "sdm_cons", "sdm_pref"):
            record[f] = ""
        for f in ("risk_percep_1_1", "risk_percept2_2", "risk_percept_3_3",
                   "risk_percept_4_4", "risk_percep_5_5"):
            record[f] = ""
        record["pt_satisfaction"] = ""

        respx.post(FAKE_REDCAP_URL).mock(
            return_value=httpx.Response(200, json=[record]),
        )

        resp = await client.get(
            "/api/surveys/redcap/records/P001", headers=api_headers
        )
        data = resp.json()
        for key in ("record_id", "decisional_conflict_survey",
                     "shared_decision_making", "risk_perception",
                     "patient_satisfaction"):
            assert key in data, f"Missing key: {key}"
        # Each instrument section has expected sub-keys
        for section in ("decisional_conflict_survey", "shared_decision_making",
                        "risk_perception", "patient_satisfaction"):
            assert "fields" in data[section]
            assert "filled_count" in data[section]
            assert "complete" in data[section]

    async def test_no_auth_returns_403(self, client):
        resp = await client.get("/api/surveys/redcap/records/P001")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/surveys/redcap/records/{record_id}/import
# ══════════════════════════════════════════════════════════════════════════════

class TestRedcapRecordImport:
    """POST /api/surveys/redcap/records/{record_id}/import"""

    @respx.mock
    async def test_successful_import(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            # Step 1: project info
            httpx.Response(200, json={
                "project_title": "Import Test",
                "is_longitudinal": 0,
            }),
            # Step 3: import
            httpx.Response(200, json=["P001"]),
            # Step 4: verify
            httpx.Response(200, json=[{
                "record_id": "P001",
                "dcs1_v2": "1",
            }]),
        ])

        resp = await client.post(
            "/api/surveys/redcap/records/P001/import",
            json={"dcs1_v2": "1"},
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["record_id"] == "P001"

    @respx.mock
    async def test_redcap_error(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            # Step 1: project info
            httpx.Response(200, json={
                "project_title": "Error Test",
                "is_longitudinal": 0,
            }),
            # Step 3: import fails
            httpx.Response(400, text="Invalid field name"),
        ])

        resp = await client.post(
            "/api/surveys/redcap/records/P001/import",
            json={"dcs1_v2": "1"},
            headers=api_headers,
        )
        assert resp.status_code == 400

    @respx.mock
    async def test_response_shape(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            httpx.Response(200, json={
                "project_title": "Shape Test",
                "is_longitudinal": 0,
            }),
            httpx.Response(200, json=["P001"]),
            httpx.Response(200, json=[{
                "record_id": "P001",
                "sdmp_options": "1",
            }]),
        ])

        resp = await client.post(
            "/api/surveys/redcap/records/P001/import",
            json={"sdmp_options": "1"},
            headers=api_headers,
        )
        data = resp.json()
        for key in ("status", "record_id", "project", "import_summary",
                     "imported_data", "verified_data", "redcap_response"):
            assert key in data, f"Missing key: {key}"

    async def test_no_auth_returns_403(self, client):
        resp = await client.post(
            "/api/surveys/redcap/records/P001/import",
            json={"dcs1_v2": "1"},
        )
        assert resp.status_code == 403

    async def test_redcap_disabled_returns_503(self, client, api_headers, monkeypatch):
        import routes_surveys
        monkeypatch.setattr(routes_surveys, "REDCAP_ENABLED", False)

        resp = await client.post(
            "/api/surveys/redcap/records/P001/import",
            json={"dcs1_v2": "1"},
            headers=api_headers,
        )
        assert resp.status_code == 503


# ══════════════════════════════════════════════════════════════════════════════
# DELETE /api/surveys/redcap/records/{record_id}
# ══════════════════════════════════════════════════════════════════════════════

class TestRedcapDelete:
    """DELETE /api/surveys/redcap/records/{record_id}"""

    @respx.mock
    async def test_successful_delete(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            # Step 1: verify record exists
            httpx.Response(200, json=[{"record_id": "P001"}]),
            # Step 2: delete
            httpx.Response(200, json=1),
            # Step 3: verify deletion
            httpx.Response(200, json=[]),
        ])

        resp = await client.delete(
            "/api/surveys/redcap/records/P001", headers=api_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "deleted"
        assert data["record_id"] == "P001"

    @respx.mock
    async def test_not_found(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(
            return_value=httpx.Response(200, json=[]),
        )

        resp = await client.delete(
            "/api/surveys/redcap/records/MISSING", headers=api_headers
        )
        assert resp.status_code == 404

    async def test_no_auth_returns_403(self, client):
        resp = await client.delete("/api/surveys/redcap/records/P001")
        assert resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/surveys/redcap/import  (bulk)
# ══════════════════════════════════════════════════════════════════════════════

class TestRedcapBulkImport:
    """POST /api/surveys/redcap/import"""

    @respx.mock
    async def test_successful_bulk_import(self, client, api_headers):
        respx.post(FAKE_REDCAP_URL).mock(side_effect=[
            # project info
            httpx.Response(200, json={
                "project_title": "Bulk Test",
                "is_longitudinal": 0,
            }),
            # import
            httpx.Response(200, json=["P001"]),
            # verify
            httpx.Response(200, json=[{
                "record_id": "P001",
                "dcs1_v2": "3",
            }]),
        ])

        resp = await client.post(
            "/api/surveys/redcap/import",
            json={
                "record_id": "P001",
                "data": {"dcs1_v2": "3"},
            },
            headers=api_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["record_id"] == "P001"

    async def test_no_auth_returns_403(self, client):
        resp = await client.post(
            "/api/surveys/redcap/import",
            json={"record_id": "P001", "data": {}},
        )
        assert resp.status_code == 403

    async def test_redcap_disabled_returns_503(self, client, api_headers, monkeypatch):
        import routes_surveys
        monkeypatch.setattr(routes_surveys, "REDCAP_ENABLED", False)

        resp = await client.post(
            "/api/surveys/redcap/import",
            json={"record_id": "P001", "data": {"dcs1_v2": "1"}},
            headers=api_headers,
        )
        assert resp.status_code == 503
