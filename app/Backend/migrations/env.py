"""Alembic env.py — async-aware migration runner.

Reads DATABASE_URL from environment (same as db.py), replaces asyncpg with
psycopg2 for Alembic (which needs a synchronous driver), and points
target_metadata at the shared SQLAlchemy Base so autogenerate works.
"""

import os
import sys
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from alembic import context

# Ensure the Backend directory is importable (for models, auth.models)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

load_dotenv()

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Dynamic DB URL from environment ──────────────────────────────────────────
# DATABASE_URL uses asyncpg (postgresql+asyncpg://...) but Alembic needs a
# synchronous driver.  Replace asyncpg → psycopg2 for migration execution.
database_url = os.getenv("DATABASE_URL", "")
if "+asyncpg" in database_url:
    database_url = database_url.replace("+asyncpg", "+psycopg2")
config.set_main_option("sqlalchemy.url", database_url)

# ── Import all models so Base.metadata is complete ───────────────────────────
from models import Base  # noqa: E402  — main models
import auth.models  # noqa: E402, F401  — auth models (registers tables on Base)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without connecting)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connect and apply)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
