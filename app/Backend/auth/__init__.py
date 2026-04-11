"""Modular authentication package.

The single public dependency that all route files should use::

    from auth import get_current_user
    from auth.base import AuthUser

    @router.get("/my-endpoint")
    async def my_endpoint(user: AuthUser = Depends(get_current_user)):
        ...

``AUTH_MODE`` env var (default ``api_key``) selects the active backend.
"""

from fastapi import Request

from auth.base import AuthUser
from auth.registry import get_backend


async def get_current_user(request: Request) -> AuthUser:
    """FastAPI dependency — authenticate the current request.

    Delegates to whichever backend ``AUTH_MODE`` selects.
    """
    backend = get_backend()
    return await backend.authenticate(request)
