"""Tests for redcap_mapping: SID -> numeric record_id, and the existence check.

REDCap records are keyed by the number in the study SID (``SID_22`` -> ``22``) and
are created by hand in REDCap, so the resolver strips the prefix and ``record_exists``
confirms the coordinator already made that record before anything is imported.
"""
import httpx
import pytest

import redcap_mapping as rm

# asyncio_mode = auto (pytest.ini): async tests run without an explicit marker,
# and the pure to_record_id() cases stay plain sync functions.


class _FakeResponse:
    """Minimal httpx.Response stand-in for the record lookup."""

    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=None)

    def json(self):
        return self._payload


class _FakeClient:
    """Async context manager whose post() returns a canned response."""

    def __init__(self, response):
        self._response = response
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def post(self, url, data=None):
        self.calls.append((url, data))
        return self._response


def _patch_client(monkeypatch, response):
    client = _FakeClient(response)
    monkeypatch.setattr(rm.httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(rm, "REDCAP_ENABLED", True)
    monkeypatch.setattr(rm, "REDCAP_API_URL", "https://redcap.example.org/api/")
    monkeypatch.setattr(rm, "REDCAP_API_TOKEN", "test-token")
    return client


# ── to_record_id / resolve_record_id ────────────────────────────────────────

def test_to_record_id_strips_sid_prefix():
    assert rm.to_record_id("SID_22") == "22"


def test_to_record_id_accepts_loose_forms():
    # The same subject written a few ways all reduce to the one REDCap id.
    assert rm.to_record_id("sid 22") == "22"
    assert rm.to_record_id("SID22") == "22"
    assert rm.to_record_id("22") == "22"


def test_to_record_id_drops_leading_zeros():
    # REDCap stores ids without padding, so SID_01 must match record "1".
    assert rm.to_record_id("SID_01") == "1"


def test_to_record_id_none_without_digits():
    assert rm.to_record_id(None) is None
    assert rm.to_record_id("") is None
    assert rm.to_record_id("SID_unknown") is None


async def test_resolve_returns_numeric_record_id():
    assert await rm.resolve_record_id("SID_22") == "22"


async def test_resolve_none_for_empty_sid():
    assert await rm.resolve_record_id(None) is None
    assert await rm.resolve_record_id("") is None


# ── record_exists ───────────────────────────────────────────────────────────

async def test_record_exists_true_when_redcap_returns_the_id(monkeypatch):
    client = _patch_client(monkeypatch, _FakeResponse([{"record_id": "22"}]))

    assert await rm.record_exists("22") is True
    # The lookup asks for that one record and only the record_id field.
    _, data = client.calls[0]
    assert data["records[0]"] == "22"
    assert data["fields[0]"] == "record_id"


async def test_record_exists_false_when_redcap_has_no_such_record(monkeypatch):
    _patch_client(monkeypatch, _FakeResponse([]))

    assert await rm.record_exists("999") is False


async def test_record_exists_false_for_empty_id(monkeypatch):
    _patch_client(monkeypatch, _FakeResponse([{"record_id": "22"}]))

    assert await rm.record_exists(None) is False
    assert await rm.record_exists("") is False


async def test_record_exists_raises_when_redcap_errors(monkeypatch):
    _patch_client(monkeypatch, _FakeResponse([], status_code=500))

    # A failed check cannot prove the record exists — callers must not import.
    with pytest.raises(httpx.HTTPStatusError):
        await rm.record_exists("22")


async def test_record_exists_false_when_redcap_disabled(monkeypatch):
    monkeypatch.setattr(rm, "REDCAP_ENABLED", False)

    assert await rm.record_exists("22") is False
