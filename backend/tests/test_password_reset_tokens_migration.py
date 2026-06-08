"""
Tests for the password_reset_tokens migration file (static SQL parsing).

All tests inspect the SQL file directly — no database connection required.
"""
import os
import re
import pytest


MIGRATION_PATH = os.path.normpath(os.path.join(
    os.path.dirname(__file__),  # backend/tests/
    "..",                        # backend/
    "..",                        # project root
    "supabase",
    "migrations",
    "20260608000007_password_reset_tokens.sql",
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
# Test 2 — CREATE TABLE statement present
# ============================================================

def test_defines_create_table_password_reset_tokens(sql):
    """should define CREATE TABLE password_reset_tokens"""
    pattern = r"create table\s+(if not exists\s+)?password_reset_tokens\s*\("
    assert re.search(pattern, sql), (
        "Expected 'CREATE TABLE [IF NOT EXISTS] password_reset_tokens' in migration SQL"
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
# Test 4 — user_id column with FK and CASCADE
# ============================================================

def test_defines_user_id_references_users_on_delete_cascade(sql):
    """should define user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE"""
    pattern = r"user_id\s+uuid\s+not null\s+references\s+users\s*\(\s*id\s*\)\s+on delete cascade"
    assert re.search(pattern, sql), (
        "Expected column: user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE"
    )


# ============================================================
# Test 5 — token_hash column UNIQUE NOT NULL
# ============================================================

def test_defines_token_hash_text_unique_not_null(sql):
    """should define token_hash text UNIQUE NOT NULL"""
    # Accept either order: unique not null  OR  not null unique
    pattern = r"token_hash\s+text\s+(unique\s+not null|not null\s+unique)"
    assert re.search(pattern, sql), (
        "Expected column: token_hash text UNIQUE NOT NULL (in any order)"
    )


# ============================================================
# Test 6 — expires_at column NOT NULL
# ============================================================

def test_defines_expires_at_timestamptz_not_null(sql):
    """should define expires_at timestamptz NOT NULL"""
    pattern = r"expires_at\s+timestamptz\s+not null"
    assert re.search(pattern, sql), (
        "Expected column: expires_at timestamptz NOT NULL"
    )


# ============================================================
# Test 7 — used_at column nullable (no NOT NULL)
# ============================================================

def test_defines_used_at_timestamptz_nullable(sql):
    """should define used_at timestamptz (nullable — no NOT NULL constraint)"""
    assert "used_at" in sql, "Expected column 'used_at' in migration SQL"
    # Extract segment between 'used_at' and the next comma or closing paren
    match = re.search(r"used_at([^,)]+)", sql)
    assert match, "Could not locate 'used_at' column definition"
    col_def = match.group(1)
    assert "not null" not in col_def, (
        "Column 'used_at' should be nullable — 'NOT NULL' must not appear on this column"
    )


# ============================================================
# Test 8 — created_at column with DEFAULT now()
# ============================================================

def test_defines_created_at_timestamptz_default_now(sql):
    """should define created_at timestamptz DEFAULT now()"""
    pattern = r"created_at\s+timestamptz\s+default\s+now\s*\(\s*\)"
    assert re.search(pattern, sql), (
        "Expected column: created_at timestamptz DEFAULT now()"
    )


# ============================================================
# Test 9 — index on expires_at for cleanup queries
# ============================================================

def test_defines_index_on_expires_at(sql):
    """should define a CREATE INDEX on expires_at"""
    pattern = r"create\s+index\s+(if not exists\s+)?\S+\s+on\s+password_reset_tokens\s*\([^)]*expires_at[^)]*\)"
    assert re.search(pattern, sql), (
        "Expected a CREATE INDEX on password_reset_tokens(expires_at)"
    )
