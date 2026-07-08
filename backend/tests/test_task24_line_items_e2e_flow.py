"""
Task 24 — HTTP-level API E2E flow (bucket line-item CRUD + goals/currency update).

WHY THIS FILE EXISTS
--------------------
``test_task24_line_items_crud.py`` is UNIT-level: it mocks each ``database.*``
function per test with a fixed return, and separately asserts SQL shape against a
fake asyncpg connection. That proves the route<->db wiring and the SQL text, but
it never threads a REALISTIC multi-step flow through the running app, and each db
mock is stateless (a create is never observed by a later read).

This file adds the missing layer: a single end-to-end flow driven through the
REAL FastAPI application over httpx/ASGITransport — real URL routing, real
Pydantic request validation (incl. the sum-to-100 goal rule), real JWT auth
(tokens are minted and decoded by the real ``auth.verify_token``, no dependency
override), real response serialization and status codes. Behind the app sits ONE
stateful in-memory database double (``InMemoryBudgetStore``) that faithfully
models the ownership contract and the CRUD/COALESCE/position semantics, so state
created in an early step is observed by later steps and the final GET reflects
every mutation in sequence.

The flow (one tenant, "alice"):
  register/login (token mint)  ->  bootstrap current-month budget (GET /api/budget)
  ->  create a line item in each of the three buckets
  ->  PATCH one (label + amount)  ->  PATCH one to MOVE bucket (re-tailed position)
  ->  PATCH the budget goals to a valid 50/30/20 split + a currency change
  ->  DELETE a line item
  ->  final GET asserts the budget state reflects ALL operations.

Cross-tenant isolation (two tenants): a second user "bob" gets 404 on every
Task 24 endpoint aimed at alice's budget, and — critically — alice's rows are
left UNMUTATED afterwards (proving the 404 is a no-op, not a silent partial write
at the app layer).

COVERAGE GAP (reported deliberately, not hidden)
------------------------------------------------
The isolation guarantee proven here is enforced in Python by the in-memory
double. It exercises the app's ownership *contract* (foreign budget -> None ->
404 -> no mutation) end to end, but it does NOT prove the production SQL
``_owned_budget_predicate`` WHERE clause actually prevents a cross-tenant row
from mutating in a live PostgreSQL with deny-all RLS + a BYPASSRLS role. That is
exactly the one thing a fake pool cannot prove, and it requires a Postgres-backed
integration harness that does not currently exist in this repo (every test here
mocks ``database.get_pool``). See the agent report for the recommended follow-up.
"""
import itertools
from datetime import datetime, date, timezone
from unittest.mock import patch, AsyncMock

import pytest
from httpx import AsyncClient, ASGITransport

import database as db


# ============================================================
# Stateful in-memory database double
# ============================================================
#
# One instance stands in for every ``database.*`` boundary function the Task 24
# routes (and the GET bootstrap + auth) touch. Ownership is modelled the same way
# the real predicate models it for a *personal* budget: a caller owns the budget
# iff they are its owner. A non-owner therefore resolves to None everywhere, which
# every route surfaces as 404 — and, because the mutation helpers short-circuit on
# a failed ownership check, a foreign caller never mutates a stored row.

ALICE = "alice-user-id"
BOB = "bob-user-id"


class InMemoryBudgetStore:
    def __init__(self):
        # budget_id -> budget dict (owner_user_id + monthly_budgets columns)
        self.budgets = {}
        # budget_id -> list of budget_line_items row dicts
        self.items = {}
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

    def ensure_budget(self, budget_id, owner_user_id, scope, user_id, household_id,
                      month, currency):
        """Idempotent create of an EMPTY budget (no seed rows).

        The E2E deliberately starts from an empty budget so every subsequent
        assertion is unambiguously attributable to a Task 24 mutation. Task 22's
        default seeding is covered by test_task22_budget_bootstrap.py and is not
        re-litigated here.
        """
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
        return self.budgets[budget_id]

    def _budget_row(self, budget_id):
        b = self.budgets[budget_id]
        # Only the monthly_budgets columns (drop the synthetic owner_user_id).
        return {k: v for k, v in b.items() if k != "owner_user_id"}

    def assemble(self, budget_id):
        """Reuse the PRODUCTION assembler so the response shape is authentic."""
        return db._assemble_budget(self._budget_row(budget_id), [],
                                   self.items.get(budget_id, []))

    # ---- boundary functions mapped to database.* names ----

    async def get_budget(self, scope, month, *, user_id=None, household_id=None):
        for bid, b in self.budgets.items():
            if b["scope"] == scope and b["user_id"] == user_id \
                    and b["household_id"] == household_id and b["month"] == month:
                return self.assemble(bid)
        return None

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
        # COALESCE semantics: a NULL param leaves the stored column unchanged.
        if bucket is not None:
            # Bucket move re-tails position to MAX(target)+1 (computed while the
            # item still carries its source bucket, matching the SQL).
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
    """A real session token minted by the app's own factory and decoded by the
    real ``auth.verify_token`` — the auth path is exercised end to end."""
    from main import _create_access_token
    return _create_access_token(user_id, f"{user_id}@example.com", "Test User")


