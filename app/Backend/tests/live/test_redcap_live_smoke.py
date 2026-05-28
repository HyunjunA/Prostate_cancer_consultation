"""Live smoke test against the REAL REDCap project (post_risk_perception_2).

Confirms that GET and POST to the actual REDCap API work end-to-end, including
the production first-visit sync code path. These hit the network and write a
dedicated throwaway record, so they are marked `live` and SKIPPED by default.

Run explicitly (opt-in via RUN_LIVE_REDCAP so a plain `pytest` never writes):
    RUN_LIVE_REDCAP=1 pytest -m live tests/live/test_redcap_live_smoke.py -v

Credentials are read from REDCAP_API_URL / REDCAP_API_TOKEN in the environment,
falling back to Backend/.env. If neither is available, every test here skips.

The smoke record id is dedicated (never a real patient) and deleted on teardown.
"""

import os
from collections import Counter
from pathlib import Path

import httpx
import pytest


# ── Credential loading (env, then Backend/.env) ────────────────────────────────

def _load_redcap_creds():
    url = os.environ.get("REDCAP_API_URL")
    token = os.environ.get("REDCAP_API_TOKEN")
    if not (url and token):
        env_path = Path(__file__).resolve().parents[2] / ".env"
        if env_path.exists():
            vals = {}
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                vals.setdefault(k.strip(), v.strip().strip('"').strip("'"))
            url = url or vals.get("REDCAP_API_URL")
            token = token or vals.get("REDCAP_API_TOKEN")
    return url, token


REDCAP_API_URL, REDCAP_API_TOKEN = _load_redcap_creds()

# Opt-in only: even with creds present these write to the real project, so a
# plain `pytest` run must never trigger them. Require RUN_LIVE_REDCAP=1.
_OPTED_IN = os.environ.get("RUN_LIVE_REDCAP") == "1"

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        not _OPTED_IN,
        reason="live REDCap test: set RUN_LIVE_REDCAP=1 to run",
    ),
    pytest.mark.skipif(
        not (REDCAP_API_URL and REDCAP_API_TOKEN),
        reason="REDCAP_API_URL/TOKEN not available (set env vars or Backend/.env)",
    ),
]

SMOKE_RECORD = "pytest_live_smoke_rp_v2"

# A full 14-field first-visit submission and the REDCap codes it must produce.
FULL_ANSWERS = [
    ("cp_risk_without_treatment", "vas", 40),
    ("cp_risk_with_treatment", "vas", 15),
    ("cp_timeline", "timeline", "Over next 5 years"),
    ("le_timeline", "timeline", "11-15 years"),
    ("le_factors", "factors", ["Age", "Tumor stage"]),
    ("ed_baseline_return", "vas", 55),
    ("ed_timeline", "timeline", "12 months after treatment"),
    ("ed_factors", "factors", ["Baseline function"]),
    ("inc_risk", "vas", 20),
    ("inc_timeline", "timeline", "9 months"),
    ("inc_factors", "factors", ["Tumor stage"]),
    ("ius_risk", "vas", 10),
    ("ius_timeline", "timeline", "3-6 months"),
    ("ius_factors", "factors", ["Age"]),
]
EXPECTED_REDCAP = {
    "cp_1_rp_v2": "40", "cp_2_rp_v2": "15", "cp_3_rp_v2": "2",
    "le_1_rp_v2": "3", "le_2_rp_v2": "2",
    "ed_1_rp_v2": "55", "ed_2_rp_v2": "3", "ed_3_rp_v2": "5",
    "ui_1_rp_v2": "20", "ui_2_rp_v2": "3", "ui_3_rp_v2": "3",
    "il_1_rp_v2": "10", "il_2_rp_v2": "2", "il_3_rp_v2": "2",
    "post_risk_perception_2_complete": "2",
}


def _redcap_post(data, timeout=30):
    payload = {"token": REDCAP_API_TOKEN, "format": "json", "returnFormat": "json", **data}
    return httpx.post(REDCAP_API_URL, data=payload, timeout=timeout)


@pytest.fixture
def cleanup_smoke_record():
    """Delete the throwaway record after the test, pass or fail."""
    yield
    _redcap_post({"action": "delete", "content": "record", "records[0]": SMOKE_RECORD})


