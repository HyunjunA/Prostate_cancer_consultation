"""Tests for health and readiness endpoints.

Endpoints tested:
  GET /          (requires auth)
  GET /health    (no auth, checks DB + Redis + NLP)
  GET /ready     (no auth, checks DB only)
"""

import pytest
import pytest_asyncio


# ── GET / (root) ──────────────────────────────────────────────────────────

class TestRootEndpoint:
    """GET / requires a valid API key and returns app info."""

    @pytest.mark.asyncio
    async def test_root_returns_app_info(self, client, api_headers):
        resp = await client.get("/", headers=api_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "version" in data
        assert data["version"] == "1.0.0"

    @pytest.mark.asyncio
    async def test_root_without_api_key_returns_403(self, client):
        resp = await client.get("/")
        assert resp.status_code == 403


# ── GET /health ───────────────────────────────────────────────────────────

class TestHealthEndpoint:
    """GET /health checks DB, Redis, NLP components."""

    @pytest.mark.asyncio
    async def test_health_returns_200_when_db_is_healthy(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "components" in data
        assert data["components"]["database"] == "healthy"

    @pytest.mark.asyncio
    async def test_health_includes_redis_status(self, client):
        resp = await client.get("/health")
        data = resp.json()
        # Redis is mocked as None → disabled
        assert data["components"]["redis"] in ("healthy", "disabled")

    @pytest.mark.asyncio
    async def test_health_includes_nlp_status(self, client):
        resp = await client.get("/health")
        data = resp.json()
        # NLP is mocked as healthy
        assert data["components"]["nlp"] == "healthy"


# ── GET /ready ────────────────────────────────────────────────────────────

class TestReadyEndpoint:
    """GET /ready checks database readiness."""

    @pytest.mark.asyncio
    async def test_ready_returns_200(self, client):
        resp = await client.get("/ready")
        assert resp.status_code == 200
        data = resp.json()
        assert "ready" in data
