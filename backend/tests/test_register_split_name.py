"""
Tests for Tasks 42-43: split RegisterRequest name into first_name + last_name,
and update create_user to derive display_name.
"""
import pytest
from pydantic import ValidationError
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport


# ============================================================
# Test 1: RegisterRequest accepts first_name and last_name
# ============================================================

def test_register_request_accepts_first_name_and_last_name():
    """should accept first_name and last_name fields on RegisterRequest"""
    # Arrange / Act
    from models import RegisterRequest
    req = RegisterRequest(
        email="test@example.com",
        password="Secure1@",
        first_name="Alice",
        last_name="Smith",
    )

    # Assert
    assert req.first_name == "Alice"
    assert req.last_name == "Smith"


# ============================================================
# Test 2: RegisterRequest rejects empty first_name
# ============================================================

def test_register_request_rejects_empty_first_name():
    """should raise ValidationError when first_name is an empty string"""
    # Arrange / Act / Assert
    from models import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="test@example.com",
            password="Secure1@",
            first_name="",
            last_name="Smith",
        )


# ============================================================
# Test 3: RegisterRequest rejects empty last_name
# ============================================================

def test_register_request_rejects_empty_last_name():
    """should raise ValidationError when last_name is an empty string"""
    # Arrange / Act / Assert
    from models import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="test@example.com",
            password="Secure1@",
            first_name="Alice",
            last_name="",
        )


# ============================================================
# Test 4: RegisterRequest rejects missing first_name
# ============================================================

def test_register_request_rejects_missing_first_name():
    """should raise ValidationError when first_name is absent"""
    # Arrange / Act / Assert
    from models import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="test@example.com",
            password="Secure1@",
            last_name="Smith",
        )


# ============================================================
# Test 5: RegisterRequest rejects missing last_name
# ============================================================

def test_register_request_rejects_missing_last_name():
    """should raise ValidationError when last_name is absent"""
    # Arrange / Act / Assert
    from models import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="test@example.com",
            password="Secure1@",
            first_name="Alice",
        )


# ============================================================
# Test 6: create_user derives display_name from first_name and last_name
# ============================================================

@pytest.mark.asyncio
async def test_create_user_derives_display_name_from_first_and_last_name():
    """should call DB INSERT with display_name = first_name.strip() + ' ' + last_name.strip()"""
    # Arrange
    from unittest.mock import MagicMock

    mock_row = {
        "id": "user-uuid-001",
        "email": "alice@example.com",
        "display_name": "Alice Smith",
        "first_name": "Alice",
        "last_name": "Smith",
        "created_at": None,
    }

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=mock_row)

    # Build a context-manager-compatible acquire mock
    acquire_cm = MagicMock()
    acquire_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    acquire_cm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=acquire_cm)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        from database import create_user
        # Act
        result = await create_user("alice@example.com", "Secure1@", "  Alice  ", "  Smith  ")

    # Assert: the INSERT was called with the derived display_name
    call_args = mock_conn.fetchrow.call_args
    sql = call_args[0][0]
    params = call_args[0][1:]

    assert "display_name" in sql.lower() or "first_name" in sql.lower()
    # The derived display_name should be "Alice Smith" (trimmed)
    assert "Alice Smith" in params


# ============================================================
# Test 7: Register endpoint passes first_name and last_name to create_user
# ============================================================

@pytest.mark.asyncio
async def test_register_endpoint_passes_first_and_last_name_to_create_user():
    """should call db.create_user with first_name and last_name from the request body"""
    # Arrange
    sample_user = {
        "id": "user-uuid-001",
        "email": "alice@example.com",
        "display_name": "Alice Smith",
        "first_name": "Alice",
        "last_name": "Smith",
    }

    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app

    with patch("database.create_user", new_callable=AsyncMock, return_value=sample_user) as mock_create:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Act
            response = await client.post(
                "/api/auth/register",
                json={
                    "email": "alice@example.com",
                    "password": "Secure1@",
                    "first_name": "Alice",
                    "last_name": "Smith",
                },
            )

    # Assert
    assert response.status_code == 201
    mock_create.assert_called_once()
    call_args = mock_create.call_args
    # Positional args: email, password, first_name, last_name
    assert call_args[0][2] == "Alice"
    assert call_args[0][3] == "Smith"


# ============================================================
# Test 8: Register endpoint returns 422 when old 'name' field is sent
# ============================================================

@pytest.mark.asyncio
async def test_register_endpoint_returns_422_when_old_name_field_sent():
    """should return 422 when register payload uses 'name' instead of first_name/last_name"""
    # Arrange
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Act
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "alice@example.com",
                "password": "Secure1@",
                "name": "Alice Smith",
            },
        )

    # Assert
    assert response.status_code == 422


# ============================================================
# Test 9: RegisterRequest rejects whitespace-only first_name
# ============================================================

def test_register_request_rejects_whitespace_only_first_name():
    """should raise ValidationError when first_name is whitespace-only"""
    from models import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="test@example.com",
            password="Secure1@",
            first_name="   ",
            last_name="Smith",
        )


# ============================================================
# Test 10: RegisterRequest rejects whitespace-only last_name
# ============================================================

def test_register_request_rejects_whitespace_only_last_name():
    """should raise ValidationError when last_name is whitespace-only"""
    from models import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="test@example.com",
            password="Secure1@",
            first_name="Alice",
            last_name="   ",
        )
