"""
Tests for the financial_conformance migration file (static SQL parsing).

All tests inspect the SQL file directly — no database connection required.
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
    "20260616000013_financial_conformance.sql",
))


# ============================================================
# Helpers
# ============================================================

def _load_sql() -> str:
    """Return the migration file contents, or empty string if missing."""
    try:
        with open(MIGRATION_PATH, "r") as fh:
            return fh.read()
    except FileNotFoundError:
        return ""


def _normalise(sql: str) -> str:
    """Collapse whitespace so multi-line SQL is easier to match."""
    return re.sub(r"\s+", " ", sql).strip().lower()


@pytest.fixture(scope="module")
def sql() -> str:
    """Normalised SQL from the migration file, loaded once per module."""
    return _normalise(_load_sql())


# ============================================================
# Test 1 — file exists
# ============================================================

def test_migration_file_exists():
    """should exist at the expected path"""
    assert os.path.isfile(MIGRATION_PATH), (
        f"Migration file not found: {MIGRATION_PATH}"
    )


# ============================================================
# Test 2 — debt_payments.id
# ============================================================

def test_debt_payments_id_column(sql):
    """should CREATE TABLE `debt_payments` with `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`"""
    assert re.search(
        r"create table\s+(if not exists\s+)?debt_payments\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] debt_payments' in migration SQL"

    assert re.search(
        r"id\s+uuid\s+primary key\s+default\s+gen_random_uuid\s*\(\s*\)",
        sql,
    ), "Expected debt_payments.id UUID PRIMARY KEY DEFAULT gen_random_uuid()"


# ============================================================
# Test 3 — debt_payments.debt_id FK
# ============================================================

def test_debt_payments_debt_id_column(sql):
    """should CREATE TABLE `debt_payments` with `debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE`"""
    assert re.search(
        r"debt_id\s+uuid\s+not null\s+references\s+debts\s*\(\s*id\s*\)\s+on delete cascade",
        sql,
    ), "Expected debt_payments.debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE"


# ============================================================
# Test 4 — debt_payments.amount
# ============================================================

def test_debt_payments_amount_column(sql):
    """should CREATE TABLE `debt_payments` with `amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)`"""
    assert re.search(
        r"amount\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*amount\s*>\s*0\s*\)",
        sql,
    ), "Expected debt_payments.amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)"


# ============================================================
# Test 5 — debt_payments.paid_for_month
# ============================================================

def test_debt_payments_paid_for_month_column(sql):
    """should CREATE TABLE `debt_payments` with `paid_for_month DATE NOT NULL`"""
    assert re.search(
        r"paid_for_month\s+date\s+not null",
        sql,
    ), "Expected debt_payments.paid_for_month DATE NOT NULL"


# ============================================================
# Test 6 — debt_payments.confirmed_at
# ============================================================

def test_debt_payments_confirmed_at_column(sql):
    """should CREATE TABLE `debt_payments` with `confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`"""
    assert re.search(
        r"confirmed_at\s+timestamptz\s+not null\s+default\s+now\s*\(\s*\)",
        sql,
    ), "Expected debt_payments.confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"


# ============================================================
# Test 7 — debt_payments.user_id FK
# ============================================================

def test_debt_payments_user_id_column(sql):
    """should CREATE TABLE `debt_payments` with `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`"""
    assert re.search(
        r"user_id\s+uuid\s+not null\s+references\s+users\s*\(\s*id\s*\)\s+on delete cascade",
        sql,
    ), "Expected debt_payments.user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE"


# ============================================================
# Test 8 — UNIQUE constraint on (debt_id, paid_for_month)
# ============================================================

def test_debt_payments_unique_constraint(sql):
    """should define a named UNIQUE constraint on `(debt_id, paid_for_month)`"""
    assert re.search(
        r"unique\s*\(\s*debt_id\s*,\s*paid_for_month\s*\)",
        sql,
    ), "Expected UNIQUE (debt_id, paid_for_month) constraint on debt_payments"
    assert "debt_payments_unique_debt_month" in sql, (
        "Expected UNIQUE constraint to be named 'debt_payments_unique_debt_month' "
        "(Task 14 catches UniqueViolationError by this name)"
    )


# ============================================================
# Test 9 — index idx_debt_payments_debt_id
# ============================================================

def test_debt_payments_index_debt_id(sql):
    """should define index `idx_debt_payments_debt_id` on `debt_payments(debt_id)`"""
    assert "idx_debt_payments_debt_id" in sql, (
        "Expected index 'idx_debt_payments_debt_id' to be defined in migration SQL"
    )
    assert re.search(
        r"idx_debt_payments_debt_id\s+on\s+debt_payments\s*\(\s*debt_id\s*\)",
        sql,
    ), "Expected index idx_debt_payments_debt_id ON debt_payments(debt_id)"


# ============================================================
# Test 10 — index idx_debt_payments_household
# ============================================================

def test_debt_payments_index_household(sql):
    """should define index `idx_debt_payments_household` on `debt_payments(household_id)`"""
    assert "idx_debt_payments_household" in sql, (
        "Expected index 'idx_debt_payments_household' to be defined in migration SQL"
    )
    assert re.search(
        r"idx_debt_payments_household\s+on\s+debt_payments\s*\(\s*household_id\s*\)",
        sql,
    ), "Expected index idx_debt_payments_household ON debt_payments(household_id)"


# ============================================================
# Test 11 — RLS enabled on debt_payments
# ============================================================

def test_debt_payments_rls_enabled(sql):
    """should enable RLS on `debt_payments`"""
    assert re.search(
        r"alter table\s+debt_payments\s+enable row level security",
        sql,
    ), "Expected 'ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY' in migration SQL"


# ============================================================
# Test 12 — NO updated_at column on debt_payments
# ============================================================

def test_debt_payments_no_updated_at_column(sql):
    """should NOT define an `updated_at` column on `debt_payments`"""
    # Find the CREATE TABLE debt_payments block and check it has no updated_at
    match = re.search(
        r"create table\s+(?:if not exists\s+)?debt_payments\s*\((.+?)\)\s*;",
        sql,
        re.DOTALL,
    )
    assert match, "Could not find CREATE TABLE debt_payments block"
    table_body = match.group(1)
    assert "updated_at" not in table_body, (
        "debt_payments must NOT have an updated_at column — payments are immutable records"
    )


# ============================================================
# Test 12b — household_id FK ON DELETE CASCADE
# ============================================================

def test_debt_payments_household_id_fk(sql):
    """should define household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE"""
    assert re.search(
        r"household_id\s+uuid\s+not null\s+references\s+households\s*\(\s*id\s*\)\s+on delete cascade",
        sql,
    ), "Expected debt_payments.household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE"


# ============================================================
# Test 13 — NO trigger of any kind on debt_payments
# ============================================================

def test_debt_payments_no_trigger(sql):
    """should NOT define any trigger on `debt_payments` — payments are immutable records"""
    assert not re.search(
        r"create trigger\s+\S+\s+\S+\s+\S+\s+on\s+debt_payments",
        sql,
    ), "debt_payments must NOT have any trigger — payments are append-only records"


# ============================================================
# Test 14 — ALTER debts ADD starting_balance (nullable first)
# ============================================================

def test_debts_add_starting_balance_nullable(sql):
    """should ALTER `debts` to add `starting_balance NUMERIC(12,2)` (nullable first)"""
    assert re.search(
        r"alter table\s+debts\s+add\s+column\s+(?:if not exists\s+)?starting_balance\s+numeric\s*\(\s*12\s*,\s*2\s*\)",
        sql,
    ), "Expected 'ALTER TABLE debts ADD COLUMN starting_balance NUMERIC(12,2)' in migration SQL"


# ============================================================
# Test 15 — UPDATE debts SET starting_balance = balance (backfill)
# ============================================================

def test_debts_backfill_starting_balance(sql):
    """should UPDATE `debts SET starting_balance = balance` (backfill)"""
    assert re.search(
        r"update\s+debts\s+set\s+starting_balance\s*=\s*balance",
        sql,
    ), "Expected 'UPDATE debts SET starting_balance = balance' backfill in migration SQL"


# ============================================================
# Test 16 — ALTER debts ALTER COLUMN starting_balance SET NOT NULL
# ============================================================

def test_debts_starting_balance_set_not_null(sql):
    """should ALTER `debts` ALTER COLUMN `starting_balance SET NOT NULL` (lock after backfill)"""
    assert re.search(
        r"alter table\s+debts\s+alter\s+column\s+starting_balance\s+set\s+not null",
        sql,
    ), "Expected 'ALTER TABLE debts ALTER COLUMN starting_balance SET NOT NULL' in migration SQL"


# ============================================================
# Test 17 — ALTER savings_goals ADD ef_target_basis
# ============================================================

def test_savings_goals_add_ef_target_basis(sql):
    """should ALTER `savings_goals` to add `ef_target_basis NUMERIC(12,2)` (nullable)"""
    assert re.search(
        r"alter table\s+savings_goals\s+add\s+column\s+(?:if not exists\s+)?ef_target_basis\s+numeric\s*\(\s*12\s*,\s*2\s*\)",
        sql,
    ), "Expected 'ALTER TABLE savings_goals ADD COLUMN ef_target_basis NUMERIC(12,2)' in migration SQL"


# ============================================================
# Test 18 — ALTER savings_goals ADD ef_multiplier_months
# ============================================================

def test_savings_goals_add_ef_multiplier_months(sql):
    """should ALTER `savings_goals` to add `ef_multiplier_months INTEGER` (nullable)"""
    assert re.search(
        r"alter table\s+savings_goals\s+add\s+column\s+(?:if not exists\s+)?ef_multiplier_months\s+integer",
        sql,
    ), "Expected 'ALTER TABLE savings_goals ADD COLUMN ef_multiplier_months INTEGER' in migration SQL"


# ============================================================
# Test 19 — NO CREATE POLICY statements
# ============================================================

def test_debt_payments_has_default_deny_policy(sql):
    """should define a RESTRICTIVE default-deny policy on debt_payments for defence-in-depth"""
    assert re.search(
        r"create policy\s+debt_payments_default_deny\s+on\s+debt_payments",
        sql,
    ), "Expected a default-deny RLS policy 'debt_payments_default_deny' on debt_payments"
    assert "as restrictive" in sql, (
        "Expected the policy to be RESTRICTIVE so it cannot be bypassed by permissive policies"
    )
    assert "using (false)" in sql, (
        "Expected USING (false) to deny all access to non-BYPASSRLS roles"
    )
