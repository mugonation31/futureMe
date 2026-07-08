"""
Task 25 — HTTP-level API E2E flow (computed colour-flagged dashboard).

WHY THIS FILE EXISTS
--------------------
``test_task25_dashboard_compute.py`` is ASSEMBLER-level: it calls
``database._assemble_budget`` directly with hand-built dict rows and asserts the
computed dashboard / allocation_status. That proves the pure compute in
isolation, but it never drives the compute through the *running application* —
real URL routing, real JWT auth, real Pydantic response serialization
(``BudgetResponse`` / ``BucketDashboard`` / ``AllocationStatus``) and the actual
GET /api/budget read path.

This file adds the missing layer: realistic multi-step flows driven through the
REAL FastAPI app over httpx/ASGITransport, ending in GET /api/budget, asserting
the ``buckets[*].dashboard`` and ``allocation_status`` that come back over the
wire. Behind the app sits ONE stateful in-memory database double
(``InMemoryBudgetStore``) modelled on the Task 24 harness but EXTENDED to model
income streams too (Task 24's store hard-coded income to ``[]``, so
``total_income`` was always 0 there and the dashboard maths was never meaningfully
exercised). Crucially the store's ``assemble`` delegates to the PRODUCTION
``database._assemble_budget`` — the same function that holds Task 25's compute —
so the dashboard in every response is GENUINELY computed by production code, not
stubbed. Nothing about the dashboard values is faked in this file.

What each flow validates end to end (all via GET /api/budget after setup):
  * per-bucket maths: bucket_total, ideal_amount (= goal_pct/100 * income),
    actual_pct on a 0-100 scale, available_to_spend, all rounded to 2 dp;
  * the ASYMMETRIC colour flag: with EVERY bucket over its goal, fundamentals/fun
    flag RED (is_over_flag True) but future_you does NOT (reversed: under-saving is
    the bad case) — and a second scenario where future_you UNDER its goal DOES
    flag RED;
  * allocation_status drives all three states (left / balanced / over), shape is
    exactly {state, amount} with a rounded amount and NO ``message`` field;
  * zero-income edge: no income -> actual_pct/ideal_amount 0, 200, no crash;
  * live recompute: a PATCH to a line item or goal changes a subsequent GET's
    dashboard (proving the compute is live, never stored).

COVERAGE NOTE
-------------
As with the Task 24 E2E, the DB boundary is an in-memory double (every test mocks
``database.get_pool``), so this proves the compute + routing + serialization end
to end but not the live PostgreSQL read path. The compute itself is pure and DB
independent, so the double faithfully reproduces it; the SQL that FEEDS the
compute (income/line-item SELECTs) is covered by the Task 22/23/24 unit suites.
"""
import itertools
from datetime import datetime, date, timezone
from unittest.mock import patch, AsyncMock

import pytest
from httpx import AsyncClient, ASGITransport

import database as db


ALICE = "alice-user-id"


# ============================================================
# Stateful in-memory database double (income streams + line items + goals)
# ============================================================
#
# Modelled on the Task 24 harness store, but this one ALSO models income streams
# so total_income is realistic and the dashboard maths is meaningful. Ownership is
# modelled exactly as the real predicate does for a personal budget: a caller owns
# the budget iff they are its owner; a non-owner resolves to None everywhere.


