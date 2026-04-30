"""core/ — cross-cutting Backend infrastructure.

Houses code that does NOT belong to a single domain (routes_*) or to
a single integration (nlp_classifier_client.py, redcap_config.py),
but is needed by many modules:

    settings.py : pydantic-settings — single source for every env var
                  the backend reads (CR #7 — Config-Driven).

Future additions (Plan P1.S7+):
    logging.py  : `configure_logging()` — JSON formatter, level, etc.
    deps.py     : shared FastAPI Depends() helpers (get_current_user
                  alias, common pagination, etc.).
"""
