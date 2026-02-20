#!/usr/bin/env python3
import os
import asyncio
import asyncpg

from dotenv import load_dotenv
load_dotenv()

TIMEOUT = int(os.getenv("DB_WAIT_TIMEOUT", "60"))

async def wait_for_db():
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set")
    # asyncpg expects "postgresql://"
    dsn = dsn.replace("postgresql+asyncpg", "postgresql")

    deadline = asyncio.get_event_loop().time() + TIMEOUT
    last_error = None
    while asyncio.get_event_loop().time() < deadline:
        try:
            conn = await asyncpg.connect(dsn)
            await conn.close()
            print("DB is ready")
            return
        except Exception as e:
            last_error = e
            print("DB not ready yet:", e)
            await asyncio.sleep(2)
    raise RuntimeError(f"DB not ready within {TIMEOUT}s: {last_error}")

if __name__ == "__main__":
    asyncio.run(wait_for_db())
