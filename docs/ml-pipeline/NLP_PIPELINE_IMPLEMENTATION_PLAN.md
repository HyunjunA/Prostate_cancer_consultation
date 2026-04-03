# NLP Pipeline Implementation Plan

> **Base Spec:** `NLP_PIPELINE_SPEC_FINAL.md`
> **Location:** `app/Pipeline/`
> **Goal:** Independent Python module replicating Michael's R pipeline

---

## Module Architecture

```
app/Pipeline/
├── config.yaml                       # Runtime configuration
├── config.py                         # YAML loader + PipelineConfig dataclass
├── main_pipeline.py                  # CLI entry point + orchestrator
├── file_manager.py                   # File watcher + archive/error movement
├── sentence_classification/
│   ├── __init__.py                   # Package exports
│   ├── preprocessing.py              # Step 1: Doctor identification + filtering
│   ├── segmentation.py               # Step 2: Sentence segmentation + indexing
│   ├── classification.py             # Step 3: NLP Docker API calls (5 models)
│   ├── selection.py                  # Step 4: Top-K selection with tie-breaker
│   ├── context.py                    # Step 5: ±window context extraction
│   └── export.py                     # Step 6: Intermediate CSV + final Excel
├── requirements.txt
└── tests/
    ├── __init__.py
    ├── test_preprocessing.py
    ├── test_segmentation.py
    ├── test_selection.py
    ├── test_context.py
    └── test_integration.py
```

---

## Data Flow Diagram

```
Input xlsx/csv
    │
    ▼
┌─────────────────────────────────┐
│ Step 1: preprocessing.py        │
│  identify_doctor() → filter     │
│  IN:  DataFrame[speaker, text]  │
│  OUT: DataFrame[index, speaker, │
│       text] (doctor rows only,  │
│       1-based re-indexed)       │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Step 2: segmentation.py         │
│  segment_sentences()            │
│  IN:  DataFrame[index, speaker, │
│       text]                     │
│  OUT: DataFrame[index, i, i2,   │
│       speaker, text]            │
│  (global index, row#, sent#)    │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Step 3: classification.py       │
│  classify_all_models()          │
│  IN:  DataFrame + model_uri     │
│  OUT: DataFrame + 5 pred cols   │
│  (cancer_prognosis, life_exp..) │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Step 4: selection.py            │
│  select_all_outcomes()          │
│  IN:  DataFrame with pred cols  │
│  OUT: Dict[str, DataFrame]      │
│  (outcome → top-K rows)         │
│  Tie-break: score DESC →        │
│    index ASC → i ASC → i2 ASC   │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Step 5: context.py              │
│  add_context_column()           │
│  IN:  full_df + top_df + window │
│  OUT: top_df with 'context' col │
│  (<main>target</main> tagged)   │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Step 6: export.py               │
│  export_intermediate() → CSVs   │
│  export_final_xlsx() → Excel    │
│  Sheets: cp, inc, ed, ius, le   │
│  Cols: name,index,i,i2,speaker, │
│        text,.pred_1,context     │
└─────────────────────────────────┘
```

---

## Function Signatures

### config.py

```python
@dataclass
class PipelineConfig:
    input_path: str
    output_path: str
    archive_path: str
    error_path: str
    text_column_name: str = "text"
    speaker_column_name: str = "speaker"
    file_pattern: str = "*.xlsx"
    poll_interval_sec: int = 5
    model_uri: str = "http://nlp-classifiers:8000"
    outcomes: List[str] = field(default_factory=lambda: ["cp", "le", "ed", "inc", "ius"])
    top_k: int = 10
    context_window: int = 3

def load_config(path: str) -> PipelineConfig:
    """Load and validate YAML config file."""
```

### preprocessing.py

```python
def identify_doctor(
    df: pd.DataFrame,
    speaker_col: str = "speaker",
    text_col: str = "text",
) -> str:
    """Identify doctor speaker by total text length.
    Returns speaker name with longest aggregated text.
    """

def filter_doctor_rows(
    df: pd.DataFrame,
    speaker_col: str = "speaker",
    text_col: str = "text",
) -> pd.DataFrame:
    """Filter to doctor rows only and re-index (1-based).
    Output columns: [index, speaker, text]
    """
```

### segmentation.py

```python
def segment_sentences(
    df: pd.DataFrame,
    text_col: str = "text",
) -> pd.DataFrame:
    """Split utterances into sentences, replicating R tidytext::unnest_tokens.

    R logic (process-data-guille.R lines 49-66):
      1. unnest_tokens('text', text, 'sentences')
      2. group_by(index) → mutate(i2 = row_number())
      3. rename(i = index)
      4. mutate(index = row_number()) → relocate(index)

    Output columns: [index, i, i2, speaker, text]
    All indices are 1-based.
    """
```

### classification.py

```python
MODEL_TO_FULL: Dict[str, str] = {
    "cp": "cancer_prognosis",
    "le": "life_expectancy",
    "ed": "erectile_dysfunction_potency",
    "inc": "continence",
    "ius": "irritative_urinary_symptoms_frequency_urgency_nocturnia",
}

def classify_sentences(
    sentences: List[str],
    model: str,
    base_url: str,
    timeout: float = 30.0,
    max_retries: int = 3,
) -> List[Dict[str, float]]:
    """Classify sentences via NLP Docker API.
    POST /predict/{model}
    Returns: [{"`.pred_1": float, "`.pred_0": float}, ...]
    """

def classify_all_models(
    df: pd.DataFrame,
    outcomes: List[str],
    base_url: str,
    text_col: str = "text",
) -> pd.DataFrame:
    """Run all models and add prediction columns.
    Adds columns: cancer_prognosis, life_expectancy, etc.
    """
```

