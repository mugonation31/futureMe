"""
Tests for new resource API endpoints:
  GET/POST        /api/accounts
  PATCH/DELETE    /api/accounts/{id}
  GET/POST        /api/income
  GET/POST        /api/expenses
  GET/POST        /api/debts
  GET/POST        /api/savings-goals
  GET             /api/dashboard
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from datetime import datetime, date

from models import CurrentUserContext


# ============================================================
# Shared fixtures
# ============================================================

HOUSEHOLD_ID = "household-uuid-123"
USER_ID = "user-abc"

SAMPLE_ACCOUNT = {
    "id": "account-uuid-1",
    "household_id": HOUSEHOLD_ID,
    "name": "Current Account",
    "type": "checking",
    "balance": 1500.0,
    "currency": "GBP",
    "created_at": datetime(2026, 1, 15, 10, 0, 0),
    "updated_at": datetime(2026, 1, 15, 10, 0, 0),
}

SAMPLE_INCOME = {
    "id": "income-uuid-1",
    "household_id": HOUSEHOLD_ID,
    "user_id": USER_ID,
    "source": "Salary",
    "amount": 3000.0,
    "frequency": "monthly",
    "created_at": datetime(2026, 1, 15, 10, 0, 0),
    "updated_at": datetime(2026, 1, 15, 10, 0, 0),
}

SAMPLE_EXPENSE = {
    "id": "expense-uuid-1",
    "household_id": HOUSEHOLD_ID,
    "user_id": USER_ID,
    "category": "Food",
    "description": "Grocery shop",
    "amount": 120.0,
    "date": date(2026, 6, 1),
    "is_recurring": False,
    "created_at": datetime(2026, 1, 15, 10, 0, 0),
    "updated_at": datetime(2026, 1, 15, 10, 0, 0),
}

SAMPLE_DEBT = {
    "id": "debt-uuid-1",
    "household_id": HOUSEHOLD_ID,
    "user_id": USER_ID,
    "name": "Car Loan",
    "balance": 8000.0,
    "interest_rate": 5.9,
    "minimum_payment": 200.0,
    "target_payoff_date": None,
    "created_at": datetime(2026, 1, 15, 10, 0, 0),
    "updated_at": datetime(2026, 1, 15, 10, 0, 0),
}

SAMPLE_SAVINGS_GOAL = {
    "id": "goal-uuid-1",
    "household_id": HOUSEHOLD_ID,
    "name": "Emergency Fund",
    "target_amount": 5000.0,
    "current_amount": 1200.0,
    "deadline": None,
    "created_at": datetime(2026, 1, 15, 10, 0, 0),
    "updated_at": datetime(2026, 1, 15, 10, 0, 0),
}

SAMPLE_DASHBOARD = {
    "total_income": 3000.0,
    "total_expenses": 120.0,
    "net_position": 2880.0,
    "emergency_fund_status": {
        "current_amount": 1200.0,
        "target_amount": 5000.0,
        "months_covered": 10.0,
    },
    "debt_summary": {
        "total_owed": 8000.0,
        "total_minimum_payments": 200.0,
        "debt_count": 1,
    },
    "savings_progress": [
        {
            "goal_name": "Emergency Fund",
            "target_amount": 5000.0,
            "current_amount": 1200.0,
            "percent": 24.0,
        }
    ],
}


def make_context(user_id: str = USER_ID, household_id: str | None = None) -> CurrentUserContext:
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
# Accounts — Test 1: GET /api/accounts success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_200_and_list_of_accounts_when_get_accounts_for_authenticated_user_with_household():
    """should return 200 and a list of accounts when GET /api/accounts for authenticated user with household"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.get_accounts", new_callable=AsyncMock, return_value=[SAMPLE_ACCOUNT]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/accounts")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Current Account"
    assert data[0]["type"] == "checking"


# ============================================================
# Accounts — Test 2: GET /api/accounts 401 unauthenticated
# ============================================================