@pytest.fixture
def store():
    return InMemoryBudgetStore()


@pytest.fixture
def app(store):
    # Patch the pool so app import/lifespan never reaches a live DB, then map every
    # database boundary the routes + auth use onto the stateful store.
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock), \
         patch("database.get_household_by_user", new_callable=AsyncMock,
               return_value=None), \
         patch("database.get_user_settings", new_callable=AsyncMock,
               return_value=None), \
         patch("database.ensure_budget_for_month", new_callable=AsyncMock) as ensure, \
         patch("database.get_budget", side_effect=store.get_budget), \
         patch("database.create_line_item", side_effect=store.create_line_item), \
         patch("database.update_line_item", side_effect=store.update_line_item), \
         patch("database.delete_line_item", side_effect=store.delete_line_item), \
         patch("database.update_budget_goals", side_effect=store.update_budget_goals):

        async def _ensure(scope, month, *, user_id=None, household_id=None, currency="$"):
            # Deterministic budget id so both tenants and every step agree.
            budget_id = f"budget-{user_id or household_id}-{month.isoformat()}"
            return store.ensure_budget(budget_id, owner_user_id=user_id, scope=scope,
                                       user_id=user_id, household_id=household_id,
                                       month=month, currency=currency)
        ensure.side_effect = _ensure

        from main import app as fastapi_app
        # Ensure real auth runs (defensive: a sibling test may have left an override).
        from auth import get_current_user
        fastapi_app.dependency_overrides.pop(get_current_user, None)
        yield fastapi_app


def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _auth(user_id):
    return {"Authorization": f"Bearer {_mint_token(user_id)}"}


def _current_month_first():
    today = datetime.now(timezone.utc).date()
    return date(today.year, today.month, 1)


def _all_items(budget):
    return [i for b in budget["buckets"].values() for i in b["line_items"]]


def _labels(budget, bucket):
    return [i["label"] for i in budget["buckets"][bucket]["line_items"]]


# ============================================================
# The end-to-end happy-path flow (single tenant)
# ============================================================

@pytest.mark.asyncio
async def test_full_line_item_and_goals_lifecycle_reflects_every_operation(app, store):
    async with _client(app) as c:
        alice = _auth(ALICE)

        # -- 1. Bootstrap the current-month personal budget (GET auto-creates it) --
        resp = await c.get("/api/budget?scope=personal", headers=alice)
        assert resp.status_code == 200
        budget = resp.json()
        budget_id = budget["id"]
        assert budget["scope"] == "personal"
        assert budget["user_id"] == ALICE
        assert set(budget["buckets"]) == {"fundamentals", "future_you", "fun"}
        assert _all_items(budget) == []  # starts empty

        # -- 2. Create one line item in EACH bucket --
        creations = [
            ("fundamentals", "Rent", 1200),
            ("future_you", "Emergency Fund", 300),
            ("fun", "Cinema", 40),
        ]
        created = {}
        for bucket, label, amount in creations:
            r = await c.post(f"/api/budget/{budget_id}/line-items",
                             json={"bucket": bucket, "label": label, "amount": amount},
                             headers=alice)
            assert r.status_code == 201, r.text
            row = r.json()
            assert row["bucket"] == bucket and row["label"] == label
            assert row["amount"] == float(amount)
            assert row["position"] == 0  # first item in its bucket -> tail 0
            created[bucket] = row["id"]

        # -- 3. PATCH label + amount on the fundamentals item --
        r = await c.patch(
            f"/api/budget/{budget_id}/line-items/{created['fundamentals']}",
            json={"label": "Mortgage", "amount": 1500}, headers=alice)
        assert r.status_code == 200
        assert r.json()["label"] == "Mortgage"
        assert r.json()["amount"] == 1500.0
        assert r.json()["bucket"] == "fundamentals"  # untouched by COALESCE

        # -- 4. PATCH to MOVE the fun item into fundamentals (position re-tailed) --
        r = await c.patch(
            f"/api/budget/{budget_id}/line-items/{created['fun']}",
            json={"bucket": "fundamentals"}, headers=alice)
        assert r.status_code == 200
        moved = r.json()
        assert moved["bucket"] == "fundamentals"
        assert moved["label"] == "Cinema"      # label/amount preserved on a move
        assert moved["amount"] == 40.0
        # Re-tailed behind the existing Mortgage row (position 0) -> position 1.
        assert moved["position"] == 1

        # -- 5. PATCH the budget goals to a valid 50/30/20 split + currency change --
        r = await c.patch(f"/api/budget/{budget_id}",
                          json={"fundamentals_goal_pct": 50, "future_you_goal_pct": 30,
                                "fun_goal_pct": 20, "currency": "£"}, headers=alice)
        assert r.status_code == 200
        after_goals = r.json()
        assert after_goals["goals"] == {
            "fundamentals_goal_pct": 50.0,
            "future_you_goal_pct": 30.0,
            "fun_goal_pct": 20.0,
        }
        assert after_goals["currency"] == "£"

        # -- 6. DELETE the future_you item --
        r = await c.delete(
            f"/api/budget/{budget_id}/line-items/{created['future_you']}",
            headers=alice)
        assert r.status_code == 204
        assert r.content in (b"", None)

        # -- 7. Final GET: the assembled budget reflects EVERY operation above --
        r = await c.get("/api/budget?scope=personal", headers=alice)
        assert r.status_code == 200
        final = r.json()
        assert final["currency"] == "£"
        assert final["goals"]["future_you_goal_pct"] == 30.0
        # future_you is now empty (deleted); its item never leaked elsewhere.
        assert final["buckets"]["future_you"]["line_items"] == []
        # fundamentals holds the renamed Mortgage AND the moved-in Cinema, in order.
        assert _labels(final, "fundamentals") == ["Mortgage", "Cinema"]
        assert _labels(final, "fun") == []  # its only item was moved out
        # Two items survive in total (3 created, 1 moved, 1 deleted).
        assert len(_all_items(final)) == 2


