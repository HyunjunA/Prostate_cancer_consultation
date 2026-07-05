"""Tests for deid.py — un-hashing the affine-cipher speaker/file strings to SIDs."""
import pytest

from deid import unhash_patient_sid, unhash_doctor_num


class TestUnhashPatientSid:
    @pytest.mark.parametrize("speaker,expected", [
        ("Patient_13511_13571_07022026", "SID_22"),  # verified against the seeded set
        ("Patient_13475_13571_07022026", "SID_34"),
        ("Patient_63514_63574_07022026", "SID_21"),
        ("Patient_63490_63574_07022026", "SID_29"),
    ])
    def test_speaker_forms(self, speaker, expected):
        assert unhash_patient_sid(speaker) == expected

    def test_file_form_with_extension(self):
        assert unhash_patient_sid("13511_13571_07022026.csv") == "SID_22"

    def test_roundtrip_matches_affine(self):
        # hash_id(22) = (22*49997 + 13577) % 100000 = 13511
        assert unhash_patient_sid("Patient_13511_00000_01012026") == "SID_22"

    @pytest.mark.parametrize("bad", ["", "Patient_only_text", "no-digits-here", None])
    def test_unparseable_returns_none(self, bad):
        assert unhash_patient_sid(bad) is None


class TestUnhashDoctorNum:
    def test_doctor_token(self):
        # hash_id(2) = (2*49997 + 13577) % 100000 = 13571 -> doc2
        assert unhash_doctor_num("Patient_13511_13571_07022026") == "doc2"

    def test_needs_second_token(self):
        assert unhash_doctor_num("Patient_13511") is None

    def test_empty_returns_none(self):
        assert unhash_doctor_num("") is None
