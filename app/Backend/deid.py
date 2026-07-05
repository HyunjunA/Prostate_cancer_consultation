"""Reverse the de-identification affine cipher, at the backend storage boundary.

Transcript files are de-identified upstream (AI repo
``scripts/deidentify_transcript_simple.py``) with a deterministic, reversible
affine cipher: ``code = (SID * MULT + ADD) mod MOD``. Patient/doctor numbers in a
speaker/file string like ``Patient_13511_13571_07022026`` are those codes.

This module recovers the real subject id (``SID_<n>``) so survey data can be stored
and pushed to REDCap attributed to the real subject instead of the opaque hash.

The constants are the same public constants as the upstream script (its docstring
notes this is light obfuscation, "not cryptographically secure" — no secret here).
Only the affine (simple) method is reversed here; files de-identified with the AES
method would need ``DEID_KEY`` and are not handled.
"""
from __future__ import annotations

import re
from typing import Optional

# Public affine-cipher constants — mirror deidentify_transcript_simple.py.
MOD = 100000
MULT = 49997
ADD = 13577
INV = pow(MULT, -1, MOD)  # multiplicative inverse of MULT mod MOD


def _affine_unhash(code: int) -> int:
    """Inverse of ``(sid * MULT + ADD) mod MOD`` — recover the original number."""
    return ((code - ADD) % MOD) * INV % MOD


def _numeric_tokens(speaker_or_file: str) -> list[int]:
    """Numeric tokens of a speaker/file string, in order.

    ``Patient_13511_13571_07022026`` / ``13511_13571_07022026.csv`` -> [13511, 13571, 7022026]
    """
    stem = re.sub(r"\.(csv|xlsx|xls)$", "", speaker_or_file, flags=re.IGNORECASE)
    return [int(t) for t in stem.split("_") if t.isdigit()]


def unhash_patient_sid(speaker_or_file: str) -> Optional[str]:
    """Return ``"SID_<n>"`` for the patient hash in a speaker/file string, else None.

    The 1st numeric token is the hashed patient code. Returns None if the string has
    no code-shaped token (e.g. unparseable, or a value outside the cipher range).
    """
    if not speaker_or_file:
        return None
    tokens = _numeric_tokens(speaker_or_file)
    if not tokens or tokens[0] >= MOD:
        return None
    return f"SID_{_affine_unhash(tokens[0])}"


def unhash_doctor_num(speaker_or_file: str) -> Optional[str]:
    """Return ``"doc<n>"`` for the doctor hash (2nd numeric token), else None.

    Carried alongside the SID as part of the stored state.
    """
    if not speaker_or_file:
        return None
    tokens = _numeric_tokens(speaker_or_file)
    if len(tokens) < 2 or tokens[1] >= MOD:
        return None
    return f"doc{_affine_unhash(tokens[1])}"
