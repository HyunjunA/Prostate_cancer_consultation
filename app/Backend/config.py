"""Configuration loader — reads config.yaml with environment variable overrides.

Ivan's rule: "All configurable parameters in config file, not hardcoded."
"""

import os
from pathlib import Path
from typing import Any, Dict

import yaml

_CONFIG_PATH = Path(__file__).parent / "config.yaml"
_config: Dict[str, Any] = {}


def load_config(path: str = None) -> Dict[str, Any]:
    """Load config.yaml and apply environment variable overrides."""
    global _config
    config_path = Path(path) if path else _CONFIG_PATH

    with open(config_path) as f:
        _config = yaml.safe_load(f)

    # Environment variable overrides (higher priority than config.yaml)
    _override("pipeline.top_n", "PIPELINE_TOP_N", int)
    _override("pipeline.context_window", "PIPELINE_CONTEXT_WINDOW", int)
    _override("pipeline.batch_size", "PIPELINE_BATCH_SIZE", int)
    _override("paths.transcript_dir", "TRANSCRIPT_DIR", str)
    _override("paths.output_dir", "OUTPUT_DIR", str)
    _override("worker.enabled", "WORKER_ENABLED", lambda v: v.lower() == "true")
    _override("worker.scan_interval_seconds", "WORKER_SCAN_INTERVAL", int)
    _override("scoring.scorer_url", "SCORER_API_URL", str)
    _override("scoring.rewriter_url", "REWRITER_API_URL", str)
    _override("nlp.api_url", "NLP_API_URL", str)

    return _config


def get(key: str, default: Any = None) -> Any:
    """Get a nested config value using dot notation (e.g. 'pipeline.top_n')."""
    if not _config:
        load_config()
    keys = key.split(".")
    val = _config
    for k in keys:
        if isinstance(val, dict) and k in val:
            val = val[k]
        else:
            return default
    return val


def _override(key_path: str, env_var: str, cast_fn):
    """Override a config value if the environment variable is set."""
    env_val = os.getenv(env_var)
    if env_val is not None:
        keys = key_path.split(".")
        d = _config
        for k in keys[:-1]:
            d = d.setdefault(k, {})
        d[keys[-1]] = cast_fn(env_val)
