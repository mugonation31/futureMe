"""
Task 13 — Derive debt balance from the payment log

Acceptance criteria:
1. get_debts returns each debt with computed balance = starting_balance - SUM(confirmed payments), never below 0
2. create_debt sets starting_balance from submitted opening balance; derived balance equals starting_balance (no payments)
3. update_debt no longer allows direct mutation of balance; balance is dropped from allowed update fields
4. dashboard debt_summary.total_owed aggregates derived balances, not the stored balance column
5. No separately-mutated balance column is read as source of truth anywhere

Tests follow the mock pattern established in test_task12_monthly_expenses.py.
"""
import pytest
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock, patch
from pydantic import ValidationError


# ============================================================
# Shared helpers (mirror pattern from test_task12_monthly_expenses.py)
# ============================================================

def make_row(data: dict):
    """Create a fake asyncpg-style row from a dict."""
    return type("Row", (), {
        "__iter__": lambda self: iter(data.items()),
        "items": lambda self: data.items(),
        "keys": lambda self: data.keys(),
        "__getitem__": lambda self, k: data[k],
    })()


def make_mock_pool(mock_conn):
    """Build a mock asyncpg pool that yields mock_conn on acquire()."""
    mock_pool = MagicMock()
    acquire_ctx = MagicMock()
    acquire_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    acquire_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = acquire_ctx
    return mock_pool


# ============================================================
# Test 1 — get_debts SQL computes derived balance
# ============================================================

@pytest.mark.asyncio
async def test_should_compute_derived_balance_in_get_debts_sql():
    """should compute derived balance = starting_balance - SUM(confirmed payments) in get_debts SQL"""
    import database

    # Arrange — DB returns a row with starting_balance and a computed balance
    debt_row = make_row({
        "id": "debt-uuid",
        "household_id": "hh-uuid",
        "name": "Car Loan",
        "starting_balance": Decimal("5000.00"),
        "balance": Decimal("4500.00"),   # 5000 - 500 payment
        "interest_rate": Decimal("5.0"),
        "minimum_payment": Decimal("200.00"),
        "created_at": "2025-01-01",
        "updated_at": "2025-01-01",
    })

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [debt_row]

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.get_debts("hh-uuid")

    # Assert — get_debts returned the row and the SQL references starting_balance
    assert len(result) == 1
    assert result[0]["balance"] == Decimal("4500.00")

    # Verify the SQL uses starting_balance and references debt_payments
    call_args = mock_conn.fetch.call_args
    sql = call_args[0][0].lower()
    assert "starting_balance" in sql, (
        "get_debts SQL must reference starting_balance to compute derived balance"
    )
    assert "debt_payments" in sql, (
        "get_debts SQL must JOIN debt_payments to sum confirmed payments"
    )
    assert "coalesce" in sql, (
        "get_debts SQL must use COALESCE so debts with no payments return 0 for SUM"
    )


# ============================================================
# Test 2 — get_debts returns starting_balance when no payments exist
# ============================================================

@pytest.mark.asyncio
async def test_should_return_starting_balance_as_balance_when_no_payments():
    """should return derived balance equal to starting_balance when no payments exist"""
    import database

    # Arrange — DB returns computed balance equal to starting_balance (no payments)
    debt_row = make_row({
        "id": "debt-uuid",
        "household_id": "hh-uuid",
        "name": "Mortgage",
        "starting_balance": Decimal("200000.00"),
        "balance": Decimal("200000.00"),   # no payments yet
        "interest_rate": Decimal("3.5"),
        "minimum_payment": Decimal("1000.00"),
        "created_at": "2025-01-01",
        "updated_at": "2025-01-01",
    })

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [debt_row]

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.get_debts("hh-uuid")

    # Assert — balance equals starting_balance (COALESCE of empty SUM → 0)
    assert result[0]["balance"] == Decimal("200000.00")
    assert result[0]["starting_balance"] == Decimal("200000.00")


# ============================================================
# Test 3 — derived balance never goes below zero
# ============================================================

@pytest.mark.asyncio
async def test_should_floor_derived_balance_at_zero():
    """should return derived balance of 0 when payments exceed starting_balance"""
    import database

    # Arrange — DB has applied GREATEST(0, ...) so balance is 0 for overpaid debt
    debt_row = make_row({
        "id": "debt-uuid",
        "household_id": "hh-uuid",
        "name": "Overpaid Debt",
        "starting_balance": Decimal("100.00"),
        "balance": Decimal("0.00"),   # floored at 0
        "interest_rate": Decimal("0.0"),
        "minimum_payment": Decimal("50.00"),
        "created_at": "2025-01-01",
        "updated_at": "2025-01-01",
    })

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [debt_row]

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.get_debts("hh-uuid")

    # Assert — balance is 0, not negative
    assert result[0]["balance"] == Decimal("0.00")

    # SQL must use GREATEST to floor at 0
    call_args = mock_conn.fetch.call_args
    sql = call_args[0][0].lower()
    assert "greatest" in sql, (
        "get_debts SQL must use GREATEST(0, ...) to floor derived balance at zero"
    )


