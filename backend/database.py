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

async def create_user(email: str, password: str, display_name: str) -> Dict[str, Any]:
    password_hash = hash_password(password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """INSERT INTO users (email, password_hash, display_name)
                   VALUES ($1, $2, $3)
                   RETURNING id, email, display_name, created_at""",
                email.lower().strip(),
                password_hash,
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
# Dashboard
# ============================================================

async def get_dashboard_stats(user_id: str, household_id: str = None) -> Dict[str, Any]:
    if household_id is None:
        return {
            "total_budget": 0.0,
            "total_spent": 0.0,
            "remaining_budget": 0.0,
            "savings_rate": 0.0,
            "category_breakdown": [],
        }

    pool = await get_pool()
    async with pool.acquire() as conn:
        settings_row = await conn.fetchrow(
            "SELECT monthly_budget FROM user_settings WHERE user_id = $1",
            user_id
        )
        total_budget = float(settings_row["monthly_budget"]) if settings_row and settings_row["monthly_budget"] else 0.0

        spent_row = await conn.fetchrow(
            """SELECT COALESCE(SUM(amount), 0) AS total_spent
               FROM transactions
               WHERE household_id = $1
                 AND type = 'expense'
                 AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)""",
            household_id,
        )
        total_spent = float(spent_row["total_spent"]) if spent_row else 0.0

        category_rows = await conn.fetch(
            """SELECT COALESCE(bc.name, 'Uncategorised') AS category_name,
                      SUM(t.amount) AS spent
               FROM transactions t
               LEFT JOIN budget_categories bc ON bc.id = t.category_id
               WHERE t.household_id = $1
                 AND t.type = 'expense'
                 AND date_trunc('month', t.date) = date_trunc('month', CURRENT_DATE)
               GROUP BY bc.name
               ORDER BY spent DESC""",
            household_id,
        )

    remaining_budget = max(0.0, total_budget - total_spent)
    savings_rate = (
        max(0.0, (total_budget - total_spent) / total_budget * 100)
        if total_budget > 0
        else 0.0
    )

    return {
        "total_budget": total_budget,
        "total_spent": total_spent,
        "remaining_budget": remaining_budget,
        "savings_rate": savings_rate,
        "category_breakdown": [
            {"category_name": r["category_name"], "spent": float(r["spent"])}
            for r in category_rows
        ],
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


# ============================================================
# Category CRUD
# ============================================================

async def get_categories(household_id: str) -> list:
    """Return all categories for a household plus default (global) categories."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM budget_categories
               WHERE household_id = $1 OR household_id IS NULL
               ORDER BY is_default DESC, name ASC""",
            household_id,
        )
    return [_serialize_row(r) for r in rows]


async def create_category(household_id: str, name: str, icon=None, color=None) -> Dict[str, Any]:
    """Insert a new budget category and return it."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO budget_categories (household_id, name, icon, color)
               VALUES ($1, $2, $3, $4)
               RETURNING *""",
            household_id,
            name,
            icon,
            color,
        )
    return _serialize_row(row)


# ============================================================
# Transaction CRUD
# ============================================================

_TRANSACTION_SELECT = """
    SELECT t.*,
           bc.name AS category_name
    FROM transactions t
    LEFT JOIN budget_categories bc ON bc.id = t.category_id
"""


async def create_transaction(household_id: str, user_id: str, data) -> Dict[str, Any]:
    """Insert a new transaction and return it with category name joined."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        new_row = await conn.fetchrow(
            """INSERT INTO transactions
                   (household_id, user_id, category_id, amount, type, description, date)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id""",
            household_id,
            user_id,
            data.category_id,
            data.amount,
            data.type,
            data.description,
            data.date,
        )
        row = await conn.fetchrow(
            _TRANSACTION_SELECT + " WHERE t.id = $1",
            new_row["id"],
        )
    return _serialize_row(row)


async def get_transactions(household_id: str, month: str = None) -> list:
    """Return transactions for a household, optionally filtered to a given month (YYYY-MM)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        if month:
            rows = await conn.fetch(
                _TRANSACTION_SELECT + """
                WHERE t.household_id = $1
                  AND date_trunc('month', t.date) = date_trunc('month', ($2 || '-01')::date)
                ORDER BY t.date DESC, t.created_at DESC""",
                household_id,
                month,
            )
        else:
            rows = await conn.fetch(
                _TRANSACTION_SELECT + """
                WHERE t.household_id = $1
                ORDER BY t.date DESC, t.created_at DESC""",
                household_id,
            )
    return [_serialize_row(r) for r in rows]


async def get_transaction(household_id: str, transaction_id: str) -> Optional[Dict[str, Any]]:
    """Return a single transaction with category join, scoped to the household."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            _TRANSACTION_SELECT + " WHERE t.household_id = $1 AND t.id = $2",
            household_id,
            transaction_id,
        )
    return _serialize_row(row) if row else None


_ALLOWED_TRANSACTION_UPDATE_FIELDS = {"amount", "type", "description", "date", "category_id"}


async def update_transaction(household_id: str, transaction_id: str, data) -> Optional[Dict[str, Any]]:
    """Update non-None fields on a transaction and return the updated row."""
    fields = data.model_dump(exclude_unset=True)
    if not fields:
        return await get_transaction(household_id, transaction_id)

    set_clauses = []
    values = []
    idx = 1
    for key, val in fields.items():
        if key not in _ALLOWED_TRANSACTION_UPDATE_FIELDS:
            raise ValueError(f"Invalid field: {key}")
        set_clauses.append(f"{key} = ${idx}")
        values.append(val)
        idx += 1
    set_sql = ", ".join(set_clauses)

    values.extend([household_id, transaction_id])
    pool = await get_pool()
    async with pool.acquire() as conn:
        updated = await conn.fetchrow(
            f"""UPDATE transactions
                SET {set_sql}, updated_at = NOW()
                WHERE household_id = ${idx} AND id = ${idx + 1}
                RETURNING id""",
            *values,
        )
        if not updated:
            return None
        row = await conn.fetchrow(
            _TRANSACTION_SELECT + " WHERE t.id = $1",
            updated["id"],
        )
    return _serialize_row(row) if row else None


async def delete_transaction(household_id: str, transaction_id: str) -> bool:
    """Delete a transaction. Returns True if a row was deleted."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        status = await conn.execute(
            "DELETE FROM transactions WHERE household_id = $1 AND id = $2",
            household_id,
            transaction_id,
        )
    return status == "DELETE 1"
