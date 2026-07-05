"""Automated data-integrity verifiers — DB · REDCap · activity.

Three read-only checkers that replace manual per-row verification by surfacing only
exceptions:

  C1 check_db_integrity        — DB invariants (surveys + behavior + recordings).
  C2 check_redcap_reconciliation — DB↔REDCap: does each synced submission actually
                                   match its REDCap record (reuses the production
                                   field crosswalk). Read-only REDCap export.
  C3 check_activity_crosscheck — canonical survey answers vs behavior events, to
                                   estimate silently-dropped activity (best-effort tracking).

Each check returns a CheckResult; run_all_checks aggregates. Nothing writes.
"""
from __future__ import annotations

import contextlib
import io
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import models
from deid import unhash_patient_sid

logger = logging.getLogger(__name__)

ALLOWED_SURVEY_TYPES = {"dcs", "sdm", "satisfaction", "risk_perception", "risk_perception_2"}
ALLOWED_AREAS = {
    "patient_first", "patient_first_report", "patient_first_survey",
    "patient_followup", "doctor", "physician", "unknown",
}
_OPEN_CLOSE = ["topic", "evidence", "summary"]  # *_open / *_close balance
_EXAMPLE_LIMIT = 10


@dataclass
class CheckResult:
    """One integrity check outcome. status: pass | warn | fail."""
    name: str
    status: str
    count: int = 0
    total: Optional[int] = None
    detail: str = ""
    examples: List[Any] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status,
            "count": self.count,
            "total": self.total,
            "detail": self.detail,
            "examples": self.examples[:_EXAMPLE_LIMIT],
        }


def _ok(name: str, total: Optional[int] = None, detail: str = "") -> CheckResult:
    return CheckResult(name=name, status="pass", count=0, total=total, detail=detail)


async def _scalar(db: AsyncSession, stmt) -> int:
    return (await db.execute(stmt)).scalar() or 0