class InMemoryBudgetStore:
    def __init__(self):
        self.budgets = {}          # budget_id -> budget dict (+ owner_user_id)
        self.items = {}            # budget_id -> list of line-item rows
        self.streams = {}          # budget_id -> list of income-stream rows
        self._ids = itertools.count(1)

    # ---- helpers ----

    def _now(self):
        return datetime(2026, 7, 1, tzinfo=timezone.utc)

    def _owned(self, budget_id, caller_user_id):
        b = self.budgets.get(budget_id)
        if b is None or b["owner_user_id"] != caller_user_id:
            return None
        return b

    def _next_position(self, budget_id, bucket):
        positions = [i["position"] for i in self.items.get(budget_id, [])
                     if i["bucket"] == bucket]
        return (max(positions) + 1) if positions else 0

    def _next_stream_position(self, budget_id):
        positions = [s["position"] for s in self.streams.get(budget_id, [])]
        return (max(positions) + 1) if positions else 0

    def ensure_budget(self, budget_id, owner_user_id, scope, user_id, household_id,
                      month, currency):
        """Idempotent create of an EMPTY budget (no seed income/line items)."""
        if budget_id not in self.budgets:
            self.budgets[budget_id] = {
                "id": budget_id,
                "owner_user_id": owner_user_id,
                "scope": scope,
                "user_id": user_id,
                "household_id": household_id,
                "month": month,
                "currency": currency,
                "fundamentals_goal_pct": 50.0,
                "future_you_goal_pct": 30.0,
                "fun_goal_pct": 20.0,
                "created_at": self._now(),
                "updated_at": self._now(),
            }
            self.items[budget_id] = []
            self.streams[budget_id] = []
        return self.budgets[budget_id]

    def _budget_row(self, budget_id):
        b = self.budgets[budget_id]
        return {k: v for k, v in b.items() if k != "owner_user_id"}

    def assemble(self, budget_id):
        """Reuse the PRODUCTION assembler so the dashboard is GENUINELY computed.

        This is the whole point of the Task 25 E2E: ``_assemble_budget`` is the
        function under test, so the response must flow through it (with real
        income streams AND line items), never a stubbed dashboard.
        """
        return db._assemble_budget(
            self._budget_row(budget_id),
            self.streams.get(budget_id, []),
            self.items.get(budget_id, []),
        )

    # ---- boundary functions mapped to database.* names ----

    async def get_budget(self, scope, month, *, user_id=None, household_id=None):
        for bid, b in self.budgets.items():
            if b["scope"] == scope and b["user_id"] == user_id \
                    and b["household_id"] == household_id and b["month"] == month:
                return self.assemble(bid)
        return None

    async def create_income_stream(self, budget_id, caller_user_id, label, amount):
        if self._owned(budget_id, caller_user_id) is None:
            return None
        row = {
            "id": f"stream-{next(self._ids)}",
            "budget_id": budget_id,
            "label": label,
            "amount": float(amount),
            "position": self._next_stream_position(budget_id),
            "created_at": self._now(),
            "updated_at": self._now(),
        }
        self.streams[budget_id].append(row)
        return dict(row)

    async def update_income_stream(self, budget_id, income_id, caller_user_id, *,
                                   label=None, amount=None):
        if self._owned(budget_id, caller_user_id) is None:
            return None
        stream = next((s for s in self.streams.get(budget_id, [])
                       if s["id"] == income_id), None)
        if stream is None:
            return None
        if label is not None:
            stream["label"] = label
        if amount is not None:
            stream["amount"] = float(amount)
        stream["updated_at"] = self._now()
        return dict(stream)

    async def delete_income_stream(self, budget_id, income_id, caller_user_id):
        if self._owned(budget_id, caller_user_id) is None:
            return None
        streams = self.streams.get(budget_id, [])
        stream = next((s for s in streams if s["id"] == income_id), None)
        if stream is None:
            return None
        streams.remove(stream)
        return income_id

    async def create_line_item(self, budget_id, caller_user_id, bucket, label, amount):
        if self._owned(budget_id, caller_user_id) is None:
            return None
        row = {
            "id": f"item-{next(self._ids)}",
            "budget_id": budget_id,
            "bucket": bucket,
            "label": label,
            "amount": float(amount),
            "position": self._next_position(budget_id, bucket),
            "created_at": self._now(),
            "updated_at": self._now(),
        }
        self.items[budget_id].append(row)
        return dict(row)

    async def update_line_item(self, budget_id, item_id, caller_user_id, *,
                               bucket=None, label=None, amount=None):
        if self._owned(budget_id, caller_user_id) is None:
            return None
        item = next((i for i in self.items.get(budget_id, []) if i["id"] == item_id),
                    None)
        if item is None:
            return None
        if bucket is not None:
            item["position"] = self._next_position(budget_id, bucket)
            item["bucket"] = bucket
        if label is not None:
            item["label"] = label
        if amount is not None:
            item["amount"] = float(amount)
        item["updated_at"] = self._now()
        return dict(item)

    async def delete_line_item(self, budget_id, item_id, caller_user_id):
        if self._owned(budget_id, caller_user_id) is None:
            return None
        items = self.items.get(budget_id, [])
        item = next((i for i in items if i["id"] == item_id), None)
        if item is None:
            return None
        items.remove(item)
        return item_id

    async def update_budget_goals(self, budget_id, caller_user_id, *,
                                  fundamentals_goal_pct=None, future_you_goal_pct=None,
                                  fun_goal_pct=None, currency=None):
        b = self._owned(budget_id, caller_user_id)
        if b is None:
            return None
        if fundamentals_goal_pct is not None:
            b["fundamentals_goal_pct"] = fundamentals_goal_pct
        if future_you_goal_pct is not None:
            b["future_you_goal_pct"] = future_you_goal_pct
        if fun_goal_pct is not None:
            b["fun_goal_pct"] = fun_goal_pct
        if currency is not None:
            b["currency"] = currency
        b["updated_at"] = self._now()
        return self.assemble(budget_id)


