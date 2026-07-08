"""
Task 34 — gated Postgres integration harness proving SQL-level tenant isolation.

WHY THIS FILE EXISTS
--------------------
The app's #1 risk is tenant isolation, and it is enforced by ONE thing: the
SQL-level ownership predicate ``database._owned_budget_predicate`` embedded in
every budget mutation. RLS is deny-all and the application connects as a
BYPASSRLS role, so RLS is pure defence-in-depth — the WHERE clause is the real
guard. Every OTHER test in this repo mocks the DB boundary
(``database.get_pool`` is patched; ``DATABASE_URL`` points at a never-connected
localhost). No test proves the production WHERE clauses actually mutate ZERO
foreign rows against a live Postgres. This harness closes that gap.

WHAT IT DOES
------------
* Stands up a REAL ephemeral Postgres via testcontainers (Docker).
* Applies every ``migrations/migrations/*.sql`` in order (the legacy Supabase
  migration ``20260524000001_households.sql`` is skipped — it references the
  Supabase-only ``auth.users`` / ``auth.uid()`` and was explicitly superseded by
  ``20260608000001_neon_households.sql`` for Neon; production Neon never ran it).
* FAITHFULLY reproduces the production security model: the migrations' RESTRICTIVE
  deny-all RLS policies AND a NOSUPERUSER-but-BYPASSRLS application role that plays
  the role of Neon's ``neondb_owner``. NOTE: this app role is deliberately NOT the
  table owner — it gets past the deny-all policy via BYPASSRLS *alone*, which is a
  stronger, more precisely-attributable setup than prod (where ``neondb_owner`` may
  also bypass RLS by owning the tables). Do NOT "fix" this toward table ownership:
  owner-bypass would make the test pass for the wrong reason and hide a weakened
  WHERE clause. A parallel NOBYPASSRLS control role proves the deny-all policy is
  real and that BYPASSRLS is what lets the app past it.
* Replaces the mocked ``get_pool`` with a real asyncpg pool connected AS the
  BYPASSRLS app role, and seeds two distinct tenants.
* Replays the Task 24 cross-tenant flow through the REAL ``database.py`` functions
  and asserts foreign mutations affect ZERO rows and leave tenant A byte-for-byte
  unchanged, while the owner's own calls still succeed (positive control).

GATING
------
Opt-in only: marked ``@pytest.mark.integration`` and skipped unless
``RUN_INTEGRATION_TESTS=1``. If Docker / testcontainers is unavailable the whole
module SKIPS (never errors), so the default ``pytest`` run stays fast and offline.
"""
import glob
import os

import pytest

import database as db

# --------------------------------------------------------------------------
# Gating: opt-in + graceful skip. Evaluated at import time so the default run
# never touches Docker.
# --------------------------------------------------------------------------

pytestmark = pytest.mark.integration

if os.environ.get("RUN_INTEGRATION_TESTS") != "1":
    pytest.skip(
        "RUN_INTEGRATION_TESTS != 1 — skipping the gated Postgres integration "
        "harness (default suite stays offline).",
        allow_module_level=True,
    )

try:
    import asyncpg  # noqa: F401  (already a project dep; imported for clarity)
    import pytest_asyncio
    from testcontainers.postgres import PostgresContainer
except Exception as exc:  # pragma: no cover - environment guard
    pytest.skip(
        f"integration dependencies unavailable ({exc!r}); skipping.",
        allow_module_level=True,
    )


MIGRATIONS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "migrations", "migrations")
)

# The legacy Supabase migration cannot run on plain Postgres/Neon (references the
# Supabase-only auth.users FK + auth.uid()). It was explicitly superseded by
# 20260608000001_neon_households.sql, which recreates the same objects
# Neon-compatibly. Production Neon never applied it, so skipping it here is what
# makes the test DB faithful to production — not a workaround.
_SKIP_MIGRATIONS = {"20260524000001_households.sql"}

APP_ROLE = "app_role"          # NOSUPERUSER + BYPASSRLS — mirrors Neon's neondb_owner
APP_PASSWORD = "app_pw"
CONTROL_ROLE = "control_role"  # NOSUPERUSER + NOBYPASSRLS — proves deny-all is real
CONTROL_PASSWORD = "ctrl_pw"

