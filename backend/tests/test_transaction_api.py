"""
Tests for transaction and category API endpoints (Task 23).
Uses httpx AsyncClient pattern matching test_households.py.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from datetime import datetime, date

from models import CurrentUserContext


# ============================================================
# Shared fixtures
# ============================================================

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


def make_context(user_id: str = "user-abc", household_id: str | None = None) -> CurrentUserContext:
    return CurrentUserContext(user_id=user_id, household_id=household_id)


def get_app_with_context(context: CurrentUserContext):
    """Return the FastAPI app with get_current_user overridden to the given context."""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides[get_current_user] = lambda: context
        return app


# ============================================================
# Test 1: GET /api/categories — 403 when user has no household
# ============================================================

@pytest.mark.asyncio
async def test_get_categories_returns_403_when_no_household():
    """should return 403 when GET /api/categories and user has no household"""
    # Arrange
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.get("/api/categories")

    # Assert
    assert response.status_code == 403


# ============================================================
# Test 2: GET /api/categories — returns list
# ============================================================

@pytest.mark.asyncio
async def test_get_categories_returns_list():
    """should return a list of categories when GET /api/categories and user has a household"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_categories", new_callable=AsyncMock, return_value=[SAMPLE_CATEGORY]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/categories")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["name"] == "Groceries"


# ============================================================
# Test 3: POST /api/transactions — 201 created
# ============================================================

@pytest.mark.asyncio
async def test_create_transaction_returns_201():
    """should return 201 and transaction data when POST /api/transactions succeeds"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.create_transaction", new_callable=AsyncMock, return_value=SAMPLE_TRANSACTION):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/transactions",
                json={"amount": 55.00, "type": "expense", "description": "Weekly shop"},
            )

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == 55.00
    assert data["type"] == "expense"


# ============================================================
# Test 4: GET /api/transactions — filters by month query param
# ============================================================

@pytest.mark.asyncio
async def test_get_transactions_filters_by_month():
    """should pass month query param when GET /api/transactions?month=2026-06"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    mock_get_transactions = AsyncMock(return_value=[SAMPLE_TRANSACTION])

    with patch("database.get_transactions", mock_get_transactions):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/transactions?month=2026-06")

    # Assert
    assert response.status_code == 200
    # Verify the month argument was forwarded to the DB call
    mock_get_transactions.assert_called_once_with("household-uuid-123", "2026-06")


# ============================================================
# Test 5: DELETE /api/transactions/{id} — 403 when not owner and not creator
# ============================================================

@pytest.mark.asyncio
async def test_delete_transaction_returns_403_when_not_owner():
    """should return 403 when deleting another user's transaction and role is not owner"""
    # Arrange — the transaction belongs to a different user
    context = make_context(user_id="user-other", household_id="household-uuid-123")
    app = get_app_with_context(context)

    # Transaction was created by "user-abc", current user is "user-other" with member role
    with patch("database.get_transaction", new_callable=AsyncMock, return_value=SAMPLE_TRANSACTION), \
         patch("database.get_member_role", new_callable=AsyncMock, return_value="member"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.delete("/api/transactions/txn-uuid-001")

    # Assert
    assert response.status_code == 403


# ============================================================
# Test 6: DELETE /api/transactions/{id} — 204 no content
# ============================================================

@pytest.mark.asyncio
async def test_delete_transaction_returns_204():
    """should return 204 when deleting a transaction the user owns"""
    # Arrange — the transaction belongs to the current user
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_transaction", new_callable=AsyncMock, return_value=SAMPLE_TRANSACTION), \
         patch("database.delete_transaction", new_callable=AsyncMock, return_value=True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.delete("/api/transactions/txn-uuid-001")

    # Assert
    assert response.status_code == 204
