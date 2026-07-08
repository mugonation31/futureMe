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


# ============================================================
# Monthly budget bootstrap (Intentional Spending Tracker)
# ============================================================

# Default seed line items per bucket, in display order. Seeded ONCE on the first
# access to a (scope, owner, month) budget so the screen is never blank. All seed
# amounts are 0; the user fills them in.
DEFAULT_LINE_ITEMS: Dict[str, list] = {
    "fundamentals": [
        "Rent/Mortgage", "Groceries", "Insurance", "Car Payment",
        "Gas/Transportation", "Minimum Debt Payments", "Phone", "Internet",
        "Electricity", "Miscellaneous",
    ],
    "future_you": [
        "Emergency Fund", "Investment accounts", "Workplace retirement",
        "Extra debt payments", "Downpayment",
    ],
    "fun": [
        "Clothing", "Eating out", "Travel", "Personal Care", "Subscriptions",
        "Donations", "Coffees", "Miscellaneous",
    ],
}

# Canonical bucket order for assembling the response.
_BUCKET_ORDER = ("fundamentals", "future_you", "fun")


def _first_of_month(value):
    """Normalise a date to the first of its calendar month (DB CHECK requires it)."""
    return value.replace(day=1)


async def _fetch_budget_row(conn, scope: str, month, user_id, household_id):
    """Fetch the single budget row for a (scope, owner, month), or None.

    The WHERE predicate is the ONLY tenant isolation (deny-all RLS + BYPASSRLS
    role), so it is centralised here and branches strictly on scope.
    """
    if scope == "household":
        return await conn.fetchrow(
            """SELECT * FROM monthly_budgets
               WHERE scope = 'household' AND household_id = $1 AND month = $2""",
            household_id, month,
        )
    return await conn.fetchrow(
        """SELECT * FROM monthly_budgets
           WHERE scope = 'personal' AND user_id = $1 AND month = $2""",
        user_id, month,
    )


async def _seed_line_items(conn, budget_id: str) -> None:
    """Insert the default line items for a freshly-created budget (all amount 0)."""
    rows = []
    for bucket in _BUCKET_ORDER:
        for position, label in enumerate(DEFAULT_LINE_ITEMS[bucket]):
            rows.append((budget_id, bucket, label, 0, position))
    await conn.executemany(
        """INSERT INTO budget_line_items (budget_id, bucket, label, amount, position)
           VALUES ($1, $2, $3, $4, $5)""",
        rows,
    )


async def ensure_budget_for_month(
    scope: str, month, *, user_id=None, household_id=None, currency: str = "$",
) -> Dict[str, Any]:
    """Return the (scope, owner, month) budget, creating + seeding it on first access.

    Race-safe: INSERT ... ON CONFLICT DO NOTHING against the relevant partial
    unique index. When the insert returns a row it is brand new, so we seed the
    default line items; when it returns nothing the budget already existed
    (concurrent create or prior access) and we simply re-fetch it — never
    re-seeding. Create + seed happen in ONE transaction.
    """
    month = _first_of_month(month)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            if scope == "household":
                created = await conn.fetchrow(
                    """INSERT INTO monthly_budgets (scope, user_id, household_id, month, currency)
                       VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (household_id, month) WHERE scope = 'household'
                       DO NOTHING
                       RETURNING *""",
                    "household", None, household_id, month, currency,
                )
            else:
                created = await conn.fetchrow(
                    """INSERT INTO monthly_budgets (scope, user_id, household_id, month, currency)
                       VALUES ($1, $2, $3, $4, $5)
                       ON CONFLICT (user_id, month) WHERE scope = 'personal'
                       DO NOTHING
                       RETURNING *""",
                    "personal", user_id, None, month, currency,
                )
            if created is not None:
                await _seed_line_items(conn, created["id"])
                row = created
            else:
                row = await _fetch_budget_row(conn, scope, month, user_id, household_id)
    return _serialize_row(row)


# future_you is the only bucket where UNDER the goal is the "bad" (RED) case —
# under-saving. For fundamentals and fun, OVER the goal (overspending) is RED.
_UNDER_IS_OVER_BUCKETS = frozenset({"future_you"})


