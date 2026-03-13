"""Tests for API key authentication (auth module A).

Covers the APIKeyBackend (auth/backends/api_key.py) which authenticates
requests via the ``X-API-Key`` header using hmac.compare_digest.

Endpoints used for testing:
  GET /          (requires auth via get_current_user)
  GET /health    (no auth required)
  GET /ready     (no auth required)
  GET /api/doctor/files       (requires auth)
  GET /api/patient/files      (requires auth)
  GET /api/stats/dashboard    (requires auth)
"""

import pytest


# ── Valid API Key ────────────────────────────────────────────────────────

class TestValidAPIKey:
    """Requests with a correct API key should be accepted."""

    async def test_valid_key_returns_200(self, client, api_headers):
        """GET / with valid X-API-Key returns 200."""
        resp = await client.get("/", headers=api_headers)
        assert resp.status_code == 200

    async def test_valid_key_returns_expected_body(self, client, api_headers):
        """Response body includes app info fields."""
        resp = await client.get("/", headers=api_headers)
        data = resp.json()
        assert data["version"] == "1.0.0"
        assert "message" in data
        assert "docs" in data
        assert "health" in data


# ── Missing API Key ──────────────────────────────────────────────────────

class TestMissingAPIKey:
    """Requests without the X-API-Key header should be rejected."""

    async def test_missing_key_returns_403(self, client):
        """GET / without any API key header returns 403."""
        resp = await client.get("/")
        assert resp.status_code == 403

    async def test_missing_key_error_detail(self, client):
        """Error response contains 'Missing API Key' detail."""
        resp = await client.get("/")
        data = resp.json()
        assert data["detail"] == "Missing API Key"


# ── Invalid API Key ──────────────────────────────────────────────────────

class TestInvalidAPIKey:
    """Requests with an incorrect API key should be rejected."""

    async def test_wrong_key_returns_403(self, client, bad_api_headers):
        """GET / with wrong X-API-Key returns 403."""
        resp = await client.get("/", headers=bad_api_headers)
        assert resp.status_code == 403

    async def test_wrong_key_error_detail(self, client, bad_api_headers):
        """Error response contains 'Invalid API Key' detail."""
        resp = await client.get("/", headers=bad_api_headers)
        data = resp.json()
        assert data["detail"] == "Invalid API Key"

    async def test_empty_key_returns_403(self, client):
        """An empty string API key should be rejected as invalid."""
        resp = await client.get("/", headers={"X-API-Key": ""})
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Invalid API Key"


# ── Header Edge Cases ────────────────────────────────────────────────────

class TestHeaderEdgeCases:
    """Edge cases around HTTP header handling."""

    async def test_header_name_is_case_insensitive(self, client):
        """HTTP headers are case-insensitive; lowercase should also work."""
        resp = await client.get("/", headers={"x-api-key": "test-api-key"})
        assert resp.status_code == 200

    async def test_mixed_case_header_name(self, client):
        """Mixed case 'X-Api-Key' should also be accepted."""
        resp = await client.get("/", headers={"X-Api-Key": "test-api-key"})
        assert resp.status_code == 200

    async def test_key_with_leading_whitespace_rejected(self, client):
        """API key value with leading whitespace should not match."""
        resp = await client.get("/", headers={"X-API-Key": " test-api-key"})
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Invalid API Key"

    async def test_key_with_trailing_whitespace_rejected(self, client):
        """API key value with trailing whitespace should not match."""
        resp = await client.get("/", headers={"X-API-Key": "test-api-key "})
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Invalid API Key"


# ── Unauthenticated (Public) Endpoints ───────────────────────────────────

class TestPublicEndpoints:
    """Endpoints that should NOT require an API key."""

    async def test_health_no_auth_required(self, client):
        """GET /health works without any API key."""
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    async def test_ready_no_auth_required(self, client):
        """GET /ready works without any API key."""
        resp = await client.get("/ready")
        assert resp.status_code == 200
        assert "ready" in resp.json()


# ── Auth-Required Endpoint Spot Checks ───────────────────────────────────

class TestAuthRequiredEndpoints:
    """Spot-check that various authenticated endpoints reject missing keys."""

    async def test_doctor_files_requires_auth(self, client):
        """GET /api/doctor/files without key returns 403."""
        resp = await client.get("/api/doctor/files")
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Missing API Key"

    async def test_patient_files_requires_auth(self, client):
        """GET /api/patient/files without key returns 403."""
        resp = await client.get("/api/patient/files")
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Missing API Key"

    async def test_dashboard_stats_requires_auth(self, client):
        """GET /api/stats/dashboard without key returns 403."""
        resp = await client.get("/api/stats/dashboard")
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Missing API Key"

    async def test_auth_required_endpoint_with_wrong_key(self, client, bad_api_headers):
        """GET /api/doctor/files with wrong key returns 403 Invalid."""
        resp = await client.get("/api/doctor/files", headers=bad_api_headers)
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Invalid API Key"
