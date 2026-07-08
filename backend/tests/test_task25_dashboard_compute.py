"""
Task 25 — computed colour-flagged dashboard in the budget payload.

Assembler-level unit tests for ``database._assemble_budget``: given raw budget /
income-stream / line-item rows, it must produce a fully-computed per-bucket
dashboard (bucket_total, ideal_amount, actual_pct, available_to_spend,
is_over_flag) plus an allocation_status block. This is the real-row coverage of
the assembly path that Task 22 explicitly deferred to Task 25.

The compute is pure (no DB), so we exercise ``_assemble_budget`` directly with
plain dict rows — the same shape ``_serialize_row`` yields.

KEY CORRECTNESS RISK — the colour flag is ASYMMETRIC:
  * fundamentals / fun : RED (is_over_flag=True) when spending EXCEEDS the goal.
  * future_you         : RED (is_over_flag=True) when UNDER the goal (under-saving
                         is the bad case). REVERSED logic.
  * at exact equality  : flag is False for all three.
"""
from datetime import datetime, date, timezone

import database as db
from models import BudgetResponse


# ============================================================
# Row builders (plain dicts, as _serialize_row would produce)
# ============================================================

def _budget_row(scope="personal", user_id="user-abc", household_id=None,
                currency="$", fundamentals=50.0, future_you=20.0, fun=30.0):
    return {
        "id": "budget-1", "scope": scope, "user_id": user_id,
        "household_id": household_id, "month": date(2026, 7, 1),
        "currency": currency,
        "fundamentals_goal_pct": fundamentals,
        "future_you_goal_pct": future_you,
        "fun_goal_pct": fun,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _stream(label, amount):
    return {
        "id": f"s-{label}", "budget_id": "budget-1", "label": label,
        "amount": amount, "position": 0,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _item(bucket, label, amount):
    return {
        "id": f"i-{label}", "budget_id": "budget-1", "bucket": bucket,
        "label": label, "amount": amount, "position": 0,
        "created_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 7, 1, tzinfo=timezone.utc),
    }


def _dash(assembled, bucket):
    return assembled["buckets"][bucket]["dashboard"]


# ============================================================
# bucket_total — sum of line items per bucket
# ============================================================

def test_bucket_total_sums_line_items_within_each_bucket():
    """should sum line-item amounts per bucket and keep buckets independent"""
    assembled = db._assemble_budget(
        _budget_row(),
        [_stream("Salary", 4000.0)],
        [
            _item("fundamentals", "Rent", 1200.0),
            _item("fundamentals", "Groceries", 300.0),
            _item("future_you", "Investments", 500.0),
            _item("fun", "Eating out", 200.0),
        ],
    )
    assert _dash(assembled, "fundamentals")["bucket_total"] == 1500.0
    assert _dash(assembled, "future_you")["bucket_total"] == 500.0
    assert _dash(assembled, "fun")["bucket_total"] == 200.0


def test_bucket_with_no_line_items_has_zero_total():
    """a bucket with no line items should report bucket_total 0 (not crash)"""
    assembled = db._assemble_budget(
        _budget_row(),
        [_stream("Salary", 1000.0)],
        [_item("fundamentals", "Rent", 500.0)],
    )
    assert _dash(assembled, "fun")["bucket_total"] == 0.0
    assert _dash(assembled, "future_you")["bucket_total"] == 0.0


# ============================================================
# ideal_amount = goal_pct / 100 * total_income
# ============================================================

def test_ideal_amount_is_goal_pct_of_total_income():
    """should compute ideal_amount as goal_pct/100 * total_income"""
    assembled = db._assemble_budget(
        _budget_row(fundamentals=50.0, future_you=20.0, fun=30.0),
        [_stream("Salary", 2000.0), _stream("Side", 1000.0)],  # total 3000
        [],
    )
    assert _dash(assembled, "fundamentals")["ideal_amount"] == 1500.0  # 50% of 3000
    assert _dash(assembled, "future_you")["ideal_amount"] == 600.0     # 20% of 3000
    assert _dash(assembled, "fun")["ideal_amount"] == 900.0            # 30% of 3000


# ============================================================
# actual_pct = (bucket_total / total_income) * 100 (0-100 scale, guard div-by-zero)
# ============================================================

def test_actual_pct_is_bucket_total_over_income_as_0_to_100_percentage():
    """actual_pct is a 0-100 percentage (same scale as goal_pct), not a 0-1 fraction"""
    assembled = db._assemble_budget(
        _budget_row(),
        [_stream("Salary", 2000.0)],
        [_item("fundamentals", "Rent", 500.0)],  # 500/2000 = 25%
    )
    assert _dash(assembled, "fundamentals")["actual_pct"] == 25.0


def test_computed_money_and_pct_values_are_rounded_to_2dp():
    """bucket_total, ideal_amount, actual_pct, available_to_spend round to 2 dp"""
    # income 3000, goal 33.33% -> ideal 999.9 (33.33/100*3000); spend 1000/3.
    assembled = db._assemble_budget(
        _budget_row(fundamentals=33.33),
        [_stream("Salary", 3000.0)],
        [_item("fundamentals", "Rent", 333.333)],
    )
    dash = _dash(assembled, "fundamentals")
    assert dash["bucket_total"] == 333.33
    assert dash["ideal_amount"] == 999.9
    # 333.333 / 3000 * 100 = 11.1111 -> 11.11
    assert dash["actual_pct"] == 11.11
    # 999.9 - 333.33 = 666.57
    assert dash["available_to_spend"] == 666.57


def test_actual_pct_and_ideal_are_zero_when_total_income_is_zero():
    """total_income == 0 must not divide-by-zero: actual_pct=0, ideal_amount=0"""
    assembled = db._assemble_budget(
        _budget_row(),
        [],  # no income
        [_item("fundamentals", "Rent", 500.0)],
    )
    assert assembled["total_income"] == 0.0
    for bucket in ("fundamentals", "future_you", "fun"):
        assert _dash(assembled, bucket)["actual_pct"] == 0.0
        assert _dash(assembled, bucket)["ideal_amount"] == 0.0


# ============================================================
# available_to_spend = ideal_amount - bucket_total
# ============================================================

def test_available_to_spend_is_ideal_minus_actual():
    """should compute available_to_spend as ideal_amount - bucket_total (negative = overspent)"""
    assembled = db._assemble_budget(
        _budget_row(fundamentals=50.0),
        [_stream("Salary", 2000.0)],  # ideal fundamentals = 1000
        [_item("fundamentals", "Rent", 1200.0)],
    )
    assert _dash(assembled, "fundamentals")["available_to_spend"] == -200.0


# ============================================================
# is_over_flag — fundamentals / fun : RED when OVER goal
# ============================================================

def test_fundamentals_flag_red_when_over_goal():
    """fundamentals is_over_flag True when bucket_total exceeds ideal_amount"""
    assembled = db._assemble_budget(
        _budget_row(fundamentals=50.0),
        [_stream("Salary", 1000.0)],  # ideal = 500
        [_item("fundamentals", "Rent", 600.0)],
    )
    assert _dash(assembled, "fundamentals")["is_over_flag"] is True


def test_fundamentals_flag_not_red_when_under_goal():
    """fundamentals is_over_flag False when bucket_total is below ideal_amount"""
    assembled = db._assemble_budget(
        _budget_row(fundamentals=50.0),
        [_stream("Salary", 1000.0)],  # ideal = 500
        [_item("fundamentals", "Rent", 400.0)],
    )
    assert _dash(assembled, "fundamentals")["is_over_flag"] is False


def test_fun_flag_red_when_over_goal():
    """fun uses the same non-reversed rule as fundamentals: RED when over"""
    assembled = db._assemble_budget(
        _budget_row(fun=30.0),
        [_stream("Salary", 1000.0)],  # ideal fun = 300
        [_item("fun", "Travel", 500.0)],
    )
    assert _dash(assembled, "fun")["is_over_flag"] is True


# ============================================================
# is_over_flag — future_you : REVERSED (RED when UNDER goal)
# ============================================================

def test_future_you_flag_red_when_under_goal():
    """future_you is_over_flag True when UNDER goal (under-saving is bad) — REVERSED"""
    assembled = db._assemble_budget(
        _budget_row(future_you=20.0),
        [_stream("Salary", 1000.0)],  # ideal future_you = 200
        [_item("future_you", "Investments", 150.0)],  # UNDER goal
    )
    assert _dash(assembled, "future_you")["is_over_flag"] is True


def test_future_you_flag_not_red_when_over_goal():
    """future_you is_over_flag False when OVER goal (saving more is good) — REVERSED"""
    assembled = db._assemble_budget(
        _budget_row(future_you=20.0),
        [_stream("Salary", 1000.0)],  # ideal future_you = 200
        [_item("future_you", "Investments", 350.0)],  # OVER goal
    )
    assert _dash(assembled, "future_you")["is_over_flag"] is False


def test_flag_asymmetry_same_over_goal_scenario_flags_differently():
    """the SAME 'over goal' condition must flag fundamentals/fun RED but future_you NOT red"""
    # Every bucket spends 350 against an ideal of 200 (i.e. all OVER their goal).
    assembled = db._assemble_budget(
        _budget_row(fundamentals=20.0, future_you=20.0, fun=20.0),
        [_stream("Salary", 1000.0)],  # ideal per bucket = 200
        [
            _item("fundamentals", "Rent", 350.0),
            _item("future_you", "Investments", 350.0),
            _item("fun", "Travel", 350.0),
        ],
    )
    assert _dash(assembled, "fundamentals")["is_over_flag"] is True   # over -> RED
    assert _dash(assembled, "fun")["is_over_flag"] is True            # over -> RED
    assert _dash(assembled, "future_you")["is_over_flag"] is False    # over -> NOT red (reversed)


def test_flag_false_for_all_three_at_exact_equality():
    """at bucket_total == ideal_amount the flag is False for all three buckets"""
    # income 1000, each goal 200 -> ideal 200; spend exactly 200 in each bucket.
    assembled = db._assemble_budget(
        _budget_row(fundamentals=20.0, future_you=20.0, fun=20.0),
        [_stream("Salary", 1000.0)],
        [
            _item("fundamentals", "Rent", 200.0),
            _item("future_you", "Investments", 200.0),
            _item("fun", "Travel", 200.0),
        ],
    )
    for bucket in ("fundamentals", "future_you", "fun"):
        assert _dash(assembled, bucket)["is_over_flag"] is False


# ============================================================
# allocation_status — left / balanced / over
# ============================================================

# The compute layer returns ONLY {state, amount} — NO formatted display string.
# The frontend (Task 29) builds the copy from state + amount + budget currency.

def test_allocation_status_left_carries_state_and_amount_only():
    """allocated < income -> state 'left', amount = income - allocated, NO message"""
    assembled = db._assemble_budget(
        _budget_row(currency="£"),
        [_stream("Salary", 1000.0)],
        [_item("fundamentals", "Rent", 600.0)],  # allocated 600 < 1000
    )
    status = assembled["allocation_status"]
    assert status["state"] == "left"
    assert status["amount"] == 400.0
    assert "message" not in status


def test_allocation_status_balanced_when_allocated_equals_income():
    """allocated == income -> state 'balanced', amount 0, NO message"""
    assembled = db._assemble_budget(
        _budget_row(currency="$"),
        [_stream("Salary", 1000.0)],
        [
            _item("fundamentals", "Rent", 600.0),
            _item("fun", "Travel", 400.0),  # allocated 1000 == 1000
        ],
    )
    status = assembled["allocation_status"]
    assert status["state"] == "balanced"
    assert status["amount"] == 0.0
    assert "message" not in status


def test_allocation_status_over_carries_state_and_amount_only():
    """allocated > income -> state 'over', amount = allocated - income, NO message"""
    assembled = db._assemble_budget(
        _budget_row(currency="€"),
        [_stream("Salary", 1000.0)],
        [
            _item("fundamentals", "Rent", 900.0),
            _item("fun", "Travel", 300.0),  # allocated 1200 > 1000
        ],
    )
    status = assembled["allocation_status"]
    assert status["state"] == "over"
    assert status["amount"] == 200.0
    assert "message" not in status


def test_allocation_status_amount_is_rounded_to_2dp():
    """the allocation amount is rounded to 2 decimal places"""
    assembled = db._assemble_budget(
        _budget_row(currency="£"),
        [_stream("Salary", 5000.0)],
        [_item("fundamentals", "Rent", 750.128)],  # 5000 - 750.128 = 4249.872 -> 4249.87
    )
    status = assembled["allocation_status"]
    assert status["state"] == "left"
    assert status["amount"] == 4249.87
    assert "message" not in status


# ============================================================
# End-to-end — the assembled dict validates as a BudgetResponse
# ============================================================

def test_assembled_dict_validates_as_budget_response():
    """the computed assembler output must validate against the BudgetResponse model"""
    assembled = db._assemble_budget(
        _budget_row(),
        [_stream("Salary", 3000.0)],
        [
            _item("fundamentals", "Rent", 1400.0),
            _item("future_you", "Investments", 500.0),
            _item("fun", "Travel", 400.0),
        ],
    )
    model = BudgetResponse.model_validate(assembled)
    assert model.total_income == 3000.0
    assert model.buckets.fundamentals.dashboard.bucket_total == 1400.0
    assert model.allocation_status.state == "left"
