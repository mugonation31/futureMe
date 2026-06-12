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


# Authorization: only these fields may appear in update payloads.
# Any field outside these sets indicates a malformed or tampered request.
_ALLOWED_ACCOUNT_UPDATE_FIELDS = frozenset({"name", "type", "balance", "currency"})
_ALLOWED_INCOME_UPDATE_FIELDS = frozenset({"source", "amount", "frequency"})
_ALLOWED_EXPENSE_UPDATE_FIELDS = frozenset({"category", "description", "amount", "date", "is_recurring"})
_ALLOWED_DEBT_UPDATE_FIELDS = frozenset({"name", "balance", "interest_rate", "minimum_payment", "target_payoff_date"})
_ALLOWED_SAVINGS_GOAL_UPDATE_FIELDS = frozenset({"name", "target_amount", "current_amount", "deadline"})


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


# ============================================================
# Accounts CRUD
# ============================================================

async def get_accounts(household_id: str) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM accounts WHERE household_id = $1 ORDER BY name",
            household_id,
        )
    return [_serialize_row(r) for r in rows]


async def create_account(household_id: str, data) -> Dict[str, Any]:
    d = data.model_dump()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO accounts (household_id, name, type, balance, currency)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *""",
            household_id,
            d["name"],
            d["type"],
            d["balance"],
            d["currency"],
        )
    return _serialize_row(row)


async def update_account(account_id: str, household_id: str, data) -> Optional[Dict[str, Any]]:
    d = data.model_dump(exclude_unset=True)
    for key in d:
        if key not in _ALLOWED_ACCOUNT_UPDATE_FIELDS:
            raise ValueError(f"Invalid field: {key}")
    if not d:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM accounts WHERE id = $1 AND household_id = $2",
                account_id,
                household_id,
            )
        return _serialize_row(row) if row else None

    set_clauses = ", ".join(f"{k} = ${i + 3}" for i, k in enumerate(d.keys()))
    values = list(d.values())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE accounts SET {set_clauses}, updated_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING *",
            account_id,
            household_id,
            *values,
        )
    return _serialize_row(row) if row else None


async def delete_account(account_id: str, household_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM accounts WHERE id = $1 AND household_id = $2",
            account_id,
            household_id,
        )
    return result != "DELETE 0"


# ============================================================
# Income CRUD
# ============================================================

async def get_income_entries(household_id: str) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM income_entries WHERE household_id = $1 ORDER BY source",
            household_id,
        )
    return [_serialize_row(r) for r in rows]


async def create_income_entry(household_id: str, user_id: str, data) -> Dict[str, Any]:
    d = data.model_dump()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO income_entries (household_id, user_id, source, amount, frequency)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *""",
            household_id,
            user_id,
            d["source"],
            d["amount"],
            d["frequency"],
        )
    return _serialize_row(row)


async def update_income_entry(entry_id: str, household_id: str, data) -> Optional[Dict[str, Any]]:
    d = data.model_dump(exclude_unset=True)
    for key in d:
        if key not in _ALLOWED_INCOME_UPDATE_FIELDS:
            raise ValueError(f"Invalid field: {key}")
    if not d:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM income_entries WHERE id = $1 AND household_id = $2",
                entry_id,
                household_id,
            )
        return _serialize_row(row) if row else None

    set_clauses = ", ".join(f"{k} = ${i + 3}" for i, k in enumerate(d.keys()))
    values = list(d.values())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE income_entries SET {set_clauses}, updated_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING *",
            entry_id,
            household_id,
            *values,
        )
    return _serialize_row(row) if row else None


async def delete_income_entry(entry_id: str, household_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM income_entries WHERE id = $1 AND household_id = $2",
            entry_id,
            household_id,
        )
    return result != "DELETE 0"


# ============================================================
# Expenses CRUD
# ============================================================

async def get_expenses(household_id: str) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM expenses WHERE household_id = $1 ORDER BY date DESC",
            household_id,
        )
    return [_serialize_row(r) for r in rows]


async def create_expense(household_id: str, user_id: str, data) -> Dict[str, Any]:
    d = data.model_dump()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO expenses (household_id, user_id, category, description, amount, date, is_recurring)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *""",
            household_id,
            user_id,
            d.get("category"),
            d.get("description"),
            d["amount"],
            d["date"],
            d.get("is_recurring", False),
        )
    return _serialize_row(row)


async def update_expense(expense_id: str, household_id: str, data) -> Optional[Dict[str, Any]]:
    d = data.model_dump(exclude_unset=True)
    for key in d:
        if key not in _ALLOWED_EXPENSE_UPDATE_FIELDS:
            raise ValueError(f"Invalid field: {key}")
    if not d:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM expenses WHERE id = $1 AND household_id = $2",
                expense_id,
                household_id,
            )
        return _serialize_row(row) if row else None

    set_clauses = ", ".join(f"{k} = ${i + 3}" for i, k in enumerate(d.keys()))
    values = list(d.values())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE expenses SET {set_clauses}, updated_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING *",
            expense_id,
            household_id,
            *values,
        )
    return _serialize_row(row) if row else None


async def delete_expense(expense_id: str, household_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM expenses WHERE id = $1 AND household_id = $2",
            expense_id,
            household_id,
        )
    return result != "DELETE 0"


# ============================================================
# Debts CRUD
# ============================================================

async def get_debts(household_id: str) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM debts WHERE household_id = $1 ORDER BY name",
            household_id,
        )
    return [_serialize_row(r) for r in rows]


async def create_debt(household_id: str, user_id: str, data) -> Dict[str, Any]:
    d = data.model_dump()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO debts (household_id, user_id, name, balance, interest_rate, minimum_payment, target_payoff_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *""",
            household_id,
            user_id,
            d["name"],
            d["balance"],
            d.get("interest_rate", 0.0),
            d.get("minimum_payment", 0.0),
            d.get("target_payoff_date"),
        )
    return _serialize_row(row)