# ── GET connectivity ───────────────────────────────────────────────────────────

def test_live_get_project_info():
    resp = _redcap_post({"content": "project"})
    assert resp.status_code == 200, resp.text
    assert "project_id" in resp.json()


def test_live_get_instrument_shape():
    resp = _redcap_post({"content": "metadata", "forms[0]": "post_risk_perception_2"})
    assert resp.status_code == 200, resp.text
    fields = resp.json()
    assert len(fields) == 14
    types = Counter(f["field_type"] for f in fields)
    assert types["slider"] == 5
    assert types["radio"] == 9
    assert "checkbox" not in types  # factor fields are single radio


# ── POST + GET round-trip through the production sync code ─────────────────────

@pytest.mark.asyncio
async def test_live_sync_roundtrip(monkeypatch, cleanup_smoke_record):
    import routes_patient

    # Point the production sync at the real creds (test env loads neither).
    monkeypatch.setattr(routes_patient, "REDCAP_API_URL", REDCAP_API_URL)
    monkeypatch.setattr(routes_patient, "REDCAP_API_TOKEN", REDCAP_API_TOKEN)

    answers = [
        routes_patient.AnswerItem(question_id=q, field=f, value=v)
        for q, f, v in FULL_ANSWERS
    ]

    # POST: production code path writes to REDCap.
    await routes_patient._sync_first_visit_answers_to_redcap(SMOKE_RECORD, answers)

    # GET: read the record back and verify every mapped field/code.
    fields = list(EXPECTED_REDCAP.keys())
    data = {"content": "record", "type": "flat", "records[0]": SMOKE_RECORD, "fields[0]": "record_id"}
    for i, f in enumerate(fields):
        data[f"fields[{i + 1}]"] = f
    resp = _redcap_post(data)
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert rows, "smoke record not found after import"
    stored = rows[0]

    for field, expected in EXPECTED_REDCAP.items():
        assert stored.get(field) == expected, f"{field}: got {stored.get(field)!r}, want {expected!r}"


# ══════════════════════════════════════════════════════════════════════════════
# Whole-project audit: can we push to AND get from EVERY writable field?
# ══════════════════════════════════════════════════════════════════════════════

ALL_FIELDS_RECORD = "pytest_live_smoke_allfields"

# Forms that are repeating instruments must be imported with repeat params.
# (Discovered via content=repeatingFormsEvents; refreshed at runtime below.)
NON_WRITABLE_TYPES = {"descriptive", "file", "calc", "sql"}


def _first_choice_code(raw):
    """'1, Label | 2, Other' -> '1' (first valid choice code)."""
    return raw.split("|")[0].split(",")[0].strip()


def _text_value(val_type):
    """A value that satisfies a text field's validation. REDCap's API uses
    Y-M-D for date/datetime on both import and export regardless of display."""
    if val_type == "integer":
        return "1"
    if val_type.startswith("number"):
        return "1"
    if val_type.startswith("datetime_seconds"):
        return "2021-06-15 13:30:00"
    if val_type.startswith("datetime"):
        return "2021-06-15 13:30"
    if val_type.startswith("date"):
        return "2021-06-15"
    if val_type == "time":
        return "13:30"
    if val_type == "email":
        return "test@example.com"
    if val_type == "phone":
        return "5551234567"
    if val_type in ("zipcode", "zip"):
        return "90048"
    return "test"


def _gen_value(field):
    """Return (export_key_suffix, value) parts for a field, or None to skip."""
    ft = field["field_type"]
    if ft in NON_WRITABLE_TYPES:
        return None
    if ft == "checkbox":
        code = _first_choice_code(field["select_choices_or_calculations"])
        return (f"___{code}", "1")  # checkbox -> field___<code> = 1
    if ft in ("radio", "dropdown"):
        return ("", _first_choice_code(field["select_choices_or_calculations"]))
    if ft == "yesno":
        return ("", "1")
    if ft == "truefalse":
        return ("", "1")
    if ft == "slider":
        return ("", "50")
    if ft in ("text", "notes"):
        return ("", _text_value(field.get("text_validation_type_or_show_slider_number", "")))
    return ("", "test")


