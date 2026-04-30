"""Concrete authentication backend implementations.

Each module in this package implements the AuthBackend protocol defined
in auth/base.py. The active backend is selected at runtime by
auth/registry.py based on the AUTH_MODE environment variable
(api_key, multi_key, jwt, oauth2).

Adding a new auth method = drop a new module here that exposes a class
implementing `async def authenticate(request) -> AuthUser`, then wire
it into auth/registry.py.
"""
