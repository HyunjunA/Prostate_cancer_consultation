"""Backend logging setup — single place that configures the root logger.

Called exactly once at app startup (main.py / create_app) before any
other module logs anything. Replaces the implicit `logging.basicConfig`
calls that used to be scattered across modules.

Why centralise this:
    - Module-level `logging.getLogger(__name__)` calls (in db.py,
      redis_client.py, etc.) work fine, but the FORMAT and LEVEL of
      what they emit is determined by whichever module calls
      `basicConfig` first. Without a single owner, the root logger
      falls back to Python's default "WARNING and above only" — so
      info-level lines silently disappear depending on import order.
    - Centralising means every uvicorn worker, CLI script, and test
      gets the same format and level, with a single env knob
      (LOG_LEVEL) to override.

Level policy:
    - LOG_LEVEL env var wins if set ("DEBUG", "INFO", "WARNING", ...).
    - Otherwise: dev/development environment → DEBUG (verbose for
      local work). Anything else (staging/production) → INFO.
"""

import logging

from core.settings import get_settings


def configure_logging() -> None:
    """Apply the standard logging config to the root logger.

    Idempotent in practice — `basicConfig(force=True)` lets us call
    this from tests too without leaving handlers from the previous
    test run attached.
    """
    settings = get_settings()

    if settings.log_level:
        # Explicit override from LOG_LEVEL env var.
        level = getattr(logging, settings.log_level.upper(), logging.INFO)
    elif settings.environment.lower() in ("dev", "development", "local"):
        level = logging.DEBUG
    else:
        # production / staging / anything else
        level = logging.INFO

    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        # force=True replaces any handlers a previous import already
        # installed (e.g. another module's basicConfig ran first under test).
        force=True,
    )


def get_logger(name: str) -> logging.Logger:
    """Return a module-named logger.

    Thin wrapper over `logging.getLogger(name)`. Exists so callers can
    do `from core.logging import get_logger` and stay consistent with
    the other `from core.* import` patterns in the codebase. Functionally
    identical to `logging.getLogger(__name__)`.
    """
    return logging.getLogger(name)
