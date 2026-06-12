#!/usr/bin/env python3
"""Create (or update) an admin user for the dashboard's admin login.

The admin tracking screens are gated behind a JWT login (see
``auth/admin_auth_routes.py`` + ``auth/admin_session.py``). This one-time CLI
seeds the first admin account so someone can actually log in — the user-management
API in ``auth/admin_routes.py`` is itself admin-protected, so it cannot bootstrap
the very first admin.

Usage (from app/Backend, with the backend venv active)::

    python scripts/create_admin.py --username admin
    # prompts for the password (hidden)

    python scripts/create_admin.py --username admin --password 's3cret...' --email a@b.org

If the username already exists, its password is reset and the admin role is
ensured (so this doubles as a password-reset tool). Passwords are stored as a
salted SHA-256 hash (same scheme the rest of the auth layer uses).
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]  # file -> scripts -> Backend -> app -> repo root
BACKEND_DIR = REPO_ROOT / "app" / "Backend"
ENV_FILE = BACKEND_DIR / ".env"

# Make the Backend package importable (auth.*, db, ...) when run from anywhere.
sys.path.insert(0, str(BACKEND_DIR))

# Load env BEFORE importing sqlalchemy / db (asyncpg URL must be set).
try:
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE)
except ImportError:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

from sqlalchemy import select  # noqa: E402

from auth.admin_routes import _hash_password  # noqa: E402
from auth.models import AuthUser  # noqa: E402
from db import AsyncSessionLocal  # noqa: E402

MIN_PASSWORD_LEN = 8


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Create or update a dashboard admin user.")
    p.add_argument("--username", required=True, help="Admin username (login id).")
    p.add_argument(
        "--password",
        default=None,
        help="Admin password. Omit to be prompted securely (recommended).",
    )
    p.add_argument("--email", default=None, help="Optional email address.")
    p.add_argument(
        "--no-superuser",
        action="store_true",
        help="Create with role=admin but is_superuser=False (default is superuser).",
    )
    return p.parse_args()


def _resolve_password(arg_password: str | None) -> str:
    password = arg_password
    if not password:
        password = getpass.getpass("Admin password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("✗ Passwords do not match.", file=sys.stderr)
            raise SystemExit(1)
    if len(password) < MIN_PASSWORD_LEN:
        print(f"✗ Password must be at least {MIN_PASSWORD_LEN} characters.", file=sys.stderr)
        raise SystemExit(1)
    return password


async def _upsert_admin(username: str, password: str, email: str | None, superuser: bool) -> None:
    password_hash = _hash_password(password)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AuthUser).where(AuthUser.username == username))
        user = result.scalar_one_or_none()

        if user is None:
            user = AuthUser(
                username=username,
                email=email,
                role="admin",
                is_superuser=superuser,
                is_active=True,
                password_hash=password_hash,
            )
            db.add(user)
            action = "created"
        else:
            user.password_hash = password_hash
            user.role = "admin"
            user.is_superuser = superuser
            user.is_active = True
            if email is not None:
                user.email = email
            action = "updated"

        await db.commit()
        await db.refresh(user)

    print(
        f"✓ Admin user {action}: id={user.id} username={user.username} "
        f"role={user.role} superuser={user.is_superuser}"
    )


def main() -> None:
    args = _parse_args()
    password = _resolve_password(args.password)
    asyncio.run(
        _upsert_admin(
            username=args.username,
            password=password,
            email=args.email,
            superuser=not args.no_superuser,
        )
    )


if __name__ == "__main__":
    main()