# ── C1: DB integrity ────────────────────────────────────────────────────────
async def check_db_integrity(db: AsyncSession) -> List[CheckResult]:
    S = models.PatientSurveySubmissionLog
    results: List[CheckResult] = []

    total_surveys = await _scalar(db, select(func.count(S.id)))

    # Orphan submissions: no matching patient_summary parent.
    orphan_stmt = (
        select(S.id, S.file, S.speaker)
        .outerjoin(models.PatientSummary,
                   (S.file == models.PatientSummary.file) & (S.speaker == models.PatientSummary.speaker))
        .where(models.PatientSummary.file.is_(None))
    )
    orphans = (await db.execute(orphan_stmt)).all()
    results.append(CheckResult(
        "survey_orphan_rows", "fail" if orphans else "pass", len(orphans), total_surveys,
        "submissions with no patient_summary parent",
        [{"id": r.id, "file": r.file, "speaker": r.speaker} for r in orphans],
    ) if orphans else _ok("survey_orphan_rows", total_surveys))

    # Empty answers (portable: fetch + inspect in Python, JSONB differs across engines).
    all_rows = (await db.execute(select(S.id, S.survey_type, S.speaker, S.answers, S.sid,
                                        S.redcap_synced, S.redcap_record_id))).all()
    empty = [r for r in all_rows if not r.answers]
    results.append(CheckResult("survey_empty_answers", "fail" if empty else "pass", len(empty),
                               total_surveys, "submissions with empty answers",
                               [{"id": r.id} for r in empty]) if empty else _ok("survey_empty_answers", total_surveys))

    bad_type = [r for r in all_rows if r.survey_type not in ALLOWED_SURVEY_TYPES]
    results.append(CheckResult("survey_bad_type", "fail" if bad_type else "pass", len(bad_type),
                               total_surveys, "survey_type outside the allowed set",
                               [{"id": r.id, "survey_type": r.survey_type} for r in bad_type])
                   if bad_type else _ok("survey_bad_type", total_surveys))

    synced_no_id = [r for r in all_rows if r.redcap_synced and not r.redcap_record_id]
    results.append(CheckResult("survey_synced_missing_record_id", "fail" if synced_no_id else "pass",
                               len(synced_no_id), total_surveys, "redcap_synced rows lacking a record_id",
                               [{"id": r.id} for r in synced_no_id])
                   if synced_no_id else _ok("survey_synced_missing_record_id", total_surveys))

    # sid must resolve by un-hashing the speaker (attribution integrity).
    sid_bad = [r for r in all_rows if unhash_patient_sid(r.speaker) is None]
    results.append(CheckResult("survey_sid_unresolvable", "warn" if sid_bad else "pass", len(sid_bad),
                               total_surveys, "speaker does not un-hash to a SID",
                               [{"id": r.id, "speaker": r.speaker} for r in sid_bad])
                   if sid_bad else _ok("survey_sid_unresolvable", total_surveys))

    # Behavior: session bracketing + open/close balance across the 3 tables.
    behavior_tables = [
        ("patient_report", models.PatientReportPageBehavior),
        ("patient_followup", models.PatientFollowupSurveyPageBehavior),
        ("doctor", models.DoctorBehavior),
    ]
    missing_pv: List[dict] = []
    missing_se: List[dict] = []
    imbalance: List[dict] = []
    total_sessions = 0
    for area, M in behavior_tables:
        rows = (await db.execute(select(M.session_id, M.event_type))).all()
        by_session: Dict[str, List] = {}
        for r in rows:
            by_session.setdefault(r[0], []).append(r[1])
        total_sessions += len(by_session)
        for sid, types in by_session.items():
            if "page_view" not in types:
                missing_pv.append({"area": area, "session_id": sid})
            if "session_end" not in types:
                missing_se.append({"area": area, "session_id": sid})
            # close-without-open per domain (hard): count opens vs closes.
            for kind in _OPEN_CLOSE:
                opens = sum(1 for t in types if t == f"{kind}_open")
                closes = sum(1 for t in types if t == f"{kind}_close")
                if closes > opens:
                    imbalance.append({"area": area, "session_id": sid, "kind": kind,
                                      "opens": opens, "closes": closes})

    # Soft: a dropped *_open (best-effort tracking) legitimately makes close>open,
    # so this is an anomaly signal, not a hard failure.
    results.append(CheckResult("behavior_close_without_open", "warn" if imbalance else "pass",
                               len(imbalance), total_sessions,
                               "more *_close than *_open in a session (likely a dropped open event)",
                               imbalance))
    # Soft anomaly rates (unload-time session_end can legitimately drop).
    results.append(CheckResult("behavior_session_missing_page_view",
                               "warn" if missing_pv else "pass", len(missing_pv), total_sessions,
                               "sessions with no page_view (should be rare)", missing_pv))
    results.append(CheckResult("behavior_session_missing_session_end",
                               "warn" if missing_se else "pass", len(missing_se), total_sessions,
                               "sessions with no session_end (best-effort; some loss expected)", missing_se))

    # Recordings: area conformance.
    rec_rows = (await db.execute(select(models.SessionRecording.id, models.SessionRecording.area))).all()
    bad_area = [r for r in rec_rows if r.area not in ALLOWED_AREAS]
    results.append(CheckResult("recording_bad_area", "fail" if bad_area else "pass", len(bad_area),
                               len(rec_rows), "recording area outside the allowed set",
                               [{"id": r.id, "area": r.area} for r in bad_area])
                   if bad_area else _ok("recording_bad_area", len(rec_rows)))

    return results


# ── C2: DB ↔ REDCap reconciliation ──────────────────────────────────────────
def _expected_fields(survey_type: str, answers: Any) -> Dict[str, str]:
    """Build the REDCap {field: value} a submission SHOULD have, reusing the exact
    production crosswalk (follow-up mapping+transform, or the first-visit mapper)."""
    from routes_surveys import FRONTEND_TO_REDCAP_MAPPING, transform_value

    expected: Dict[str, str] = {}
    if survey_type == "risk_perception_2":
        from routes_patient import _fv_answer_to_redcap
        # answers = {domain: {question_id: {question_id, field, value, ...}}}
        for _domain, qmap in (answers or {}).items():
            for _qid, a in (qmap or {}).items():
                for f, v in _fv_answer_to_redcap(a.get("question_id"), a.get("field"), a.get("value")):
                    expected[f] = str(v)
        return expected

    mapping = FRONTEND_TO_REDCAP_MAPPING.get(survey_type, {})
    # transform_value() prints debug lines; silence them so the report stays clean.
    with contextlib.redirect_stdout(io.StringIO()):
        for frontend_key, redcap_field in mapping.items():
            if isinstance(answers, dict) and frontend_key in answers and answers[frontend_key] is not None:
                expected[redcap_field] = str(transform_value(survey_type, frontend_key, answers[frontend_key]))
    return expected


