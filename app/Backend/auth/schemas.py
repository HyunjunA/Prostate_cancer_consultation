"""Pydantic request/response schemas for auth admin API."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# ──────────────────────────────────────────────────────────────────────────────
# User schemas
# ──────────────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=150)
    email: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    role: str = Field(default="user", pattern="^(admin|user|readonly)$")
    is_superuser: bool = False


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=1, max_length=150)
    email: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, min_length=8, max_length=128)
    role: Optional[str] = Field(None, pattern="^(admin|user|readonly)$")
    is_superuser: Optional[bool] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    is_superuser: bool
    is_active: bool
    auth_provider: str
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────────────────────
# API Key schemas
# ──────────────────────────────────────────────────────────────────────────────

class APIKeyCreate(BaseModel):
    label: Optional[str] = Field(None, max_length=100)
    expires_in_days: Optional[int] = Field(None, ge=1, le=3650)


class APIKeyResponse(BaseModel):
    id: int
    label: Optional[str]
    is_active: bool
    created_at: Optional[datetime]
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]

    class Config:
        from_attributes = True


class APIKeyCreated(APIKeyResponse):
    """Returned only at creation time — includes the raw key."""
    raw_key: str


# ──────────────────────────────────────────────────────────────────────────────
# Patient access schemas
# ──────────────────────────────────────────────────────────────────────────────

class PatientAccessGrant(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=255)
    access_type: str = Field(default="read", pattern="^(read|write|admin)$")


class PatientAccessResponse(BaseModel):
    id: int
    user_id: int
    patient_id: str
    access_type: str
    granted_at: Optional[datetime]
    granted_by: Optional[int]

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────────────────────────────────────
# JWT login schemas
# ──────────────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
