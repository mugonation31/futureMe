"""
Tests for the intentional_spending_rebuild migration file (static SQL parsing).

Task 20 — DB migration for the monthly-budget product pivot:
  * drops the six retired feature tables
  * creates monthly_budgets, income_streams, budget_line_items
  * partial unique indexes, CHECK constraints, updated_at triggers, RLS

All tests inspect the SQL file directly — no database connection required
(this matches the pattern in test_feature_rebuild_migration.py and
test_task12_migration.py).
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
    "20260706000014_intentional_spending_rebuild.sql",
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


def _table_body(sql: str, table: str) -> str:
    """
    Return the parenthesised column body of a CREATE TABLE statement.

    Matches balanced parentheses so nested CHECK(...) definitions do not
    prematurely terminate the body.
    """
    start = re.search(
        rf"create table\s+(?:if not exists\s+)?{table}\s*\(", sql
    )
    assert start, f"Could not find CREATE TABLE {table}"
    i = start.end()
    depth = 1
    while i < len(sql) and depth > 0:
        if sql[i] == "(":
            depth += 1
        elif sql[i] == ")":
            depth -= 1
        i += 1
    return sql[start.end():i - 1]


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
# Test 2 — wrapped in a transaction
# ============================================================

def test_wrapped_in_transaction():
    """should wrap the whole migration in BEGIN; ... COMMIT; (ignoring leading/trailing comments)"""
    raw = _load_sql()
    # Strip SQL line comments so the leading header block does not hide the
    # BEGIN;/COMMIT; that actually bracket the executable statements.
    code = "\n".join(
        line for line in raw.splitlines()
        if not line.strip().startswith("--")
    )
    statements = _normalise(code)
    assert statements.startswith("begin"), (
        "First executable statement must be BEGIN;"
    )
    assert statements.rstrip().rstrip(";").endswith("commit"), (
        "Last executable statement must be COMMIT;"
    )
    # BEGIN must come before the first DDL, and COMMIT after it.
    assert statements.index("begin") < statements.index("drop table"), (
        "BEGIN; must open the transaction before any DDL"
    )


# ============================================================
# Test 3 — drops the six retired feature tables with CASCADE
# ============================================================

def test_drops_six_retired_tables_with_cascade(sql):
    """should DROP the six retired feature tables with CASCADE"""
    retired = (
        "accounts",
        "income_entries",
        "expenses",
        "debt_payments",
        "debts",
        "savings_goals",
    )
    for table in retired:
        pattern = rf"drop table\s+(?:if exists\s+)?[^;]*\b{table}\b[^;]*cascade"
        assert re.search(pattern, sql), (
            f"Expected a 'DROP TABLE ... {table} ... CASCADE' in migration SQL"
        )


def test_drops_debt_payments_before_debts(sql):
    """should drop debt_payments before debts (FK order, even though CASCADE covers it)"""
    dp = sql.find("debt_payments")
    debts_drop = re.search(r"drop table[^;]*\bdebts\b", sql)
    assert dp != -1 and debts_drop, "Expected both debt_payments and debts drops"
    assert dp < debts_drop.start(), (
        "debt_payments should be dropped before debts to respect FK order"
    )


# ============================================================
# Test 4 — CREATE TABLE monthly_budgets
# ============================================================

def test_creates_monthly_budgets_table(sql):
    """should CREATE TABLE monthly_budgets"""
    assert re.search(
        r"create table\s+(?:if not exists\s+)?monthly_budgets\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] monthly_budgets' in migration SQL"


def test_monthly_budgets_id_column(sql):
    """should define monthly_budgets.id UUID PRIMARY KEY DEFAULT gen_random_uuid()"""
    body = _table_body(sql, "monthly_budgets")
    assert re.search(
        r"id\s+uuid\s+primary key\s+default\s+gen_random_uuid\s*\(\s*\)", body
    ), "Expected monthly_budgets.id UUID PRIMARY KEY DEFAULT gen_random_uuid()"


def test_monthly_budgets_scope_column_and_check(sql):
    """should define monthly_budgets.scope TEXT NOT NULL DEFAULT 'household' CHECK (scope IN ('personal','household'))"""
    body = _table_body(sql, "monthly_budgets")
    assert re.search(
        r"scope\s+text\s+not null\s+default\s+'household'", body
    ), "Expected monthly_budgets.scope TEXT NOT NULL DEFAULT 'household'"
    assert re.search(
        r"scope\s+in\s*\(\s*'personal'\s*,\s*'household'\s*\)", body
    ), "Expected CHECK (scope IN ('personal','household'))"


def test_monthly_budgets_user_id_fk(sql):
    """should define monthly_budgets.user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE"""
    body = _table_body(sql, "monthly_budgets")
    assert re.search(
        r"user_id\s+uuid\s+not null\s+references\s+users\s*\(\s*id\s*\)\s+on delete cascade",
        body,
    ), "Expected monthly_budgets.user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE"


def test_monthly_budgets_household_id_fk_nullable(sql):
    """should define monthly_budgets.household_id UUID REFERENCES households(id) ON DELETE CASCADE (nullable)"""
    body = _table_body(sql, "monthly_budgets")
    match = re.search(
        r"household_id\s+uuid\s+(not null\s+)?references\s+households\s*\(\s*id\s*\)\s+on delete cascade",
        body,
    )
    assert match, "Expected monthly_budgets.household_id UUID REFERENCES households(id) ON DELETE CASCADE"
    assert match.group(1) is None, (
        "monthly_budgets.household_id must be nullable at the column level "
        "(personal budgets have no household)"
    )


def test_monthly_budgets_month_and_currency(sql):
    """should define monthly_budgets.month DATE NOT NULL and currency TEXT NOT NULL DEFAULT '$'"""
    body = _table_body(sql, "monthly_budgets")
    assert re.search(r"month\s+date\s+not null", body), (
        "Expected monthly_budgets.month DATE NOT NULL"
    )
    assert re.search(r"currency\s+text\s+not null\s+default\s+'\$'", body), (
        "Expected monthly_budgets.currency TEXT NOT NULL DEFAULT '$'"
    )


def test_monthly_budgets_goal_pct_columns(sql):
    """should define the three goal-pct columns NUMERIC(5,2) NOT NULL with defaults 50/20/30"""
    body = _table_body(sql, "monthly_budgets")
    for col, default in (
        ("fundamentals_goal_pct", "50"),
        ("future_you_goal_pct", "20"),
        ("fun_goal_pct", "30"),
    ):
        assert re.search(
            rf"{col}\s+numeric\s*\(\s*5\s*,\s*2\s*\)\s+not null\s+default\s+{default}\b",
            body,
        ), f"Expected {col} NUMERIC(5,2) NOT NULL DEFAULT {default}"


def test_monthly_budgets_timestamps(sql):
    """should define created_at and updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"""
    body = _table_body(sql, "monthly_budgets")
    for col in ("created_at", "updated_at"):
        assert re.search(
            rf"{col}\s+timestamptz\s+not null\s+default\s+now\s*\(\s*\)", body
        ), f"Expected monthly_budgets.{col} TIMESTAMPTZ NOT NULL DEFAULT now()"


def test_monthly_budgets_household_required_check(sql):
    """should define CHECK (scope = 'personal' OR household_id IS NOT NULL)"""
    body = _table_body(sql, "monthly_budgets")
    assert re.search(
        r"check\s*\(\s*scope\s*=\s*'personal'\s+or\s+household_id\s+is not null\s*\)",
        body,
    ), "Expected CHECK (scope = 'personal' OR household_id IS NOT NULL)"


# ============================================================
# Test 5 — partial unique indexes on monthly_budgets
# ============================================================

def test_monthly_budgets_personal_partial_unique_index(sql):
    """should define a partial UNIQUE INDEX on (user_id, month) WHERE scope = 'personal'"""
    assert re.search(
        r"create unique index\s+(?:if not exists\s+)?\S+\s+on\s+monthly_budgets\s*"
        r"\(\s*user_id\s*,\s*month\s*\)\s+where\s+scope\s*=\s*'personal'",
        sql,
    ), "Expected partial UNIQUE INDEX ON monthly_budgets (user_id, month) WHERE scope = 'personal'"


def test_monthly_budgets_household_partial_unique_index(sql):
    """should define a partial UNIQUE INDEX on (household_id, month) WHERE scope = 'household'"""
    assert re.search(
        r"create unique index\s+(?:if not exists\s+)?\S+\s+on\s+monthly_budgets\s*"
        r"\(\s*household_id\s*,\s*month\s*\)\s+where\s+scope\s*=\s*'household'",
        sql,
    ), "Expected partial UNIQUE INDEX ON monthly_budgets (household_id, month) WHERE scope = 'household'"


# ============================================================
# Test 6 — CREATE TABLE income_streams
# ============================================================

def test_creates_income_streams_table(sql):
    """should CREATE TABLE income_streams"""
    assert re.search(
        r"create table\s+(?:if not exists\s+)?income_streams\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] income_streams' in migration SQL"


def test_income_streams_columns(sql):
    """should define income_streams budget_id FK, label, amount CHECK, position"""
    body = _table_body(sql, "income_streams")
    assert re.search(
        r"budget_id\s+uuid\s+not null\s+references\s+monthly_budgets\s*\(\s*id\s*\)\s+on delete cascade",
        body,
    ), "Expected income_streams.budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE"
    assert re.search(r"label\s+text\s+not null", body), (
        "Expected income_streams.label TEXT NOT NULL"
    )
    assert re.search(
        r"amount\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+default\s+0\s+check\s*\(\s*amount\s*>=\s*0\s*\)",
        body,
    ), "Expected income_streams.amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0)"
    assert re.search(r"position\s+integer\s+not null\s+default\s+0", body), (
        "Expected income_streams.position INTEGER NOT NULL DEFAULT 0"
    )


# ============================================================
# Test 7 — CREATE TABLE budget_line_items
# ============================================================

def test_creates_budget_line_items_table(sql):
    """should CREATE TABLE budget_line_items"""
    assert re.search(
        r"create table\s+(?:if not exists\s+)?budget_line_items\s*\(", sql
    ), "Expected 'CREATE TABLE [IF NOT EXISTS] budget_line_items' in migration SQL"


def test_budget_line_items_columns(sql):
    """should define budget_line_items budget_id FK, bucket CHECK, label, amount CHECK, position"""
    body = _table_body(sql, "budget_line_items")
    assert re.search(
        r"budget_id\s+uuid\s+not null\s+references\s+monthly_budgets\s*\(\s*id\s*\)\s+on delete cascade",
        body,
    ), "Expected budget_line_items.budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE"
    assert re.search(
        r"bucket\s+text\s+not null\s+check\s*\(\s*bucket\s+in\s*\(\s*'fundamentals'\s*,\s*'future_you'\s*,\s*'fun'\s*\)\s*\)",
        body,
    ), "Expected budget_line_items.bucket TEXT NOT NULL CHECK (bucket IN ('fundamentals','future_you','fun'))"
    assert re.search(r"label\s+text\s+not null", body), (
        "Expected budget_line_items.label TEXT NOT NULL"
    )
    assert re.search(
        r"amount\s+numeric\s*\(\s*12\s*,\s*2\s*\)\s+not null\s+default\s+0\s+check\s*\(\s*amount\s*>=\s*0\s*\)",
        body,
    ), "Expected budget_line_items.amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0)"
    assert re.search(r"position\s+integer\s+not null\s+default\s+0", body), (
        "Expected budget_line_items.position INTEGER NOT NULL DEFAULT 0"
    )


# ============================================================
# Test 8 — indexes
# ============================================================

def test_defines_all_indexes(sql):
    """should define indexes on monthly_budgets, income_streams and budget_line_items"""
    assert re.search(
        r"create index\s+(?:if not exists\s+)?\S+\s+on\s+monthly_budgets\s*\(\s*user_id\s*,\s*month\s*\)",
        sql,
    ), "Expected index ON monthly_budgets (user_id, month)"
    assert re.search(
        r"create index\s+(?:if not exists\s+)?\S+\s+on\s+monthly_budgets\s*\(\s*household_id\s*,\s*month\s*\)",
        sql,
    ), "Expected index ON monthly_budgets (household_id, month)"
    assert re.search(
        r"create index\s+(?:if not exists\s+)?\S+\s+on\s+income_streams\s*\(\s*budget_id\s*\)",
        sql,
    ), "Expected index ON income_streams (budget_id)"
    assert re.search(
        r"create index\s+(?:if not exists\s+)?\S+\s+on\s+budget_line_items\s*\(\s*budget_id\s*,\s*bucket\s*\)",
        sql,
    ), "Expected index ON budget_line_items (budget_id, bucket)"


# ============================================================
# Test 9 — updated_at triggers on all three tables
# ============================================================

def test_defines_updated_at_triggers_on_all_tables(sql):
    """should define BEFORE UPDATE triggers executing set_updated_at() on all three tables"""
    for table in ("monthly_budgets", "income_streams", "budget_line_items"):
        pattern = (
            rf"create trigger\s+\S+\s+before update\s+on\s+{table}"
            rf".*?execute\s+(?:procedure|function)\s+set_updated_at\s*\(\s*\)"
        )
        assert re.search(pattern, sql, re.DOTALL), (
            f"Expected a BEFORE UPDATE trigger on '{table}' executing set_updated_at()"
        )


def test_does_not_redefine_set_updated_at_function(sql):
    """should NOT redefine the set_updated_at function"""
    assert not re.search(
        r"create\s+(?:or replace\s+)?function\s+set_updated_at", sql
    ), "Migration must NOT redefine set_updated_at() — it already exists in the DB"


# ============================================================
# Test 10 — RLS enabled + default-deny restrictive policies
# ============================================================

def test_enables_rls_on_all_three_tables(sql):
    """should enable RLS on monthly_budgets, income_streams, budget_line_items"""
    for table in ("monthly_budgets", "income_streams", "budget_line_items"):
        assert re.search(
            rf"alter table\s+{table}\s+enable row level security", sql
        ), f"Expected 'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY' in migration SQL"


def test_default_deny_restrictive_policies(sql):
    """should define a RESTRICTIVE default-deny policy (USING (false)) on all three tables"""
    for table in ("monthly_budgets", "income_streams", "budget_line_items"):
        assert re.search(
            rf"create policy\s+\S+\s+on\s+{table}\s+as restrictive\s+using\s*\(\s*false\s*\)",
            sql,
        ), f"Expected a RESTRICTIVE default-deny policy USING (false) on {table}"


def test_no_policies_reference_auth_uid(sql):
    """should NOT create policies referencing auth.uid() (RLS enforced at app layer)"""
    for match in re.finditer(r"create policy", sql):
        snippet = sql[match.start(): match.start() + 500]
        assert "auth.uid()" not in snippet, (
            "Found a CREATE POLICY referencing auth.uid() — not allowed; "
            "household/user scoping is enforced at the application layer"
        )


# ============================================================
# Test 11 — reflections seam comment
# ============================================================

def test_reflections_seam_comment(sql):
    """should note (in a comment) a future reflections table FK to monthly_budgets (Phase 4)"""
    assert "reflections" in sql, (
        "Expected a seam comment mentioning the future 'reflections' table"
    )
    assert re.search(r"reflections.*monthly_budgets|monthly_budgets.*reflections", sql), (
        "Expected the reflections seam comment to reference monthly_budgets"
    )
