"""Tests for redcap_mapping — reading {SID: record_id} from REDCap + resolving.

REDCap export is mocked with respx; settings + the in-process cache are stubbed so
no real network call happens.
"""
import httpx
import pytest
import respx

import redcap_mapping as rm

pytestmark = pytest.mark.asyncio

FAKE_URL = "https://redcap.example.com/api/"


class _Settings:
    redcap_api_url = FAKE_URL
    redcap_api_token = "TOK"
    redcap_sid_field = "study_sid"
    redcap_enabled = True
    redcap_record_id_mode = "production"


@pytest.fixture(autouse=True)
def _stub(monkeypatch):
    monkeypatch.setattr(rm, "get_settings", lambda: _Settings())
    rm._MEM_CACHE["map"] = None  # reset the in-process cache between tests


@respx.mock
async def test_load_builds_map_from_sid_field():
    respx.post(FAKE_URL).mock(return_value=httpx.Response(200, json=[
        {"record_id": "1", "study_sid": "SID_21"},
        {"record_id": "2", "study_sid": "SID_22"},
        {"record_id": "3", "study_sid": ""},        # no SID -> skipped
    ]))
    assert await rm.load_sid_to_record_id(force=True) == {"SID_21": "1", "SID_22": "2"}


@respx.mock
async def test_resolve_hit():
    respx.post(FAKE_URL).mock(return_value=httpx.Response(200, json=[
        {"record_id": "2", "study_sid": "SID_22"}]))
    assert await rm.resolve_record_id("SID_22") == "2"


@respx.mock
async def test_resolve_miss_returns_none():
    # Miss triggers one refresh; still absent -> None.
    respx.post(FAKE_URL).mock(return_value=httpx.Response(200, json=[
        {"record_id": "2", "study_sid": "SID_22"}]))
    assert await rm.resolve_record_id("SID_99") is None


async def test_resolve_none_for_empty_sid():
    assert await rm.resolve_record_id(None) is None


async def test_test_mode_returns_sid_verbatim(monkeypatch):
    class _Test(_Settings):
        redcap_record_id_mode = "test"
    monkeypatch.setattr(rm, "get_settings", lambda: _Test())
    # test mode: record_id == the SID; no REDCap export at all.
    assert await rm.resolve_record_id("SID_22") == "SID_22"


async def test_disabled_returns_empty(monkeypatch):
    class _Off:
        redcap_api_url = None
        redcap_api_token = None
        redcap_sid_field = "study_sid"
        redcap_enabled = False
    monkeypatch.setattr(rm, "get_settings", lambda: _Off())
    assert await rm.load_sid_to_record_id(force=True) == {}
