"""
Tests for CurrentUserContext returned by get_current_user
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from jose import jwt
from fastapi import HTTPException

from models import CurrentUserContext


@pytest.mark.asyncio
async def test_should_return_current_user_context_with_user_id():
    """should return CurrentUserContext containing user_id when token is valid"""
    # Arrange
    secret = "test-jwt-secret-key-for-testing-only"
    user_id = "user-uuid-12345"
    token = jwt.encode({"sub": user_id}, secret, algorithm="HS256")
    credentials = MagicMock()
    credentials.credentials = token

    with patch("database.get_household_by_user", new_callable=AsyncMock) as mock_get_household:
        mock_get_household.return_value = None

        from auth import verify_token, get_current_user
        payload = verify_token(credentials)

        # Act
        context = await get_current_user(payload)

    # Assert
    assert isinstance(context, CurrentUserContext)
    assert context.user_id == user_id


@pytest.mark.asyncio
async def test_should_include_household_id_in_context_when_user_belongs_to_household():
    """should include household_id in context when user belongs to a household"""
    # Arrange
    secret = "test-jwt-secret-key-for-testing-only"
    user_id = "user-uuid-abc"
    household_id = "household-uuid-xyz"
    token = jwt.encode({"sub": user_id}, secret, algorithm="HS256")
    credentials = MagicMock()
    credentials.credentials = token

    with patch("database.get_household_by_user", new_callable=AsyncMock) as mock_get_household:
        mock_get_household.return_value = {"id": household_id, "name": "Smith Family"}

        from auth import verify_token, get_current_user
        payload = verify_token(credentials)

        # Act
        context = await get_current_user(payload)

    # Assert
    assert isinstance(context, CurrentUserContext)
    assert context.user_id == user_id
    assert context.household_id == household_id


@pytest.mark.asyncio
async def test_should_set_household_id_to_none_when_user_has_no_household():
    """should set household_id to None when user does not belong to any household"""
    # Arrange
    secret = "test-jwt-secret-key-for-testing-only"
    user_id = "user-uuid-no-household"
    token = jwt.encode({"sub": user_id}, secret, algorithm="HS256")
    credentials = MagicMock()
    credentials.credentials = token

    with patch("database.get_household_by_user", new_callable=AsyncMock) as mock_get_household:
        mock_get_household.return_value = None

        from auth import verify_token, get_current_user
        payload = verify_token(credentials)

        # Act
        context = await get_current_user(payload)

    # Assert
    assert isinstance(context, CurrentUserContext)
    assert context.user_id == user_id
    assert context.household_id is None