# ============================================================
# Test 4 — create_debt sets starting_balance from submitted balance
# ============================================================

@pytest.mark.asyncio
async def test_should_set_starting_balance_from_submitted_balance_in_create_debt():
    """should set starting_balance from the submitted opening balance in create_debt"""
    import database
    from models import DebtCreate

    # Arrange
    mock_conn = AsyncMock()
    created_row = make_row({
        "id": "new-debt-uuid",
        "household_id": "hh-uuid",
        "name": "Student Loan",
        "starting_balance": Decimal("15000.00"),
        "balance": Decimal("15000.00"),
        "interest_rate": Decimal("4.5"),
        "minimum_payment": Decimal("300.00"),
        "created_at": "2025-01-01",
        "updated_at": "2025-01-01",
    })
    mock_conn.fetchrow.return_value = created_row

    mock_pool = make_mock_pool(mock_conn)

    data = DebtCreate(name="Student Loan", balance=15000.00, interest_rate=4.5, minimum_payment=300.0)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.create_debt("hh-uuid", "user-uuid", data)

    # Assert — returned debt has starting_balance and balance both set to the opening amount
    assert result["starting_balance"] == Decimal("15000.00")
    assert result["balance"] == Decimal("15000.00")

    # The INSERT SQL must include starting_balance, not just balance
    call_args = mock_conn.fetchrow.call_args
    sql = call_args[0][0].lower()
    assert "starting_balance" in sql, (
        "create_debt INSERT must write to starting_balance column, not just balance"
    )


# ============================================================
# Test 5 — update_debt rejects balance as an update field
# ============================================================

@pytest.mark.asyncio
async def test_should_reject_balance_field_in_update_debt():
    """should raise ValueError when balance is included in update_debt payload"""
    import database
    from models import DebtUpdate

    # Arrange — build a DebtUpdate-like object that has balance set
    # We use a plain object because DebtUpdate should not allow balance,
    # but we need to test the database layer defence too.
    class FakeUpdate:
        def model_dump(self, exclude_unset=True):
            return {"balance": 9999.0}

    mock_conn = AsyncMock()
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        with pytest.raises(ValueError, match="[Bb]alance"):
            await database.update_debt("debt-uuid", "hh-uuid", FakeUpdate())


# ============================================================
# Test 6 — dashboard total_owed uses derived balances
# ============================================================

@pytest.mark.asyncio
async def test_should_aggregate_derived_balances_in_dashboard_total_owed():
    """should aggregate derived balances in dashboard debt_summary.total_owed, not stored balance column"""
    import database

    # Arrange
    income_row = make_row({"total_income": Decimal("3000.00")})
    # The debt summary row comes from a query that sums computed balance
    debt_row = make_row({
        "total_owed": Decimal("9500.00"),   # sum of derived balances
        "total_minimum_payments": Decimal("300.00"),
        "debt_count": 2,
    })
    ef_row = make_row({"current_amount": Decimal("0.00"), "target_amount": Decimal("5000.00")})

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [income_row, debt_row, ef_row]
    mock_conn.fetch.return_value = []

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool), \
         patch("database.get_monthly_expenses", new_callable=AsyncMock, return_value=500.0):
        result = await database.get_dashboard_stats("hh-uuid")

    # Assert — total_owed comes from the derived balance aggregation
    assert result["debt_summary"]["total_owed"] == 9500.0

    # The debt SQL must reference debt_payments (JOIN) and NOT use the raw balance column directly
    # We find the fetchrow call that returned the debt_row (index 1 = second call)
    fetchrow_calls = mock_conn.fetchrow.call_args_list
    debt_sql = fetchrow_calls[1][0][0].lower()
    assert "debt_payments" in debt_sql, (
        "dashboard debt SQL must reference debt_payments to aggregate derived balances"
    )
    assert "starting_balance" in debt_sql, (
        "dashboard debt SQL must reference starting_balance to compute derived total_owed"
    )


# ============================================================
# Test 7 — DebtResponse includes starting_balance field
# ============================================================

def test_should_include_starting_balance_in_debt_response_model():
    """should include starting_balance field in DebtResponse"""
    from models import DebtResponse
    import inspect

    # Act — inspect the model fields
    fields = DebtResponse.model_fields

    # Assert
    assert "starting_balance" in fields, (
        "DebtResponse must expose a starting_balance field so clients can see the original balance"
    )


# ============================================================
# Test 8 — DebtUpdate does NOT allow balance field
# ============================================================

def test_should_not_allow_balance_field_in_debt_update_model():
    """should NOT allow balance field in DebtUpdate (balance is derived, not mutated directly)"""
    from models import DebtUpdate

    # Arrange — try to create a DebtUpdate with a balance field
    with pytest.raises((ValidationError, TypeError)):
        # Pydantic v2 with extra='forbid' would raise ValidationError
        # If the field simply doesn't exist, passing it as a kwarg raises TypeError
        DebtUpdate(balance=500.0)

    # Also verify balance is not in the model's defined fields
    fields = DebtUpdate.model_fields
    assert "balance" not in fields, (
        "DebtUpdate must NOT declare a balance field — balance is derived from payments"
    )
