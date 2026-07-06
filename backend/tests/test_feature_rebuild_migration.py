"""
Tests for the feature_rebuild migration file (static SQL parsing).

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
    "20260611000011_feature_rebuild.sql",
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
# Test 2 — DROP statements with CASCADE
# ============================================================

def test_drops_old_tables_with_cascade(sql):
    """should DROP budget_categories, category_budgets, and transactions with CASCADE"""
    for table in ("budget_categories", "category_budgets", "transactions"):
        pattern = rf"drop table\s+(if exists\s+)?{table}\s+cascade"
        assert re.search(pattern, sql), (
            f"Expected 'DROP TABLE [IF EXISTS] {table} CASCADE' in migration SQL"
        )


# ============================================================
# Test 3 — CREATE TABLE accounts
# ============================================================

def test_creates_accounts_table(sql):
    """should CREATE TABLE accounts with correct columns and type CHECK constraint"""
    assert re.search(
        r"create table\s+(if not exists\s+)?accounts\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] accounts' in migration SQL"

    assert re.search(
        r"type\s+text\s+not null\s+check\s*\([^)]*type\s+in\s*\([^)]*'checking'[^)]*'savings'[^)]*\)",
        sql,
    ), "Expected accounts.type TEXT NOT NULL CHECK (type IN ('checking', 'savings', ...))"


# ============================================================
# Test 4 — CREATE TABLE income_entries
# ============================================================

def test_creates_income_entries_table(sql):
    """should CREATE TABLE income_entries with amount and frequency CHECK constraints"""
    assert re.search(
        r"create table\s+(if not exists\s+)?income_entries\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] income_entries' in migration SQL"

    assert re.search(
        r"amount\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*amount\s*>\s*0\s*\)",
        sql,
    ), "Expected income_entries.amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)"

    assert re.search(
        r"frequency\s+text\s+not null\s+check\s*\([^)]*frequency\s+in\s*\([^)]*'monthly'[^)]*\)",
        sql,
    ), "Expected income_entries.frequency TEXT NOT NULL CHECK (frequency IN (...))"


# ============================================================
# Test 5 — CREATE TABLE expenses
# ============================================================

def test_creates_expenses_table(sql):
    """should CREATE TABLE expenses with is_recurring BOOLEAN DEFAULT false"""
    assert re.search(
        r"create table\s+(if not exists\s+)?expenses\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] expenses' in migration SQL"

    assert re.search(
        r"is_recurring\s+boolean\s+.*default\s+false",
        sql,
    ), "Expected expenses.is_recurring BOOLEAN DEFAULT false"


# ============================================================
# Test 6 — CREATE TABLE debts
# ============================================================

def test_creates_debts_table(sql):
    """should CREATE TABLE debts with balance, interest_rate, and minimum_payment CHECK constraints"""
    assert re.search(
        r"create table\s+(if not exists\s+)?debts\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] debts' in migration SQL"

    assert re.search(
        r"balance\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*balance\s*>=\s*0\s*\)",
        sql,
    ), "Expected debts.balance NUMERIC(12,2) NOT NULL CHECK (balance >= 0)"

    assert re.search(
        r"interest_rate\s+numeric\s*\(\s*6\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*interest_rate\s*>=\s*0\s*\)",
        sql,
    ), "Expected debts.interest_rate NUMERIC(6,2) NOT NULL CHECK (interest_rate >= 0)"

    assert re.search(
        r"minimum_payment\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*minimum_payment\s*>=\s*0\s*\)",
        sql,
    ), "Expected debts.minimum_payment NUMERIC(12,2) NOT NULL CHECK (minimum_payment >= 0)"


# ============================================================
# Test 7 — CREATE TABLE savings_goals
# ============================================================

def test_creates_savings_goals_table(sql):
    """should CREATE TABLE savings_goals with target_amount and current_amount CHECK constraints"""
    assert re.search(
        r"create table\s+(if not exists\s+)?savings_goals\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] savings_goals' in migration SQL"

    assert re.search(
        r"target_amount\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*target_amount\s*>\s*0\s*\)",
        sql,
    ), "Expected savings_goals.target_amount NUMERIC(12,2) NOT NULL CHECK (target_amount > 0)"

    assert re.search(
        r"current_amount\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*current_amount\s*>=\s*0\s*\)",
        sql,
    ), "Expected savings_goals.current_amount NUMERIC(12,2) NOT NULL CHECK (current_amount >= 0)"


# ============================================================
# Test 8 — 6 indexes defined
# ============================================================

def test_defines_all_six_indexes(sql):
    """should define all 6 indexes (5 on household_id + 1 composite on expenses date)"""
    expected_indexes = [
        "idx_accounts_household",
        "idx_income_entries_household",
        "idx_expenses_household",
        "idx_expenses_date",
        "idx_debts_household",
        "idx_savings_goals_household",
    ]
    for idx_name in expected_indexes:
        assert idx_name in sql, (
            f"Expected index '{idx_name}' to be defined in migration SQL"
        )


# ============================================================
# Test 9 — updated_at triggers on all 5 tables
# ============================================================

def test_defines_updated_at_triggers_on_all_tables(sql):
    """should define updated_at triggers on all 5 tables using set_updated_at"""
    tables = ("accounts", "income_entries", "expenses", "debts", "savings_goals")
    for table in tables:
        pattern = (
            rf"create trigger\s+\S+\s+before update\s+on\s+{table}"
            rf".*?execute\s+(?:procedure|function)\s+set_updated_at\s*\(\s*\)"
        )
        assert re.search(pattern, sql, re.DOTALL), (
            f"Expected a BEFORE UPDATE trigger on '{table}' executing set_updated_at()"
        )


# ============================================================
# Test 10 — does NOT redefine set_updated_at function
# ============================================================

def test_does_not_redefine_set_updated_at_function(sql):
    """should NOT redefine the set_updated_at function"""
    pattern = r"create\s+(or replace\s+)?function\s+set_updated_at"
    assert not re.search(pattern, sql), (
        "Migration must NOT redefine set_updated_at() — it already exists in the DB"
    )


# ============================================================
# Test 11 — RLS enabled on all 5 tables
# ============================================================

def test_enables_rls_on_all_tables(sql):
    """should enable RLS on all 5 tables"""
    tables = ("accounts", "income_entries", "expenses", "debts", "savings_goals")
    for table in tables:
        pattern = rf"alter table\s+{table}\s+enable row level security"
        assert re.search(pattern, sql), (
            f"Expected 'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY' in migration SQL"
        )


# ============================================================
# Test 12 — no policies with auth.uid()
# ============================================================

def test_no_policies_with_auth_uid(sql):
    """should NOT create policies referencing auth.uid()"""
    assert "create policy" not in sql or "auth.uid()" not in sql, (
        "Migration must not define CREATE POLICY statements using auth.uid() — "
        "RLS is enforced at application layer"
    )
    # More specific: ensure there's no CREATE POLICY that contains auth.uid()
    policy_matches = list(re.finditer(r"create policy", sql))
    for match in policy_matches:
        # Extract a window after the CREATE POLICY keyword
        snippet = sql[match.start(): match.start() + 500]
        assert "auth.uid()" not in snippet, (
            "Found a CREATE POLICY referencing auth.uid() — not allowed in this migration"
        )
