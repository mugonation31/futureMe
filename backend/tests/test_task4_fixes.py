"""
Task 4 fix tests: allowlist validation on update_* functions,
months_covered None when total_expenses is zero,
and EmergencyFundStatus.months_covered defaults to None.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


# ============================================================
# Shared helpers (mirror pattern from test_database_household.py)
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
# Test 1: update_account raises ValueError for invalid field
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_value_error_when_update_account_receives_field_not_in_allowlist():
    """should raise ValueError when update_account receives a field not in the allowlist"""
    import database

    # Arrange — a mock data object that exposes an invalid field
    mock_data = MagicMock()
    mock_data.model_dump.return_value = {"name": "Good Name", "evil_field": "injection"}

    mock_conn = AsyncMock()
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act / Assert
        with pytest.raises(ValueError, match="Invalid field"):
            await database.update_account("account-id", "household-id", mock_data)


# ============================================================
# Test 2: update_income_entry raises ValueError for invalid field
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_value_error_when_update_income_entry_receives_field_not_in_allowlist():
    """should raise ValueError when update_income_entry receives a field not in the allowlist"""
    import database

    # Arrange
    mock_data = MagicMock()
    mock_data.model_dump.return_value = {"source": "Salary", "injected": "bad"}

    mock_conn = AsyncMock()
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act / Assert
        with pytest.raises(ValueError, match="Invalid field"):
            await database.update_income_entry("entry-id", "household-id", mock_data)


# ============================================================
# Test 3: update_expense raises ValueError for invalid field
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_value_error_when_update_expense_receives_field_not_in_allowlist():
    """should raise ValueError when update_expense receives a field not in the allowlist"""
    import database

    # Arrange
    mock_data = MagicMock()
    mock_data.model_dump.return_value = {"amount": 50.0, "admin_override": True}

    mock_conn = AsyncMock()
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act / Assert
        with pytest.raises(ValueError, match="Invalid field"):
            await database.update_expense("expense-id", "household-id", mock_data)


# ============================================================
# Test 4: update_debt raises ValueError for invalid field
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_value_error_when_update_debt_receives_field_not_in_allowlist():
    """should raise ValueError when update_debt receives a field not in the allowlist"""
    import database

    # Arrange
    mock_data = MagicMock()
    mock_data.model_dump.return_value = {"balance": 1000.0, "extra": "hack"}

    mock_conn = AsyncMock()
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act / Assert
        with pytest.raises(ValueError, match="Invalid field"):
            await database.update_debt("debt-id", "household-id", mock_data)


# ============================================================
# Test 5: update_savings_goal raises ValueError for invalid field
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_value_error_when_update_savings_goal_receives_field_not_in_allowlist():
    """should raise ValueError when update_savings_goal receives a field not in the allowlist"""
    import database

    # Arrange
    mock_data = MagicMock()
    mock_data.model_dump.return_value = {"name": "Goal", "household_id": "override"}

    mock_conn = AsyncMock()
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act / Assert
        with pytest.raises(ValueError, match="Invalid field"):
            await database.update_savings_goal("goal-id", "household-id", mock_data)


# ============================================================
# Test 6: get_dashboard_stats returns months_covered as None
#         when total_expenses is zero
# ============================================================

@pytest.mark.asyncio
async def test_should_return_months_covered_as_none_when_total_expenses_is_zero():
    """should return months_covered as None when total_expenses is zero in get_dashboard_stats"""
    import database

    # Arrange — build fake asyncpg rows
    income_row = make_row({"total_income": 3000.0})
    expense_row = make_row({"total_expenses": 0.0})   # <-- zero expenses
    debt_row = make_row({"total_owed": 0.0, "total_minimum_payments": 0.0, "debt_count": 0})
    ef_row = make_row({"current_amount": 1200.0, "target_amount": 5000.0})

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [income_row, expense_row, debt_row, ef_row]
    mock_conn.fetch.return_value = []

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        # Act
        result = await database.get_dashboard_stats("household-id")

    # Assert
    assert result["emergency_fund_status"]["months_covered"] is None


# ============================================================
# Test 7: EmergencyFundStatus.months_covered defaults to None
# ============================================================

def test_should_create_emergency_fund_status_with_months_covered_defaulting_to_none():
    """should create EmergencyFundStatus with months_covered defaulting to None"""
    from models import EmergencyFundStatus

    # Arrange / Act
    ef = EmergencyFundStatus()

    # Assert
    assert ef.months_covered is None
