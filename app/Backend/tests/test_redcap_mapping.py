"""Tests for redcap_mapping.resolve_record_id.

Single scheme: the REDCap record_id IS the study SID, so resolve_record_id returns the
SID it is given (and None for a falsy SID). No REDCap network call is involved.
"""
import pytest

import redcap_mapping as rm

pytestmark = pytest.mark.asyncio


async def test_resolve_returns_sid_verbatim():
    # record_id == SID: the resolver hands the SID straight back.
    assert await rm.resolve_record_id("SID_22") == "SID_22"


async def test_resolve_none_for_empty_sid():
    assert await rm.resolve_record_id(None) is None
    assert await rm.resolve_record_id("") is None
