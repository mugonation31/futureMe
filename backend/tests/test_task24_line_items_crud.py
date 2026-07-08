"""
Task 24 — bucket line-item CRUD + goals/currency update under a parent budget.

Direct sibling of tests/test_task23_income_crud.py. Two layers:
  * Route layer   — mock the database boundary; drive via httpx/ASGITransport.
                    Assert status codes and that the mutation is / isn't awaited.
  * Database layer — a fake asyncpg pool/connection to assert the ownership-gated
                    SQL shape (predicate present, RETURNING used, position
                    computed per bucket) without a live database.

SECURITY: ownership is the ONLY tenant-isolation control (deny-all RLS +
BYPASSRLS role). Every read/write MUST verify the caller owns the parent budget
in the SAME query, and a foreign budget_id must return 404 and never mutate.
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


BUDGET_ID = "budget-1"
ITEM_ID = "item-9"


def sample_item(bucket="fundamentals", label="Rent", amount=1200.0, position=0):
    return {
        "id": ITEM_ID,
        "budget_id": BUDGET_ID,
        "bucket": bucket,
        "label": label,
        "amount": amount,
        "position": position,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def sample_budget_payload(scope="household", user_id=None, household_id="hh-1",
                          month=date(2026, 7, 1)):
    """A fully-shaped BudgetResponse dict as update_budget_goals returns it."""
    def dash(bucket, goal):
        return {
            "bucket": bucket, "goal_pct": goal, "ideal_amount": 0.0,
            "actual_pct": 0.0, "bucket_total": 0.0,
            "available_to_spend": 0.0, "is_over_flag": False,
        }
    return {
        "id": BUDGET_ID,
        "scope": scope,
        "user_id": user_id,
        "household_id": household_id,
        "month": month,
        "currency": "$",
        "goals": {
            "fundamentals_goal_pct": 55.0,
            "future_you_goal_pct": 25.0,
            "fun_goal_pct": 20.0,
        },
        "total_income": 0.0,
        "income_streams": [],
        "buckets": {
            "fundamentals": {"line_items": [], "dashboard": dash("fundamentals", 55.0)},
            "future_you": {"line_items": [], "dashboard": dash("future_you", 25.0)},
            "fun": {"line_items": [], "dashboard": dash("fun", 20.0)},
        },
        "allocation_status": {"state": "balanced", "amount": 0.0},
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
# Route layer — POST line-items
# ============================================================

@pytest.mark.asyncio
async def test_should_create_line_item_and_return_201_with_row():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_item(bucket="fundamentals",
                                                label="Rent", amount=1200.0))

    with patch("database.create_line_item", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/line-items",
                           {"bucket": "fundamentals", "label": "Rent", "amount": 1200})

    assert resp.status_code == 201
    data = resp.json()
    assert data["bucket"] == "fundamentals"
    assert data["label"] == "Rent"
    assert data["amount"] == 1200.0
    assert data["budget_id"] == BUDGET_ID
    # Isolation: the DB layer is handed the caller's own user_id only.
    assert create.await_args.args[0] == BUDGET_ID
    assert create.await_args.args[1] == "user-abc"


@pytest.mark.asyncio
async def test_should_return_422_when_post_amount_is_negative():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_item())

    with patch("database.create_line_item", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/line-items",
                           {"bucket": "fun", "label": "Cinema", "amount": -5})

    assert resp.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_post_label_is_blank():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_item())

    with patch("database.create_line_item", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/line-items",
                           {"bucket": "fun", "label": "   ", "amount": 10})

    assert resp.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_post_bucket_is_invalid():
    # bucket is a BucketKey enum: an out-of-range value is rejected before the DB.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_item())

    with patch("database.create_line_item", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/line-items",
                           {"bucket": "savings", "label": "Rent", "amount": 10})

    assert resp.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_post_has_unknown_field():
    # LineItemCreate is extra="forbid": an unexpected/typo'd key (e.g. `amont`)
    # is rejected before the DB layer, matching the PATCH contract.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    create = AsyncMock(return_value=sample_item())

    with patch("database.create_line_item", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/line-items",
                           {"bucket": "fundamentals", "label": "Rent",
                            "amount": 100, "amont": 1})

    assert resp.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_404_when_post_targets_foreign_budget():
    # Foreign budget => gated INSERT affects no row => DB returns None sentinel.
    context = make_context(user_id="intruder", household_id=None)
    app = get_app_with_context(context)
    create = AsyncMock(return_value=None)

    with patch("database.create_line_item", create):
        resp = await _post(app, f"/api/budget/{BUDGET_ID}/line-items",
                           {"bucket": "fundamentals", "label": "Rent", "amount": 10})

    assert resp.status_code == 404
    # The route surfaced the sentinel as 404 with ONLY an error detail — no row
    # data (id/label/amount) may leak in the body.
    assert resp.json() == {"detail": "Budget not found"}


# ============================================================
# Route layer — PATCH line-items
# ============================================================

@pytest.mark.asyncio
async def test_should_update_label_and_amount_and_return_200():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_item(label="Mortgage", amount=1500.0))

    with patch("database.update_line_item", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}",
                            {"label": "Mortgage", "amount": 1500})

    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "Mortgage"
    assert data["amount"] == 1500.0
    assert update.await_args.args[0] == BUDGET_ID
    assert update.await_args.args[1] == ITEM_ID
    assert update.await_args.args[2] == "user-abc"


@pytest.mark.asyncio
async def test_should_move_bucket_on_update_and_return_200():
    # A line item may be re-bucketed (fundamentals -> fun) in the same PATCH.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_item(bucket="fun", label="Rent", amount=1200.0))

    with patch("database.update_line_item", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}",
                            {"bucket": "fun"})

    assert resp.status_code == 200
    assert resp.json()["bucket"] == "fun"
    # bucket forwarded; label/amount passed through as None (COALESCE keeps them).
    assert update.await_args.kwargs.get("bucket") == "fun"
    assert update.await_args.kwargs.get("label") is None
    assert update.await_args.kwargs.get("amount") is None


@pytest.mark.asyncio
async def test_should_treat_empty_patch_body_as_noop_and_return_200():
    # An empty {} body is valid (all fields optional): the DB COALESCEs every
    # column to its stored value, so the row is returned unchanged with a 200.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_item(bucket="fundamentals",
                                                label="Rent", amount=1200.0))

    with patch("database.update_line_item", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}", {})

    assert resp.status_code == 200
    assert update.await_args.kwargs.get("bucket") is None
    assert update.await_args.kwargs.get("label") is None
    assert update.await_args.kwargs.get("amount") is None
    assert resp.json()["label"] == "Rent"
    assert resp.json()["amount"] == 1200.0


@pytest.mark.asyncio
async def test_should_return_422_when_patch_has_unknown_field():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_item())

    with patch("database.update_line_item", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}",
                            {"label": "X", "sneaky": 1})

    assert resp.status_code == 422
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_404_when_patch_targets_foreign_household_budget():
    # Caller is not a member of the budget's household => sentinel None.
    context = make_context(user_id="not-a-member", household_id="other-hh")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=None)

    with patch("database.update_line_item", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}",
                            {"amount": 100})

    assert resp.status_code == 404


# ============================================================
# Route layer — DELETE line-items
# ============================================================

@pytest.mark.asyncio
async def test_should_delete_and_return_204():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    delete = AsyncMock(return_value=ITEM_ID)

    with patch("database.delete_line_item", delete):
        resp = await _delete(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}")

    assert resp.status_code == 204
    assert resp.content in (b"", None)
    assert delete.await_args.args[0] == BUDGET_ID
    assert delete.await_args.args[1] == ITEM_ID
    assert delete.await_args.args[2] == "user-abc"


@pytest.mark.asyncio
async def test_should_return_404_when_delete_targets_foreign_budget():
    context = make_context(user_id="intruder", household_id=None)
    app = get_app_with_context(context)
    delete = AsyncMock(return_value=None)

    with patch("database.delete_line_item", delete):
        resp = await _delete(app, f"/api/budget/{BUDGET_ID}/line-items/{ITEM_ID}")

    assert resp.status_code == 404


# ============================================================
# Route layer — PATCH budget goals / currency
# ============================================================

@pytest.mark.asyncio
async def test_should_update_goal_pcts_and_return_200():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}",
                            {"fundamentals_goal_pct": 55, "future_you_goal_pct": 25,
                             "fun_goal_pct": 20})

    assert resp.status_code == 200
    data = resp.json()
    assert data["goals"]["fundamentals_goal_pct"] == 55.0
    # Isolation: DB layer handed the caller's own user_id only.
    assert update.await_args.args[0] == BUDGET_ID
    assert update.await_args.args[1] == "user-abc"
    assert update.await_args.kwargs.get("fundamentals_goal_pct") == 55
    assert update.await_args.kwargs.get("future_you_goal_pct") == 25
    assert update.await_args.kwargs.get("fun_goal_pct") == 20


@pytest.mark.asyncio
async def test_should_update_currency_and_return_200():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}", {"currency": "£"})

    assert resp.status_code == 200
    assert update.await_args.kwargs.get("currency") == "£"
    # The unspecified goal params pass through as None so the DB COALESCE keeps them.
    assert update.await_args.kwargs.get("fundamentals_goal_pct") is None


@pytest.mark.asyncio
async def test_should_treat_empty_goals_patch_body_as_noop_and_return_200():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}", {})

    assert resp.status_code == 200
    assert update.await_args.kwargs.get("fundamentals_goal_pct") is None
    assert update.await_args.kwargs.get("future_you_goal_pct") is None
    assert update.await_args.kwargs.get("fun_goal_pct") is None
    assert update.await_args.kwargs.get("currency") is None


@pytest.mark.asyncio
async def test_should_return_422_when_goal_pct_over_100():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}",
                            {"fundamentals_goal_pct": 101})

    assert resp.status_code == 422
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_goal_pct_below_zero():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}",
                            {"fun_goal_pct": -1})

    assert resp.status_code == 422
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_only_one_goal_pct_provided():
    # All-three-or-none: the 50/30/20 model is only meaningful as a complete set,
    # so a single pct without its two siblings is rejected (422), never partially
    # applied.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}",
                            {"fundamentals_goal_pct": 50})

    assert resp.status_code == 422
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_three_goal_pcts_do_not_sum_to_100():
    # 90/90/90 was previously accepted (each independently within 0–100); the
    # sum-to-100 rule now rejects any complete set that doesn't total exactly 100.
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}",
                            {"fundamentals_goal_pct": 30, "future_you_goal_pct": 30,
                             "fun_goal_pct": 30})

    assert resp.status_code == 422
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_422_when_goals_body_has_unknown_field():
    context = make_context(user_id="user-abc", household_id="hh-1")
    app = get_app_with_context(context)
    update = AsyncMock(return_value=sample_budget_payload())

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}",
                            {"fundamentals_goal_pct": 50, "sneaky": 1})

    assert resp.status_code == 422
    update.assert_not_awaited()


@pytest.mark.asyncio
async def test_should_return_404_when_goals_patch_targets_foreign_budget():
    context = make_context(user_id="intruder", household_id=None)
    app = get_app_with_context(context)
    update = AsyncMock(return_value=None)

    with patch("database.update_budget_goals", update):
        resp = await _patch(app, f"/api/budget/{BUDGET_ID}", {"currency": "£"})

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Budget not found"}


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
                f"/api/budget/{BUDGET_ID}/line-items",
                json={"bucket": "fundamentals", "label": "Rent", "amount": 100},
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


def _item_row(bucket="fundamentals", label="Rent", amount=1200.0, position=0):
    return {
        "id": ITEM_ID, "budget_id": BUDGET_ID, "bucket": bucket, "label": label,
        "amount": amount, "position": position,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _budget_row(scope="personal", user_id="user-abc", household_id=None):
    return {
        "id": BUDGET_ID, "scope": scope, "user_id": user_id,
        "household_id": household_id, "month": date(2026, 7, 1), "currency": "£",
        "fundamentals_goal_pct": 55.0, "future_you_goal_pct": 25.0,
        "fun_goal_pct": 20.0,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _only_call(conn):
    """The single mutating query (fetchrow) issued; helper fetches are ignored."""
    fetchrows = [c for c in conn.calls if c[0] == "fetchrow"]
    assert len(fetchrows) == 1, f"expected exactly one query, got {conn.calls}"
    return fetchrows[0][1], fetchrows[0][2]


# ---- create_line_item ----

@pytest.mark.asyncio
async def test_create_line_item_sql_is_ownership_gated_and_returns_row():
    conn = FakeConn(fetchrow_returns=_item_row())
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.create_line_item(
            BUDGET_ID, "user-abc", "fundamentals", "Rent", 1200.0)

    query, args = _only_call(conn)
    assert "INSERT INTO budget_line_items" in query
    assert "RETURNING" in query
    # Position is computed from the existing max scoped per (budget_id, bucket).
    assert "MAX(position)" in query
    assert "bucket = $3" in query  # position window is scoped to the target bucket
    # Ownership predicate: BOTH scope branches present, household via subquery.
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    assert "household_members" in query
    # Positional binding: budget=$1, caller=$2 (guards a placeholder swap).
    assert "b.user_id = $2" in query
    assert "WHERE user_id = $2" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == "user-abc"         # $2 == caller
    assert args[2] == "fundamentals"     # $3 == bucket
    assert result["id"] == ITEM_ID


@pytest.mark.asyncio
async def test_create_line_item_returns_none_when_not_owned():
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.create_line_item(
            BUDGET_ID, "intruder", "fun", "Cinema", 10.0)

    assert result is None


# ---- update_line_item ----

@pytest.mark.asyncio
async def test_update_line_item_sql_is_ownership_gated_and_moves_bucket():
    conn = FakeConn(fetchrow_returns=_item_row(bucket="fun", label="Rent"))
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.update_line_item(
            BUDGET_ID, ITEM_ID, "user-abc", bucket="fun", label=None, amount=None)

    query, args = _only_call(conn)
    assert "UPDATE budget_line_items" in query
    assert "RETURNING" in query
    assert "COALESCE" in query          # partial update keeps unchanged columns
    assert "bucket = COALESCE" in query  # a line item may be re-bucketed
    assert "household_members" in query
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    # Positional binding: budget=$1, item row=$2, caller=$3.
    assert "b.user_id = $3" in query
    assert "WHERE user_id = $3" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == ITEM_ID            # $2
    assert args[2] == "user-abc"         # $3 == caller
    assert result["bucket"] == "fun"


@pytest.mark.asyncio
async def test_update_line_item_recomputes_position_to_target_bucket_tail_on_move():
    # A bucket move must re-tail the item: position becomes MAX(position)+1 of the
    # TARGET bucket, not keep the stale source-bucket position. When bucket is
    # NULL (no move) the position is left unchanged. All in the SAME statement.
    conn = FakeConn(fetchrow_returns=_item_row(bucket="fun", label="Rent", position=3))
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        await db.update_line_item(
            BUDGET_ID, ITEM_ID, "user-abc", bucket="fun", label=None, amount=None)

    query, args = _only_call(conn)
    # Position is conditionally recomputed only on a move (bucket param non-NULL).
    assert "position = CASE" in query
    assert "MAX(li.position)" in query
    # The recompute window is scoped to the TARGET bucket ($4) and this budget.
    assert "li.bucket = $4" in query
    assert "ELSE s.position" in query  # no-move path keeps the stored position
    # Still one ownership-gated statement; bindings unchanged.
    assert "household_members" in query
    assert "b.user_id = $3" in query
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == ITEM_ID            # $2
    assert args[2] == "user-abc"         # $3 == caller
    assert args[3] == "fun"              # $4 == bucket (target)


@pytest.mark.asyncio
async def test_update_line_item_returns_none_when_not_owned():
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.update_line_item(
            BUDGET_ID, ITEM_ID, "intruder", bucket=None, label="X", amount=10.0)

    assert result is None


# ---- delete_line_item ----

@pytest.mark.asyncio
async def test_delete_line_item_sql_is_ownership_gated_and_returns_id():
    conn = FakeConn(fetchrow_returns={"id": ITEM_ID})
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.delete_line_item(BUDGET_ID, ITEM_ID, "user-abc")

    query, args = _only_call(conn)
    assert "DELETE FROM budget_line_items" in query
    assert "RETURNING" in query
    assert "household_members" in query
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    # Positional binding: budget=$1, item row=$2, caller=$3.
    assert "b.user_id = $3" in query
    assert "WHERE user_id = $3" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == ITEM_ID            # $2
    assert args[2] == "user-abc"         # $3 == caller
    assert result is not None


@pytest.mark.asyncio
async def test_delete_line_item_returns_none_when_not_owned():
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.delete_line_item(BUDGET_ID, ITEM_ID, "intruder")

    assert result is None


# ---- update_budget_goals ----

@pytest.mark.asyncio
async def test_update_budget_goals_sql_is_ownership_gated_and_returns_budget():
    conn = FakeConn(fetchrow_returns=_budget_row())
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.update_budget_goals(
            BUDGET_ID, "user-abc", fundamentals_goal_pct=55.0,
            future_you_goal_pct=25.0, fun_goal_pct=20.0, currency="£")

    query, args = _only_call(conn)
    assert "UPDATE monthly_budgets" in query
    assert "RETURNING" in query
    assert "COALESCE" in query
    assert "fundamentals_goal_pct = COALESCE" in query
    assert "currency = COALESCE" in query
    assert "household_members" in query
    assert "scope = 'personal'" in query
    assert "scope = 'household'" in query
    # Ownership predicate applies directly to monthly_budgets: budget=$1, caller=$2.
    assert "b.user_id = $2" in query
    assert "WHERE user_id = $2" in query  # household_members subquery
    assert args[0] == BUDGET_ID          # $1
    assert args[1] == "user-abc"         # $2 == caller
    # Returns a fully-assembled BudgetResponse-shaped dict.
    assert result["goals"]["fundamentals_goal_pct"] == 55.0
    assert set(result["buckets"].keys()) == {"fundamentals", "future_you", "fun"}


@pytest.mark.asyncio
async def test_update_budget_goals_returns_none_when_not_owned():
    conn = FakeConn(fetchrow_returns=None)
    with patch("database.get_pool", new_callable=AsyncMock, return_value=FakePool(conn)):
        result = await db.update_budget_goals(
            BUDGET_ID, "intruder", currency="£")

    assert result is None
