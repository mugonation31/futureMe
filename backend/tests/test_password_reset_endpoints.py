"""
Tests for POST /api/auth/forgot-password and POST /api/auth/reset-password endpoints.
All database calls and email service calls are mocked.
"""
import pytest
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock

from config import settings

# Use the same secret that settings.jwt_secret resolves to, so that the
# endpoint can verify tokens built in tests and vice-versa.
TEST_SECRET = settings.jwt_secret

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


def _build_reset_token(user_id: str = "user-uuid-001", secret: str = TEST_SECRET, exp_delta: timedelta = timedelta(hours=1)) -> str:
    """Build a valid password-reset JWT for use in tests."""
    payload = {
        "sub": user_id,
        "purpose": "password_reset",
        "exp": datetime.now(timezone.utc) + exp_delta,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


def _get_app():
    """Return the FastAPI app with DB pool mocked to avoid real connections."""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        return app


# ============================================================
# Test 6: forgot-password returns 200 for a registered email
# ============================================================

@pytest.mark.asyncio
async def test_forgot_password_returns_200_for_registered_email():
    """should return 200 when POST /api/auth/forgot-password with a registered email"""
    # Arrange
    app = _get_app()

    with patch("database.get_user_by_email", new_callable=AsyncMock, return_value=SAMPLE_USER), \
         patch("database.create_password_reset_token", new_callable=AsyncMock), \
         patch("email_service.send_password_reset_email", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/forgot-password",
                json={"email": "user@example.com"},
            )

    # Assert
    assert response.status_code == 200
    assert "message" in response.json()


# ============================================================
# Test 7: forgot-password returns 200 for an unknown email (no enumeration)
# ============================================================

@pytest.mark.asyncio
async def test_forgot_password_returns_200_for_unknown_email():
    """should return 200 when POST /api/auth/forgot-password with an unknown email"""
    # Arrange
    app = _get_app()

    with patch("database.get_user_by_email", new_callable=AsyncMock, return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/forgot-password",
                json={"email": "nobody@example.com"},
            )

    # Assert
    assert response.status_code == 200
    assert "message" in response.json()


# ============================================================
# Test 8: forgot-password calls email service only when user exists
# ============================================================

@pytest.mark.asyncio
async def test_forgot_password_calls_email_service_only_when_user_exists():
    """should call email service when user exists, not when user doesn't exist"""
    # Arrange
    app = _get_app()
    mock_send_email = AsyncMock()

    # Case A: user exists — email service should be called
    with patch("database.get_user_by_email", new_callable=AsyncMock, return_value=SAMPLE_USER), \
         patch("database.create_password_reset_token", new_callable=AsyncMock), \
         patch("email_service.send_password_reset_email", mock_send_email):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/auth/forgot-password", json={"email": "user@example.com"})

    assert mock_send_email.called, "Email service should be called when user exists"
    mock_send_email.reset_mock()

    # Case B: user does not exist — email service should NOT be called
    with patch("database.get_user_by_email", new_callable=AsyncMock, return_value=None), \
         patch("email_service.send_password_reset_email", mock_send_email):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})

    assert not mock_send_email.called, "Email service should NOT be called when user doesn't exist"


# ============================================================
# Test 9: reset-password returns 200 with valid token
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_returns_200_with_valid_token():
    """should return 200 when POST /api/auth/reset-password with a valid token"""
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
                json={"token": valid_token, "new_password": "newpass123"},
            )

    # Assert
    assert response.status_code == 200
    assert "message" in response.json()


# ============================================================
# Test 10: reset-password returns 400 with expired token
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_returns_400_with_expired_token():
    """should return 400 when POST /api/auth/reset-password with an expired token"""
    # Arrange
    app = _get_app()
    # Build a token that is already expired
    expired_token = _build_reset_token(exp_delta=timedelta(hours=-1))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": expired_token, "new_password": "newpass123"},
        )

    # Assert
    assert response.status_code == 400


# ============================================================
# Test 11: reset-password returns 400 when token is already used
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_returns_400_when_token_already_used():
    """should return 400 when POST /api/auth/reset-password with an already-used token"""
    # Arrange
    app = _get_app()
    valid_token = _build_reset_token()

    used_token_record = {
        **SAMPLE_TOKEN_RECORD,
        "used_at": datetime.now(timezone.utc) - timedelta(minutes=5),
    }

    with patch("database.get_password_reset_token", new_callable=AsyncMock, return_value=used_token_record):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/reset-password",
                json={"token": valid_token, "new_password": "newpass123"},
            )

    # Assert
    assert response.status_code == 400


# ============================================================
# Test 12: reset-password returns 422 when password is too short
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_returns_422_when_password_too_short():
    """should return 422 when POST /api/auth/reset-password with password shorter than 6 chars"""
    # Arrange
    app = _get_app()
    valid_token = _build_reset_token()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": valid_token, "new_password": "abc"},
        )

    # Assert
    assert response.status_code == 422


# ============================================================
# Test 13: reset-password returns 400 with invalid JWT
# ============================================================

@pytest.mark.asyncio
async def test_reset_password_returns_400_with_invalid_jwt():
    """should return 400 when POST /api/auth/reset-password with an invalid JWT"""
    # Arrange
    app = _get_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/reset-password",
            json={"token": "not.a.valid.jwt", "new_password": "newpass123"},
        )

    # Assert
    assert response.status_code == 400
