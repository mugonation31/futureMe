"""
Database operations using async PostgreSQL
"""
import asyncpg
import ssl
from uuid import UUID
from typing import Optional, Dict, Any
from config import settings


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
# User Settings CRUD
# ============================================================

async def get_user_settings(user_id: str) -> Optional[Dict[str, Any]]:
    conn = await get_pool()
    row = await conn.fetchrow(
        "SELECT * FROM user_settings WHERE user_id = $1",
        user_id
    )
    return _serialize_row(row) if row else None


async def upsert_user_settings(user_id: str, settings_data) -> Dict[str, Any]:
    update_data = settings_data.model_dump(exclude_unset=True)
    conn = await get_pool()
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
# Dashboard
# ============================================================

async def get_dashboard_stats(user_id: str) -> Dict[str, Any]:
    conn = await get_pool()
    row = await conn.fetchrow(
        "SELECT monthly_budget FROM user_settings WHERE user_id = $1",
        user_id
    )
    monthly_budget = float(row["monthly_budget"]) if row and row["monthly_budget"] else 0.0

    return {
        "total_budget": monthly_budget,
        "total_spent": 0.0,
        "remaining_budget": monthly_budget,
        "savings_rate": 0.0,
    }


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