async def update_debt(debt_id: str, household_id: str, data) -> Optional[Dict[str, Any]]:
    d = data.model_dump(exclude_unset=True)
    for key in d:
        if key not in _ALLOWED_DEBT_UPDATE_FIELDS:
            raise ValueError(f"Invalid field: {key}")
    if not d:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM debts WHERE id = $1 AND household_id = $2",
                debt_id,
                household_id,
            )
        return _serialize_row(row) if row else None

    set_clauses = ", ".join(f"{k} = ${i + 3}" for i, k in enumerate(d.keys()))
    values = list(d.values())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE debts SET {set_clauses}, updated_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING *",
            debt_id,
            household_id,
            *values,
        )
    return _serialize_row(row) if row else None


async def delete_debt(debt_id: str, household_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM debts WHERE id = $1 AND household_id = $2",
            debt_id,
            household_id,
        )
    return result != "DELETE 0"


# ============================================================
# Savings Goals CRUD
# ============================================================

async def get_savings_goals(household_id: str) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM savings_goals WHERE household_id = $1 ORDER BY name",
            household_id,
        )
    return [_serialize_row(r) for r in rows]


async def create_savings_goal(household_id: str, data) -> Dict[str, Any]:
    d = data.model_dump()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO savings_goals (household_id, name, target_amount, current_amount, deadline)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *""",
            household_id,
            d["name"],
            d["target_amount"],
            d.get("current_amount", 0.0),
            d.get("deadline"),
        )
    return _serialize_row(row)


async def update_savings_goal(goal_id: str, household_id: str, data) -> Optional[Dict[str, Any]]:
    d = data.model_dump(exclude_unset=True)
    for key in d:
        if key not in _ALLOWED_SAVINGS_GOAL_UPDATE_FIELDS:
            raise ValueError(f"Invalid field: {key}")
    if not d:
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM savings_goals WHERE id = $1 AND household_id = $2",
                goal_id,
                household_id,
            )
        return _serialize_row(row) if row else None

    set_clauses = ", ".join(f"{k} = ${i + 3}" for i, k in enumerate(d.keys()))
    values = list(d.values())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE savings_goals SET {set_clauses}, updated_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING *",
            goal_id,
            household_id,
            *values,
        )
    return _serialize_row(row) if row else None


async def delete_savings_goal(goal_id: str, household_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM savings_goals WHERE id = $1 AND household_id = $2",
            goal_id,
            household_id,
        )
    return result != "DELETE 0"


# ============================================================
# Dashboard stats
# ============================================================

async def get_dashboard_stats(household_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Monthly-normalised income
        income_row = await conn.fetchrow("""
            SELECT COALESCE(SUM(
                CASE frequency
                    WHEN 'monthly' THEN amount
                    WHEN 'weekly' THEN amount * 52 / 12
                    WHEN 'annual' THEN amount / 12
                END
            ), 0) as total_income
            FROM income_entries WHERE household_id = $1
        """, household_id)

        # This month's expenses
        expense_row = await conn.fetchrow("""
            SELECT COALESCE(SUM(amount), 0) as total_expenses
            FROM expenses
            WHERE household_id = $1
            AND date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
        """, household_id)

        # Debt summary
        debt_row = await conn.fetchrow("""
            SELECT
                COALESCE(SUM(balance), 0) as total_owed,
                COALESCE(SUM(minimum_payment), 0) as total_minimum_payments,
                COUNT(*) as debt_count
            FROM debts WHERE household_id = $1
        """, household_id)

        # Emergency fund (savings_goal named 'Emergency Fund')
        ef_row = await conn.fetchrow("""
            SELECT current_amount, target_amount
            FROM savings_goals
            WHERE household_id = $1 AND LOWER(name) = 'emergency fund'
            LIMIT 1
        """, household_id)

        # All savings goals
        goals = await conn.fetch("""
            SELECT name, target_amount, current_amount
            FROM savings_goals WHERE household_id = $1 ORDER BY name
        """, household_id)

        total_income = float(income_row["total_income"])
        total_expenses = float(expense_row["total_expenses"])

        ef_current = float(ef_row["current_amount"]) if ef_row else 0.0
        ef_target = float(ef_row["target_amount"]) if ef_row else 0.0

        return {
            "total_income": total_income,
            "total_expenses": total_expenses,
            "net_position": total_income - total_expenses,
            "emergency_fund_status": {
                "current_amount": ef_current,
                "target_amount": ef_target,
                "months_covered": round(ef_current / total_expenses, 1) if total_expenses > 0 else None
            },
            "debt_summary": {
                "total_owed": float(debt_row["total_owed"]),
                "total_minimum_payments": float(debt_row["total_minimum_payments"]),
                "debt_count": int(debt_row["debt_count"])
            },
            "savings_progress": [
                {
                    "goal_name": r["name"],
                    "target_amount": float(r["target_amount"]),
                    "current_amount": float(r["current_amount"]),
                    "percent": round(float(r["current_amount"]) / float(r["target_amount"]) * 100, 1) if float(r["target_amount"]) > 0 else 0.0
                }
                for r in goals
            ]
        }


