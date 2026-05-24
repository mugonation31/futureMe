"""
Tests for household database operations (create_household, get_household_by_invite_code,
get_household_by_user, join_household)
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime


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

SAMPLE_MEMBER = {
    "id": "member-uuid-456",
    "household_id": "household-uuid-123",
    "user_id": "user-abc",
    "role": "owner",
    "joined_at": datetime(2026, 1, 15, 10, 0, 0),
}


def make_row(data: dict):
    """Create a fake asyncpg-style row from a dict."""
    return type("Row", (), {
        "__iter__": lambda self: iter(data.items()),
        "items": lambda self: data.items(),
        "keys": lambda self: data.keys(),
        "__getitem__": lambda self, k: data[k],
    })()


def make_mock_pool(mock_conn):
    """Build a mock asyncpg pool that yields mock_conn on acquire()."""
    mock_pool = MagicMock()
    acquire_ctx = MagicMock()
    acquire_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    acquire_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = acquire_ctx
    return mock_pool


def attach_transaction(mock_conn):
    """Configure mock_conn.transaction() to behave as an async context manager.

    asyncpg's conn.transaction() is a *synchronous* call that returns an
    object implementing __aenter__/__aexit__. AsyncMock makes every attribute
    async by default, so we replace the transaction attribute with a plain
    MagicMock whose return value is the async context manager.
    """
    tx_ctx = MagicMock()
    tx_ctx.__aenter__ = AsyncMock(return_value=None)
    tx_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_conn.transaction = MagicMock(return_value=tx_ctx)


# ============================================================
# create_household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_household_dict_when_create_household_succeeds():
    """should return a household dict when create_household inserts successfully"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(SAMPLE_HOUSEHOLD)
    attach_transaction(mock_conn)

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.create_household(user_id="user-abc", name="Smith Family")

    # Assert
    assert result["name"] == "Smith Family"
    assert result["invite_code"] == "SMITH01"
    assert result["created_by"] == "user-abc"


@pytest.mark.asyncio
async def test_should_call_execute_for_member_insert_when_create_household_called():
    """should call execute to insert the owner member row when create_household is called"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(SAMPLE_HOUSEHOLD)
    attach_transaction(mock_conn)

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        await database.create_household(user_id="user-abc", name="Smith Family")

    # Assert: execute was called for the household_members INSERT
    mock_conn.execute.assert_called_once()
    call_sql = mock_conn.execute.call_args[0][0]
    assert "household_members" in call_sql


# ============================================================
# get_household_by_invite_code
# ============================================================

@pytest.mark.asyncio
async def test_should_return_household_when_invite_code_matches_case_insensitively():
    """should return household dict when invite code matches regardless of case"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(SAMPLE_HOUSEHOLD)

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_household_by_invite_code("smith01")

    # Assert
    assert result is not None
    assert result["invite_code"] == "SMITH01"
    # Verify UPPER() was used in the SQL query
    call_sql = mock_conn.fetchrow.call_args[0][0]
    assert "UPPER" in call_sql


@pytest.mark.asyncio
async def test_should_return_none_when_invite_code_not_found():
    """should return None when no household matches the invite code"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_household_by_invite_code("UNKNOWN")

    # Assert
    assert result is None


# ============================================================
# get_household_by_user
# ============================================================

@pytest.mark.asyncio
async def test_should_return_household_when_user_is_a_member():
    """should return household dict when user belongs to a household"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(SAMPLE_HOUSEHOLD)

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_household_by_user("user-abc")

    # Assert
    assert result is not None
    assert result["id"] == "household-uuid-123"


@pytest.mark.asyncio
async def test_should_return_none_when_user_is_not_in_any_household():
    """should return None when user does not belong to any household"""
    # Arrange
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        import database
        result = await database.get_household_by_user("user-xyz")

    # Assert
    assert result is None


# ============================================================
# join_household
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_value_error_when_user_already_in_a_household():
    """should raise ValueError when user tries to join but is already in a household"""
    # Arrange - get_household_by_user returns an existing household
    with patch("database.get_household_by_user", new_callable=AsyncMock, return_value=SAMPLE_HOUSEHOLD):
        import database

        # Act & Assert
        with pytest.raises(ValueError, match="already"):
            await database.join_household(user_id="user-abc", household_id="household-uuid-123")


@pytest.mark.asyncio
async def test_should_return_member_dict_when_join_household_succeeds():
    """should return a member dict when user successfully joins a household"""
    # Arrange - user is not in a household yet
    # get_household_by_invite_code and get_household_by_user are both patched,
    # so join_household only makes one fetchrow call: the INSERT ... RETURNING
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = make_row(SAMPLE_MEMBER)

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool), \
         patch("database.get_household_by_user", new_callable=AsyncMock, return_value=None):
        import database
        result = await database.join_household(user_id="user-xyz", household_id="household-uuid-123")

    # Assert
    assert result["user_id"] == "user-abc"
    assert result["role"] == "owner"
    assert result["household_id"] == "household-uuid-123"
