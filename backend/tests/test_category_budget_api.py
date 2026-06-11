"""
Tests for category budget API endpoints (Tasks 32-35).
Uses httpx AsyncClient pattern matching test_transaction_api.py.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from datetime import datetime

from models import CurrentUserContext


# ============================================================
# Shared fixtures
# ============================================================

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
# Test 1: GET /api/category-budgets — 403 when no household
# ============================================================

@pytest.mark.asyncio
async def test_get_category_budgets_returns_403_when_no_household():
    """should return 403 when GET /api/category-budgets and user has no household"""
    # Arrange
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.get("/api/category-budgets")

    # Assert
    assert response.status_code == 403


# ============================================================
# Test 2: GET /api/category-budgets — returns list
# ============================================================

@pytest.mark.asyncio
async def test_get_category_budgets_returns_list():
    """should return a list of category budgets when GET /api/category-budgets and user has a household"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_category_budgets", new_callable=AsyncMock, return_value=[SAMPLE_CATEGORY_BUDGET]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/category-budgets")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["category_name"] == "Groceries"
    assert data[0]["monthly_limit"] == 200.0


# ============================================================
# Test 3: PUT /api/category-budgets — 403 when no household
# ============================================================

@pytest.mark.asyncio
async def test_put_category_budget_returns_403_when_no_household():
    """should return 403 when PUT /api/category-budgets and user has no household"""
    # Arrange
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.put(
            "/api/category-budgets",
            json={"category_id": VALID_UUID, "monthly_limit": 200.0},
        )

    # Assert
    assert response.status_code == 403


# ============================================================
# Test 4: PUT /api/category-budgets — 422 when payload is invalid
# ============================================================

@pytest.mark.asyncio
async def test_put_category_budget_returns_422_when_monthly_limit_is_zero():
    """should return 422 when PUT /api/category-budgets with monthly_limit of 0"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.put(
            "/api/category-budgets",
            json={"category_id": VALID_UUID, "monthly_limit": 0},
        )

    # Assert
    assert response.status_code == 422


# ============================================================
# Test 5: PUT /api/category-budgets — 200 upsert success
# ============================================================

@pytest.mark.asyncio
async def test_put_category_budget_returns_200_on_upsert_success():
    """should return 200 with the upserted budget when PUT /api/category-budgets succeeds"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_member_role", new_callable=AsyncMock, return_value="owner"), \
         patch("database.upsert_category_budget", new_callable=AsyncMock, return_value=SAMPLE_CATEGORY_BUDGET):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.put(
                "/api/category-budgets",
                json={"category_id": VALID_UUID, "monthly_limit": 200.0},
            )

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["category_name"] == "Groceries"
    assert data["monthly_limit"] == 200.0


# ============================================================
# Test 6: DELETE /api/category-budgets/{category_id} — 403 when no household
# ============================================================

@pytest.mark.asyncio
async def test_delete_category_budget_returns_403_when_no_household():
    """should return 403 when DELETE /api/category-budgets/{id} and user has no household"""
    # Arrange
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.delete(f"/api/category-budgets/{VALID_UUID}")

    # Assert
    assert response.status_code == 403


# ============================================================
# Test 7: DELETE /api/category-budgets/{category_id} — 404 when not found
# ============================================================

@pytest.mark.asyncio
async def test_delete_category_budget_returns_404_when_not_found():
    """should return 404 when DELETE /api/category-budgets/{id} and budget does not exist"""
    # Arrange
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_member_role", new_callable=AsyncMock, return_value="owner"), \
         patch("database.delete_category_budget", new_callable=AsyncMock, return_value=False):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.delete(f"/api/category-budgets/{VALID_UUID}")

    # Assert
    assert response.status_code == 404


# ============================================================
# Test 8: DELETE /api/category-budgets/{category_id} — 403 when not owner
# ============================================================

@pytest.mark.asyncio
async def test_delete_category_budget_returns_403_when_not_owner():
    """should return 403 when DELETE /api/category-budgets/{id} and user role is member"""
    # Arrange — member role, not owner
    context = make_context(user_id="user-other", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_member_role", new_callable=AsyncMock, return_value="member"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.delete(f"/api/category-budgets/{VALID_UUID}")

    # Assert
    assert response.status_code == 403


# ============================================================
# Test 9: DELETE /api/category-budgets/{category_id} — 204 on success
# ============================================================

@pytest.mark.asyncio
async def test_delete_category_budget_returns_204_when_owner():
    """should return 204 when DELETE /api/category-budgets/{id} and user is household owner"""
    # Arrange — owner role
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_member_role", new_callable=AsyncMock, return_value="owner"), \
         patch("database.delete_category_budget", new_callable=AsyncMock, return_value=True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.delete(f"/api/category-budgets/{VALID_UUID}")

    # Assert
    assert response.status_code == 204