def _bucket_dashboard(bucket: str, goal_pct: float, bucket_total: float,
                      total_income: float) -> Dict[str, Any]:
    """Compute one bucket's colour-flagged dashboard from live totals.

    ``ideal_amount`` is the goal share of income; ``actual_pct`` is a 0-100
    PERCENTAGE (same scale as ``goal_pct``), guarding against a zero income
    (returns 0 rather than dividing by zero). All money + pct values are rounded
    to 2 decimal places so consumers get clean numbers. ``is_over_flag`` is
    ASYMMETRIC: fundamentals/fun flag RED when spending EXCEEDS the goal, while
    future_you flags RED when it falls UNDER the goal (under-saving). At exact
    equality (bucket_total == ideal_amount) the flag is False for all three,
    which the strict > / < comparisons give for free.
    """
    ideal_amount = goal_pct / 100 * total_income
    actual_pct = (bucket_total / total_income * 100) if total_income > 0 else 0.0
    if bucket in _UNDER_IS_OVER_BUCKETS:
        is_over_flag = bucket_total < ideal_amount
    else:
        is_over_flag = bucket_total > ideal_amount
    return {
        "bucket": bucket,
        "goal_pct": float(goal_pct),
        "ideal_amount": round(ideal_amount, 2),
        "actual_pct": round(actual_pct, 2),
        "bucket_total": round(bucket_total, 2),
        "available_to_spend": round(ideal_amount - bucket_total, 2),
        "is_over_flag": is_over_flag,
    }


def _allocation_status(allocated: float, total_income: float) -> Dict[str, Any]:
    """Compute the money-left-to-allocate state + amount from live totals.

    Returns ONLY the machine-readable ``state`` and a 2-dp-rounded ``amount``.
    The user-facing copy (currency-prefixed, localised) is built by the frontend
    (Task 29) from state + amount + the budget's currency — the backend never
    bakes a formatted display string.
    """
    if allocated < total_income:
        return {"state": "left", "amount": round(total_income - allocated, 2)}
    if allocated > total_income:
        return {"state": "over", "amount": round(allocated - total_income, 2)}
    return {"state": "balanced", "amount": 0.0}


def _assemble_budget(budget_row, stream_rows, item_rows) -> Dict[str, Any]:
    """Build the BudgetResponse-shaped dict from raw rows, computing the dashboard.

    Every field is recomputed from the live income streams + line items on each
    call (nothing is stored), so the payload always reflects the current data.
    """
    b = _serialize_row(budget_row)
    goals = {
        "fundamentals_goal_pct": float(b["fundamentals_goal_pct"]),
        "future_you_goal_pct": float(b["future_you_goal_pct"]),
        "fun_goal_pct": float(b["fun_goal_pct"]),
    }
    goal_for = {
        "fundamentals": goals["fundamentals_goal_pct"],
        "future_you": goals["future_you_goal_pct"],
        "fun": goals["fun_goal_pct"],
    }
    items_by_bucket: Dict[str, list] = {k: [] for k in _BUCKET_ORDER}
    for item in item_rows:
        d = _serialize_row(item)
        items_by_bucket.setdefault(d["bucket"], []).append(d)

    income_streams = [_serialize_row(s) for s in stream_rows]
    total_income = sum(float(s["amount"]) for s in income_streams)

    buckets = {}
    allocated = 0.0
    for bucket in _BUCKET_ORDER:
        items = items_by_bucket.get(bucket, [])
        bucket_total = sum(float(i["amount"]) for i in items)
        allocated += bucket_total
        buckets[bucket] = {
            "line_items": items,
            "dashboard": _bucket_dashboard(
                bucket, goal_for[bucket], bucket_total, total_income),
        }

    return {
        "id": b["id"],
        "scope": b["scope"],
        "user_id": b.get("user_id"),
        "household_id": b.get("household_id"),
        "month": b["month"],
        "currency": b["currency"],
        "goals": goals,
        "total_income": total_income,
        "income_streams": income_streams,
        "buckets": buckets,
        "allocation_status": _allocation_status(allocated, total_income),
    }


# ------------------------------------------------------------
# Income streams — ownership-gated CRUD (Task 23)
# ------------------------------------------------------------

