"""
Task 21 — core Pydantic models for the Intentional Spending Tracker (50/30/20).

These tests define the new model vocabulary for the pivoted feature layer. They
exercise validation only (no DB), matching the existing `_sanitise_text` +
Pydantic 2.5 validator style.
"""
from datetime import datetime, date
import pytest
from pydantic import ValidationError


# ============================================================
# IncomeStreamCreate / Update / Response
# ============================================================

def test_income_stream_create_accepts_valid_label_and_amount():
    """should accept a valid {label, amount>=0}"""
    from models import IncomeStreamCreate

    m = IncomeStreamCreate(label="Salary", amount=3000)

    assert m.label == "Salary"
    assert m.amount == 3000


def test_income_stream_create_rejects_negative_amount():
    """should reject a negative amount"""
    from models import IncomeStreamCreate

    with pytest.raises(ValidationError):
        IncomeStreamCreate(label="Salary", amount=-1)


def test_income_stream_create_sanitises_label():
    """should strip surrounding whitespace via _sanitise_text"""
    from models import IncomeStreamCreate

    m = IncomeStreamCreate(label="  Freelance  ", amount=500)

    assert m.label == "Freelance"


def test_income_stream_create_rejects_whitespace_only_label():
    """a label that collapses to empty after stripping must be rejected"""
    from models import IncomeStreamCreate

    with pytest.raises(ValidationError):
        IncomeStreamCreate(label="   ", amount=500)


def test_income_stream_update_forbids_extra_fields():
    """should forbid fields outside label/amount on the Update model"""
    from models import IncomeStreamUpdate

    with pytest.raises(ValidationError):
        IncomeStreamUpdate(label="Salary", household_id="hacked")


def test_income_stream_response_constructs_from_attributes():
    """should build an IncomeStreamResponse carrying budget_id + position"""
    from models import IncomeStreamResponse

    now = datetime.now()
    m = IncomeStreamResponse(
        id="i1", budget_id="b1", label="Salary", amount=3000,
        position=0, created_at=now, updated_at=now,
    )

    assert m.budget_id == "b1"
    assert m.position == 0


# ============================================================
# LineItemCreate / Update / Response
# ============================================================

@pytest.mark.parametrize("bucket", ["fundamentals", "future_you", "fun"])
def test_line_item_create_accepts_valid_buckets(bucket):
    """should accept each of the three valid bucket literals"""
    from models import LineItemCreate

    m = LineItemCreate(bucket=bucket, label="Rent", amount=1200)

    assert m.bucket == bucket


def test_line_item_create_rejects_invalid_bucket():
    """should reject a bucket outside fundamentals/future_you/fun"""
    from models import LineItemCreate

    with pytest.raises(ValidationError):
        LineItemCreate(bucket="wants", label="Rent", amount=1200)


def test_line_item_create_rejects_negative_amount():
    """should reject a negative amount"""
    from models import LineItemCreate

    with pytest.raises(ValidationError):
        LineItemCreate(bucket="fun", label="Coffee", amount=-5)


def test_line_item_create_sanitises_label():
    """should strip surrounding whitespace on the label"""
    from models import LineItemCreate

    m = LineItemCreate(bucket="fundamentals", label="  Groceries  ", amount=300)

    assert m.label == "Groceries"


def test_line_item_create_rejects_whitespace_only_label():
    """a label that collapses to empty after stripping must be rejected"""
    from models import LineItemCreate

    with pytest.raises(ValidationError):
        LineItemCreate(bucket="fundamentals", label="   ", amount=300)


def test_line_item_update_forbids_extra_but_allows_bucket_move():
    """should forbid extra fields yet permit moving bucket on update"""
    from models import LineItemUpdate

    moved = LineItemUpdate(bucket="future_you")
    assert moved.bucket == "future_you"

    with pytest.raises(ValidationError):
        LineItemUpdate(label="Rent", budget_id="hacked")


def test_line_item_response_constructs():
    """should build a LineItemResponse carrying bucket + budget_id + position"""
    from models import LineItemResponse

    now = datetime.now()
    m = LineItemResponse(
        id="l1", budget_id="b1", bucket="fundamentals", label="Rent",
        amount=1200, position=0, created_at=now, updated_at=now,
    )

    assert m.bucket == "fundamentals"
    assert m.budget_id == "b1"


# ============================================================
# BudgetGoalsUpdate
# ============================================================

def test_budget_goals_update_accepts_valid_pcts_and_currency():
    """should accept goal pcts within 0-100 and a currency, forbidding extra"""
    from models import BudgetGoalsUpdate

    m = BudgetGoalsUpdate(
        fundamentals_goal_pct=50,
        future_you_goal_pct=20,
        fun_goal_pct=30,
        currency="$",
    )

    assert m.fundamentals_goal_pct == 50
    assert m.currency == "$"


