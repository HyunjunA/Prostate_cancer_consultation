"""Reverse the de-identification cipher, at the backend storage boundary.

Transcript files are de-identified upstream (AI repo
``scripts/deidentify_transcript.py``) with AES-SIV (RFC 5297, deterministic
authenticated encryption): only the sequential NUMBER of each id is encrypted
under the shared ``DEID_KEY`` passphrase, then Base32-encoded. A speaker/file
string like ``Patient_<hashedPatient>_<hashedDoctor>_<MMDDYYYY>`` carries those
Base32 tokens.

This module recovers the real subject id (``SID_<n>``) so survey data can be
stored and pushed to REDCap attributed to the real subject instead of the opaque
hash. Re-identification requires the same ``DEID_KEY`` the upstream de-id used;
it is read from settings (``app/Backend/.env``, gitignored). When the key is
absent or a token does not decrypt (e.g. a legacy affine 5-digit code, or a
tampered value), the un-hash functions return ``None`` and the caller records the
submission as pending instead of attributing it.
"""
from __future__ import annotations

import base64
import hashlib
import re
from functools import lru_cache
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESSIV

from core.settings import get_settings

# What a hashed number refers to. Bound into each token as AES-SIV associated data
# by the upstream de-id; these values must match ``deidentify_transcript``'s
# DOMAIN_PATIENT / DOMAIN_DOCTOR byte-for-byte or nothing decrypts.
DOMAIN_PATIENT = b"patient"
DOMAIN_DOCTOR = b"doctor"
# The visit date is hashed the same way (its own domain), so the real MMDDYYYY never
# leaves the clinical machine. The server decrypts it only to reconstruct the visit
# ORDER for the doctor timeline; the date itself is never stored or returned. Must
# match ``deidentify_transcript.DOMAIN_DATE`` byte-for-byte.
DOMAIN_DATE = b"date"


@lru_cache(maxsize=4)
def _derive_key(passphrase: str) -> bytes:
    """Derive the 64-byte AES-256-SIV key from the shared passphrase (deterministic).

    Mirrors ``deidentify_transcript._derive_key`` so the same passphrase reverses
    what the upstream de-id produced. Cached: the passphrase is constant per process.
    """
    return hashlib.sha512(passphrase.encode("utf-8")).digest()


def _hash_tokens(speaker_or_file: str) -> list[str]:
    """The ordered Base32 hash tokens of a speaker/file string.

    Drops a leading ``Patient`` label and a LEGACY trailing 8-digit ``MMDDYYYY``
    date. The de-id pipeline now hashes the date too, so on current files the date
    is itself a Base32 token that stays in the list as the LAST element:

        ``Patient_MFRGGZDF_NBSWY3DP_HZKV…`` -> ["MFRGGZDF", "NBSWY3DP", "HZKV…"]
        ``MFRGGZDF_NBSWY3DP_HZKV….csv``     -> ["MFRGGZDF", "NBSWY3DP", "HZKV…"]
        ``Patient_MFRGGZDF_HZKV…``          -> ["MFRGGZDF", "HZKV…"]
        # legacy plaintext-date names still collapse to 1-2 tokens:
        ``Patient_MFRGGZDF_NBSWY3DP_07022026`` -> ["MFRGGZDF", "NBSWY3DP"]

    Position picks patient (1st) vs doctor (2nd) vs date (last); the cipher's domain
    then verifies that choice — a token read at the wrong position fails to decrypt
    rather than yielding the wrong kind's value.
    """
    stem = re.sub(r"\.(csv|xlsx|xls)$", "", speaker_or_file, flags=re.IGNORECASE)
    parts = stem.split("_")
    if parts and parts[0].lower() == "patient":
        parts = parts[1:]
    if parts and re.fullmatch(r"\d{8}", parts[-1]):
        parts = parts[:-1]
    return parts


def _unhash_number(token: str, key: str, domain: bytes) -> Optional[str]:
    """Decrypt one Base32 token back to its number string, or None if it can't.

    ``domain`` must match the one the upstream de-id created the token under
    (mirrors ``deidentify_transcript.DOMAIN_PATIENT`` / ``DOMAIN_DOCTOR``), so a
    doctor token asked for as a patient fails to authenticate instead of returning
    the doctor's number as if it were a subject id.

    Fail-soft: a wrong key, a non-Base32 token (e.g. a legacy affine 5-digit code
    contains ``0/1/8/9`` which are not in the Base32 alphabet), a wrong domain, or a
    failed authentication all yield None rather than raising.
    """
    try:
        padding = "=" * (-len(token) % 8)
        ciphertext = base64.b32decode(token.upper() + padding)
        return AESSIV(_derive_key(key)).decrypt(ciphertext, [domain]).decode("utf-8")
    except Exception:  # noqa: BLE001 - any decode/auth failure -> not re-identifiable
        return None


def unhash_patient_sid(speaker_or_file: str) -> Optional[str]:
    """Return ``"SID_<n>"`` for the patient hash in a speaker/file string, else None.

    The 1st hash token is the patient code. Returns None when there is no key, no
    token, or the token does not decrypt (unparseable / legacy / tampered / a
    doctor token, which is rejected by the domain rather than mis-read as a subject).
    """
    key = get_settings().deid_key
    if not speaker_or_file or not key:
        return None
    tokens = _hash_tokens(speaker_or_file)
    if not tokens:
        return None
    number = _unhash_number(tokens[0], key, DOMAIN_PATIENT)
    return f"SID_{number}" if number is not None else None


def unhash_doctor_num(speaker_or_file: str) -> Optional[str]:
    """Return ``"doc<n>"`` for the doctor hash (2nd hash token), else None.

    Carried alongside the SID as part of the stored state.
    """
    key = get_settings().deid_key
    if not speaker_or_file or not key:
        return None
    tokens = _hash_tokens(speaker_or_file)
    if len(tokens) < 2:
        return None
    number = _unhash_number(tokens[1], key, DOMAIN_DOCTOR)
    return f"doc{number}" if number is not None else None


def unhash_visit_date(speaker_or_file: str) -> Optional[str]:
    """Return the real ``"MMDDYYYY"`` visit date hidden in a de-id name, else None.

    The visit date is the LAST hash token (the de-id pipeline hashes it under
    :data:`DOMAIN_DATE`). Used ONLY to reconstruct the visit order for the doctor
    timeline — the returned date is never stored or sent to the client. Returns None
    for legacy plaintext-date names, names with no hashed date, or a wrong key
    (the token fails to authenticate under the date domain).
    """
    key = get_settings().deid_key
    if not speaker_or_file or not key:
        return None
    tokens = _hash_tokens(speaker_or_file)
    if not tokens:
        return None
    # _unhash_number returns the decrypted plaintext string; for a date that is the
    # 8-char "MMDDYYYY" (leading zeros preserved), for an id it is the number.
    return _unhash_number(tokens[-1], key, DOMAIN_DATE)