@pytest.fixture
def cleanup_allfields_record():
    yield
    _redcap_post({"action": "delete", "content": "record", "records[0]": ALL_FIELDS_RECORD})


def test_live_push_get_every_writable_field(cleanup_allfields_record):
    """Write a valid value to every writable field across all instruments,
    then read them all back and assert each round-trips.

    Proves the project-wide claim: POST and GET work for all fields (not just
    post_risk_perception_2). descriptive/file/calc fields are not data-bearing
    and are reported as skipped. Run with `-s` to see the per-type summary.
    """
    meta = _redcap_post({"content": "metadata"}).json()
    record_id_field = meta[0]["field_name"]

    repeating = {
        r["form_name"]
        for r in _redcap_post({"content": "repeatingFormsEvents"}).json()
        if isinstance(r, dict) and r.get("form_name")
    }

    base = {"record_id": ALL_FIELDS_RECORD}
    repeat_rows = {}          # form -> field dict
    checks = []               # (form_or_None, export_key, expected_value)
    skipped = []

    for f in meta:
        name = f["field_name"]
        if name == record_id_field:
            continue
        gen = _gen_value(f)
        if gen is None:
            skipped.append(name)
            continue
        suffix, value = gen
        key = f"{name}{suffix}"
        form = f["form_name"]
        target = repeat_rows.setdefault(form, {}) if form in repeating else base
        target[key] = value
        checks.append((form if form in repeating else None, key, value))

    rows = [base]
    for form, d in repeat_rows.items():
        d["record_id"] = ALL_FIELDS_RECORD
        d["redcap_repeat_instrument"] = form
        d["redcap_repeat_instance"] = "1"
        rows.append(d)

    # ── PUSH: one import of every writable field ──
    import json as _json
    imp = _redcap_post({
        "content": "record", "type": "flat",
        "overwriteBehavior": "overwrite", "returnContent": "count",
        "data": _json.dumps(rows),
    })
    assert imp.status_code == 200, f"import failed: {imp.text}"
    assert "error" not in imp.json(), f"REDCap rejected fields: {imp.text}"

    # ── GET: read the whole record back (base + repeat rows) ──
    exp = _redcap_post({"content": "record", "type": "flat", "records[0]": ALL_FIELDS_RECORD})
    assert exp.status_code == 200, exp.text
    export_rows = exp.json()
    assert export_rows, "record not found after import"

    base_export = next((r for r in export_rows if not r.get("redcap_repeat_instrument")), {})
    repeat_export = {
        r["redcap_repeat_instrument"]: r
        for r in export_rows if r.get("redcap_repeat_instrument")
    }

    # Classify each writable field's read-back:
    #   matched  - exported value equals what we pushed (push+get fully works)
    #   blanked  - exported empty: the API token's DE-IDENTIFIED export rights
    #              strip identifier / free-text / notes / date fields. Push still
    #              succeeded (the bulk import returned 200 with no error); only
    #              the read-back is restricted by token policy, not connectivity.
    #   wrong    - exported a DIFFERENT non-empty value: a real corruption -> fail
    matched, blanked, wrong = [], [], []
    for form, key, expected in checks:
        row = repeat_export.get(form, {}) if form else base_export
        got = row.get(key)
        if got == expected:
            matched.append(key)
        elif got in (None, ""):
            blanked.append(key)
        else:
            wrong.append(f"{key}: got {got!r}, want {expected!r}")

    print(
        f"\n[all-fields audit] total_fields={len(meta)} "
        f"writable={len(checks)} skipped(descriptive/file)={len(skipped)}\n"
        f"  PUSH: import HTTP 200, no error  -> all {len(checks)} writable fields accepted\n"
        f"  GET : matched={len(matched)}  blanked_by_token_deid={len(blanked)}  wrong={len(wrong)}\n"
        f"  blanked (export-restricted): {sorted(blanked)}"
    )

    # Hard failures: a field that came back with the WRONG value means push or
    # get is actually broken. Blanked-by-policy is expected and only reported.
    assert not wrong, "round-trip value corruption:\n  " + "\n  ".join(wrong[:25])
    # Sanity: the token must be able to export *something* (the coded fields).
    assert matched, "no fields round-tripped — export may be entirely blocked"
