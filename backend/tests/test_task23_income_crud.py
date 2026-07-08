"""
Task 23 — income-stream CRUD under a parent budget.

Two layers of tests (mirrors tests/test_task22_budget_bootstrap.py):
  * Route layer   — mock the database boundary; drive via httpx/ASGITransport.
                    Assert status codes and that the mutation is / isn't awaited.
  * Database layer — a fake asyncpg pool/connection to assert the ownership-gated
                    SQL shape (predicate present, RETURNING used, position
                    computed) without a live database.

SECURITY: ownership is the ONLY tenant-isolation control (deny-all RLS +
BYPASSRLS role). Every read/write MUST verify the caller owns the parent budget
in the SAME query, and a foreign budget_id must return 404 and never mutate.
"""
import pytest
from datetime import datetime, timezone
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


BUDGET_ID = "budget-1"
INCOME_ID = "income-9"


def sample_income(label="Salary", amount=2500.0, position=0):
    return {
        "id": INCOME_ID,
        "budget_id": BUDGET_ID,
        "label": label,
        "amount": amount,
        "position": position,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


from httpx import AsyncClient, ASGITransport


async def _post(app, url, json):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(url, json=json)


async def _patch(app, url, json):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.patch(url, json=json)


async def _delete(app, url):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.delete(url)


# ============================================================
# Route layer — POST
# ============================================================

@pytest.mark.asyncio
async def test_should_create_income_stream_and_return_201_with_row():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_income(label="Salary", amount=2500.0))

    with patch("database.create_income_stream", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/income",
                           {"label": "Salary", "amount": 2500})

    assert resp.status_code == 201
    data = resp.json()
    assert data["label"] == "Salary"
    assert data["amount"] == 2500.0
    assert data["budget_id"] == BUDGET_ID
    # Isolation: the DB layer is handed the caller's own user_id only.
    assert create.await_args.args[0] == BUDGET_ID
    assert create.await_args.args[1] == "user-abc"


@pytest.mark.asyncio
async def test_should_return_422_when_post_amount_is_negative():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_income())

    with patch("database.create_income_stream", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/income",
                           {"label": "Salary", "amount": -5})

    assert resp.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_post_label_is_blank():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_income())

    with patch("database.create_income_stream", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/income",
                           {"label": "   ", "amount": 100})

    assert resp.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_post_has_unknown_field():
    # IncomeStreamCreate is extra="forbid": an unexpected key is rejected before
    # the DB layer, matching the PATCH contract.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_income())

    with patch("database.create_income_stream", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/income",
                           {"label": "Salary", "amount": 100, "sneaky": 1})

    assert resp.status_code == 422
    create.assert_not_awaited()


# ============================================================
# Route layer — PATCH
# ============================================================

@pytest.mark.asyncio
async def test_should_update_label_and_amount_and_return_200():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_income(label="Bonus", amount=999.0))

    with patch("database.update_income_stream", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}",
                            {"label": "Bonus", "amount": 999})

    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "Bonus"
    assert data["amount"] == 999.0
    assert update.await_args.args[0] == BUDGET_ID
    assert update.await_args.args[1] == INCOME_ID
    assert update.await_args.args[2] == "user-abc"


@pytest.mark.asyncio
async def test_should_leave_label_unchanged_on_partial_amount_only_patch():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    # DB echoes the row with the original label preserved (COALESCE keeps it).
    update = AsyncMock(return_value=sample_income(label="Salary", amount=3000.0))

    with patch("database.update_income_stream", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}",
                            {"amount": 3000})

    assert resp.status_code == 200
    # label passed through as None so the DB COALESCE keeps the stored value.
    assert update.await_args.kwargs.get("label") is None
    assert update.await_args.kwargs.get("amount") == 3000
    assert resp.json()["label"] == "Salary"


@pytest.mark.asyncio
async def test_should_treat_empty_patch_body_as_noop_and_return_200():
    # An empty {} body is valid (all fields optional): the DB COALESCEs every
    # column to its stored value, so the row is returned unchanged with a 200.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_income(label="Salary", amount=2500.0))

    with patch("database.update_income_stream", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}", {})

    assert resp.status_code == 200
    # Both fields forwarded as None so the DB leaves them untouched.
    assert update.await_args.kwargs.get("label") is None
    assert update.await_args.kwargs.get("amount") is None
    assert resp.json()["label"] == "Salary"
    assert resp.json()["amount"] == 2500.0


@pytest.mark.asyncio
async def test_should_return_422_when_patch_has_unknown_field():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_income())

    with patch("database.update_income_stream", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}",
                            {"label": "X", "sneaky": 1})

    assert resp.status_code == 422
    update.assert_not_awaited()


# ============================================================
# Route layer — DELETE
# ============================================================

@pytest.mark.asyncio
async def test_should_delete_and_return_204():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    delete = AsyncMock(return_value=INCOME_ID)

    with patch("database.delete_income_stream", delete):
        resp = await _delete(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}")

    assert resp.status_code == 204
    assert resp.content in (b"", None)
    assert delete.await_args.args[0] == BUDGET_ID
    assert delete.await_args.args[1] == INCOME_ID
    assert delete.await_args.args[2] == "user-abc"


# ============================================================
# Route layer — foreign budget (ownership) — MUST 404, never data/mutation
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_post_targets_foreign_budget():
    # Foreign budget => gated INSERT affects no row => DB returns None sentinel.
    context = make_context(user_id="intruder", household_id=None)
    app = get_app_with_context(context)
    create = AsyncMock(return_value=None)

    with patch("database.create_income_stream", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/income",
                           {"label": "Salary", "amount": 100})

    assert resp.status_code == 404
    # The route surfaced the sentinel as 404 with ONLY an error detail — no row
    # data (id/label/amount) may leak in the body.
    assert resp.json() == {"detail": "Budget not found"}


