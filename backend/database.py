"""
Database operations using async PostgreSQL
"""
import asyncpg
import ssl
from uuid import UUID
from datetime import datetime
from typing import Optional, Dict, Any
from config import settings
import bcrypt as _bcrypt


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _serialize_row(row) -> Dict[str, Any]:
    """Convert a database row to a dict with UUIDs cast to strings"""
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, UUID):
            d[k] = str(v)
    return d


pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        ssl_context = ssl.create_default_context()
        pool = await asyncpg.create_pool(settings.database_url, ssl=ssl_context)
    return pool


async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None


# ============================================================
# User auth CRUD
# ============================================================

async def create_user(email: str, password: str, first_name: str, last_name: str) -> Dict[str, Any]:
    fn = first_name.strip()
    ln = last_name.strip()
    display_name = f"{fn} {ln}"
    password_hash = hash_password(password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """INSERT INTO users (email, password_hash, first_name, last_name, display_name)
                   VALUES ($1, $2, $3, $4, $5)
                   RETURNING id, email, first_name, last_name, display_name, created_at""",
                email.lower().strip(),
                password_hash,
                fn,
                ln,
                display_name,
            )
        except asyncpg.UniqueViolationError:
            raise ValueError("Email already registered")
    return _serialize_row(row)


async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Internal use only — returned dict includes password_hash for login verification."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = $1",
            email.lower().strip(),
        )
    return _serialize_row(row) if row else None


async def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Return a user record by primary key, or None."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, display_name, created_at FROM users WHERE id = $1",
            user_id,
        )
    return _serialize_row(row) if row else None


async def create_password_reset_token(user_id: str, token_hash: str, expires_at: datetime) -> None:
    """Insert a password-reset token record."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
               VALUES ($1, $2, $3)""",
            user_id,
            token_hash,
            expires_at,
        )


async def get_password_reset_token(token_hash: str) -> Optional[Dict[str, Any]]:
    """Return the password-reset token record matching the hash, or None."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id, user_id, token_hash, expires_at, used_at, created_at
               FROM password_reset_tokens WHERE token_hash = $1""",
            token_hash,
        )
    return _serialize_row(row) if row else None


async def reset_password_with_token(token_hash: str, user_id: str, new_password_hash: str) -> None:
    """Update password and invalidate the reset token in a single transaction.

    Wrapping both writes in one transaction prevents a crash between the two
    statements from leaving the token reusable after the password was already changed.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                new_password_hash,
                user_id,
            )
            await conn.execute(
                "UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1",
                token_hash,
            )


# ============================================================
# User Settings CRUD
# ============================================================

async def get_user_settings(user_id: str) -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM user_settings WHERE user_id = $1",
            user_id
        )
    return _serialize_row(row) if row else None


async def upsert_user_settings(user_id: str, settings_data) -> Dict[str, Any]:
    update_data = settings_data.model_dump(exclude_unset=True)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO user_settings (user_id, display_name, currency, monthly_budget)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id) DO UPDATE SET
                   display_name = COALESCE($2, user_settings.display_name),
                   currency = COALESCE($3, user_settings.currency),
                   monthly_budget = COALESCE($4, user_settings.monthly_budget),
                   updated_at = NOW()
               RETURNING *""",
            user_id,
            update_data.get("display_name"),
            update_data.get("currency"),
            update_data.get("monthly_budget"),
        )
    return _serialize_row(row)


# ============================================================
# Household CRUD
# ============================================================

async def create_household(user_id: str, name: str) -> Dict[str, Any]:
    """Create a new household and add the creator as owner in a single transaction."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """INSERT INTO households (name, created_by)
                   VALUES ($1, $2)
                   RETURNING *""",
                name,
                user_id,
            )
            await conn.execute(
                """INSERT INTO household_members (household_id, user_id, role)
                   VALUES ($1, $2, 'owner')""",
                row["id"],
                user_id,
            )
    return _serialize_row(row)


async def get_household_by_invite_code(invite_code: str) -> Optional[Dict[str, Any]]:
    """Return the household matching the invite code (case-insensitive)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM households WHERE UPPER(invite_code) = UPPER($1)",
            invite_code,
        )
    return _serialize_row(row) if row else None


async def get_household_by_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Return the household the user belongs to, or None."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT h.* FROM households h
               JOIN household_members m ON m.household_id = h.id
               WHERE m.user_id = $1""",
            user_id,
        )
    return _serialize_row(row) if row else None


async def get_member_role(user_id: str, household_id: str) -> Optional[str]:
    """Return the user's role in a household, or None if not a member."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT role FROM household_members WHERE user_id = $1 AND household_id = $2",
            user_id,
            household_id,
        )
    return row["role"] if row else None


async def join_household(user_id: str, household_id: str) -> Dict[str, Any]:
    """Add user to a household as member. Raises ValueError if already a member."""
    existing = await get_household_by_user(user_id)
    if existing is not None:
        raise ValueError("User is already in a household")

    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """INSERT INTO household_members (household_id, user_id, role)
                   VALUES ($1, $2, 'member')
                   RETURNING *""",
                household_id,
                user_id,
            )
        except asyncpg.UniqueViolationError:
            raise ValueError("User is already in a household")
    return _serialize_row(row)
