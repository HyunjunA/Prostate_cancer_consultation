"""Tests for deid.py — un-hashing AES-SIV speaker/file strings back to SIDs.

Tokens are keyed, so most tests generate them with a fixed test passphrase
(mirroring the upstream ``deidentify_transcript.hash_id``) and monkeypatch
``deid.get_settings`` to that key — no dependence on the real ``DEID_KEY`` in
``.env``.

``TestKnownAnswerVectors`` is the deliberate exception. Generated tokens only ever
prove this file agrees with itself: this module duplicates the upstream key
derivation, domains and encoding, and if the upstream changed any of them, every
test here would still pass while production quietly re-identified nothing. The
vectors are the contract between the two repos, so they are written out, and the
AI repo asserts the same values from the encode side.
"""
import base64
import hashlib
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESSIV

import deid

TEST_KEY = "unit-test-deid-passphrase-fixed"

# Kept byte-identical with the AI repo's tests/test_deidentify_transcript.py.
# These are what the upstream de-id actually emits for TEST_KEY; if this module
# can no longer read them, it can no longer read production's tokens either.
VECTOR_PATIENT_22 = "VM3OOSQYJLLLK24ZXBQJGXBXUW7D4"
VECTOR_DOCTOR_2 = "7OOXN2SKFJ6TC3QR5WSSHKCCNJXA"
VECTOR_DATE_07162026 = "YPWF747CL7IHCWCX3UBQKSNWTD4ZQHWVHU5WMXQ"


def _aes_hash(number: int, domain: bytes = deid.DOMAIN_PATIENT, key: str = TEST_KEY) -> str:
    """Mirror ``deidentify_transcript.hash_id``: AES-SIV(number, domain) -> base32.

    ``domain`` is associated data, not encrypted: it is what keeps a patient and a
    doctor sharing a number from producing the same token.
    """
    derived = hashlib.sha512(key.encode("utf-8")).digest()
    ciphertext = AESSIV(derived).encrypt(str(number).encode("utf-8"), [domain])
    return base64.b32encode(ciphertext).decode("ascii").rstrip("=")


def _doctor_hash(number: int) -> str:
    return _aes_hash(number, deid.DOMAIN_DOCTOR)


def _date_hash(date_str: str, key: str = TEST_KEY) -> str:
    """Mirror ``deidentify_transcript.hash_date``: AES-SIV(date STRING, DOMAIN_DATE).

    The date is encrypted as its exact string so leading zeros survive.
    """
    derived = hashlib.sha512(key.encode("utf-8")).digest()
    ciphertext = AESSIV(derived).encrypt(date_str.encode("utf-8"), [deid.DOMAIN_DATE])
    return base64.b32encode(ciphertext).decode("ascii").rstrip("=")


@pytest.fixture(autouse=True)
def _use_test_key(monkeypatch):
    """Point deid.get_settings at a fixed test DEID_KEY (independent of .env)."""
    monkeypatch.setattr(deid, "get_settings", lambda: SimpleNamespace(deid_key=TEST_KEY))


class TestUnhashPatientSid:
    @pytest.mark.parametrize("sid_n", [22, 34, 21, 29, 1, 999])
    def test_speaker_roundtrip(self, sid_n):
        speaker = f"Patient_{_aes_hash(sid_n)}_{_doctor_hash(2)}_07022026"
        assert deid.unhash_patient_sid(speaker) == f"SID_{sid_n}"

    def test_file_form_with_extension(self):
        name = f"{_aes_hash(22)}_{_doctor_hash(2)}_07022026.csv"
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
        speaker = f"Patient_{_aes_hash(22)}_{_doctor_hash(2)}_07022026"
        assert deid.unhash_doctor_num(speaker) == "doc2"

    def test_needs_second_token(self):
        assert deid.unhash_doctor_num(f"Patient_{_aes_hash(22)}_07022026") is None

    def test_empty_returns_none(self):
        assert deid.unhash_doctor_num("") is None