### selection.py

```python
def select_top_k(
    df: pd.DataFrame,
    outcome_col: str,
    k: int = 10,
) -> pd.DataFrame:
    """Select top-K sentences for one outcome.
    Tie-breaker: .pred_1 DESC → index ASC → i ASC → i2 ASC
    """

def select_all_outcomes(
    df: pd.DataFrame,
    outcomes: List[str],
    k: int = 10,
) -> Dict[str, pd.DataFrame]:
    """Select top-K for all 5 outcomes.
    Returns: {"cp": df, "le": df, ...}
    """
```

### context.py

```python
def extract_context(
    full_df: pd.DataFrame,
    top_df: pd.DataFrame,
    window: int = 3,
) -> List[str]:
    """Extract ±window context for each top sentence.
    Target wrapped in <main>...</main>, joined by '.'.
    """

def add_context_column(
    full_df: pd.DataFrame,
    top_df: pd.DataFrame,
    window: int = 3,
) -> pd.DataFrame:
    """Add 'context' column to top_df."""
```

### export.py

```python
def export_intermediate(
    segmented_df: pd.DataFrame,
    predictions_df: pd.DataFrame,
    top_dfs: Dict[str, pd.DataFrame],
    output_path: str,
    patient_id: str,
) -> None:
    """Write intermediate CSVs for validation."""

def export_final_xlsx(
    top_dfs: Dict[str, pd.DataFrame],
    patient_id: str,
    output_path: str,
) -> Path:
    """Write final Excel with outcome sheets.
    Sheet order: cp, inc, ed, ius, le
    Columns: name, index, i, i2, speaker, text, .pred_1, context
    """
```

### file_manager.py

```python
class FileManager:
    def __init__(self, config: PipelineConfig) -> None: ...
    def scan(self) -> List[Path]: ...
    def is_stable(self, filepath: Path, wait: float = 2.0) -> bool: ...
    def archive(self, filepath: Path) -> Path: ...
    def mark_error(self, filepath: Path) -> Path: ...
    def watch(self, callback: Callable[[Path], None]) -> None: ...
```

### main_pipeline.py

```python
def process_single_file(filepath: Path, config: PipelineConfig) -> None:
    """Run full pipeline on one file."""

def main() -> None:
    """CLI entry point.
    --config config.yaml
    --file input.xlsx (optional, single-file mode)
    """
```

---

## R Code ↔ Python Mapping

| R (process-data-guille.R) | Python (Pipeline) | Notes |
|---|---|---|
| `readxl::read_excel(x)` | `pd.read_excel(path)` | openpyxl engine |
| `mutate(index = row_number())` | `df['index'] = range(1, len(df)+1)` | 1-based |
| `filter(speaker %in% physician_ids)` | `identify_doctor()` + filter | Text-length based instead |
| `unnest_tokens('text', text, 'sentences')` | `nltk.sent_tokenize()` | Must validate exact match |
| `group_by(index) %>% mutate(i2 = row_number())` | Group + enumerate within group | i2 = sentence# within row |
| `rename(i = index)` | Column rename | Original row → i |
| `mutate(index = row_number())` | New global index | 1-based sequential |
| `predict(x, new_data, type='prob')` | `POST /predict/{model}` | Docker API |
| `slice_max(order_by=.pred_1, n=5)` | `sort_values + head(k)` | Changed to top-10 |
| `filter(index %in% seq(x-3, x+3))` | `full_df[index ± window]` | Boundary-safe |
| `case_when(index==x ~ glue('<main>{text}</main>'))` | f-string wrapping | Same tag format |
| `paste0(collapse='.')` | `'.'.join(parts)` | Dot separator |
| `writexl::write_xlsx()` | `pd.ExcelWriter(openpyxl)` | Sheet order: cp,inc,ed,ius,le |

---

## Validation Data Paths

| Dataset | Input | Reference Output |
|---|---|---|
| sid-01 (Keystroke) | `prostate_cancer_R01_NLP_classifiers_Michael/Data_processing_script_for_NLP_input/processed_transcripts_sid-01.xlsx` | `prostate_cancer_R01_NLP_classifiers_Michael/prediction_pipeline_and_results/original-study-physician-predictions-top-context.xlsx` |
| SID14 (Keystroke) | `prostate_cancer_R01_Guille/Input_Keystrokes REC001 (SID 14).xlsx` | `prostate_cancer_R01_Guille/Output_Keystrokes nlp-pilot-processed-results-sid14.xlsx` |
| SID33 (TurboScribe) | `prostate_cancer_R01_Guille/Input_TurboScribe SID 33.csv` | (Doctor = Speaker 1 verification) |

---

## Implementation Order

1. Phase 1: `config.yaml` + `config.py`
2. Phase 2: `preprocessing.py`
3. Phase 3: `segmentation.py` (highest risk — requires R exact match)
4. Phase 4: `classification.py`
5. Phase 5: `selection.py`
6. Phase 6: `context.py` + `export.py`
7. Phase 7: `file_manager.py` + `main_pipeline.py`
8. Tests + `requirements.txt`
