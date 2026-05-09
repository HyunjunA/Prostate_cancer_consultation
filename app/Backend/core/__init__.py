"""core/ — cross-cutting Backend infrastructure.

Houses code that does NOT belong to a single domain (routes_*) or to
a single external integration (e.g. redcap_config.py), but is needed
by many modules:

    settings.py : pydantic-settings — single source for every env var
                  the backend reads.
    logging.py  : `configure_logging()` — root-logger setup applied
                  once at app startup so every module's getLogger()
                  call shares the same format / level.

Future additions:
    deps.py     : shared FastAPI Depends() helpers (get_current_user
                  alias, common pagination, etc.).
"""
