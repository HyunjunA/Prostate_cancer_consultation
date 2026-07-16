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
from pathlib import Path
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Default pipeline drop folder: where admin uploads land and the pipeline watch
# picks them up. Deliberately NOT data/input_deid — that is where the clinical-side
# preparation step writes its output, and reusing one folder for both roles means a
# machine running both swallows files before they can be uploaded. core/settings.py
# sits at app/Backend/core/, so parents[4] is the project root holding both repos.
_DEFAULT_PIPELINE_DROP_DIR = str(
    Path(__file__).resolve().parents[4]
    / "AI_physician_patient_communication"
    / "data"
    / "incoming"
)


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

    # ── Pipeline tuning ──────────────────────────────────────────────
    # Migrated here from config.py / config.yaml so the backend has a
    # single typed source of truth. Defaults match the historical YAML
    # values; env vars (PIPELINE_TOP_N, PIPELINE_CONTEXT_WINDOW,
    # PIPELINE_BATCH_SIZE) override them per-environment.
    pipeline_top_n: int = Field(10, ge=1, le=1000)
    pipeline_context_window: int = Field(3, ge=0, le=20)
    pipeline_batch_size: int = Field(50, ge=1, le=1000)

    # Drop folder that the pipeline watch mode monitors. The admin
    # upload endpoint writes de-identified transcripts here so the running
    # watch picks them up automatically. Override per-host with
    # PIPELINE_DROP_DIR (e.g. an absolute server path).
    pipeline_drop_dir: str = Field(_DEFAULT_PIPELINE_DROP_DIR)

    # ── Background worker (CLI watch mode) ───────────────────────────
    # Legacy knobs kept for backwards compatibility with older config
    # snapshots. The AI repo's main_complete_pipeline_db.py has its own
    # watch-folder mode driven by FileManager (poll interval comes from
    # PipelineConfig there), so the dashboard backend itself does not
    # consume these any more.
    worker_enabled: bool = Field(False)
    worker_scan_interval: int = Field(3600, ge=1, le=86400)

    # ── Azure OpenAI ─────────────────────────────────────────────────
    # All optional — the doctor's "Try & Score" route degrades gracefully
    # when these are missing. The AI repo's main_complete_pipeline_db.py
    # also reads these (via its own .env) to drive the AI 5-substep.
    azure_openai_endpoint: Optional[str] = None
    azure_openai_key: Optional[str] = None
    azure_openai_api_version: str = Field("2024-08-01-preview")
    azure_openai_model: str = Field("gpt-4o")

    # ── REDCap ───────────────────────────────────────────────────────
    # Optional — the dashboard works without REDCap (see redcap_config.py).
    redcap_api_url: Optional[str] = None
    redcap_api_token: Optional[str] = None
    # A survey is attributed to the REDCap record whose record_id IS the study SID
    # (e.g. SID_22): the coordinator names each record after the SID. See
    # redcap_mapping.resolve_record_id and docs/architecture/REDCAP_RECORD_ID_MAPPING.md.

    @property
    def redcap_enabled(self) -> bool:
        """True only when BOTH the URL and the token are configured."""
        return bool(self.redcap_api_url and self.redcap_api_token)

    # ── De-identification (AES-SIV) ──────────────────────────────────
    # Shared passphrase used upstream by the AI repo's
    # scripts/deidentify_transcript.py to hash the study/doctor numbers.
    # The backend needs the SAME value to reverse a hashed speaker back to
    # its SID for REDCap attribution (deid.unhash_patient_sid) and to
    # de-identify raw admin uploads (routes_admin_upload). Optional: when
    # absent, un-hash returns None and raw uploads are refused (503).
    # Must match DEID_KEY in the AI repo .env. Never commit the value.
    deid_key: Optional[str] = None

    # ── App / runtime ────────────────────────────────────────────────
    environment: str = Field("development")
    # Override with LOG_LEVEL=DEBUG / WARNING / ERROR. Default is None
    # so configure_logging() can pick INFO in production and DEBUG in
    # dev based on `environment` instead.
    log_level: Optional[str] = None
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
