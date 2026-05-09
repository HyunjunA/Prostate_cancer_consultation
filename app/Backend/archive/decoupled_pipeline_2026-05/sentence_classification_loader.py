"""Single-shot import shim for the bundled `sentence_classification` package.

Why this module exists
----------------------
The upstream ``sentence_classification`` package was written as a standalone
project and its submodules use ``from config import MODEL_TO_FULL, ...`` at
import time. Inside the Backend container, the name ``config`` already
refers to *our* YAML loader (``config.py``), so a naive import would fail
or pick up the wrong constants.

Earlier revisions of this codebase performed the shim **inside each
handler** (``pipeline_runner.process_single_file`` and
``routes_transcript.run_transcript_analysis``):

    sys.modules["config"] = fake_config_module
    from sentence_classification.X import ...  # picks up the fake
    sys.modules["config"] = real_config_module

That works under single-threaded execution but is fragile — ``sys.modules``
is process-global, so two concurrent coroutines or threads doing the
swap-import-restore dance can leave the module table in an inconsistent
state, and a failure between the swap and the restore leaks the fake
module to the rest of the process.

This module performs the shim **once, at process startup**, the moment it
is first imported. The needed function references are cached as
module-level attributes; from then on every consumer can just
``from sentence_classification_loader import segment_sentences`` like a
normal import — no ``sys.modules`` mutation, no race window.

Constants
---------
The fake ``config`` module mirrors the values produced by
``pipeline_runner.process_single_file``'s historical shim. Keep
``MODEL_TO_FULL`` in sync with ``pipeline_runner.OUTCOME_TO_SHEET``.
"""
import sys
import types

_sc_config = types.ModuleType("sc_config")
_sc_config.MODEL_TO_FULL = {
    "cp": "cancer_prognosis",
    "le": "life_expectancy",
    "ed": "erectile_dysfunction_potency",
    "inc": "continence",
    "ius": "irritative_urinary_symptoms_frequency_urgency_nocturnia",
}
# Historical pipeline_runner behavior: MODEL_TO_SHEET == MODEL_TO_FULL.
# (The duplication is intentional — the upstream package reads both names.)
_sc_config.MODEL_TO_SHEET = dict(_sc_config.MODEL_TO_FULL)
_sc_config.SHEET_ORDER = ["cp", "inc", "ed", "ius", "le"]

_orig_config = sys.modules.get("config")
sys.modules["config"] = _sc_config
try:
    from sentence_classification.preprocessing import (
        identify_doctor_speaker,
        filter_doctor_rows,
    )
    from sentence_classification.segmentation import segment_sentences
    from sentence_classification.classification import classify_all_models
    from sentence_classification.selection import select_top_sentences_all_outcomes
    from sentence_classification.context import add_context_all_outcomes
    from sentence_classification.export import (
        export_intermediate_files,
        export_final_csv,
    )
finally:
    if _orig_config is not None:
        sys.modules["config"] = _orig_config
    else:
        sys.modules.pop("config", None)

__all__ = [
    "identify_doctor_speaker",
    "filter_doctor_rows",
    "segment_sentences",
    "classify_all_models",
    "select_top_sentences_all_outcomes",
    "add_context_all_outcomes",
    "export_intermediate_files",
    "export_final_csv",
]
