"""
Tests for the budget_integrity_constraints follow-up migration (static SQL parsing).

Task 20 code-review follow-up — tightens the dual-scope monthly_budgets model:
  * user_id becomes NULLABLE (household budgets are household-owned)
  * strict per-scope ownership CHECK (personal => user_id/no household;
    household => household_id/no user_id)
  * goal_pct columns bounded 0..100
  * month must be first-of-month

All tests inspect the SQL file directly — no database connection required
(matches the pattern in test_task20_intentional_spending_migration.py).
"""
import os
import re
import pytest


MIGRATION_PATH = os.path.normpath(os.path.join(
    os.path.dirname(__file__),  # backend/tests/
    "..",                        # backend/
    "..",                        # project root
    "migrations",
    "migrations",
    "20260706000015_budget_integrity_constraints.sql",
))


def _load_sql() -> str:
    try:
        with open(MIGRATION_PATH, "r") as fh:
            return fh.read()
    except FileNotFoundError:
        return ""


def _normalise(sql: str) -> str:
    """Collapse whitespace and lowercase so multi-line SQL is easy to match."""
    return re.sub(r"\s+", " ", sql).strip().lower()


@pytest.fixture(scope="module")
def sql() -> str:
    return _normalise(_load_sql())


# ============================================================
# File + transaction framing
# ============================================================

def test_migration_file_exists():
    assert _load_sql().strip() != "", (
        f"Migration file not found at {MIGRATION_PATH}"
    )


def test_wrapped_in_transaction(sql):
    # Strip comments, then assert BEGIN precedes the first DDL and COMMIT trails.
    body = re.sub(r"--[^\n]*", "", _load_sql()).lower()
    body = re.sub(r"\s+", " ", body).strip()
    assert body.startswith("begin"), "Migration must open with BEGIN"
    assert body.rstrip().endswith("commit;"), "Migration must end with COMMIT"


# ============================================================
# 1. user_id becomes nullable
# ============================================================

def test_user_id_drops_not_null(sql):
    assert re.search(
        r"alter table monthly_budgets alter column user_id drop not null", sql
    ), "Migration must drop NOT NULL on monthly_budgets.user_id"


# ============================================================
# 2. Strict per-scope ownership CHECK
# ============================================================

def test_drops_old_household_required_constraint(sql):
    assert "drop constraint if exists monthly_budgets_household_required" in sql, (
        "Migration must drop the loose monthly_budgets_household_required check"
    )


def test_adds_scope_ownership_constraint(sql):
    assert "monthly_budgets_scope_ownership" in sql, (
        "Migration must add the monthly_budgets_scope_ownership check"
    )


def test_personal_scope_requires_user_and_no_household(sql):
    # personal => user_id IS NOT NULL AND household_id IS NULL
    assert re.search(
        r"scope = 'personal'\s+and\s+user_id is not null\s+and\s+household_id is null",
        sql,
    ), "Personal budgets must require user_id set and household_id NULL"


def test_household_scope_requires_household_and_no_user(sql):
    # household => household_id IS NOT NULL AND user_id IS NULL
    assert re.search(
        r"scope = 'household'\s+and\s+household_id is not null\s+and\s+user_id is null",
        sql,
    ), "Household budgets must require household_id set and user_id NULL"


# ============================================================
# 3. Goal percentage bounds (0..100), no sum constraint
# ============================================================

def test_goal_pct_range_constraint(sql):
    assert "monthly_budgets_goal_pct_range" in sql
    for col in ("fundamentals_goal_pct", "future_you_goal_pct", "fun_goal_pct"):
        assert re.search(rf"{col} between 0 and 100", sql), (
            f"{col} must be bounded 0..100"
        )


def test_no_sum_to_100_constraint(sql):
    # The tool intentionally allows over/under-allocation vs targets, so the
    # three percentages must NOT be forced to sum to 100.
    joined = re.sub(r"\s+", "", sql)
    assert "=100" not in joined.replace("between0and100", ""), (
        "Goal percentages must NOT be constrained to sum to 100"
    )


# ============================================================
# 4. month first-of-month
# ============================================================

def test_month_first_of_month_constraint(sql):
    assert "monthly_budgets_month_first_of_month" in sql
    assert re.search(
        r"month = date_trunc\('month', month\)::date", sql
    ), "month must be constrained to the first of its calendar month"