async def check_redcap_reconciliation(
    db: AsyncSession, redcap_url: Optional[str], redcap_token: Optional[str],
) -> List[CheckResult]:
    S = models.PatientSurveySubmissionLog
    if not (redcap_url and redcap_token):
        return [CheckResult("redcap_reconciliation", "warn", 0, 0, "REDCap not configured — skipped")]

    synced = (await db.execute(
        select(S.id, S.speaker, S.survey_type, S.answers, S.redcap_record_id)
        .where(S.redcap_synced.is_(True))
    )).all()
    total = len(synced)
    if total == 0:
        return [_ok("redcap_reconciliation", 0, "no synced submissions")]

    # One read-only export of all referenced record_ids (all fields).
    record_ids = sorted({r.redcap_record_id or unhash_patient_sid(r.speaker) for r in synced if
                         (r.redcap_record_id or unhash_patient_sid(r.speaker))})
    data = {"token": redcap_token, "content": "record", "format": "json", "type": "flat",
            "returnFormat": "json"}
    for i, rid in enumerate(record_ids):
        data[f"records[{i}]"] = rid
    try:
        resp = httpx.post(redcap_url, data=data, timeout=60)
        resp.raise_for_status()
        by_id: Dict[str, dict] = {}
        for rec in resp.json():
            by_id.setdefault(rec.get("record_id"), {}).update({k: v for k, v in rec.items() if v != ""})
    except Exception as exc:  # noqa: BLE001
        return [CheckResult("redcap_reconciliation", "fail", 0, total, f"REDCap export failed: {exc}")]

    missing_record: List[dict] = []
    mismatches: List[dict] = []
    for r in synced:
        rid = r.redcap_record_id or unhash_patient_sid(r.speaker)
        actual = by_id.get(rid)
        if actual is None:
            missing_record.append({"id": r.id, "record_id": rid, "survey_type": r.survey_type})
            continue
        for fld, exp in _expected_fields(r.survey_type, r.answers).items():
            act = str(actual.get(fld, ""))
            if act != str(exp):
                mismatches.append({"id": r.id, "record_id": rid, "field": fld,
                                   "expected": str(exp), "actual": act})

    results = []
    results.append(CheckResult("redcap_missing_record", "fail" if missing_record else "pass",
                               len(missing_record), total,
                               "DB says synced but the REDCap record is absent", missing_record)
                   if missing_record else _ok("redcap_missing_record", total))
    results.append(CheckResult("redcap_field_mismatch", "fail" if mismatches else "pass",
                               len(mismatches), total,
                               "REDCap field value differs from the DB answer", mismatches)
                   if mismatches else _ok("redcap_field_mismatch", total))
    return results


# ── C3: activity cross-check ────────────────────────────────────────────────
async def check_activity_crosscheck(db: AsyncSession) -> List[CheckResult]:
    """Each canonical survey submission should leave a behavior trail; count those
    with none as a silent-drop anomaly (soft — tracking is best-effort)."""
    S = models.PatientSurveySubmissionLog
    subs = (await db.execute(select(S.id, S.file, S.speaker, S.survey_type))).all()
    total = len(subs)
    if total == 0:
        return [_ok("activity_survey_trail", 0)]

    # (file, speaker) that produced any survey-related behavior event.
    F = models.PatientFollowupSurveyPageBehavior
    fu = set((r.file, r.speaker) for r in (await db.execute(
        select(F.file, F.speaker).where(F.event_type.in_(
            ["survey_answer", "survey_complete", "domain_submitted"]))
    )).all())
    R = models.PatientReportPageBehavior
    rep = set((r.file, r.speaker) for r in (await db.execute(
        select(R.file, R.speaker).where(R.event_type == "domain_submitted")
    )).all())
    seen = fu | rep

    no_trail = [{"id": r.id, "survey_type": r.survey_type, "file": r.file}
                for r in subs if (r.file, r.speaker) not in seen]
    return [CheckResult("activity_survey_trail", "warn" if no_trail else "pass", len(no_trail), total,
                        "survey submissions with no matching behavior event (possible silent drop)",
                        no_trail)]


# ── Aggregate ───────────────────────────────────────────────────────────────
async def run_all_checks(
    db: AsyncSession, redcap_url: Optional[str] = None, redcap_token: Optional[str] = None,
    *, skip_redcap: bool = False,
) -> dict:
    results: List[CheckResult] = []
    results += await check_db_integrity(db)
    if skip_redcap:
        results.append(CheckResult("redcap_reconciliation", "warn", 0, 0, "skipped (--skip-redcap)"))
    else:
        results += await check_redcap_reconciliation(db, redcap_url, redcap_token)
    results += await check_activity_crosscheck(db)

    statuses = [r.status for r in results]
    overall = "fail" if "fail" in statuses else ("warn" if "warn" in statuses else "pass")
    return {"overall": overall, "results": [r.to_dict() for r in results]}
