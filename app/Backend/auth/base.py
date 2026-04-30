"""Base types and protocol for all authentication backends."""

from dataclasses import dataclass
from typing import Protocol

from fastapi import Request


@dataclass
class AuthUser:
    """Common return type for all auth modules.

    Every backend must resolve incoming credentials to an AuthUser instance.
    Downstream code (access control, audit logging) depends only on this type.
    """

    user_id: str
    username: str
    role: str  # "admin" | "user" | "readonly"
    is_superuser: bool  # True -> patient access control is bypassed


class AuthBackend(Protocol):
    """Interface that every authentication backend must implement."""

    async def authenticate(self, request: Request) -> AuthUser:
        """Resolve the incoming request to an AuthUser.

        Raises ``HTTPException`` (401/403) on failure.
        """
        ...
