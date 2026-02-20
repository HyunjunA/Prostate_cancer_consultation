import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")  # must be postgresql+asyncpg://...
if not DATABASE_URL or "+asyncpg" not in DATABASE_URL:
    raise ValueError("DATABASE_URL must be postgresql+asyncpg://... and use asyncpg")

POOL_SIZE        = int(os.getenv("DATABASE_POOL_SIZE", 10))
MAX_OVERFLOW     = int(os.getenv("DATABASE_MAX_OVERFLOW", 20))
POOL_TIMEOUT     = int(os.getenv("DATABASE_POOL_TIMEOUT", 30))
POOL_RECYCLE     = int(os.getenv("DATABASE_POOL_RECYCLE", 1800))
POOL_USE_LIFO    = os.getenv("DATABASE_POOL_USE_LIFO", "true").lower() == "true"
ECHO_SQL         = os.getenv("SQL_ECHO", "false").lower() == "true"

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=POOL_RECYCLE,
    pool_use_lifo=POOL_USE_LIFO,
    echo=ECHO_SQL,
)

AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)

async def get_db():
    """FastAPI dependency: one async session per request."""
    async with AsyncSessionLocal() as session:
        yield session

async def db_ready_ping() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