MONTH = "2026-07-01"


def _migration_paths():
    files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    return [f for f in files if os.path.basename(f) not in _SKIP_MIGRATIONS]


def _docker_available():
    try:
        import docker

        docker.from_env().ping()
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------
# Session-scoped container: start Postgres once, apply migrations, create the
# BYPASSRLS app role + the NOBYPASSRLS control role. Sync fixture (testcontainers
# is sync); asyncpg work is driven through a throwaway event loop.
# --------------------------------------------------------------------------

@pytest.fixture(scope="session")
def pg_dsns():
    if not _docker_available():
        pytest.skip("Docker is not available; skipping Postgres integration harness.")

    import asyncio

    with PostgresContainer("postgres:16-alpine") as container:
        host = container.get_container_host_ip()
        port = container.get_exposed_port(5432)
        dbname = container.dbname
        admin_dsn = (
            f"postgresql://{container.username}:{container.password}"
            f"@{host}:{port}/{dbname}"
        )
        # Pass credentials as connection kwargs (not embedded in a DSN URL) so a
        # connection-failure traceback can't surface the password in a DSN string.
        app_conn = {
            "host": host, "port": port, "database": dbname,
            "user": APP_ROLE, "password": APP_PASSWORD,
        }
        control_conn = {
            "host": host, "port": port, "database": dbname,
            "user": CONTROL_ROLE, "password": CONTROL_PASSWORD,
        }

        async def _provision():
            conn = await asyncpg.connect(admin_dsn)
            try:
                for path in _migration_paths():
                    with open(path, encoding="utf-8") as f:
                        await conn.execute(f.read())
                # Reproduce the production security model. The app role is
                # NOSUPERUSER so it does NOT get owner-bypass or superuser-bypass;
                # its access past the RESTRICTIVE deny-all policy is due to
                # BYPASSRLS alone — exactly like Neon's neondb_owner. The control
                # role is identical MINUS BYPASSRLS, so it must be blocked.
                await conn.execute(
                    f"""
                    DROP ROLE IF EXISTS {APP_ROLE};
                    CREATE ROLE {APP_ROLE} WITH LOGIN PASSWORD '{APP_PASSWORD}'
                        NOSUPERUSER BYPASSRLS;
                    DROP ROLE IF EXISTS {CONTROL_ROLE};
                    CREATE ROLE {CONTROL_ROLE} WITH LOGIN PASSWORD '{CONTROL_PASSWORD}'
                        NOSUPERUSER NOBYPASSRLS;
                    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
                        TO {APP_ROLE}, {CONTROL_ROLE};
                    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
                        TO {APP_ROLE}, {CONTROL_ROLE};
                    GRANT USAGE ON SCHEMA public TO {APP_ROLE}, {CONTROL_ROLE};
                    """
                )
            finally:
                await conn.close()

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_provision())
        finally:
            loop.close()

        yield {"admin": admin_dsn, "app": app_conn, "control": control_conn}


# --------------------------------------------------------------------------
# Function-scoped real asyncpg pool wired into database.py (replacing the mock),
# with a fresh two-tenant seed per test.
# --------------------------------------------------------------------------

async def _all_rows(conn, table, budget_id):
    rows = await conn.fetch(
        f"SELECT * FROM {table} WHERE budget_id = $1 ORDER BY id", budget_id
    )
    return [dict(r) for r in rows]


async def _budget_row(conn, budget_id):
    return dict(await conn.fetchrow(
        "SELECT * FROM monthly_budgets WHERE id = $1", budget_id
    ))


class _Tenants:
    """Holds the ids for the two seeded tenants and their budgets/rows."""


