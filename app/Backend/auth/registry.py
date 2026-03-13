"""Auth backend registry — selects the active backend based on AUTH_MODE."""

import logging
import os
from functools import lru_cache

from auth.base import AuthBackend

logger = logging.getLogger(__name__)

_VALID_MODES = {"api_key", "multi_key", "jwt", "oauth2"}


@lru_cache(maxsize=1)
def _get_backend() -> AuthBackend:
    """Instantiate and return the auth backend for the current AUTH_MODE.

    Called once (cached) per process lifetime.
    """
    mode = os.getenv("AUTH_MODE", "api_key").lower()
    if mode not in _VALID_MODES:
        raise ValueError(
            f"Invalid AUTH_MODE='{mode}'. Must be one of: {_VALID_MODES}"
        )

    if mode == "api_key":
        from auth.backends.api_key import APIKeyBackend
        backend = APIKeyBackend()
    elif mode == "multi_key":
        from auth.backends.multi_key import MultiKeyBackend
        backend = MultiKeyBackend()
    elif mode == "jwt":
        from auth.backends.jwt_auth import JWTBackend
        backend = JWTBackend()
    elif mode == "oauth2":
        from auth.backends.oauth2 import OAuth2Backend
        backend = OAuth2Backend()
    else:
        raise ValueError(f"Unsupported AUTH_MODE='{mode}'")

    logger.info("Auth backend initialised: AUTH_MODE=%s (%s)", mode, type(backend).__name__)
    return backend


def get_backend() -> AuthBackend:
    """Public accessor (thin wrapper around cached _get_backend)."""
    return _get_backend()
