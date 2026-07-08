"""
Task 22 — GET /api/budget current-month bootstrap (auto-create + seed).

Two layers of tests:
  * Route layer   — mock the database boundary (matches tests/test_households.py).
  * Database layer — a fake asyncpg pool/connection to assert the create+seed SQL
                     shape without a live database.
"""
import pytest
from datetime import datetime, date, timezone
from unittest.mock import patch, AsyncMock

import database as db
from models import CurrentUserContext


# ============================================================
# Shared helpers / fixtures
# ============================================================

def make_context(user_id="user-abc", household_id=None) -> CurrentUserContext:
    return CurrentUserContext(user_id=user_id, household_id=household_id)


def get_app_with_context(context: CurrentUserContext):
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides[get_current_user] = lambda: context
        return app


SAMPLE_HOUSEHOLD = {
    "id": "hh-1",
    "name": "Smith Family",
    "invite_code": "SMITH01",
    "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    "created_by": "user-abc",
}


def sample_budget_payload(scope="household", user_id=None, household_id="hh-1",
                          month=date(2026, 7, 1)):
    """A fully-shaped BudgetResponse dict as get_budget would return it."""
    def dash(bucket, goal):
        return {
            "bucket": bucket, "goal_pct": goal, "ideal_amount": 0.0,
            "actual_pct": 0.0, "bucket_total": 0.0,
            "available_to_spend": 0.0, "is_over_flag": False,
        }
    return {
        "id": "budget-1",
        "scope": scope,
        "user_id": user_id,
        "household_id": household_id,
        "month": month,
        "currency": "$",
        "goals": {
            "fundamentals_goal_pct": 50.0,
            "future_you_goal_pct": 20.0,
            "fun_goal_pct": 30.0,
        },
        "total_income": 0.0,
        "income_streams": [],
        "buckets": {
            "fundamentals": {"line_items": [], "dashboard": dash("fundamentals", 50.0)},
            "future_you": {"line_items": [], "dashboard": dash("future_you", 20.0)},
            "fun": {"line_items": [], "dashboard": dash("fun", 30.0)},
        },
        "allocation_status": {"state": "balanced", "amount": 0.0,
                              "message": "Great — all allocated"},
    }


from httpx import AsyncClient, ASGITransport


async def _get(app, url):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(url)


# ============================================================
# Route layer
# ============================================================

@pytest.mark.asyncio
async def test_should_default_month_to_current_first_of_month_when_no_month_given():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    ensure = AsyncMock(return_value=sample_budget_payload())
    get_b = AsyncMock(return_value=sample_budget_payload())

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.get_member_role", new_callable=AsyncMock, return_value="owner"), \
         patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", ensure), \
         patch("database.get_budget", get_b):
        resp = await _get(app, "/api/budget?scope=household")

    assert resp.status_code == 200
    today = datetime.now(timezone.utc).date()
    expected = date(today.year, today.month, 1)
    assert ensure.await_args.kwargs["month"] == expected


@pytest.mark.asyncio
async def test_should_normalise_month_to_first_of_month_when_explicit_date_given():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    ensure = AsyncMock(return_value=sample_budget_payload())

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.get_member_role", new_callable=AsyncMock, return_value="owner"), \
         patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", ensure), \
         patch("database.get_budget", new_callable=AsyncMock, return_value=sample_budget_payload()):
        resp = await _get(app, "/api/budget?scope=household&month=2026-07-15")

    assert resp.status_code == 200
    assert ensure.await_args.kwargs["month"] == date(2026, 7, 1)


