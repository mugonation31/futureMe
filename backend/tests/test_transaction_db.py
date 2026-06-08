"""
Tests for transaction/category database operations (Task 22).
Uses unittest.mock to avoid real DB connections.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, date


# ============================================================
# Helpers — mirrors test_database_household.py patterns
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


SAMPLE_CATEGORY = {
    "id": "cat-uuid-001",
    "household_id": "household-uuid-123",
    "name": "Groceries",
    "icon": None,
    "color": "#FF0000",
    "is_default": False,
    "created_at": datetime(2026, 1, 1, 0, 0, 0),
}

SAMPLE_TRANSACTION = {
    "id": "txn-uuid-001",
    "household_id": "household-uuid-123",
    "user_id": "user-abc",
    "category_id": "cat-uuid-001",
    "category_name": "Groceries",
    "amount": 55.00,
    "type": "expense",
    "description": "Weekly shop",
    "date": date(2026, 6, 1),
    "created_at": datetime(2026, 6, 1, 10, 0, 0),
    "updated_at": datetime(2026, 6, 1, 10, 0, 0),
}


# ============================================================
# Test 1: get_categories returns a list
# ============================================================

@pytest.mark.asyncio
async def test_get_categories_returns_list():
    """should return a list of category dicts when pool fetchall returns rows"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [make_row(SAMPLE_CATEGORY)]
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_categories("household-uuid-123")

    # Assert
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["name"] == "Groceries"


# ============================================================
# Test 2: create_transaction returns a dict
# ============================================================

@pytest.mark.asyncio
async def test_create_transaction_returns_dict():
    """should return a transaction dict when pool fetchrow returns a row"""
    # Arrange
    mock_conn = AsyncMock()
    # First fetchrow for INSERT, second for SELECT with join
    mock_conn.fetchrow.side_effect = [
        make_row({**SAMPLE_TRANSACTION, "id": "txn-uuid-001"}),
        make_row(SAMPLE_TRANSACTION),
    ]
    mock_pool = make_mock_pool(mock_conn)

    from models import TransactionCreate
    tx_data = TransactionCreate(amount=55.00, type="expense", description="Weekly shop")

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.create_transaction(
            household_id="household-uuid-123",
            user_id="user-abc",
            data=tx_data,
        )

    # Assert
    assert result["amount"] == 55.00
    assert result["type"] == "expense"
    assert result["household_id"] == "household-uuid-123"


# ============================================================
# Test 3: get_transactions passes month filter
# ============================================================

@pytest.mark.asyncio
async def test_get_transactions_with_month_filter():
    """should pass the month parameter to the query when month is provided"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [make_row(SAMPLE_TRANSACTION)]
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_transactions(
            household_id="household-uuid-123",
            month="2026-06",
        )

    # Assert — result is a list and the month param was forwarded
    assert isinstance(result, list)
    # Verify the month string was passed as a query param
    call_args = mock_conn.fetch.call_args
    assert "2026-06" in call_args[0]


# ============================================================
# Test 4: delete_transaction returns True on success
# ============================================================

@pytest.mark.asyncio
async def test_delete_transaction_returns_true_on_success():
    """should return True when a transaction row is deleted"""
    # Arrange — execute returns a status string like "DELETE 1"
    mock_conn = AsyncMock()
    mock_conn.execute.return_value = "DELETE 1"
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.delete_transaction(
            household_id="household-uuid-123",
            transaction_id="txn-uuid-001",
        )

    # Assert
    assert result is True


# ============================================================
# Test 5: get_dashboard_stats returns zeros when no household
# ============================================================

@pytest.mark.asyncio
async def test_get_dashboard_stats_returns_zeros_when_no_household():
    """should return zeroed stats with empty category_breakdown when household_id is None"""
    with patch("database.get_pool", new_callable=AsyncMock):
        import database
        result = await database.get_dashboard_stats(user_id="user-abc", household_id=None)

    # Assert
    assert result["total_spent"] == 0.0
    assert result["total_budget"] == 0.0
    assert result["remaining_budget"] == 0.0
    assert result["savings_rate"] == 0.0
    assert result["category_breakdown"] == []