class TestDomainSeparation:
    """A token is bound to what its number refers to, so the two kinds cannot be
    confused for each other — position picks a token, the domain verifies it."""

    def test_patient_and_doctor_sharing_a_number_do_not_collide(self):
        assert _aes_hash(2, deid.DOMAIN_PATIENT) != _aes_hash(2, deid.DOMAIN_DOCTOR)

    def test_doctor_token_is_not_readable_as_a_subject(self):
        """The regression: without a domain this returned "SID_3" for doctor 3,
        which would attribute survey data to a subject that may not exist."""
        assert deid.unhash_patient_sid(f"Patient_{_doctor_hash(3)}_07022026") is None

    def test_patient_token_is_not_readable_as_a_doctor(self):
        speaker = f"Patient_{_aes_hash(22)}_{_aes_hash(2)}_07022026"  # 2nd token is a PATIENT hash
        assert deid.unhash_doctor_num(speaker) is None


class TestUnhashVisitDate:
    """The visit date is hashed into the filename; the server decrypts it (only to
    order the timeline) and the real date is never returned to the client."""

    def test_roundtrip_three_part(self):
        name = f"{_aes_hash(22)}_{_doctor_hash(2)}_{_date_hash('07162026')}.csv"
        assert deid.unhash_visit_date(name) == "07162026"

    def test_roundtrip_two_part(self):
        name = f"{_aes_hash(22)}_{_date_hash('07162026')}.csv"
        assert deid.unhash_visit_date(name) == "07162026"

    def test_leading_zero_preserved(self):
        name = f"{_aes_hash(22)}_{_doctor_hash(2)}_{_date_hash('01022026')}.csv"
        assert deid.unhash_visit_date(name) == "01022026"

    def test_legacy_plaintext_date_returns_none(self):
        # The trailing \d{8} is stripped, so the last token is the doctor, which does
        # not authenticate under the date domain.
        assert deid.unhash_visit_date(f"{_aes_hash(22)}_{_doctor_hash(2)}_07022026") is None

    def test_patient_and_doctor_still_read_with_a_hashed_date(self):
        name = f"Patient_{_aes_hash(22)}_{_doctor_hash(2)}_{_date_hash('07162026')}"
        assert deid.unhash_patient_sid(name) == "SID_22"
        assert deid.unhash_doctor_num(name) == "doc2"

    def test_no_key_returns_none(self, monkeypatch):
        monkeypatch.setattr(deid, "get_settings", lambda: SimpleNamespace(deid_key=None))
        name = f"{_aes_hash(22)}_{_date_hash('07162026')}.csv"
        assert deid.unhash_visit_date(name) is None


class TestKnownAnswerVectors:
    """Read tokens this module did not generate — the cross-repo contract.

    Everything else here round-trips against our own constants and would keep
    passing if the upstream de-id changed its domains or key derivation, while
    production silently un-hashed nothing. These fail instead.
    """

    def test_reads_an_upstream_patient_token(self):
        speaker = f"Patient_{VECTOR_PATIENT_22}_{VECTOR_DOCTOR_2}_{VECTOR_DATE_07162026}"
        assert deid.unhash_patient_sid(speaker) == "SID_22"

    def test_reads_an_upstream_doctor_token(self):
        speaker = f"Patient_{VECTOR_PATIENT_22}_{VECTOR_DOCTOR_2}_{VECTOR_DATE_07162026}"
        assert deid.unhash_doctor_num(speaker) == "doc2"

    def test_reads_an_upstream_date_token(self):
        name = f"{VECTOR_PATIENT_22}_{VECTOR_DOCTOR_2}_{VECTOR_DATE_07162026}.csv"
        assert deid.unhash_visit_date(name) == "07162026"

    def test_our_hash_matches_the_upstream_vector(self):
        """The mirror in _aes_hash / _date_hash must reproduce upstream byte-for-byte."""
        assert _aes_hash(22, deid.DOMAIN_PATIENT) == VECTOR_PATIENT_22
        assert _doctor_hash(2) == VECTOR_DOCTOR_2
        assert _date_hash("07162026") == VECTOR_DATE_07162026


class TestNoKeyConfigured:
    def test_returns_none_without_key(self, monkeypatch):
        monkeypatch.setattr(deid, "get_settings", lambda: SimpleNamespace(deid_key=None))
        speaker = f"Patient_{_aes_hash(22)}_{_doctor_hash(2)}_07022026"
        assert deid.unhash_patient_sid(speaker) is None
        assert deid.unhash_doctor_num(speaker) is None