def _owned_budget_predicate(alias: str, budget_param: str, caller_param: str) -> str:
    """Return the SQL predicate that is TRUE only when the budget row aliased
    `alias` is owned by the caller (`caller_param` = the caller's user_id).

    Ownership is the ONLY tenant-isolation control (deny-all RLS + BYPASSRLS
    role), so this predicate MUST be evaluated in the SAME query as any read or
    write — never split across a fetch-then-check. Centralised here and reused by
    every income-stream mutation so the WHERE clause is never hand-rolled per
    function. Branches on scope exactly like ``_fetch_budget_row``:
      * personal  → owned when scope='personal' AND user_id = caller
      * household → owned when scope='household' AND household_id is one of the
                    caller's memberships (derived via the household_members
                    subquery, so only the caller's user_id is needed).
    """
    return (
        f"{alias}.id = {budget_param} AND ("
        f"({alias}.scope = 'personal' AND {alias}.user_id = {caller_param}) OR "
        f"({alias}.scope = 'household' AND {alias}.household_id IN "
        f"(SELECT household_id FROM household_members WHERE user_id = {caller_param}))"
        f")"
    )


async def create_income_stream(budget_id, caller_user_id, label, amount):
    """Insert an income stream under `budget_id`, gated on caller ownership.

    The INSERT ... SELECT ... WHERE <ownership predicate> means a budget the
    caller does not own yields no row → return None so the route raises 404. The
    position is computed (MAX+1) inside the same statement.
    """
    predicate = _owned_budget_predicate("b", "$1", "$2")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""INSERT INTO income_streams (budget_id, label, amount, position)
                SELECT b.id, $3, $4,
                       COALESCE(
                           (SELECT MAX(position) + 1 FROM income_streams
                            WHERE budget_id = b.id), 0)
                FROM monthly_budgets b
                WHERE {predicate}
                RETURNING *""",
            budget_id, caller_user_id, label, amount,
        )
    return _serialize_row(row) if row is not None else None


async def update_income_stream(budget_id, income_id, caller_user_id, *,
                               label=None, amount=None):
    """Update an income stream's label and/or amount, gated on caller ownership.

    COALESCE keeps a column unchanged when its param is NULL (partial update).
    A budget the caller does not own → no row → return None so the route 404s.
    """
    predicate = _owned_budget_predicate("b", "$1", "$3")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""UPDATE income_streams s
                SET label = COALESCE($4, s.label),
                    amount = COALESCE($5, s.amount),
                    updated_at = NOW()
                FROM monthly_budgets b
                WHERE s.id = $2 AND s.budget_id = b.id AND {predicate}
                RETURNING s.*""",
            budget_id, income_id, caller_user_id, label, amount,
        )
    return _serialize_row(row) if row is not None else None


async def delete_income_stream(budget_id, income_id, caller_user_id):
    """Delete an income stream, gated on caller ownership.

    Returns the deleted id, or None when the budget is not owned (no row
    deleted) so the route raises 404.
    """
    predicate = _owned_budget_predicate("b", "$1", "$3")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""DELETE FROM income_streams s
                USING monthly_budgets b
                WHERE s.id = $2 AND s.budget_id = b.id AND {predicate}
                RETURNING s.id""",
            budget_id, income_id, caller_user_id,
        )
    return str(row["id"]) if row is not None else None


# ------------------------------------------------------------
# Budget line items + goals/currency — ownership-gated CRUD (Task 24)
# ------------------------------------------------------------

async def create_line_item(budget_id, caller_user_id, bucket, label, amount):
    """Insert a bucket line item under `budget_id`, gated on caller ownership.

    Mirrors ``create_income_stream``: the INSERT ... SELECT ... WHERE <ownership
    predicate> means a budget the caller does not own yields no row → return None
    so the route raises 404. The position is computed (MAX+1) inside the same
    statement, scoped per (budget_id, bucket) so each bucket has its own ordering.
    """
    predicate = _owned_budget_predicate("b", "$1", "$2")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""INSERT INTO budget_line_items (budget_id, bucket, label, amount, position)
                SELECT b.id, $3, $4, $5,
                       COALESCE(
                           (SELECT MAX(position) + 1 FROM budget_line_items
                            WHERE budget_id = b.id AND bucket = $3), 0)
                FROM monthly_budgets b
                WHERE {predicate}
                RETURNING *""",
            budget_id, caller_user_id, bucket, label, amount,
        )
    return _serialize_row(row) if row is not None else None