# ============================================================
# App + auth wiring (real JWT, no dependency override)
# ============================================================

def _mint_token(user_id: str) -> str:
    from main import _create_access_token
    return _create_access_token(user_id, f"{user_id}@example.com", "Test User")


@pytest.fixture
def store():
    return InMemoryBudgetStore()


@pytest.fixture
def app(store):
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock), \
         patch("database.get_household_by_user", new_callable=AsyncMock,
               return_value=None), \
         patch("database.get_user_settings", new_callable=AsyncMock,
               return_value=None), \
         patch("database.ensure_budget_for_month", new_callable=AsyncMock) as ensure, \
         patch("database.get_budget", side_effect=store.get_budget), \
         patch("database.create_income_stream", side_effect=store.create_income_stream), \
         patch("database.update_income_stream", side_effect=store.update_income_stream), \
         patch("database.delete_income_stream", side_effect=store.delete_income_stream), \
         patch("database.create_line_item", side_effect=store.create_line_item), \
         patch("database.update_line_item", side_effect=store.update_line_item), \
         patch("database.delete_line_item", side_effect=store.delete_line_item), \
         patch("database.update_budget_goals", side_effect=store.update_budget_goals):

        async def _ensure(scope, month, *, user_id=None, household_id=None, currency="$"):
            budget_id = f"budget-{user_id or household_id}-{month.isoformat()}"
            return store.ensure_budget(budget_id, owner_user_id=user_id, scope=scope,
                                       user_id=user_id, household_id=household_id,
                                       month=month, currency=currency)
        ensure.side_effect = _ensure

        from main import app as fastapi_app
        from auth import get_current_user
        fastapi_app.dependency_overrides.pop(get_current_user, None)
        yield fastapi_app


def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _auth(user_id):
    return {"Authorization": f"Bearer {_mint_token(user_id)}"}


# ============================================================
# Flow helpers — drive the setup steps a dashboard read depends on
# ============================================================