@pytest_asyncio.fixture
async def seeded(pg_dsns):
    # Real pool connected AS the BYPASSRLS app role. No SSL: the local container
    # speaks plaintext. Wire it straight into database.py's module-global pool so
    # every database.* function under test uses it (get_pool returns it as-is).
    pool = await asyncpg.create_pool(**pg_dsns["app"], min_size=1, max_size=5)
    db.pool = pool
    try:
        async with pool.acquire() as conn:
            # Clean slate each test — CASCADE reaches budgets/streams/items.
            await conn.execute(
                "TRUNCATE users, households, household_members, monthly_budgets, "
                "income_streams, budget_line_items RESTART IDENTITY CASCADE"
            )

        # Seed two distinct tenants entirely through the REAL database.py code
        # paths (create_user / ensure_budget_for_month / create_* mutations).
        alice = await db.create_user("alice@example.com", "pw", "Alice", "A")
        bob = await db.create_user("bob@example.com", "pw", "Bob", "B")

        a_budget = await db.ensure_budget_for_month(
            "personal", _first_of_month(), user_id=alice["id"]
        )
        b_budget = await db.ensure_budget_for_month(
            "personal", _first_of_month(), user_id=bob["id"]
        )

        # A known income stream + a known line item for each tenant, created via
        # the owner so the ownership predicate lets them through.
        a_stream = await db.create_income_stream(
            a_budget["id"], alice["id"], "Salary", 5000
        )
        a_item = await db.create_line_item(
            a_budget["id"], alice["id"], "fundamentals", "Rent", 1200
        )
        b_stream = await db.create_income_stream(
            b_budget["id"], bob["id"], "Wages", 4000
        )
        b_item = await db.create_line_item(
            b_budget["id"], bob["id"], "fun", "Cinema", 40
        )

        t = _Tenants()
        t.alice_id, t.bob_id = alice["id"], bob["id"]
        t.a_budget_id, t.b_budget_id = a_budget["id"], b_budget["id"]
        t.a_stream_id, t.b_stream_id = a_stream["id"], b_stream["id"]
        t.a_item_id, t.b_item_id = a_item["id"], b_item["id"]
        yield t
    finally:
        db.pool = None
        await pool.close()


def _first_of_month():
    from datetime import date

    y, m, _ = (int(x) for x in MONTH.split("-"))
    return date(y, m, 1)


async def _snapshot_a(budget_id):
    """Full byte-for-byte snapshot of tenant A's budget, streams and items."""
    async with db.pool.acquire() as conn:
        return {
            "budget": await _budget_row(conn, budget_id),
            "streams": await _all_rows(conn, "income_streams", budget_id),
            "items": await _all_rows(conn, "budget_line_items", budget_id),
        }


# ==========================================================================
# 1. Security-model fidelity: the migrations create the RLS policies AND the
#    deny-all + BYPASSRLS split behaves exactly like production.
# ==========================================================================

@pytest.mark.asyncio
async def test_migrations_create_deny_all_rls_policies_on_budget_tables(seeded):
    async with db.pool.acquire() as conn:
        policies = await conn.fetch(
            """SELECT tablename, policyname, permissive
               FROM pg_policies
               WHERE schemaname = 'public'
                 AND tablename IN ('monthly_budgets', 'income_streams',
                                   'budget_line_items')
               ORDER BY tablename"""
        )
        rls = await conn.fetch(
            """SELECT relname, relrowsecurity FROM pg_class
               WHERE relname IN ('monthly_budgets', 'income_streams',
                                 'budget_line_items')"""
        )

    by_table = {p["tablename"]: p for p in policies}
    assert set(by_table) == {"monthly_budgets", "income_streams", "budget_line_items"}
    # Every policy is RESTRICTIVE (deny-all) — the production defence-in-depth.
    assert all(p["permissive"] == "RESTRICTIVE" for p in policies)
    # RLS is actually ENABLED (not merely defined) on all three tables.
    assert all(r["relrowsecurity"] for r in rls)


@pytest.mark.asyncio
async def test_bypassrls_app_role_reads_rows_that_deny_all_hides_from_control(
    seeded, pg_dsns
):
    # The app role (BYPASSRLS) sees the seeded rows...
    async with db.pool.acquire() as conn:
        app_view = await conn.fetchval("SELECT count(*) FROM monthly_budgets")
    assert app_view == 2

    # ...but a NOBYPASSRLS role with identical grants sees ZERO — proving the
    # RESTRICTIVE deny-all policy is genuinely active and that BYPASSRLS (not
    # ownership or superuser) is the only reason the app can read. If the test DB
    # failed to reproduce this split, the isolation proof below would be hollow.
    control = await asyncpg.connect(**pg_dsns["control"])
    try:
        control_view = await control.fetchval("SELECT count(*) FROM monthly_budgets")
    finally:
        await control.close()
    assert control_view == 0


