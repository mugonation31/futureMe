"""
Tests for household API endpoints:
  POST /api/households
  GET  /api/households/me
  POST /api/households/join
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock
from datetime import datetime

from models import CurrentUserContext


# ============================================================
# Shared fixtures
# ============================================================

SAMPLE_HOUSEHOLD = {
    "id": "household-uuid-123",
    "name": "Smith Family",
    "invite_code": "SMITH01",
    "created_at": datetime(2026, 1, 15, 10, 0, 0),
    "created_by": "user-abc",
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
# Test 1: POST /api/households — success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_household_response_with_invite_code_when_create_household_succeeds():
    """should return HouseholdResponse with invite_code when POST /api/households succeeds"""
    # Arrange — user has no household yet
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)

    with patch("database.create_household", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post("/api/households", json={"name": "Smith Family"})

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Smith Family"
    assert data["invite_code"] == "SMITH01"
    assert data["id"] == "household-uuid-123"


# ============================================================
# Test 2: POST /api/households — 409 when user already has a household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_409_when_post_households_and_user_already_has_household():
    """should return 409 when POST /api/households and user already has a household"""
    # Arrange — user already belongs to a household
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post("/api/households", json={"name": "Another Family"})

    # Assert
    assert response.status_code == 409
    assert response.json()["detail"] == "User already belongs to a household"


# ============================================================
# Test 3: GET /api/households/me — success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_household_response_when_get_me_and_household_exists():
    """should return HouseholdPublicResponse (no invite_code) when GET /api/households/me"""
    # Arrange — user belongs to a household
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/households/me")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "household-uuid-123"
    assert data["name"] == "Smith Family"
    assert "invite_code" not in data


# ============================================================
# Test 4: GET /api/households/me — 404 when user has no household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_get_me_and_user_has_no_household():
    """should return 404 when GET /api/households/me and user has no household"""
    # Arrange — user has no household
    context = make_context(user_id="user-abc", household_id=None)
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.get("/api/households/me")

    # Assert
    assert response.status_code == 404
    assert response.json()["detail"] == "No household found"


# ============================================================
# Test 5: POST /api/households/join — success
# ============================================================

@pytest.mark.asyncio
async def test_should_return_household_response_when_join_household_succeeds():
    """should return HouseholdPublicResponse (no invite_code) when POST /api/households/join succeeds"""
    # Arrange — user has no household, invite code is valid
    context = make_context(user_id="user-xyz", household_id=None)
    app = get_app_with_context(context)

    mock_member = {
        "id": "member-uuid-789",
        "household_id": "household-uuid-123",
        "user_id": "user-xyz",
        "role": "member",
        "joined_at": datetime(2026, 1, 15, 11, 0, 0),
    }

    with patch("database.get_household_by_invite_code", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD), \
         patch("database.join_household", new_callable=AsyncMock, return_value=mock_member):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post("/api/households/join", json={"invite_code": "SMITH01"})

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "household-uuid-123"
    assert data["name"] == "Smith Family"
    assert "invite_code" not in data


# ============================================================
# Test 6: POST /api/households/join — 404 for invalid invite code
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_join_household_with_invalid_invite_code():
    """should return 404 when POST /api/households/join with invalid invite code"""
    # Arrange — user has no household, invite code does not exist
    context = make_context(user_id="user-xyz", household_id=None)
    app = get_app_with_context(context)

    with patch("database.get_household_by_invite_code", new_callable=AsyncMock, return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post("/api/households/join", json={"invite_code": "BADCODE"})

    # Assert
    assert response.status_code == 404
    assert response.json()["detail"] == "Invite code not found"


# ============================================================
# Test 7: POST /api/households/join — 409 when user already in a household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_409_when_join_household_and_user_already_in_household():
    """should return 409 when POST /api/households/join and user already in a household"""
    # Arrange — user already belongs to a household
    context = make_context(user_id="user-abc", household_id="household-uuid-123")
    app = get_app_with_context(context)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post("/api/households/join", json={"invite_code": "ANYCODE"})

    # Assert
    assert response.status_code == 409
    assert response.json()["detail"] == "User already belongs to a household"