async def _bootstrap(c, headers):
    """GET the current-month personal budget (auto-creates it) -> budget_id."""
    r = await c.get("/api/budget?scope=personal", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


async def _add_income(c, headers, budget_id, label, amount):
    r = await c.post(f"/api/budget/{budget_id}/income",
                     json={"label": label, "amount": amount}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _add_item(c, headers, budget_id, bucket, label, amount):
    r = await c.post(f"/api/budget/{budget_id}/line-items",
                     json={"bucket": bucket, "label": label, "amount": amount},
                     headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _set_goals(c, headers, budget_id, fundamentals, future_you, fun):
    r = await c.patch(f"/api/budget/{budget_id}",
                      json={"fundamentals_goal_pct": fundamentals,
                            "future_you_goal_pct": future_you,
                            "fun_goal_pct": fun}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def _get_budget(c, headers):
    r = await c.get("/api/budget?scope=personal", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _dash(budget, bucket):
    return budget["buckets"][bucket]["dashboard"]


# ============================================================
# 1. Per-bucket maths through the running app (realistic full flow)
# ============================================================

@pytest.mark.asyncio
async def test_per_bucket_dashboard_maths_are_correct_over_the_wire(app, store):
    """bootstrap -> income -> 50/20/30 goals -> items -> GET: every dashboard
    number (bucket_total, ideal_amount, actual_pct on a 0-100 scale,
    available_to_spend) is correct and 2-dp-rounded in the API response."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)

        # Income total 4000 (proves income POSTs feed total_income via assemble).
        await _add_income(c, alice, budget_id, "Salary", 3000)
        await _add_income(c, alice, budget_id, "Side gig", 1000)

        # Goals 50/20/30 (sum 100) -> ideal 2000 / 800 / 1200.
        await _set_goals(c, alice, budget_id, 50, 20, 30)

        # Line items across all three buckets.
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 1200)
        await _add_item(c, alice, budget_id, "fundamentals", "Groceries", 300)
        await _add_item(c, alice, budget_id, "future_you", "Investments", 500)
        await _add_item(c, alice, budget_id, "fun", "Travel", 200)

        budget = await _get_budget(c, alice)
        assert budget["total_income"] == 4000.0

        fundamentals = _dash(budget, "fundamentals")
        assert fundamentals["bucket_total"] == 1500.0
        assert fundamentals["ideal_amount"] == 2000.0        # 50% of 4000
        assert fundamentals["actual_pct"] == 37.5            # 1500/4000*100 (0-100 scale)
        assert fundamentals["available_to_spend"] == 500.0   # 2000 - 1500

        future_you = _dash(budget, "future_you")
        assert future_you["bucket_total"] == 500.0
        assert future_you["ideal_amount"] == 800.0           # 20% of 4000
        assert future_you["actual_pct"] == 12.5
        assert future_you["available_to_spend"] == 300.0

        fun = _dash(budget, "fun")
        assert fun["bucket_total"] == 200.0
        assert fun["ideal_amount"] == 1200.0                 # 30% of 4000
        assert fun["actual_pct"] == 5.0
        assert fun["available_to_spend"] == 1000.0


@pytest.mark.asyncio
async def test_dashboard_values_are_rounded_to_2dp_over_the_wire(app, store):
    """fractional income/amount values survive serialization rounded to 2 dp."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 3000)
        await _set_goals(c, alice, budget_id, 33.34, 33.33, 33.33)  # sum 100.00
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 333.333)

        fundamentals = _dash(await _get_budget(c, alice), "fundamentals")
        assert fundamentals["bucket_total"] == 333.33          # 333.333 -> 333.33
        assert fundamentals["ideal_amount"] == 1000.2          # 33.34/100*3000
        assert fundamentals["actual_pct"] == 11.11             # 333.333/3000*100
        assert fundamentals["available_to_spend"] == 666.87    # 1000.2 - 333.33


# ============================================================
# 2. Asymmetric colour flag (the most important behaviour)
# ============================================================

@pytest.mark.asyncio
async def test_over_goal_flag_is_asymmetric_across_buckets(app, store):
    """With EVERY bucket over its goal, fundamentals/fun flag RED but future_you
    does NOT (its rule is reversed: only UNDER-goal saving is red)."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        # Goals 50/20/30 -> ideal fundamentals 500, future_you 200, fun 300.
        await _set_goals(c, alice, budget_id, 50, 20, 30)
        # Spend OVER the goal in EVERY bucket.
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 600)   # 600 > 500
        await _add_item(c, alice, budget_id, "future_you", "Invest", 300)   # 300 > 200
        await _add_item(c, alice, budget_id, "fun", "Travel", 400)          # 400 > 300

        budget = await _get_budget(c, alice)
        # fundamentals / fun: OVER goal -> RED.
        assert _dash(budget, "fundamentals")["is_over_flag"] is True
        assert _dash(budget, "fun")["is_over_flag"] is True
        # future_you: OVER goal (over-saving is GOOD) -> NOT red. THE ASYMMETRY.
        assert _dash(budget, "future_you")["is_over_flag"] is False


@pytest.mark.asyncio
async def test_future_you_flag_is_red_when_under_its_goal(app, store):
    """future_you flags RED when UNDER its goal (under-saving), while a
    fundamentals bucket that is likewise under its goal does NOT flag red — the
    same 'under goal' condition resolves oppositely for the two buckets."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        # Goals 50/20/30 -> ideal fundamentals 500, future_you 200.
        await _set_goals(c, alice, budget_id, 50, 20, 30)
        # BOTH under their goal.
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 400)   # 400 < 500
        await _add_item(c, alice, budget_id, "future_you", "Invest", 150)   # 150 < 200

        budget = await _get_budget(c, alice)
        # future_you UNDER goal -> RED (reversed rule: under-saving is bad).
        assert _dash(budget, "future_you")["is_over_flag"] is True
        # fundamentals UNDER goal -> NOT red (under-spending is fine).
        assert _dash(budget, "fundamentals")["is_over_flag"] is False


# ============================================================
# 3. allocation_status — left / balanced / over, shape {state, amount}, NO message
# ============================================================

@pytest.mark.asyncio
async def test_allocation_status_left_shape_over_the_wire(app, store):
    """allocated < income -> {state:'left', amount:income-allocated}, no message."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 600)  # allocated 600

        status = (await _get_budget(c, alice))["allocation_status"]
        assert status == {"state": "left", "amount": 400.0}
        assert set(status.keys()) == {"state", "amount"}   # exact contract shape
        assert "message" not in status                     # contract change confirmed


@pytest.mark.asyncio
async def test_allocation_status_balanced_shape_over_the_wire(app, store):
    """allocated == income -> {state:'balanced', amount:0}, no message."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 600)
        await _add_item(c, alice, budget_id, "fun", "Travel", 400)  # allocated 1000 == 1000

        status = (await _get_budget(c, alice))["allocation_status"]
        assert status == {"state": "balanced", "amount": 0.0}
        assert "message" not in status


@pytest.mark.asyncio
async def test_allocation_status_over_shape_and_rounding_over_the_wire(app, store):
    """allocated > income -> {state:'over', amount:allocated-income} rounded, no message."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 900)
        await _add_item(c, alice, budget_id, "fun", "Travel", 300.128)  # allocated 1200.128

        status = (await _get_budget(c, alice))["allocation_status"]
        assert status == {"state": "over", "amount": 200.13}  # 1200.128-1000 -> 200.13
        assert set(status.keys()) == {"state", "amount"}
        assert "message" not in status


# ============================================================
# 4. Zero-income edge — no divide-by-zero, 200, computed zeros
# ============================================================

@pytest.mark.asyncio
async def test_zero_income_budget_returns_computed_zeros_without_crashing(app, store):
    """A budget with NO income: actual_pct and ideal_amount are 0 for every
    bucket, the response is a clean 200, and nothing divides by zero."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _set_goals(c, alice, budget_id, 50, 20, 30)
        # A line item with NO income behind it.
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 500)

        budget = await _get_budget(c, alice)   # 200 asserted in helper
        assert budget["total_income"] == 0.0
        for bucket in ("fundamentals", "future_you", "fun"):
            dash = _dash(budget, bucket)
            assert dash["actual_pct"] == 0.0
            assert dash["ideal_amount"] == 0.0


# ============================================================
# 5. Live recompute — a PATCH changes a subsequent GET's dashboard
# ============================================================

@pytest.mark.asyncio
async def test_dashboard_recomputes_live_after_line_item_patch(app, store):
    """Editing a line item's amount flips is_over_flag / actual_pct on the NEXT
    GET, proving the dashboard is computed live per request, never stored."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        await _set_goals(c, alice, budget_id, 50, 20, 30)  # ideal fundamentals 500
        item_id = await _add_item(c, alice, budget_id, "fundamentals", "Rent", 400)

        before = _dash(await _get_budget(c, alice), "fundamentals")
        assert before["bucket_total"] == 400.0
        assert before["is_over_flag"] is False   # 400 < 500 -> under, not red

        # Bump the item OVER the goal.
        r = await c.patch(f"/api/budget/{budget_id}/line-items/{item_id}",
                          json={"amount": 700}, headers=alice)
        assert r.status_code == 200

        after = _dash(await _get_budget(c, alice), "fundamentals")
        assert after["bucket_total"] == 700.0            # recomputed
        assert after["actual_pct"] == 70.0               # 700/1000*100
        assert after["available_to_spend"] == -200.0     # 500 - 700
        assert after["is_over_flag"] is True             # now OVER -> RED


@pytest.mark.asyncio
async def test_dashboard_recomputes_live_after_goal_patch(app, store):
    """Changing the goal split changes ideal_amount / is_over_flag on the NEXT
    GET, without touching any line item — the compute reacts to goals live."""
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = await _bootstrap(c, alice)
        await _add_income(c, alice, budget_id, "Salary", 1000)
        await _set_goals(c, alice, budget_id, 50, 20, 30)  # ideal fundamentals 500
        await _add_item(c, alice, budget_id, "fundamentals", "Rent", 400)

        before = _dash(await _get_budget(c, alice), "fundamentals")
        assert before["ideal_amount"] == 500.0
        assert before["is_over_flag"] is False   # 400 < 500

        # Shrink the fundamentals goal so 400 is now OVER the new ideal (300).
        await _set_goals(c, alice, budget_id, 30, 20, 50)

        after = _dash(await _get_budget(c, alice), "fundamentals")
        assert after["ideal_amount"] == 300.0            # 30% of 1000, recomputed
        assert after["available_to_spend"] == -100.0     # 300 - 400
        assert after["is_over_flag"] is True             # 400 > 300 -> now RED