async def update_line_item(budget_id, item_id, caller_user_id, *,
                           bucket=None, label=None, amount=None):
    """Update a line item's bucket/label/amount, gated on caller ownership.

    COALESCE keeps a column unchanged when its param is NULL (partial update); a
    non-NULL ``bucket`` MOVES the item to another bucket. On a move the position
    is re-tailed to ``MAX(position)+1`` of the TARGET bucket (so it doesn't keep
    its stale source-bucket position and collide/leave a gap); a no-move (bucket
    param NULL) leaves the position untouched. This is done in the SAME
    ownership-gated statement — the item's own row still carries its source bucket
    at recompute time, so the correlated MAX over the target bucket excludes it
    and yields a correct tail-append. A budget the caller does not own → no row →
    return None so the route 404s.
    """
    predicate = _owned_budget_predicate("b", "$1", "$3")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""UPDATE budget_line_items s
                SET bucket = COALESCE($4, s.bucket),
                    label = COALESCE($5, s.label),
                    amount = COALESCE($6, s.amount),
                    position = CASE
                        WHEN $4 IS NOT NULL THEN COALESCE(
                            (SELECT MAX(li.position) + 1 FROM budget_line_items li
                             WHERE li.budget_id = s.budget_id AND li.bucket = $4), 0)
                        ELSE s.position
                    END,
                    updated_at = NOW()
                FROM monthly_budgets b
                WHERE s.id = $2 AND s.budget_id = b.id AND {predicate}
                RETURNING s.*""",
            budget_id, item_id, caller_user_id, bucket, label, amount,
        )
    return _serialize_row(row) if row is not None else None


async def delete_line_item(budget_id, item_id, caller_user_id):
    """Delete a line item, gated on caller ownership.

    Returns the deleted id, or None when the budget is not owned (no row deleted)
    so the route raises 404.
    """
    predicate = _owned_budget_predicate("b", "$1", "$3")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"""DELETE FROM budget_line_items s
                USING monthly_budgets b
                WHERE s.id = $2 AND s.budget_id = b.id AND {predicate}
                RETURNING s.id""",
            budget_id, item_id, caller_user_id,
        )
    return str(row["id"]) if row is not None else None


async def update_budget_goals(budget_id, caller_user_id, *,
                              fundamentals_goal_pct=None, future_you_goal_pct=None,
                              fun_goal_pct=None, currency=None):
    """Update a budget's goal percentages and/or currency, gated on caller ownership.

    The ownership predicate applies directly to ``monthly_budgets`` (alias ``b``)
    with a COALESCE partial-update, matching ``update_income_stream``. A budget
    the caller does not own → no row → return None so the route 404s. On success
    the fully-assembled BudgetResponse-shaped dict is returned (same shape as
    ``get_budget``) so the route can echo the refreshed budget.
    """
    predicate = _owned_budget_predicate("b", "$1", "$2")
    pool = await get_pool()
    async with pool.acquire() as conn:
        budget = await conn.fetchrow(
            f"""UPDATE monthly_budgets b
                SET fundamentals_goal_pct = COALESCE($3, b.fundamentals_goal_pct),
                    future_you_goal_pct = COALESCE($4, b.future_you_goal_pct),
                    fun_goal_pct = COALESCE($5, b.fun_goal_pct),
                    currency = COALESCE($6, b.currency),
                    updated_at = NOW()
                WHERE {predicate}
                RETURNING b.*""",
            budget_id, caller_user_id, fundamentals_goal_pct,
            future_you_goal_pct, fun_goal_pct, currency,
        )
        if budget is None:
            return None
        streams = await conn.fetch(
            "SELECT * FROM income_streams WHERE budget_id = $1 ORDER BY position, created_at",
            budget["id"],
        )
        items = await conn.fetch(
            "SELECT * FROM budget_line_items WHERE budget_id = $1 ORDER BY position, created_at",
            budget["id"],
        )
    return _assemble_budget(budget, streams, items)


async def get_budget(scope: str, month, *, user_id=None, household_id=None):
    """Return the fully-assembled BudgetResponse dict for a (scope, owner, month), or None."""
    month = _first_of_month(month)
    pool = await get_pool()
    async with pool.acquire() as conn:
        budget = await _fetch_budget_row(conn, scope, month, user_id, household_id)
        if budget is None:
            return None
        streams = await conn.fetch(
            "SELECT * FROM income_streams WHERE budget_id = $1 ORDER BY position, created_at",
            budget["id"],
        )
        items = await conn.fetch(
            "SELECT * FROM budget_line_items WHERE budget_id = $1 ORDER BY position, created_at",
            budget["id"],
        )
    return _assemble_budget(budget, streams, items)
