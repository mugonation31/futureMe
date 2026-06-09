"""
Tests for password complexity validation on register and reset-password endpoints.
Requires: at least 1 digit AND at least 1 special character.
"""
import pytest
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock

from config import settings

TEST_SECRET = settings.jwt_secret


def _get_app():
    """Return the FastAPI app with DB pool mocked to avoid real connections."""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        return app


def _build_reset_token(
    user_id: str = "user-uuid-001",
    secret: str = TEST_SECRET,
    exp_delta: timedelta = timedelta(hours=1),
) -> str:
    payload = {
        "sub": user_id,
        "purpose": "password_reset",
        "exp": datetime.now(timezone.utc) + exp_delta,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


SAMPLE_USER = {
    "id": "user-uuid-001",
    "email": "user@example.com",
    "display_name": "Test User",
    "password_hash": "$2b$12$hashedpassword",
}

SAMPLE_TOKEN_RECORD = {
    "id": "token-uuid-001",
    "user_id": "user-uuid-001",
    "token_hash": "sha256hashvalue",
    "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
    "used_at": None,
}


# ============================================================
# Test 1: register rejects password without digit
# ============================================================

@pytest.mark.asyncio
async def test_register_rejects_password_without_digit():
    """should return 422 when registering with a password that has no digit"""
    # Arrange
    app = _get_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/register",
            json={"email": "user@example.com", "password": "NoDigit!@#", "name": "Test User"},
        )

    # Assert
    assert response.status_code == 422


# ============================================================
# Test 2: register rejects password without special character
# ============================================================

@pytest.mark.asyncio
async def test_register_rejects_password_without_special_char():
    """should return 422 when registering with a password that has no special character"""
    # Arrange
    app = _get_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/register",
            json={"email": "user@example.com", "password": "NoSpecial123", "name": "Test User"},
        )

    # Assert
    assert response.status_code == 422


# ============================================================
# Test 3: register rejects password missing both digit and special char
# ============================================================

@pytest.mark.asyncio
async def test_register_rejects_password_missing_both():
    """should return 422 with message covering both requirements when password has neither digit nor special char"""
    # Arrange
    app = _get_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/register",
            json={"email": "user@example.com", "password": "NoDigitOrSpecial", "name": "Test User"},
        )

    # Assert
    assert response.status_code == 422
    body = response.json()
    error_msgs = str(body)
    assert "digit" in error_msgs.lower() or "special" in error_msgs.lower()


# ============================================================
# Test 4: register accepts valid complex password
# ============================================================

@pytest.mark.asyncio
async def test_register_accepts_valid_complex_password():
    """should return 200 when registering with a password that has digit and special character"""
    # Arrange
    app = _get_app()

    with patch("database.create_user", new_callable=AsyncMock, return_value={
             "id": "user-uuid-001",
             "email": "user@example.com",
             "display_name": "Test User",
         }):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/register",
                json={"email": "user@example.com", "password": "Valid1@password", "name": "Test User"},
            )

    # Assert
    assert response.status_code == 200


# ============================================================
# Test 5: reset-password rejects weak new_password
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_rejects_weak_new_password():
    """should return 422 when POST /api/auth/reset-password with a weak new_password (no digit, no special)"""
    # Arrange
    app = _get_app()
    valid_token = _build_reset_token()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": valid_token, "new_password": "WeakPassword"},
        )

    # Assert
    assert response.status_code == 422


# ============================================================
# Test 6: reset-password accepts valid complex new_password
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_accepts_valid_complex_password():
    """should return 200 when POST /api/auth/reset-password with a strong new_password"""
    # Arrange
    app = _get_app()
    valid_token = _build_reset_token()

    with patch("database.get_password_reset_token", new_callable=AsyncMock, return_value=SAMPLE_TOKEN_RECORD), \
         patch("database.reset_password_with_token", new_callable=AsyncMock), \
         patch("database.hash_password", return_value="$2b$12$hashed_new_password"):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/reset-password",
                json={"token": valid_token, "new_password": "Strong1@password"},
            )

    # Assert
    assert response.status_code == 200
