"""
Tests for Company Settings endpoints
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock


# Sample settings data for tests
SAMPLE_SETTINGS = {
    "id": "settings-uuid-123",
    "user_id": "user-123",
    "company_name": "My Company Ltd",
    "company_email": "info@mycompany.com",
    "company_phone": "020-1234-5678",
    "bank_account_name": "My Company Ltd",
    "bank_name": "Barclays",
    "account_number": "12345678",
    "sort_code": "20-30-40",
    "iban": "GB29NWBK60161331926819",
    "created_at": "2026-01-15T10:00:00",
    "updated_at": "2026-01-15T10:00:00",
}


def get_test_app():
    """Get app with auth dependency overridden"""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides[get_current_user] = lambda: "user-123"
        return app


def get_test_app_no_auth():
    """Get app without auth override (to test 401)"""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides.pop(get_current_user, None)
        return app


# ============================================================
# Test 1: GET /api/settings - no settings yet (404)
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_user_has_no_settings():
    """should return 404 when user has no company settings on GET /api/settings"""
    # Arrange
    app = get_test_app()
    with patch("database.get_company_settings", new_callable=AsyncMock, return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/settings")

    # Assert
    assert response.status_code == 404
    assert response.json()["detail"] == "Settings not found"


# ============================================================
# Test 2: GET /api/settings - returns settings when they exist
# ============================================================

@pytest.mark.asyncio
async def test_should_return_settings_when_they_exist():
    """should return company settings when they exist on GET /api/settings"""
    # Arrange
    app = get_test_app()
    with patch("database.get_company_settings", new_callable=AsyncMock, return_value=SAMPLE_SETTINGS):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/api/settings")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["company_name"] == "My Company Ltd"
    assert data["bank_name"] == "Barclays"
    assert data["account_number"] == "12345678"
    assert data["sort_code"] == "20-30-40"
    assert data["iban"] == "GB29NWBK60161331926819"
    assert data["user_id"] == "user-123"


# ============================================================
# Test 3: PUT /api/settings - create settings (upsert)
# ============================================================

@pytest.mark.asyncio
async def test_should_create_settings_on_put():
    """should create new company settings on PUT /api/settings when none exist"""
    # Arrange
    app = get_test_app()
    create_data = {
        "company_name": "My Company Ltd",
        "company_email": "info@mycompany.com",
        "bank_name": "Barclays",
        "account_number": "12345678",
    }
    with patch("database.upsert_company_settings", new_callable=AsyncMock, return_value=SAMPLE_SETTINGS):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.put("/api/settings", json=create_data)

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["company_name"] == "My Company Ltd"
    assert data["bank_name"] == "Barclays"
    assert data["id"] == "settings-uuid-123"


# ============================================================
# Test 4: PUT /api/settings - update existing settings
# ============================================================

@pytest.mark.asyncio
async def test_should_update_settings_on_put():
    """should update existing company settings on PUT /api/settings"""
    # Arrange
    app = get_test_app()
    update_data = {"company_name": "Updated Company Name"}
    updated_settings = {**SAMPLE_SETTINGS, "company_name": "Updated Company Name"}
    with patch("database.upsert_company_settings", new_callable=AsyncMock, return_value=updated_settings):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.put("/api/settings", json=update_data)

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["company_name"] == "Updated Company Name"


# ============================================================
# Test 5: GET /api/settings - 401 without auth
# ============================================================

@pytest.mark.asyncio
async def test_should_return_401_when_no_auth_token_on_settings():
    """should return 401 when no auth token provided on GET /api/settings"""
    # Arrange
    app = get_test_app_no_auth()
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act - no Authorization header
            response = await client.get("/api/settings")

    # Assert
    assert response.status_code in [401, 403]
