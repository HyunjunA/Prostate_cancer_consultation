"""Configuration loader — reads config.yaml with environment variable overrides.

Ivan's rule: "All configurable parameters in config file, not hardcoded."

This module is the single source of truth for tunable knobs that are
NOT secrets. Secrets (DATABASE_URL, API keys, REDCAP token) live in
environment variables only — they should never appear in config.yaml.

Two-tier configuration:
    1. config.yaml   : version-controlled defaults that ship with the
                       repo (e.g. pipeline.top_n = 5).
    2. Env variables : per-environment overrides that take precedence
                       (e.g. PIPELINE_TOP_N=10 in production .env).

Lookup pattern (used everywhere else in the codebase):
    import config as _cfg
    top_n = _cfg.get("pipeline.top_n", 5)

The dot-notation key navigates the nested YAML, and the second arg is
the fallback if the key is missing — so adding a new yaml key never
breaks an old caller that does not know about it.
"""

import os
from pathlib import Path
from typing import Any, Dict

import yaml

# ──────────────────────────────────────────────────────────────────────────────
# Module-level state
# ──────────────────────────────────────────────────────────────────────────────
# Where to find the YAML file by default. Computed from this file's
# location so it works regardless of the CWD the backend was launched
# from (e.g. uvicorn from the repo root, or a CLI script from elsewhere).
_CONFIG_PATH = Path(__file__).parent / "config.yaml"

# Anchor for resolving relative paths inside config.yaml. We walk up
# THREE parents:
#   config.py        -> app/Backend/
#   .parent          -> app/
#   .parent.parent   -> repo root
# This lets the YAML use portable relatives like "../AI_physician_..."
# without breaking when the backend is run from Docker, native, or CI.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# The loaded config dict. Starts empty; populated lazily by the first
# get() call (or eagerly by load_config()). Module-level globals are
# used here for the same reason as in db.py / redis_client.py — config
# is a per-process singleton, no point in wrapping it in a class.
_config: Dict[str, Any] = {}


def load_config(path: str = None) -> Dict[str, Any]:
    """Load config.yaml and apply environment variable overrides.

    Args:
        path: Override the default YAML path. Mostly for tests that
            want to point at a fixture file.

    Returns:
        The fully-resolved config dict. Also stored in the module-
        level `_config` so subsequent get() calls do not re-read YAML.
    """
    global _config
    config_path = Path(path) if path else _CONFIG_PATH

    with open(config_path) as f:
        _config = yaml.safe_load(f)

    # ── Environment variable overrides ──────────────────────────────
    # Each line below: "if env var X is set, overwrite the matching
    # YAML key with X (after casting)." Env vars ALWAYS win, so the
    # same Docker image can run in dev/staging/prod with only .env
    # changes and no code changes.
    _override("pipeline.top_n", "PIPELINE_TOP_N", int)
    _override("pipeline.context_window", "PIPELINE_CONTEXT_WINDOW", int)
    _override("pipeline.batch_size", "PIPELINE_BATCH_SIZE", int)
    _override("paths.transcript_dir", "TRANSCRIPT_DIR", str)
    _override("paths.output_dir", "OUTPUT_DIR", str)
    # `WORKER_ENABLED=true/false` is read as a string; convert here so
    # callers can do plain boolean checks (`if cfg.get("worker.enabled"):`).
    _override("worker.enabled", "WORKER_ENABLED", lambda v: v.lower() == "true")
    _override("worker.scan_interval_seconds", "WORKER_SCAN_INTERVAL", int)
    _override("nlp.api_url", "NLP_API_URL", str)

    # Convert any relative `paths.*` to absolute so callers do not need
    # to know where the backend was started from.
    _resolve_paths_against_repo_root()

    return _config


def _resolve_paths_against_repo_root() -> None:
    """Make every relative `paths.*` value absolute, anchored at REPO_ROOT.

    Lets `.env.native` use portable relative paths like
    `../AI_physician_patient_communication/data/output` regardless of CWD.
    Without this, the same path string would point at different places
    depending on whether the backend was launched from `/repo`, `/repo/app/Backend`,
    or some CI runner.
    """
    paths = _config.get("paths", {})
    # Snapshot the items via `list()` because we mutate `paths` inside
    # the loop; iterating a live dict while mutating raises RuntimeError.
    for k, v in list(paths.items()):
        if isinstance(v, str) and v and not Path(v).is_absolute():
            # `.resolve()` normalises ".." and symlinks so two callers
            # comparing the same logical path always get the same string.
            paths[k] = str((_REPO_ROOT / v).resolve())


def get(key: str, default: Any = None) -> Any:
    """Get a nested config value using dot notation (e.g. 'pipeline.top_n').

    Args:
        key:     Dot-separated path into the YAML, e.g. "pipeline.top_n"
                 or "nlp.api_url".
        default: Returned when any segment of the path is missing.
                 Choose a sensible default so callers never need a
                 separate try/except for first-run / missing-key cases.

    Returns:
        The value at `key`, or `default` if the path does not exist.

    Lazy loading:
        The first call triggers load_config() automatically, so callers
        can `import config; config.get("pipeline.top_n")` without
        boilerplate. Subsequent calls reuse the cached `_config`.
    """
    # Lazy load: most modules just want to call get() and not think
    # about initialisation order. If nothing has loaded the config yet,
    # do it now.
    if not _config:
        load_config()

    keys = key.split(".")
    val = _config
    # Walk one level at a time. Bail out and return the default the
    # moment a key is missing — never raise KeyError, because callers
    # universally provide a default and never expect this to throw.
    for k in keys:
        if isinstance(val, dict) and k in val:
            val = val[k]
        else:
            return default
    return val


def _override(key_path: str, env_var: str, cast_fn):
    """Override a config value if the environment variable is set.

    Args:
        key_path: Dot-notation key into `_config` to overwrite.
        env_var:  Name of the environment variable to check.
        cast_fn:  Callable that converts the raw env string into the
                  target type (int, str, bool, …). Bools need a custom
                  lambda — `bool("false")` is True!

    No-op when the env var is unset, so YAML defaults remain in force.
    Creates intermediate dicts on the path if they do not exist
    (`setdefault`) so an env-var override can introduce a brand-new key.
    """
    env_val = os.getenv(env_var)
    if env_val is not None:
        keys = key_path.split(".")
        d = _config
        # Walk down to the parent dict, creating empty dicts along the
        # way if necessary so we can set the leaf even when the YAML
        # has no entry for this key at all.
        for k in keys[:-1]:
            d = d.setdefault(k, {})
        d[keys[-1]] = cast_fn(env_val)
