"""
Tests for FastAPI main application endpoints
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_should_return_api_running_message_on_get_root():
    """should return API running message on GET /"""
    # Arrange - mock database to avoid real connections
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Invoice Me API is running"
    assert "version" in data


@pytest.mark.asyncio
async def test_should_return_ok_status_on_get_health():
    """should return OK status on GET /health"""
    # Arrange
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.get("/health")

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "OK"}