@pytest.mark.asyncio
async def test_should_return_404_when_patch_targets_foreign_household_budget():
    # Caller is not a member of the budget's household => sentinel None.
    context = make_context(user_id="not-a-member", household_id="other-hh")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=None)

    with patch("database.update_income_stream", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}",
                            {"amount": 100})

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_should_return_404_when_delete_targets_foreign_budget():
    context = make_context(user_id="intruder", household_id=None)
    app = get_app_with_context(context)
    delete = AsyncMock(return_value=None)

    with patch("database.delete_income_stream", delete):
        resp = await _delete(app, f"/api/budget/{BUDGET_ID}/income/{INCOME_ID}")

    assert resp.status_code == 404


# ============================================================
# Route layer — auth
# ============================================================

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
            resp = await client.post(
                f"/api/budget/{BUDGET_ID}/income",
                json={"label": "Salary", "amount": 100},
                headers={"Authorization": "Bearer not-a-real-token"},
            )
    assert resp.status_code == 401


# ============================================================
# Database layer — fake pool/conn (no live DB)
# ============================================================

class FakeConn:
    def __init__(self, fetchrow_returns):
        self.calls = []
        self._fetchrow_returns = fetchrow_returns

    async def fetchrow(self, query, *args):
        self.calls.append(("fetchrow", query, args))
        return self._fetchrow_returns

    async def execute(self, query, *args):
        self.calls.append(("execute", query, args))

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


def _income_row(label="Salary", amount=2500.0, position=0):
    return {
        "id": INCOME_ID, "budget_id": BUDGET_ID, "label": label,
        "amount": amount, "position": position,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _only_call(conn):
    """The single (query, args) issued (mutations touch the DB once)."""
    fetchrows = [c for c in conn.calls if c[0] == "fetchrow"]
    assert len(fetchrows) == 1, f"expected exactly one query, got {conn.calls}"
    return fetchrows[0][1], fetchrows[0][2]


def _only_query(conn):
    return _only_call(conn)[0]


# ---- create_income_stream ----

@pytest.mark.asyncio
async def test_create_income_stream_sql_is_ownership_gated_and_returns_row():
    conn = FakeConn(fetchrow_returns=_income_row())
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.create_income_stream(BUDGET_ID, "user-abc", "Salary", 2500.0)

    query, args = _only_call(conn)
    assert "INSERT INTO income_streams" in query
    assert "RETURNING" in query
    # Position is computed from the existing max in the same statement.
    assert "MAX(position)" in query
    # Ownership predicate: BOTH scope branches must be present, household via subquery.
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    assert "household_members" in query
    # Positional binding: the caller placeholder the predicate references ($2)
    # must positionally BE the caller user_id, and the budget id must be $1.
    # This guards against a refactor that swaps placeholders while keeping the
    # substrings intact — the highest-risk isolation regression.
    assert "b.user_id = $2" in query
    assert "WHERE user_id = $2" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == "user-abc"         # $2 == caller
    assert result["id"] == INCOME_ID


@pytest.mark.asyncio
async def test_create_income_stream_returns_none_when_not_owned():
    # Gated INSERT ... SELECT WHERE <not owned> returns no row.
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.create_income_stream(BUDGET_ID, "intruder", "Salary", 100.0)

    assert result is None


# ---- update_income_stream ----

@pytest.mark.asyncio
async def test_update_income_stream_sql_is_ownership_gated_and_returns_row():
    conn = FakeConn(fetchrow_returns=_income_row(label="Bonus", amount=10.0))
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.update_income_stream(
            BUDGET_ID, INCOME_ID, "user-abc", label="Bonus", amount=10.0)

    query, args = _only_call(conn)
    assert "UPDATE income_streams" in query
    assert "RETURNING" in query
    assert "COALESCE" in query  # partial update keeps unchanged columns
    assert "household_members" in query
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    # Positional binding: budget=$1, income row=$2, caller=$3.
    assert "b.user_id = $3" in query
    assert "WHERE user_id = $3" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == INCOME_ID          # $2
    assert args[2] == "user-abc"         # $3 == caller
    assert result["label"] == "Bonus"


@pytest.mark.asyncio
async def test_update_income_stream_returns_none_when_not_owned():
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.update_income_stream(
            BUDGET_ID, INCOME_ID, "intruder", label="Bonus", amount=10.0)

    assert result is None


# ---- delete_income_stream ----

@pytest.mark.asyncio
async def test_delete_income_stream_sql_is_ownership_gated_and_returns_id():
    conn = FakeConn(fetchrow_returns={"id": INCOME_ID})
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.delete_income_stream(BUDGET_ID, INCOME_ID, "user-abc")

    query, args = _only_call(conn)
    assert "DELETE FROM income_streams" in query
    assert "RETURNING" in query
    assert "household_members" in query
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    # Positional binding: budget=$1, income row=$2, caller=$3.
    assert "b.user_id = $3" in query
    assert "WHERE user_id = $3" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == INCOME_ID          # $2
    assert args[2] == "user-abc"         # $3 == caller
    assert result is not None


@pytest.mark.asyncio
async def test_delete_income_stream_returns_none_when_not_owned():
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.delete_income_stream(BUDGET_ID, INCOME_ID, "intruder")

    assert result is None
