"""Integration tests: AUTH_MODE switching via the registry.

Tests that the auth backend registry correctly selects backends based on
the AUTH_MODE environment variable, handles caching, and rejects invalid modes.

Key function under test: auth.registry._get_backend (lru_cache(maxsize=1))
"""


import pytest

from auth.registry import _get_backend, _VALID_MODES


pytestmark = pytest.mark.integration


class TestAuthModeDefault:
    """Default mode when AUTH_MODE is not set."""

    async def test_default_mode_is_api_key(self, monkeypatch):
        """When AUTH_MODE is unset, the registry defaults to 'api_key'."""
        _get_backend.cache_clear()
        monkeypatch.delenv("AUTH_MODE", raising=False)
        monkeypatch.setenv("API_KEY", "test-api-key")

        backend = _get_backend()
        from auth.backends.api_key import APIKeyBackend
        assert isinstance(backend, APIKeyBackend)
        _get_backend.cache_clear()

    async def test_explicit_api_key_mode(self, monkeypatch):
        """AUTH_MODE=api_key selects APIKeyBackend."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "api_key")
        monkeypatch.setenv("API_KEY", "test-api-key")

        backend = _get_backend()
        from auth.backends.api_key import APIKeyBackend
        assert isinstance(backend, APIKeyBackend)
        _get_backend.cache_clear()


class TestAuthModeSwitching:
    """Switch between auth modes using cache_clear + env var change."""

    async def test_switch_to_multi_key(self, monkeypatch):
        """Clear cache + set AUTH_MODE=multi_key selects MultiKeyBackend."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "multi_key")

        backend = _get_backend()
        from auth.backends.multi_key import MultiKeyBackend
        assert isinstance(backend, MultiKeyBackend)
        _get_backend.cache_clear()

    async def test_switch_to_jwt(self, monkeypatch):
        """Clear cache + set AUTH_MODE=jwt selects JWTBackend."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "jwt")

        backend = _get_backend()
        from auth.backends.jwt_auth import JWTBackend
        assert isinstance(backend, JWTBackend)
        _get_backend.cache_clear()

    async def test_switch_api_key_then_multi_key(self, monkeypatch):
        """Switching from api_key to multi_key works after cache_clear."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "api_key")
        monkeypatch.setenv("API_KEY", "test-api-key")

        backend1 = _get_backend()
        from auth.backends.api_key import APIKeyBackend
        assert isinstance(backend1, APIKeyBackend)

        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "multi_key")

        backend2 = _get_backend()
        from auth.backends.multi_key import MultiKeyBackend
        assert isinstance(backend2, MultiKeyBackend)
        _get_backend.cache_clear()

    async def test_mode_is_case_insensitive(self, monkeypatch):
        """AUTH_MODE comparison uses .lower(), so 'API_KEY' should work."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "API_KEY")
        monkeypatch.setenv("API_KEY", "test-api-key")

        backend = _get_backend()
        from auth.backends.api_key import APIKeyBackend
        assert isinstance(backend, APIKeyBackend)
        _get_backend.cache_clear()

    async def test_mixed_case_jwt(self, monkeypatch):
        """AUTH_MODE='Jwt' lowered to 'jwt' -> JWTBackend."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "Jwt")

        backend = _get_backend()
        from auth.backends.jwt_auth import JWTBackend
        assert isinstance(backend, JWTBackend)
        _get_backend.cache_clear()


class TestAuthModeInvalid:
    """Invalid AUTH_MODE values raise ValueError."""

    async def test_invalid_mode_raises_valueerror(self, monkeypatch):
        """An unrecognized AUTH_MODE raises ValueError."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "kerberos")

        with pytest.raises(ValueError, match="Invalid AUTH_MODE"):
            _get_backend()
        _get_backend.cache_clear()

    async def test_empty_string_raises_valueerror(self, monkeypatch):
        """Empty string AUTH_MODE raises ValueError."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "")

        with pytest.raises(ValueError, match="Invalid AUTH_MODE"):
            _get_backend()
        _get_backend.cache_clear()

    async def test_whitespace_raises_valueerror(self, monkeypatch):
        """Whitespace AUTH_MODE raises ValueError."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "  ")

        with pytest.raises(ValueError, match="Invalid AUTH_MODE"):
            _get_backend()
        _get_backend.cache_clear()


class TestRegistryCaching:
    """Verify lru_cache behaviour of _get_backend."""

    async def test_cache_returns_same_instance(self, monkeypatch):
        """Without cache_clear, repeated calls return the same object."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "api_key")
        monkeypatch.setenv("API_KEY", "test-api-key")

        b1 = _get_backend()
        b2 = _get_backend()
        assert b1 is b2
        _get_backend.cache_clear()

    async def test_cache_clear_allows_new_instance(self, monkeypatch):
        """After cache_clear, a new instance is created."""
        _get_backend.cache_clear()
        monkeypatch.setenv("AUTH_MODE", "api_key")
        monkeypatch.setenv("API_KEY", "test-api-key")

        b1 = _get_backend()
        _get_backend.cache_clear()
        b2 = _get_backend()
        # They are separate instances (not necessarily different class)
        # but the lru_cache.cache_info shows misses increased
        assert b1 is not b2
        _get_backend.cache_clear()

    async def test_valid_modes_set(self):
        """_VALID_MODES contains all expected auth modes."""
        assert _VALID_MODES == {"api_key", "multi_key", "jwt", "oauth2"}