def test_budget_goals_update_sanitises_currency():
    """currency should be stripped of surrounding whitespace like labels"""
    from models import BudgetGoalsUpdate

    m = BudgetGoalsUpdate(currency="  £  ")

    assert m.currency == "£"


def test_budget_goals_update_rejects_whitespace_only_currency():
    """currency that collapses to empty after stripping must be rejected"""
    from models import BudgetGoalsUpdate

    with pytest.raises(ValidationError):
        BudgetGoalsUpdate(currency="   ")


def test_budget_goals_update_rejects_control_char_currency():
    """currency carrying a NUL/BiDi control char must be rejected"""
    from models import BudgetGoalsUpdate

    with pytest.raises(ValidationError):
        BudgetGoalsUpdate(currency="‮$")


def test_budget_goals_update_forbids_extra_fields():
    """should forbid fields outside the three pcts + currency"""
    from models import BudgetGoalsUpdate

    with pytest.raises(ValidationError):
        BudgetGoalsUpdate(fundamentals_goal_pct=50, total_income=9999)


def test_budget_goals_update_rejects_pct_above_100():
    """should reject a goal pct greater than 100"""
    from models import BudgetGoalsUpdate

    with pytest.raises(ValidationError):
        BudgetGoalsUpdate(fun_goal_pct=150)


def test_budget_goals_update_rejects_negative_pct():
    """should reject a goal pct below 0"""
    from models import BudgetGoalsUpdate

    with pytest.raises(ValidationError):
        BudgetGoalsUpdate(fundamentals_goal_pct=-1)


# ============================================================
# BucketDashboard
# ============================================================

def test_bucket_dashboard_constructs_with_computed_fields():
    """should carry the computed per-bucket dashboard values + colour flag"""
    from models import BucketDashboard

    d = BucketDashboard(
        bucket="fundamentals",
        goal_pct=50,
        ideal_amount=1500,
        actual_pct=40,
        bucket_total=1200,
        available_to_spend=300,
        is_over_flag=False,
    )

    assert d.bucket == "fundamentals"
    assert d.is_over_flag is False
    assert d.available_to_spend == 300


# ============================================================
# BudgetResponse — the single payload the frontend reads
# ============================================================

def _bucket_view(bucket: str):
    from models import BucketDashboard, BucketView

    return BucketView(
        line_items=[],
        dashboard=BucketDashboard(
            bucket=bucket,
            goal_pct=0,
            ideal_amount=0,
            actual_pct=0,
            bucket_total=0,
            available_to_spend=0,
            is_over_flag=False,
        ),
    )


def test_allocation_status_has_no_message_field():
    """AllocationStatus carries only state + amount; the display string is the
    frontend's job (Task 29), so no 'message' field is serialised."""
    from models import AllocationStatus

    status = AllocationStatus(state="left", amount=400)

    assert "message" not in status.model_dump()
    assert not hasattr(status, "message")


def test_budget_response_constructs_full_nested_payload():
    """should build the full BudgetResponse: goals + buckets + allocation_status + scope"""
    from models import (
        BudgetResponse, BudgetGoals, BudgetBuckets, AllocationStatus,
    )

    resp = BudgetResponse(
        id="b1",
        scope="household",
        user_id=None,
        household_id="h1",
        month=date(2026, 7, 1),
        currency="$",
        goals=BudgetGoals(
            fundamentals_goal_pct=50,
            future_you_goal_pct=20,
            fun_goal_pct=30,
        ),
        total_income=3000,
        income_streams=[],
        buckets=BudgetBuckets(
            fundamentals=_bucket_view("fundamentals"),
            future_you=_bucket_view("future_you"),
            fun=_bucket_view("fun"),
        ),
        allocation_status=AllocationStatus(
            state="left",
            amount=3000,
        ),
    )

    assert resp.scope == "household"
    assert resp.user_id is None
    assert resp.household_id == "h1"
    assert resp.goals.future_you_goal_pct == 20
    assert resp.buckets.fun.dashboard.bucket == "fun"
    assert resp.allocation_status.state == "left"


def test_budget_response_rejects_invalid_scope():
    """should reject a scope outside personal/household"""
    from models import (
        BudgetResponse, BudgetGoals, BudgetBuckets, AllocationStatus,
    )

    with pytest.raises(ValidationError):
        BudgetResponse(
            id="b1",
            scope="global",
            user_id="u1",
            household_id=None,
            month=date(2026, 7, 1),
            currency="$",
            goals=BudgetGoals(
                fundamentals_goal_pct=50,
                future_you_goal_pct=20,
                fun_goal_pct=30,
            ),
            total_income=0,
            income_streams=[],
            buckets=BudgetBuckets(
                fundamentals=_bucket_view("fundamentals"),
                future_you=_bucket_view("future_you"),
                fun=_bucket_view("fun"),
            ),
            allocation_status=AllocationStatus(
                state="balanced", amount=0,
            ),
        )
