"""Resolve a survey's patient_summary parent tolerantly.

The frontend builds ``file = "<stem>.csv"`` from ``?f=<stem>``, but the pipeline may
have stored ``patient_summary.file`` with a different extension (e.g. ``.xlsx`` when raw
xlsx transcripts were processed instead of de-identified ``.csv``). ``speaker`` is
``Patient_<stem>`` and is unique per patient, so matching on it tolerates that drift —
a survey submit then never fails the ``(file, speaker)`` foreign key just because of a
file-extension mismatch. If no patient exists for the speaker, callers return a clear
404 instead of a raw 500.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import models


async def resolve_patient_summary_file(db: AsyncSession, file: str, speaker: str) -> Optional[str]:
    """Return the ``patient_summary.file`` to use as the FK parent, or None if the
    patient does not exist.

    Prefers an exact ``(file, speaker)`` match; otherwise falls back to the same
    speaker's stored file (tolerating an extension/format drift between what the
    frontend sends and what the pipeline stored).
    """
    S = models.PatientSummary
    exact = (await db.execute(
        select(S.file).where(S.file == file, S.speaker == speaker)
    )).scalar_one_or_none()
    if exact is not None:
        return exact
    return (await db.execute(
        select(S.file).where(S.speaker == speaker).order_by(S.file).limit(1)
    )).scalar_one_or_none()
