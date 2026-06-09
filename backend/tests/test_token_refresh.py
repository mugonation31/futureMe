"""
Tests for SEC-1: shortened access token lifetime and refresh token endpoint.
"""
import pytest
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock

from config import settings


TEST_SECRET = settings.jwt_secret

SAMPLE_USER = {
    "id": "user-uuid-sec1",
    "email": "sec1@example.com",
    "display_name": "SEC1 User",
    "password_hash": "$2b$12$hashedpassword",
}


def _get_app():
    """Return the FastAPI app with DB pool mocked."""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        return app


def _build_refresh_token(
    user_id: str = "user-uuid-sec1",
    secret: str = TEST_SECRET,
    exp_delta: timedelta = timedelta(days=7),
) -> str:
    """Build a valid refresh JWT for use in tests."""
    payload = {
        "sub": user_id,
        "purpose": "refresh",
        "exp": datetime.now(timezone.utc) + exp_delta,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ============================================================
# Test 1: Settings has jwt_expiry_minutes with default 60
# ============================================================

def test_settings_has_jwt_expiry_minutes_with_default_60():
    """should include jwt_expiry_minutes field with default 60 in Settings"""
    # Arrange / Act
    from config import Settings
    s = Settings()

    # Assert
    assert hasattr(s, "jwt_expiry_minutes")
    assert s.jwt_expiry_minutes == 60


# ============================================================
# Test 2: Settings has jwt_refresh_expiry_days with default 7
# ============================================================

def test_settings_has_jwt_refresh_expiry_days_with_default_7():
    """should include jwt_refresh_expiry_days field with default 7 in Settings"""
    # Arrange / Act
    from config import Settings
    s = Settings()

    # Assert
    assert hasattr(s, "jwt_refresh_expiry_days")
    assert s.jwt_refresh_expiry_days == 7


# ============================================================
# Test 3: access token uses jwt_expiry_minutes, not 7 days
# ============================================================

def test_access_token_expires_in_jwt_expiry_minutes():
    """should create access token expiring in jwt_expiry_minutes minutes, not 7 days"""
    # Arrange
    from config import settings as cfg

    # Act — import main to use _create_access_token
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import _create_access_token

    before = datetime.now(timezone.utc)
    token = _create_access_token("uid-test", "t@t.com", "Tester")
    after = datetime.now(timezone.utc)

    payload = pyjwt.decode(token, cfg.jwt_secret, algorithms=["HS256"])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

    # Assert — exp must be roughly now + jwt_expiry_minutes (default 60)
    expected_min = before + timedelta(minutes=cfg.jwt_expiry_minutes - 1)
    expected_max = after + timedelta(minutes=cfg.jwt_expiry_minutes + 1)
    assert expected_min <= exp <= expected_max, (
        f"Token exp {exp} not within ±1 min of expected {cfg.jwt_expiry_minutes}-minute window"
    )


# ============================================================
# Test 4: POST /api/auth/login returns refresh_token in response
# ============================================================

@pytest.mark.asyncio
async def test_login_returns_refresh_token():
    """should return refresh_token in POST /api/auth/login response"""
    # Arrange
    app = _get_app()

    with patch("database.get_user_by_email", new_callable=AsyncMock, return_value=SAMPLE_USER), \
         patch("database.verify_password", return_value=True):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/login",
                json={"email": "sec1@example.com", "password": "password123"},
            )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert "refresh_token" in body
    assert isinstance(body["refresh_token"], str)
    assert len(body["refresh_token"]) > 0


# ============================================================
# Test 5: POST /api/auth/register returns refresh_token in response
# ============================================================

@pytest.mark.asyncio
async def test_register_returns_refresh_token():
    """should return refresh_token in POST /api/auth/register response"""
    # Arrange
    app = _get_app()

    with patch("database.create_user", new_callable=AsyncMock, return_value=SAMPLE_USER):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/register",
                json={"email": "sec1@example.com", "password": "Password1@", "name": "SEC1 User"},
            )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert "refresh_token" in body
    assert isinstance(body["refresh_token"], str)
    assert len(body["refresh_token"]) > 0


# ============================================================
# Test 6: POST /api/auth/refresh returns access_token with valid refresh token
# ============================================================

@pytest.mark.asyncio
async def test_refresh_returns_access_token_with_valid_refresh_token():
    """should return access_token when POST /api/auth/refresh is called with a valid refresh token"""
    # Arrange
    app = _get_app()
    valid_refresh_token = _build_refresh_token()

    with patch("database.get_user_by_id", new_callable=AsyncMock, return_value=SAMPLE_USER):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/refresh",
                json={"refresh_token": valid_refresh_token},
            )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert isinstance(body["access_token"], str)
    assert len(body["access_token"]) > 0


# ============================================================
# Test 7: POST /api/auth/refresh returns 401 for expired refresh token
# ============================================================

@pytest.mark.asyncio
async def test_refresh_returns_401_for_expired_refresh_token():
    """should return 401 when POST /api/auth/refresh is called with an expired refresh token"""
    # Arrange
    app = _get_app()
    expired_refresh_token = _build_refresh_token(exp_delta=timedelta(hours=-1))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": expired_refresh_token},
        )

    # Assert
    assert response.status_code == 401


# ============================================================
# Test 8: POST /api/auth/refresh returns 401 for invalid token string
# ============================================================

@pytest.mark.asyncio
async def test_refresh_returns_401_for_invalid_token_string():
    """should return 401 when POST /api/auth/refresh is called with an invalid token string"""
    # Arrange
    app = _get_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": "not.a.valid.jwt"},
        )

    # Assert
    assert response.status_code == 401


# ============================================================
# Test 9: POST /api/auth/refresh returns 401 when given an access token
# ============================================================

@pytest.mark.asyncio
async def test_refresh_returns_401_when_given_an_access_token():
    """should return 401 when POST /api/auth/refresh is called with an access token (purpose != 'refresh')"""
    # Arrange
    app = _get_app()

    # Build a regular access token (no purpose claim)
    access_token_payload = {
        "sub": "user-uuid-sec1",
        "email": "sec1@example.com",
        "display_name": "SEC1 User",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }
    access_token = pyjwt.encode(access_token_payload, TEST_SECRET, algorithm="HS256")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": access_token},
        )

    # Assert
    assert response.status_code == 401
