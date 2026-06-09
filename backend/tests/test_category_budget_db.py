"""
Tests for category_budget database operations (Task 31).
Uses unittest.mock to avoid real DB connections.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime


# ============================================================
# Helpers — mirrors test_transaction_db.py patterns
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


def attach_transaction(mock_conn):
    """Configure mock_conn.transaction() as a sync call returning an async context manager.

    asyncpg's conn.transaction() is synchronous; AsyncMock makes every attribute
    async by default, which breaks 'async with conn.transaction()'.
    """
    tx_ctx = MagicMock()
    tx_ctx.__aenter__ = AsyncMock(return_value=None)
    tx_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_conn.transaction = MagicMock(return_value=tx_ctx)


VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  # 36 chars

SAMPLE_CATEGORY_BUDGET = {
    "id": "budget-uuid-001",
    "household_id": "household-uuid-123",
    "category_id": VALID_UUID,
    "category_name": "Groceries",
    "monthly_limit": 200.0,
    "created_at": datetime(2026, 1, 1, 0, 0, 0),
    "updated_at": datetime(2026, 1, 1, 0, 0, 0),
}


# ============================================================
# Test 6: upsert_category_budget — insert path
# ============================================================

@pytest.mark.asyncio
async def test_upsert_category_budget_returns_dict_with_category_name():
    """should return a dict with category_name when upsert_category_budget is called (insert path)"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(SAMPLE_CATEGORY_BUDGET)
    attach_transaction(mock_conn)
    mock_pool = make_mock_pool(mock_conn)

    from models import CategoryBudgetUpsert
    data = CategoryBudgetUpsert(category_id=VALID_UUID, monthly_limit=200.0)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.upsert_category_budget(
            household_id="household-uuid-123",
            data=data,
        )

    # Assert
    assert result["category_name"] == "Groceries"
    assert result["monthly_limit"] == 200.0
    assert result["household_id"] == "household-uuid-123"


# ============================================================
# Test 7: upsert_category_budget — update path
# ============================================================

@pytest.mark.asyncio
async def test_upsert_category_budget_updates_monthly_limit():
    """should update monthly_limit when upsert_category_budget is called again for the same keys (update path)"""
    # Arrange — second call returns updated monthly_limit
    updated_budget = {**SAMPLE_CATEGORY_BUDGET, "monthly_limit": 350.0}
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(updated_budget)
    attach_transaction(mock_conn)
    mock_pool = make_mock_pool(mock_conn)

    from models import CategoryBudgetUpsert
    data = CategoryBudgetUpsert(category_id=VALID_UUID, monthly_limit=350.0)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.upsert_category_budget(
            household_id="household-uuid-123",
            data=data,
        )

    # Assert
    assert result["monthly_limit"] == 350.0
    # Verify ON CONFLICT upsert SQL was used (first fetchrow call is the INSERT … ON CONFLICT)
    first_call_sql = mock_conn.fetchrow.call_args_list[0][0][0]
    assert "ON CONFLICT" in first_call_sql


# ============================================================
# Test 8: get_category_budgets returns a list of dicts with category_name
# ============================================================

@pytest.mark.asyncio
async def test_get_category_budgets_returns_list_with_category_name():
    """should return a list of dicts with category_name when get_category_budgets is called"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [make_row(SAMPLE_CATEGORY_BUDGET)]
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_category_budgets(household_id="household-uuid-123")

    # Assert
    assert isinstance(result, list)
    assert len(result) == 1
    assert result[0]["category_name"] == "Groceries"
    assert result[0]["monthly_limit"] == 200.0


# ============================================================
# Test 9: delete_category_budget returns True on success
# ============================================================

@pytest.mark.asyncio
async def test_delete_category_budget_returns_true_on_success():
    """should return True when delete_category_budget deletes a row"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.execute.return_value = "DELETE 1"
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.delete_category_budget(
            household_id="household-uuid-123",
            category_id="cat-uuid-001",
        )

    # Assert
    assert result is True


# ============================================================
# Test 10: delete_category_budget returns False when no row found
# ============================================================

@pytest.mark.asyncio
async def test_delete_category_budget_returns_false_when_no_row():
    """should return False when delete_category_budget finds no matching row"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.execute.return_value = "DELETE 0"
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.delete_category_budget(
            household_id="household-uuid-123",
            category_id="cat-uuid-999",
        )

    # Assert
    assert result is False


# ============================================================
# Test 11: get_dashboard_stats includes budget field in category_breakdown
# ============================================================

@pytest.mark.asyncio
async def test_get_dashboard_stats_category_breakdown_includes_budget():
    """should include budget field in each category_breakdown entry from get_dashboard_stats"""
    # Arrange
    from datetime import date

    settings_row = make_row({"monthly_budget": 500.0})
    spent_row = make_row({"total_spent": 120.0})
    category_row = make_row({
        "category_name": "Groceries",
        "spent": 120.0,
        "budget": 200.0,
    })

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [settings_row, spent_row]
    mock_conn.fetch.return_value = [category_row]
    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_dashboard_stats(
            user_id="user-abc",
            household_id="household-uuid-123",
        )

    # Assert
    assert len(result["category_breakdown"]) == 1
    entry = result["category_breakdown"][0]
    assert "budget" in entry
    assert entry["budget"] == 200.0
    assert entry["category_name"] == "Groceries"
    assert entry["spent"] == 120.0