@pytest.mark.asyncio
async def test_should_reject_month_far_outside_window_to_prevent_write_amplification():
    """A month many years away must 422 and never touch the create path."""
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    ensure = AsyncMock(return_value=sample_budget_payload())
    far_year = datetime.now(timezone.utc).year + 5

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", ensure), \
         patch("database.get_budget", new_callable=AsyncMock, return_value=sample_budget_payload()):
        resp = await _get(app, f"/api/budget?scope=household&month={far_year}-01-01")

    assert resp.status_code == 422
    ensure.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_accept_month_within_window():
    """A month within the allowed window is accepted and creates as normal."""
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    ensure = AsyncMock(return_value=sample_budget_payload())
    today = datetime.now(timezone.utc).date()
    # Same month next year is 12 months away — the inclusive window boundary.
    in_window = date(today.year + 1, today.month, 1)

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", ensure), \
         patch("database.get_budget", new_callable=AsyncMock, return_value=sample_budget_payload()):
        resp = await _get(app, f"/api/budget?scope=household&month={in_window.isoformat()}")

    assert resp.status_code == 200
    ensure.assert_awaited_once()


@pytest.mark.asyncio
async def test_should_return_full_budget_response_with_three_buckets_on_first_access():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.get_member_role", new_callable=AsyncMock, return_value="owner"), \
         patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", new_callable=AsyncMock, return_value=sample_budget_payload()), \
         patch("database.get_budget", new_callable=AsyncMock, return_value=sample_budget_payload()):
        resp = await _get(app, "/api/budget?scope=household&month=2026-07-01")

    assert resp.status_code == 200
    data = resp.json()
    assert data["scope"] == "household"
    assert set(data["buckets"].keys()) == {"fundamentals", "future_you", "fun"}
    assert data["total_income"] == 0
    assert data["income_streams"] == []
    assert data["allocation_status"]["state"] == "balanced"
    assert data["buckets"]["fundamentals"]["dashboard"]["goal_pct"] == 50.0


@pytest.mark.asyncio
async def test_should_let_household_member_read_household_budget():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    ensure = AsyncMock(return_value=sample_budget_payload())
    get_b = AsyncMock(return_value=sample_budget_payload())

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.get_member_role", new_callable=AsyncMock, return_value="member"), \
         patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", ensure), \
         patch("database.get_budget", get_b):
        resp = await _get(app, "/api/budget?scope=household&month=2026-07-01")

    assert resp.status_code == 200
    # Isolation: budget is always resolved against the caller's OWN household id.
    assert ensure.await_args.kwargs["household_id"] == "hh-1"
    assert get_b.await_args.kwargs["household_id"] == "hh-1"


@pytest.mark.asyncio
async def test_should_return_403_when_household_scope_and_caller_has_no_household():
    context = make_context(user_id="orphan", household_id=None)
    app = get_app_with_context(context)

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", new_callable=AsyncMock) as ensure, \
         patch("database.get_budget", new_callable=AsyncMock):
        resp = await _get(app, "/api/budget?scope=household&month=2026-07-01")

    assert resp.status_code in (403, 404)
    # Never touched the data layer for a non-member.
    ensure.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_let_owner_read_personal_budget_scoped_to_own_user_id():
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)
    ensure = AsyncMock(return_value=sample_budget_payload(scope="personal", user_id="user-abc", household_id=None))
    get_b = AsyncMock(return_value=sample_budget_payload(scope="personal", user_id="user-abc", household_id=None))

    with patch("database.get_user_settings", new_callable=AsyncMock, return_value=None), \
         patch("database.ensure_budget_for_month", ensure), \
         patch("database.get_budget", get_b):
        resp = await _get(app, "/api/budget?scope=personal&month=2026-07-01")

    assert resp.status_code == 200
    data = resp.json()
    assert data["scope"] == "personal"
    assert data["user_id"] == "user-abc"
    assert data["household_id"] is None
    # Isolation: personal budget always scoped to the caller's own user id.
    assert ensure.await_args.kwargs["user_id"] == "user-abc"
    assert get_b.await_args.kwargs["user_id"] == "user-abc"


@pytest.mark.asyncio
async def test_should_return_401_when_credentials_invalid():
    # No dependency override — exercise real auth with a bogus bearer token.
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides.pop(get_current_user, None)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/budget?scope=personal",
                headers={"Authorization": "Bearer not-a-real-token"},
            )
    assert resp.status_code == 401


# ============================================================
# Database layer — fake pool/conn (no live DB)
# ============================================================

