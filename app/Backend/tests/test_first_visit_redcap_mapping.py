"""Unit tests for the first-visit -> REDCap "post_risk_perception_2" mapping.

Pure-function coverage for routes_patient._fv_answer_to_redcap and its lookup
tables.  No network and no DB: these lock in the value translation rules so a
future rename of a question_id, a reordered REDCap choice, or a regression in
the multi-select handling fails loudly here instead of silently shipping wrong
codes to REDCap.

Rules under test:
  - VAS sliders pass through unchanged (0..100 -> str).
  - timeline / factor TEXT -> REDCap numeric choice code (1..N), order-sensitive.
  - domain-name differences are absorbed: inc -> ui, ius -> il.
  - factor is multi-select in the UI but single-radio in REDCap -> first wins.
  - unmapped question / blank value / unknown option -> None (field not sent).
"""

import pytest

from routes_patient import (
    _FV_FACTOR_CODES,
    _FV_QUESTION_TO_REDCAP_FIELD,
    _FV_TIMELINE_CODES,
    _fv_answer_to_redcap,
)


# ── question_id -> REDCap field (incl. the inc->ui / ius->il rename) ───────────

EXPECTED_FIELD_MAP = {
    "cp_risk_without_treatment": "cp_1_rp_v2",
    "cp_risk_with_treatment": "cp_2_rp_v2",
    "cp_timeline": "cp_3_rp_v2",
    "le_timeline": "le_1_rp_v2",
    "le_factors": "le_2_rp_v2",
    "ed_baseline_return": "ed_1_rp_v2",
    "ed_timeline": "ed_2_rp_v2",
    "ed_factors": "ed_3_rp_v2",
    "inc_risk": "ui_1_rp_v2",
    "inc_timeline": "ui_2_rp_v2",
    "inc_factors": "ui_3_rp_v2",
    "ius_risk": "il_1_rp_v2",
    "ius_timeline": "il_2_rp_v2",
    "ius_factors": "il_3_rp_v2",
}


class TestMappingTables:
    def test_field_map_matches_expected_14(self):
        assert _FV_QUESTION_TO_REDCAP_FIELD == EXPECTED_FIELD_MAP

    def test_field_map_targets_are_distinct(self):
        targets = list(_FV_QUESTION_TO_REDCAP_FIELD.values())
        assert len(targets) == len(set(targets)) == 14

    def test_domain_rename_absorbed(self):
        # inc -> ui, ius -> il (cp/le/ed are identity)
        assert _FV_QUESTION_TO_REDCAP_FIELD["inc_risk"].startswith("ui_")
        assert _FV_QUESTION_TO_REDCAP_FIELD["ius_risk"].startswith("il_")

    def test_le_factor_options_differ_from_ed_family(self):
        # le has "Marital status" (no "Baseline function"); ed/inc/ius are the
        # mirror image. Same label can mean a different code across domains.
        assert "Marital status" in _FV_FACTOR_CODES["le_factors"]
        assert "Baseline function" not in _FV_FACTOR_CODES["le_factors"]
        assert _FV_FACTOR_CODES["le_factors"]["Tumor stage"] == "5"
        assert _FV_FACTOR_CODES["ed_factors"]["Tumor stage"] == "3"

    def test_ed_inc_ius_factor_tables_identical(self):
        assert _FV_FACTOR_CODES["ed_factors"] == _FV_FACTOR_CODES["inc_factors"]
        assert _FV_FACTOR_CODES["ed_factors"] == _FV_FACTOR_CODES["ius_factors"]

    def test_every_timeline_table_is_one_based_contiguous(self):
        for qid, table in _FV_TIMELINE_CODES.items():
            codes = sorted(int(c) for c in table.values())
            assert codes == list(range(1, len(codes) + 1)), qid


# ── VAS (slider) pass-through ──────────────────────────────────────────────────

class TestVas:
    @pytest.mark.parametrize("qid,field", [
        ("cp_risk_without_treatment", "cp_1_rp_v2"),
        ("cp_risk_with_treatment", "cp_2_rp_v2"),
        ("ed_baseline_return", "ed_1_rp_v2"),
        ("inc_risk", "ui_1_rp_v2"),
        ("ius_risk", "il_1_rp_v2"),
    ])
    def test_vas_passthrough(self, qid, field):
        assert _fv_answer_to_redcap(qid, "vas", 42) == (field, "42")

    def test_vas_bounds(self):
        assert _fv_answer_to_redcap("cp_risk_without_treatment", "vas", 0) == ("cp_1_rp_v2", "0")
        assert _fv_answer_to_redcap("cp_risk_without_treatment", "vas", 100) == ("cp_1_rp_v2", "100")

    def test_vas_none_skipped(self):
        assert _fv_answer_to_redcap("cp_risk_without_treatment", "vas", None) is None


# ── timeline TEXT -> code (order-sensitive, per domain) ────────────────────────

class TestTimeline:
    @pytest.mark.parametrize("qid,text,expected", [
        ("cp_timeline", "Over my lifetime", "1"),
        ("cp_timeline", "Over next 20-30 years", "6"),
        ("le_timeline", "Less than 5 years", "1"),
        ("le_timeline", "More than 20 years", "5"),
        ("ed_timeline", "3 months after treatment", "1"),
        ("ed_timeline", "Lifetime", "5"),
        ("inc_timeline", "9 months", "3"),
        ("inc_timeline", "2 years", "5"),
        ("ius_timeline", "1 month", "1"),
        ("ius_timeline", "3-6 months", "2"),
        ("ius_timeline", "Lifetime", "5"),
    ])
    def test_timeline_text_to_code(self, qid, text, expected):
        field = EXPECTED_FIELD_MAP[qid]
        assert _fv_answer_to_redcap(qid, "timeline", text) == (field, expected)

    def test_unknown_timeline_option_skipped(self):
        assert _fv_answer_to_redcap("cp_timeline", "timeline", "not a real option") is None


# ── factor multi-select -> first code ──────────────────────────────────────────

class TestFactors:
    def test_single_factor(self):
        assert _fv_answer_to_redcap("ed_factors", "factors", ["Baseline function"]) == ("ed_3_rp_v2", "5")

    def test_multi_select_sends_first(self):
        # First selection wins; the rest is dropped (REDCap radio is single).
        assert _fv_answer_to_redcap("le_factors", "factors", ["Marital status", "Age"]) == ("le_2_rp_v2", "3")
        assert _fv_answer_to_redcap("le_factors", "factors", ["Age", "Marital status"]) == ("le_2_rp_v2", "2")

    def test_inc_ius_factor_codes(self):
        assert _fv_answer_to_redcap("inc_factors", "factors", ["Tumor stage"]) == ("ui_3_rp_v2", "3")
        assert _fv_answer_to_redcap("ius_factors", "factors", ["Age"]) == ("il_3_rp_v2", "2")

    def test_empty_factor_list_skipped(self):
        assert _fv_answer_to_redcap("le_factors", "factors", []) is None

    def test_non_list_factor_skipped(self):
        assert _fv_answer_to_redcap("le_factors", "factors", "Age") is None

    def test_unknown_factor_option_skipped(self):
        assert _fv_answer_to_redcap("le_factors", "factors", ["Bogus"]) is None


# ── unmapped question ───────────────────────────────────────────────────────────

class TestUnmapped:
    def test_unmapped_question_id(self):
        assert _fv_answer_to_redcap("cp_helpfulness", "vas", 5) is None
        assert _fv_answer_to_redcap("totally_unknown", "vas", 5) is None
