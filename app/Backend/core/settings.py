"""Backend settings — single source for every environment variable.

Built on pydantic-settings. Every backend module that previously called
`os.getenv("X")` should migrate to `get_settings().x` — this module is
the single source of truth (CR #7 — Config-Driven).

Three benefits over scattered os.getenv calls:
    1. Type safety — `settings.database_pool_size` is `int`, not `str`.
       Misconfigured values fail at import time with a clear pydantic
       ValidationError, not at first use with a cryptic TypeError.
    2. IDE autocomplete — typing `settings.` lists every available knob.
    3. Single audit point — security review can read one file to see
       every env var the backend touches.

Usage:
    from core.settings import get_settings

    settings = get_settings()
    engine = create_async_engine(settings.database_url, ...)

Migration plan (incremental, low-risk):
    Phase A (this PR — P1.S1): just introduce Settings + use it ONLY
        in db.py as a try-out. All other modules keep their os.getenv
        calls untouched.
    Phase B (P1.S2-S6): migrate the remaining modules one env-var
        family at a time (DATABASE_*, NLP_*, AZURE_OPENAI_*, REDIS_*,
        CORS, ENVIRONMENT). Each step is a separate small PR.
    Phase C (P5.S2): main.py inlines `settings.environment` /
        `settings.cors_origins` directly so the create_app() factory
        no longer reads env vars. Hits the Thin Main 50-line target.

Why @lru_cache around get_settings:
    Reading .env + validating types is not free; we want to do it once.
    @lru_cache(maxsize=1) gives us a process-wide singleton without the
    boilerplate of a manual global. Tests can override by passing an
    explicit Settings(...) instance to the function under test.
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed view of every env var the backend reads."""

    # ── Pydantic-settings config ─────────────────────────────────────
    # env_file: .env in the working directory takes precedence over the
    # OS environment, so local dev .env values win over whatever the
    # shell exports — convenient for "I want to test with a different
    # NLP_API_URL real quick".
    # extra="ignore": .env may contain vars we do not declare here
    # (e.g. POSTGRES_PASSWORD which only init scripts read); ignore
    # them rather than crashing.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Database ─────────────────────────────────────────────────────
    database_url: str = Field(
        ...,
        description="PostgreSQL DSN. MUST use postgresql+asyncpg:// scheme.",
    )
    database_pool_size: int = Field(10, ge=1, le=100)
    database_max_overflow: int = Field(20, ge=0, le=200)
    database_pool_timeout: int = Field(30, ge=1, le=300)
    database_pool_recycle: int = Field(1800, ge=60, le=86400)
    database_pool_use_lifo: bool = True
    sql_echo: bool = False
    # Used only by wait_for_db.py at boot — how long to keep retrying
    # the postgres TCP+auth handshake before giving up.
    db_wait_timeout: int = Field(60, ge=1, le=600)

    @field_validator("database_url")
    @classmethod
    def _require_asyncpg(cls, v: str) -> str:
        # Same rule the legacy db.py enforces inline — moving it here
        # means EVERY env var consumer gets the same protection
        # without each having to re-implement the check.
        if "+asyncpg" not in v:
            raise ValueError(
                "DATABASE_URL must use the asyncpg driver "
                "(scheme: postgresql+asyncpg://...)"
            )
        return v

    # ── Redis ────────────────────────────────────────────────────────
    redis_url: str = Field("redis://localhost:6379/0")

    # ── NLP service ──────────────────────────────────────────────────
    nlp_api_url: str = Field("http://nlp-classifiers:8000")
    nlp_timeout: int = Field(30, ge=1, le=600)
    nlp_retries: int = Field(3, ge=1, le=10)
    nlp_cache_ttl: int = Field(3600, ge=0)

    # ── Azure OpenAI ─────────────────────────────────────────────────
    # All optional — the AI pipeline degrades gracefully when these
    # are missing (see ai_pipeline_service._create_client).
    azure_openai_endpoint: Optional[str] = None
    azure_openai_key: Optional[str] = None
    azure_openai_api_version: str = Field("2024-08-01-preview")
    azure_openai_model: str = Field("gpt-4o")

    # ── REDCap ───────────────────────────────────────────────────────
    # Optional — the dashboard works without REDCap (see redcap_config.py).
    redcap_api_url: Optional[str] = None
    redcap_api_token: Optional[str] = None

    @property
    def redcap_enabled(self) -> bool:
        """True only when BOTH the URL and the token are configured."""
        return bool(self.redcap_api_url and self.redcap_api_token)

    # ── App / runtime ────────────────────────────────────────────────
    environment: str = Field("development")
    api_key: Optional[str] = None  # Server-side check happens in auth/backends/
    upload_dir: str = Field("/app/uploads")
    transcripts_dir: str = Field("data/transcripts")
    output_dir: str = Field("../AI_physician_patient_communication/data/output")

    # CORS origins are stored in the env as a JSON-encoded array string
    # (e.g. '["http://localhost:3000"]'). pydantic-settings parses it
    # automatically because the field is declared as List[str].
    cors_origins: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080",
        ]
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide Settings singleton.

    Cached so repeated calls do not re-read .env. Tests that need a
    specific config can either monkeypatch env vars BEFORE the first
    call, or call `get_settings.cache_clear()` and re-import.
    """
    return Settings()
