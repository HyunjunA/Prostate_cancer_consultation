"""SQLAlchemy models for authentication and access control tables."""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    String,
    TIMESTAMP,
    func,
)
from sqlalchemy.orm import relationship

# Re-use the same Base from the main models module so all tables share
# a single metadata registry (important for create_all / migrations).
from models import Base


class AuthUser(Base):
    """Application user — shared across all auth modes that require a DB."""

    __tablename__ = "auth_user"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(150), nullable=False, index=True)
    email = Column(String(255), unique=True)
    password_hash = Column(String(255))
    role = Column(
        String(20),
        nullable=False,
        server_default="user",
    )
    is_superuser = Column(Boolean, nullable=False, server_default="false")
    is_active = Column(Boolean, nullable=False, server_default="true")
    auth_provider = Column(String(50), nullable=False, server_default="local")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('admin','user','readonly')", name="ck_auth_user_role"),
    )

    api_keys = relationship("AuthAPIKey", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<AuthUser(id={self.id}, username={self.username}, role={self.role})>"


class AuthAPIKey(Base):
    """Per-user API key for multi_key auth mode."""

    __tablename__ = "auth_api_key"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("auth_user.id", ondelete="CASCADE"), nullable=False)
    key_hash = Column(String(255), nullable=False)
    label = Column(String(100))
    is_active = Column(Boolean, nullable=False, server_default="true")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    expires_at = Column(TIMESTAMP(timezone=True))
    last_used_at = Column(TIMESTAMP(timezone=True))

    user = relationship("AuthUser", back_populates="api_keys")

    def __repr__(self) -> str:
        return f"<AuthAPIKey(id={self.id}, user_id={self.user_id}, label={self.label})>"


