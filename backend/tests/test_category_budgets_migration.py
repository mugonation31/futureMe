"""
Tests for the category_budgets migration file (static SQL parsing).

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
    "20260609000008_category_budgets.sql",
))


# ============================================================
# Helpers
# ============================================================

def _normalise(sql: str) -> str:
    """Collapse whitespace so multi-line SQL is easier to match."""
    return re.sub(r"\s+", " ", sql).strip().lower()


@pytest.fixture(scope="module")
def sql() -> str:
    """Normalised SQL from the migration file, loaded once per module."""
    if not os.path.isfile(MIGRATION_PATH):
        pytest.fail(f"Migration file not found: {MIGRATION_PATH}")
    with open(MIGRATION_PATH) as fh:
        return _normalise(fh.read())


# ============================================================
# Test 1 — file exists
# ============================================================

def test_migration_file_exists():
    """should exist at the expected path"""
    assert os.path.isfile(MIGRATION_PATH), (
        f"Migration file not found: {MIGRATION_PATH}"
    )


# ============================================================
# Test 2 — CREATE TABLE statement present
# ============================================================

def test_defines_create_table_category_budgets(sql):
    """should define CREATE TABLE [IF NOT EXISTS] category_budgets"""
    pattern = r"create table\s+(if not exists\s+)?category_budgets\s*\("
    assert re.search(pattern, sql), (
        "Expected 'CREATE TABLE [IF NOT EXISTS] category_budgets' in migration SQL"
    )


# ============================================================
# Test 3 — id column
# ============================================================

def test_defines_id_uuid_primary_key_default_gen_random_uuid(sql):
    """should define id uuid PRIMARY KEY DEFAULT gen_random_uuid()"""
    pattern = r"id\s+uuid\s+primary key\s+default\s+gen_random_uuid\s*\(\s*\)"
    assert re.search(pattern, sql), (
        "Expected column: id uuid PRIMARY KEY DEFAULT gen_random_uuid()"
    )


# ============================================================
# Test 4 — household_id column with FK and CASCADE
# ============================================================

def test_defines_household_id_references_households_on_delete_cascade(sql):
    """should define household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE"""
    pattern = r"household_id\s+uuid\s+not null\s+references\s+households\s*\(\s*id\s*\)\s+on delete cascade"
    assert re.search(pattern, sql), (
        "Expected column: household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE"
    )


# ============================================================
# Test 5 — category_id column with FK and CASCADE
# ============================================================

def test_defines_category_id_references_budget_categories_on_delete_cascade(sql):
    """should define category_id uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE"""
    pattern = r"category_id\s+uuid\s+not null\s+references\s+budget_categories\s*\(\s*id\s*\)\s+on delete cascade"
    assert re.search(pattern, sql), (
        "Expected column: category_id uuid NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE"
    )


# ============================================================
# Test 6 — monthly_limit column with CHECK
# ============================================================

def test_defines_monthly_limit_numeric_check_positive(sql):
    """should define monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit > 0)"""
    pattern = r"monthly_limit\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*monthly_limit\s*>\s*0\s*\)"
    assert re.search(pattern, sql), (
        "Expected column: monthly_limit numeric(12,2) NOT NULL CHECK (monthly_limit > 0)"
    )


# ============================================================
# Test 7 — created_at column with DEFAULT now()
# ============================================================

def test_defines_created_at_timestamptz_default_now(sql):
    """should define created_at timestamptz DEFAULT now()"""
    pattern = r"created_at\s+timestamptz\s+default\s+now\s*\(\s*\)"
    assert re.search(pattern, sql), (
        "Expected column: created_at timestamptz DEFAULT now()"
    )


# ============================================================
# Test 8 — updated_at column with DEFAULT now()
# ============================================================

def test_defines_updated_at_timestamptz_default_now(sql):
    """should define updated_at timestamptz DEFAULT now()"""
    pattern = r"updated_at\s+timestamptz\s+default\s+now\s*\(\s*\)"
    assert re.search(pattern, sql), (
        "Expected column: updated_at timestamptz DEFAULT now()"
    )


# ============================================================
# Test 9 — UNIQUE constraint on (household_id, category_id)
# ============================================================

def test_defines_unique_constraint_household_id_category_id(sql):
    """should define a UNIQUE constraint on (household_id, category_id)"""
    # Accept inline UNIQUE constraint or a named CONSTRAINT ... UNIQUE (...)
    # or a CREATE UNIQUE INDEX on (household_id, category_id)
    inline_pattern = r"unique\s*\(\s*household_id\s*,\s*category_id\s*\)"
    index_pattern = r"create unique index\s+(if not exists\s+)?\S+\s+on\s+category_budgets\s*\([^)]*household_id[^)]*,\s*category_id[^)]*\)"
    assert re.search(inline_pattern, sql) or re.search(index_pattern, sql), (
        "Expected a UNIQUE constraint or UNIQUE INDEX on (household_id, category_id)"
    )


# ============================================================
# Test 10 — set_updated_at() trigger on category_budgets
# ============================================================

def test_defines_set_updated_at_trigger(sql):
    """should define the set_updated_at() trigger on category_budgets"""
    pattern = r"(create or replace trigger|create trigger)\s+\S+\s+before update on category_budgets\s+for each row\s+execute function set_updated_at\s*\(\s*\)"
    assert re.search(pattern, sql), (
        "Expected a BEFORE UPDATE trigger on category_budgets executing set_updated_at()"
    )


# ============================================================
# Test 11 — index on household_id
# ============================================================

def test_defines_index_on_household_id(sql):
    """should define a CREATE INDEX on category_budgets(household_id)"""
    pattern = r"create\s+index\s+(if not exists\s+)?\S+\s+on\s+category_budgets\s*\(\s*household_id\s*\)"
    assert re.search(pattern, sql), (
        "Expected a CREATE INDEX on category_budgets(household_id)"
    )