@pytest.mark.asyncio
async def test_should_return_401_when_get_accounts_for_unauthenticated_request():
    """should return 401 when GET /api/accounts for unauthenticated request"""
    # Arrange — clear all overrides so the real auth guard runs
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        # Clear all overrides to restore real dependency (no token = 403 via HTTPBearer)
        app.dependency_overrides.clear()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act — no Authorization header
        response = await client.get("/api/accounts")

    # Assert — FastAPI HTTPBearer returns 403 when Authorization header is absent
    assert response.status_code == 403


# ============================================================
# Accounts — Test 3: GET /api/accounts 403 when no household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_403_when_get_accounts_and_context_household_id_is_none():
    """should return 403 when GET /api/accounts and context.household_id is None"""
    # Arrange — authenticated but no household
    context = make_context(household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.get("/api/accounts")

    # Assert
    assert response.status_code == 403
    assert response.json()["detail"] == "Household not set up"


# ============================================================
# Accounts — Test 4: POST /api/accounts success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_201_with_created_account_when_post_accounts_with_valid_body():
    """should return 201 with created account when POST /api/accounts with valid body"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.create_account", new_callable=AsyncMock, return_value=SAMPLE_ACCOUNT):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post("/api/accounts", json={
                "name": "Current Account",
                "type": "checking",
                "balance": 1500.0,
                "currency": "GBP",
            })

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Current Account"
    assert data["type"] == "checking"
    assert data["household_id"] == HOUSEHOLD_ID


# ============================================================
# Accounts — Test 5: POST /api/accounts 422 invalid type
# ============================================================

@pytest.mark.asyncio
async def test_should_return_422_when_post_accounts_with_invalid_type():
    """should return 422 when POST /api/accounts with invalid type"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post("/api/accounts", json={
            "name": "Bad Account",
            "type": "crypto",  # invalid — not in Literal["checking", "savings", "cash"]
            "balance": 100.0,
        })

    # Assert
    assert response.status_code == 422


# ============================================================
# Accounts — Test 6: PATCH /api/accounts/{id} 404 when not in household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_patch_account_and_account_not_in_household():
    """should return 404 when PATCH /api/accounts/{id} and account not in household"""
    # Arrange — update_account returns None (not found)
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.update_account", new_callable=AsyncMock, return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.patch("/api/accounts/nonexistent-id", json={"name": "Updated"})

    # Assert
    assert response.status_code == 404


# ============================================================
# Accounts — Test 7: DELETE /api/accounts/{id} success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_204_when_delete_account_on_success():
    """should return 204 when DELETE /api/accounts/{id} on success"""
    # Arrange — delete_account returns True
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.delete_account", new_callable=AsyncMock, return_value=True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.delete(f"/api/accounts/{SAMPLE_ACCOUNT['id']}")

    # Assert
    assert response.status_code == 204


# ============================================================
# Income — Test 8: GET /api/income success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_200_and_list_when_get_income():
    """should return 200 and a list when GET /api/income"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.get_income_entries", new_callable=AsyncMock, return_value=[SAMPLE_INCOME]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/income")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["source"] == "Salary"
    assert data[0]["frequency"] == "monthly"


# ============================================================
# Income — Test 9: POST /api/income success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_201_with_income_entry_when_post_income_with_valid_body():
    """should return 201 with income entry when POST /api/income with valid body"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.create_income_entry", new_callable=AsyncMock, return_value=SAMPLE_INCOME):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post("/api/income", json={
                "source": "Salary",
                "amount": 3000.0,
                "frequency": "monthly",
            })

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["source"] == "Salary"
    assert data["amount"] == 3000.0


# ============================================================
# Income — Test 10: POST /api/income 422 invalid frequency
# ============================================================

