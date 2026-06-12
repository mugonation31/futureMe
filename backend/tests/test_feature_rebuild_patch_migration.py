"""
Tests for the feature_rebuild_patch migration file (static SQL parsing).

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
    "20260611000012_feature_rebuild_patch.sql",
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


@pytest.fixture(scope="module")
def raw_sql() -> str:
    """Raw (non-normalised) SQL from the migration file, loaded once per module."""
    return _load_sql()


# ============================================================
# Test 1 — file exists at canonical path
# ============================================================

def test_migration_file_exists():
    """should exist at the canonical migrations/migrations/ path (20260611000012_feature_rebuild_patch.sql)"""
    assert os.path.isfile(MIGRATION_PATH), (
        f"Migration file not found: {MIGRATION_PATH}"
    )


# ============================================================
# Test 2 — ALTER TABLE debts changes interest_rate to NUMERIC(6,2)
# ============================================================

def test_alters_interest_rate_to_numeric_6_2(sql):
    """should ALTER TABLE debts to change interest_rate to NUMERIC(6,2)"""
    pattern = r"alter table\s+debts\s+alter column\s+interest_rate\s+type\s+numeric\s*\(\s*6\s*,\s*2\s*\)"
    assert re.search(pattern, sql), (
        "Expected 'ALTER TABLE debts ALTER COLUMN interest_rate TYPE NUMERIC(6,2)' in migration SQL"
    )


# ============================================================
# Test 3 — ADD CONSTRAINT debts_interest_rate_max (interest_rate <= 100)
# ============================================================

def test_adds_debts_interest_rate_max_constraint(sql):
    """should ADD CONSTRAINT debts_interest_rate_max (interest_rate <= 100)"""
    pattern = (
        r"alter table\s+debts\s+add constraint\s+debts_interest_rate_max\s+"
        r"check\s*\(\s*interest_rate\s*<=\s*100\s*\)"
    )
    assert re.search(pattern, sql), (
        "Expected 'ALTER TABLE debts ADD CONSTRAINT debts_interest_rate_max "
        "CHECK (interest_rate <= 100)' in migration SQL"
    )


# ============================================================
# Test 4 — ADD CONSTRAINT debts_meaningful (balance > 0 OR minimum_payment > 0)
# ============================================================

def test_adds_debts_meaningful_constraint(sql):
    """should ADD CONSTRAINT debts_meaningful (balance > 0 OR minimum_payment > 0)"""
    pattern = (
        r"alter table\s+debts\s+add constraint\s+debts_meaningful\s+"
        r"check\s*\(\s*balance\s*>\s*0\s+or\s+minimum_payment\s*>\s*0\s*\)"
    )
    assert re.search(pattern, sql), (
        "Expected 'ALTER TABLE debts ADD CONSTRAINT debts_meaningful "
        "CHECK (balance > 0 OR minimum_payment > 0)' in migration SQL"
    )


# ============================================================
# Test 5 — ADD CONSTRAINT savings_goals_current_lte_target (current_amount <= target_amount)
# ============================================================

def test_adds_savings_goals_current_lte_target_constraint(sql):
    """should ADD CONSTRAINT savings_goals_current_lte_target (current_amount <= target_amount)"""
    pattern = (
        r"alter table\s+savings_goals\s+add constraint\s+savings_goals_current_lte_target\s+"
        r"check\s*\(\s*current_amount\s*<=\s*target_amount\s*\)"
    )
    assert re.search(pattern, sql), (
        "Expected 'ALTER TABLE savings_goals ADD CONSTRAINT savings_goals_current_lte_target "
        "CHECK (current_amount <= target_amount)' in migration SQL"
    )


# ============================================================
# Test 6 — ADD CONSTRAINT expenses_category_length (char_length(category) <= 100)
# ============================================================

def test_adds_expenses_category_length_constraint(sql):
    """should ADD CONSTRAINT expenses_category_length (char_length(category) <= 100)"""
    pattern = (
        r"alter table\s+expenses\s+add constraint\s+expenses_category_length\s+"
        r"check\s*\(\s*char_length\s*\(\s*category\s*\)\s*<=\s*100\s*\)"
    )
    assert re.search(pattern, sql), (
        "Expected 'ALTER TABLE expenses ADD CONSTRAINT expenses_category_length "
        "CHECK (char_length(category) <= 100)' in migration SQL"
    )


# ============================================================
# Test 7 — does NOT contain CREATE TABLE
# ============================================================

def test_does_not_contain_create_table(sql):
    """should NOT contain CREATE TABLE"""
    assert "create table" not in sql, (
        "Patch migration must NOT contain CREATE TABLE — it only alters existing tables"
    )


# ============================================================
# Test 8 — contains a comment block explaining RLS/Neon architectural decision
# ============================================================

def test_contains_rls_neon_comment_block(raw_sql):
    """should contain a comment block explaining the RLS/Neon architectural decision"""
    # Check for key phrases from the required comment block
    assert "BYPASSRLS" in raw_sql or "bypassrls" in raw_sql.lower(), (
        "Migration must contain a comment about BYPASSRLS (Neon architectural decision)"
    )
    assert "neondb_owner" in raw_sql or "application layer" in raw_sql.lower(), (
        "Migration must reference either 'neondb_owner' or 'application layer' "
        "in the RLS architectural comment"
    )


# ============================================================
# Test 9 — does NOT reference auth.uid()
# ============================================================

def test_does_not_reference_auth_uid(sql):
    """should NOT reference auth.uid()"""
    assert "auth.uid()" not in sql, (
        "Patch migration must NOT reference auth.uid() — "
        "RLS is enforced at the application layer"
    )