# ============================================================
# Cross-tenant isolation flow (two tenants) + no-mutation proof
# ============================================================

@pytest.mark.asyncio
async def test_foreign_tenant_gets_404_on_every_endpoint_and_mutates_nothing(app, store):
    async with _client(app) as c:
        alice, bob = _auth(ALICE), _auth(BOB)

        # Alice bootstraps her budget and seeds one known item per Task 24 endpoint.
        resp = await c.get("/api/budget?scope=personal", headers=alice)
        budget_id = resp.json()["id"]
        r = await c.post(f"/api/budget/{budget_id}/line-items",
                         json={"bucket": "fundamentals", "label": "Rent", "amount": 1200},
                         headers=alice)
        item_id = r.json()["id"]

        # Snapshot Alice's state to prove none of Bob's attempts mutate it.
        before = (await c.get("/api/budget?scope=personal", headers=alice)).json()

        # Bob (a valid, authenticated user who is NOT the owner) is denied on all four.
        r = await c.post(f"/api/budget/{budget_id}/line-items",
                         json={"bucket": "fun", "label": "Sneaky", "amount": 999},
                         headers=bob)
        assert r.status_code == 404
        assert r.json() == {"detail": "Budget not found"}

        r = await c.patch(f"/api/budget/{budget_id}/line-items/{item_id}",
                          json={"amount": 0, "label": "Hacked"}, headers=bob)
        assert r.status_code == 404

        r = await c.delete(f"/api/budget/{budget_id}/line-items/{item_id}", headers=bob)
        assert r.status_code == 404

        r = await c.patch(f"/api/budget/{budget_id}",
                          json={"currency": "€"}, headers=bob)
        assert r.status_code == 404
        assert r.json() == {"detail": "Budget not found"}

        # Alice's budget is byte-for-byte unchanged: every foreign write was a no-op.
        after = (await c.get("/api/budget?scope=personal", headers=alice)).json()
        assert after == before
        assert _labels(after, "fundamentals") == ["Rent"]
        assert after["buckets"]["fundamentals"]["line_items"][0]["amount"] == 1200.0
        assert after["currency"] == "$"  # Bob's currency change never landed


# ============================================================
# Request-validation is enforced by the REAL app (never reaches the store)
# ============================================================

@pytest.mark.asyncio
async def test_goal_split_not_summing_to_100_is_rejected_by_the_app(app, store):
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = (await c.get("/api/budget?scope=personal", headers=alice)).json()["id"]

        # 40/30/20 = 90 -> the sum-to-100 model_validator rejects it with 422,
        # and the budget's stored goals stay at their bootstrap defaults.
        r = await c.patch(f"/api/budget/{budget_id}",
                          json={"fundamentals_goal_pct": 40, "future_you_goal_pct": 30,
                                "fun_goal_pct": 20}, headers=alice)
        assert r.status_code == 422

        final = (await c.get("/api/budget?scope=personal", headers=alice)).json()
        assert final["goals"] == {
            "fundamentals_goal_pct": 50.0,
            "future_you_goal_pct": 30.0,
            "fun_goal_pct": 20.0,
        }


@pytest.mark.asyncio
async def test_negative_amount_line_item_is_rejected_by_the_app(app, store):
    async with _client(app) as c:
        alice = _auth(ALICE)
        budget_id = (await c.get("/api/budget?scope=personal", headers=alice)).json()["id"]

        r = await c.post(f"/api/budget/{budget_id}/line-items",
                         json={"bucket": "fun", "label": "Cinema", "amount": -5},
                         headers=alice)
        assert r.status_code == 422
        # Nothing was written.
        final = (await c.get("/api/budget?scope=personal", headers=alice)).json()
        assert _all_items(final) == []