# ==========================================================================
# 2. Cross-tenant isolation — line items (Task 24). Every foreign mutation must
#    return None AND touch zero rows; tenant A stays byte-for-byte unchanged.
# ==========================================================================

@pytest.mark.asyncio
async def test_foreign_create_line_item_writes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.create_line_item(
        seeded.a_budget_id, seeded.bob_id, "fun", "Sneaky", 999
    )

    assert result is None  # ownership predicate matched no budget
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before  # not a single row of A's was inserted/changed


@pytest.mark.asyncio
async def test_foreign_update_line_item_writes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.update_line_item(
        seeded.a_budget_id, seeded.a_item_id, seeded.bob_id,
        label="Hacked", amount=0,
    )

    assert result is None
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before


@pytest.mark.asyncio
async def test_foreign_delete_line_item_deletes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.delete_line_item(
        seeded.a_budget_id, seeded.a_item_id, seeded.bob_id
    )

    assert result is None
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before


@pytest.mark.asyncio
async def test_foreign_update_budget_goals_writes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.update_budget_goals(
        seeded.a_budget_id, seeded.bob_id,
        fundamentals_goal_pct=10, future_you_goal_pct=10, fun_goal_pct=80,
        currency="€",
    )

    assert result is None
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before


# ==========================================================================
# 3. Cross-tenant isolation — income streams (Task 23).
# ==========================================================================

@pytest.mark.asyncio
async def test_foreign_create_income_stream_writes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.create_income_stream(
        seeded.a_budget_id, seeded.bob_id, "Sneaky", 999
    )

    assert result is None
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before


@pytest.mark.asyncio
async def test_foreign_update_income_stream_writes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.update_income_stream(
        seeded.a_budget_id, seeded.a_stream_id, seeded.bob_id,
        label="Hacked", amount=0,
    )

    assert result is None
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before


@pytest.mark.asyncio
async def test_foreign_delete_income_stream_deletes_zero_rows(seeded):
    before = await _snapshot_a(seeded.a_budget_id)

    result = await db.delete_income_stream(
        seeded.a_budget_id, seeded.a_stream_id, seeded.bob_id
    )

    assert result is None
    after = await _snapshot_a(seeded.a_budget_id)
    assert after == before


# ==========================================================================
# 4. Positive control — the OWNER can perform the same operations. This proves
#    the predicate isolates by ownership rather than blocking everyone (a
#    predicate of "false" would pass every test above yet fail these).
# ==========================================================================

@pytest.mark.asyncio
async def test_owner_can_mutate_own_budget(seeded):
    # create
    created = await db.create_line_item(
        seeded.a_budget_id, seeded.alice_id, "future_you", "Emergency Fund", 300
    )
    assert created is not None and created["label"] == "Emergency Fund"

    # update
    updated = await db.update_line_item(
        seeded.a_budget_id, seeded.a_item_id, seeded.alice_id, amount=1500
    )
    assert updated is not None and float(updated["amount"]) == 1500.0

    # goals
    goals = await db.update_budget_goals(
        seeded.a_budget_id, seeded.alice_id,
        fundamentals_goal_pct=50, future_you_goal_pct=30, fun_goal_pct=20,
    )
    assert goals is not None
    assert goals["goals"]["future_you_goal_pct"] == 30.0

    # income stream update + delete
    stream = await db.update_income_stream(
        seeded.a_budget_id, seeded.a_stream_id, seeded.alice_id, amount=6000
    )
    assert stream is not None and float(stream["amount"]) == 6000.0

    deleted = await db.delete_line_item(
        seeded.a_budget_id, seeded.a_item_id, seeded.alice_id
    )
    assert deleted == seeded.a_item_id