@pytest.mark.asyncio
async def test_should_return_422_when_post_income_with_invalid_frequency():
    """should return 422 when POST /api/income with invalid frequency"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post("/api/income", json={
            "source": "Salary",
            "amount": 3000.0,
            "frequency": "daily",  # invalid — not in Literal["monthly", "weekly", "annual"]
        })

    # Assert
    assert response.status_code == 422


# ============================================================
# Expenses — Test 11: GET /api/expenses success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_200_and_list_when_get_expenses():
    """should return 200 and a list when GET /api/expenses"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.get_expenses", new_callable=AsyncMock, return_value=[SAMPLE_EXPENSE]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/expenses")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["category"] == "Food"
    assert data[0]["amount"] == 120.0


# ============================================================
# Expenses — Test 12: POST /api/expenses success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_201_when_post_expenses_with_valid_body():
    """should return 201 when POST /api/expenses with valid body"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.create_expense", new_callable=AsyncMock, return_value=SAMPLE_EXPENSE):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post("/api/expenses", json={
                "category": "Food",
                "description": "Grocery shop",
                "amount": 120.0,
                "date": "2026-06-01",
            })

    # Assert
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "Food"
    assert data["amount"] == 120.0


# ============================================================
# Debts — Test 13: GET /api/debts success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_200_and_list_when_get_debts():
    """should return 200 and a list when GET /api/debts"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.get_debts", new_callable=AsyncMock, return_value=[SAMPLE_DEBT]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/debts")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Car Loan"
    assert data[0]["balance"] == 8000.0


# ============================================================
# Debts — Test 14: POST /api/debts 422 interest_rate > 100
# ============================================================

@pytest.mark.asyncio
async def test_should_return_422_when_post_debts_with_interest_rate_greater_than_100():
    """should return 422 when POST /api/debts with interest_rate greater than 100"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post("/api/debts", json={
            "name": "Bad Loan",
            "balance": 5000.0,
            "interest_rate": 150.0,  # invalid — le=100
        })

    # Assert
    assert response.status_code == 422


# ============================================================
# Savings Goals — Test 15: GET /api/savings-goals success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_200_and_list_when_get_savings_goals():
    """should return 200 and a list when GET /api/savings-goals"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.get_savings_goals", new_callable=AsyncMock, return_value=[SAMPLE_SAVINGS_GOAL]):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/savings-goals")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "Emergency Fund"
    assert data[0]["target_amount"] == 5000.0


# ============================================================
# Savings Goals — Test 16: POST /api/savings-goals 422 current > target
# ============================================================

@pytest.mark.asyncio
async def test_should_return_422_when_post_savings_goals_with_current_amount_greater_than_target_amount():
    """should return 422 when POST /api/savings-goals with current_amount greater than target_amount"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post("/api/savings-goals", json={
            "name": "Holiday",
            "target_amount": 1000.0,
            "current_amount": 2000.0,  # invalid — exceeds target
        })

    # Assert
    assert response.status_code == 422


# ============================================================
# Dashboard — Test 17: GET /api/dashboard with household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_200_with_dashboard_stats_shape_when_get_dashboard_with_household():
    """should return 200 with DashboardStats shape when GET /api/dashboard with household"""
    # Arrange
    context = make_context(household_id=HOUSEHOLD_ID)
    app = get_app_with_context(context)

    with patch("database.get_dashboard_stats", new_callable=AsyncMock, return_value=SAMPLE_DASHBOARD):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/dashboard")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["total_income"] == 3000.0
    assert data["total_expenses"] == 120.0
    assert data["net_position"] == 2880.0
    assert "emergency_fund_status" in data
    assert "debt_summary" in data
    assert "savings_progress" in data
    assert isinstance(data["savings_progress"], list)


# ============================================================
# Dashboard — Test 18: GET /api/dashboard with no household_id
# ============================================================

@pytest.mark.asyncio
async def test_should_return_default_empty_dashboard_stats_when_get_dashboard_with_no_household_id():
    """should return default empty DashboardStats when GET /api/dashboard with no household_id"""
    # Arrange — authenticated but no household
    context = make_context(household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.get("/api/dashboard")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["total_income"] == 0.0
    assert data["total_expenses"] == 0.0
    assert data["net_position"] == 0.0
    assert data["debt_summary"]["debt_count"] == 0
    assert data["savings_progress"] == []