class FakeConn:
    def __init__(self, insert_returns, existing_row):
        self.calls = []
        self._insert_returns = insert_returns
        self._existing_row = existing_row

    def transaction(self):
        outer = self

        class _Txn:
            async def __aenter__(self_):
                return None

            async def __aexit__(self_, *a):
                return False

        return _Txn()

    async def fetchrow(self, query, *args):
        self.calls.append(("fetchrow", query, args))
        if "INSERT INTO monthly_budgets" in query:
            return self._insert_returns
        return self._existing_row

    async def execute(self, query, *args):
        self.calls.append(("execute", query, args))

    async def executemany(self, query, args_iter):
        self.calls.append(("executemany", query, list(args_iter)))

    async def fetch(self, query, *args):
        self.calls.append(("fetch", query, args))
        return []


class FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        conn = self._conn

        class _Acq:
            async def __aenter__(self_):
                return conn

            async def __aexit__(self_, *a):
                return False

        return _Acq()


def _budget_row(scope="household", user_id=None, household_id="hh-1"):
    return {
        "id": "budget-1", "scope": scope, "user_id": user_id,
        "household_id": household_id, "month": date(2026, 7, 1), "currency": "$",
        "fundamentals_goal_pct": 50, "future_you_goal_pct": 20, "fun_goal_pct": 30,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _line_item_calls(conn):
    return [c for c in conn.calls
            if c[0] in ("execute", "executemany") and "budget_line_items" in c[1]]


def _all_seed_rows(conn):
    rows = []
    for kind, _q, payload in _line_item_calls(conn):
        if kind == "executemany":
            rows.extend(payload)
    return rows


def test_seed_defaults_have_exact_line_items_per_bucket():
    d = db.DEFAULT_LINE_ITEMS
    assert len(d["fundamentals"]) == 10
    assert len(d["future_you"]) == 5
    assert len(d["fun"]) == 8
    # Order preserved (first/last anchors).
    assert d["fundamentals"][0] == "Rent/Mortgage"
    assert d["fundamentals"][-1] == "Miscellaneous"
    assert d["future_you"][0] == "Emergency Fund"
    assert d["fun"][0] == "Clothing"
    assert d["fun"][-1] == "Miscellaneous"


@pytest.mark.asyncio
async def test_ensure_household_budget_inserts_owner_shape_and_seeds_on_create():
    conn = FakeConn(insert_returns=_budget_row("household", None, "hh-1"),
                    existing_row=_budget_row("household", None, "hh-1"))
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        await db.ensure_budget_for_month(
            "household", date(2026, 7, 1), user_id=None, household_id="hh-1", currency="$")

    insert = next(c for c in conn.calls if "INSERT INTO monthly_budgets" in c[1])
    args = insert[2]
    assert "household" in args        # scope
    assert None in args               # user_id NULL for household
    assert "hh-1" in args             # household_id set
    # Seeded on create: 23 line items across three buckets.
    assert len(_all_seed_rows(conn)) == 23


@pytest.mark.asyncio
async def test_ensure_personal_budget_inserts_owner_shape_and_seeds_on_create():
    conn = FakeConn(insert_returns=_budget_row("personal", "user-abc", None),
                    existing_row=_budget_row("personal", "user-abc", None))
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        await db.ensure_budget_for_month(
            "personal", date(2026, 7, 1), user_id="user-abc", household_id=None, currency="$")

    insert = next(c for c in conn.calls if "INSERT INTO monthly_budgets" in c[1])
    args = insert[2]
    assert "personal" in args
    assert "user-abc" in args
    assert None in args               # household_id NULL for personal
    assert len(_all_seed_rows(conn)) == 23


@pytest.mark.asyncio
async def test_ensure_is_idempotent_and_does_not_reseed_on_conflict():
    # ON CONFLICT DO NOTHING returns no row -> budget already existed.
    conn = FakeConn(insert_returns=None,
                    existing_row=_budget_row("household", None, "hh-1"))
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.ensure_budget_for_month(
            "household", date(2026, 7, 1), user_id=None, household_id="hh-1", currency="$")

    assert result["id"] == "budget-1"
    # No re-seeding when the budget already existed.
    assert _line_item_calls(conn) == []
