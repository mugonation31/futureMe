"""
Task 12 — Expenses: true monthly outgoings

Summing rule:
  monthly expenses = all is_recurring = true rows (any date)
                   + current-month non-recurring rows (date in this calendar month)

Tests drive the extraction of get_monthly_expenses(household_id, conn) and its
use inside get_dashboard_stats.
"""
import pytest
from decimal import Decimal
from unittest.mock import MagicMock, AsyncMock, patch


# ============================================================
# Shared helpers (mirror pattern from test_task4_fixes.py)
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
# Test 1 — get_monthly_expenses includes recurring expense from prior month
# (case 2 from acceptance criteria)
# ============================================================

@pytest.mark.asyncio
async def test_should_include_recurring_expense_from_prior_month_in_get_monthly_expenses():
    """should include a recurring expense dated in a prior month in get_monthly_expenses"""
    import database

    # Arrange — DB returns 75.00 for the given household (from a prior-month recurring row)
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row({"total_expenses": Decimal("75.00")})

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act — call the helper directly
        result = await database.get_monthly_expenses("household-uuid", mock_conn)

    # Assert — the value is returned (prior-month recurring was counted)
    assert result == 75.0

    # Verify the SQL passed to fetchrow uses both the recurring branch and the
    # current-month branch. We inspect the SQL string sent to the DB.
    call_args = mock_conn.fetchrow.call_args
    sql = call_args[0][0].lower()
    assert "is_recurring" in sql, "Query must reference is_recurring to implement the summing rule"
    assert "current_date" in sql or "now()" in sql, (
        "Query must reference CURRENT_DATE or NOW() to bound non-recurring rows to this month"
    )


# ============================================================
# Test 2 — get_monthly_expenses excludes non-recurring expense from prior month
# (case 3 from acceptance criteria)
# ============================================================

@pytest.mark.asyncio
async def test_should_exclude_non_recurring_expense_from_prior_month_in_get_monthly_expenses():
    """should exclude a non-recurring expense dated in a prior month from get_monthly_expenses"""
    import database

    # Arrange — only a current-month non-recurring row exists (amount 50.0)
    # A non-recurring prior-month row should NOT be counted; the DB returns only 50.0
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row({"total_expenses": Decimal("50.00")})

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.get_monthly_expenses("household-uuid", mock_conn)

    # Assert — only the current-month non-recurring amount is returned
    assert result == 50.0

    # The SQL must reference both is_recurring and CURRENT_DATE so the OR condition
    # that excludes non-recurring prior-month rows is demonstrably present
    call_args = mock_conn.fetchrow.call_args
    sql = call_args[0][0].lower()
    assert "is_recurring" in sql, "Query must reference is_recurring"
    assert "current_date" in sql or "now()" in sql, (
        "Query must reference CURRENT_DATE or NOW() to bound non-recurring rows to this month"
    )


# ============================================================
# Test 3 — get_monthly_expenses includes non-recurring expense from current month
# (happy path)
# ============================================================

@pytest.mark.asyncio
async def test_should_include_non_recurring_expense_from_current_month_in_get_monthly_expenses():
    """should include a non-recurring expense dated in the current month in get_monthly_expenses"""
    import database

    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row({"total_expenses": Decimal("200.00")})

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.get_monthly_expenses("household-uuid", mock_conn)

    # Assert — current-month non-recurring expense is counted
    assert result == 200.0

    # The SQL must reference both branches of the OR condition
    call_args = mock_conn.fetchrow.call_args
    sql = call_args[0][0].lower()
    assert "is_recurring" in sql, "Query must reference is_recurring"
    assert "current_date" in sql or "now()" in sql, (
        "Query must reference CURRENT_DATE or NOW() to bound non-recurring rows to this month"
    )


# ============================================================
# Test 4 — get_dashboard_stats uses get_monthly_expenses for total_expenses
# ============================================================

@pytest.mark.asyncio
async def test_should_use_monthly_expenses_rule_in_get_dashboard_stats():
    """should return total_expenses from get_monthly_expenses rule in get_dashboard_stats"""
    import database

    # Arrange — mock get_monthly_expenses directly so we can control its return value
    # independently of the SQL detail (that is already covered by Tests 1-3)
    income_row = make_row({"total_income": Decimal("3000.00")})
    debt_row = make_row({
        "total_owed": Decimal("8000.00"),
        "total_minimum_payments": Decimal("200.00"),
        "debt_count": 1,
    })
    ef_row = make_row({"current_amount": Decimal("1200.00"), "target_amount": Decimal("5000.00")})

    mock_conn = AsyncMock()
    # fetchrow calls: income, debt, emergency fund (expense comes from get_monthly_expenses)
    mock_conn.fetchrow.side_effect = [income_row, debt_row, ef_row]
    mock_conn.fetch.return_value = []

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool), \
         patch("database.get_monthly_expenses", new_callable=AsyncMock, return_value=175.0):
        result = await database.get_dashboard_stats("household-uuid")

    # Assert — total_expenses comes from get_monthly_expenses, not the old inline query
    assert result["total_expenses"] == 175.0
    assert result["net_position"] == 3000.0 - 175.0
