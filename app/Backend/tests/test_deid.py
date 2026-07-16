"""Tests for deid.py — un-hashing AES-SIV speaker/file strings back to SIDs.

Tokens are keyed, so instead of hard-coding them the tests generate tokens with a
fixed test passphrase (mirroring the upstream ``deidentify_transcript.hash_id``)
and monkeypatch ``deid.get_settings`` to that key — no dependence on the real
``DEID_KEY`` in ``.env``.
"""
import base64
import hashlib
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESSIV

import deid

TEST_KEY = "unit-test-deid-passphrase-fixed"


def _aes_hash(number: int, key: str = TEST_KEY) -> str:
    """Mirror ``deidentify_transcript.hash_id``: AES-SIV(number) -> base32, unpadded."""
    derived = hashlib.sha512(key.encode("utf-8")).digest()
    ciphertext = AESSIV(derived).encrypt(str(number).encode("utf-8"), None)
    return base64.b32encode(ciphertext).decode("ascii").rstrip("=")


@pytest.fixture(autouse=True)
def _use_test_key(monkeypatch):
    """Point deid.get_settings at a fixed test DEID_KEY (independent of .env)."""
    monkeypatch.setattr(deid, "get_settings", lambda: SimpleNamespace(deid_key=TEST_KEY))


class TestUnhashPatientSid:
    @pytest.mark.parametrize("sid_n", [22, 34, 21, 29, 1, 999])
    def test_speaker_roundtrip(self, sid_n):
        speaker = f"Patient_{_aes_hash(sid_n)}_{_aes_hash(2)}_07022026"
        assert deid.unhash_patient_sid(speaker) == f"SID_{sid_n}"

    def test_file_form_with_extension(self):
        name = f"{_aes_hash(22)}_{_aes_hash(2)}_07022026.csv"
        assert deid.unhash_patient_sid(name) == "SID_22"

    def test_patient_only_two_part(self):
        assert deid.unhash_patient_sid(f"Patient_{_aes_hash(22)}_07022026") == "SID_22"

    @pytest.mark.parametrize("bad", [
        "",
        None,
        "Patient_1no2base3_07022026",          # non-Base32 token
        "13511_13571_07022026.csv",            # legacy affine code -> not reversible here
    ])
    def test_unparseable_or_legacy_returns_none(self, bad):
        assert deid.unhash_patient_sid(bad) is None


class TestUnhashDoctorNum:
    def test_doctor_token(self):
        speaker = f"Patient_{_aes_hash(22)}_{_aes_hash(2)}_07022026"
        assert deid.unhash_doctor_num(speaker) == "doc2"

    def test_needs_second_token(self):
        assert deid.unhash_doctor_num(f"Patient_{_aes_hash(22)}_07022026") is None

    def test_empty_returns_none(self):
        assert deid.unhash_doctor_num("") is None


class TestNoKeyConfigured:
    def test_returns_none_without_key(self, monkeypatch):
        monkeypatch.setattr(deid, "get_settings", lambda: SimpleNamespace(deid_key=None))
        speaker = f"Patient_{_aes_hash(22)}_{_aes_hash(2)}_07022026"
        assert deid.unhash_patient_sid(speaker) is None
        assert deid.unhash_doctor_num(speaker) is None
