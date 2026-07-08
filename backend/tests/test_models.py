"""
Tests for Pydantic models

Scope: the models that survive the Intentional Spending Tracker pivot —
households, membership, and the request context. Retired invoice/client/
schedule/company-settings model tests were removed with their features.
Core budget model tests live in test_task21_models.py.
"""
import pytest
from datetime import datetime, timezone


# --- Household model tests ---


def test_should_create_household_create_with_a_name_field():
    """should create HouseholdCreate with a name field"""
    # Arrange / Act
    from models import HouseholdCreate
    household = HouseholdCreate(name="Smith Family")

    # Assert
    assert household.name == "Smith Family"


def test_should_reject_household_create_when_name_is_missing():
    """should reject HouseholdCreate when name is missing"""
    # Arrange
    from pydantic import ValidationError
    from models import HouseholdCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        HouseholdCreate()


def test_should_create_household_join_with_an_invite_code_field():
    """should create HouseholdJoin with an invite_code field"""
    # Arrange / Act
    from models import HouseholdJoin
    join = HouseholdJoin(invite_code="ABC123")

    # Assert
    assert join.invite_code == "ABC123"


def test_should_reject_household_join_when_invite_code_is_missing():
    """should reject HouseholdJoin when invite_code is missing"""
    # Arrange
    from pydantic import ValidationError
    from models import HouseholdJoin

    # Act / Assert
    with pytest.raises(ValidationError):
        HouseholdJoin()


def test_should_create_household_response_with_all_required_fields():
    """should create HouseholdResponse with all required fields (id, name, invite_code, created_at, created_by)"""
    # Arrange
    now = datetime.now(timezone.utc)
    data = {
        "id": "household-123",
        "name": "Smith Family",
        "invite_code": "ABC123",
        "created_at": now,
        "created_by": "user-456",
    }

    # Act
    from models import HouseholdResponse
    household = HouseholdResponse(**data)

    # Assert
    assert household.id == "household-123"
    assert household.name == "Smith Family"
    assert household.invite_code == "ABC123"
    assert household.created_at == now
    assert household.created_by == "user-456"


def test_should_create_household_member_response_with_all_required_fields():
    """should create HouseholdMemberResponse with all required fields (id, household_id, user_id, role, joined_at)"""
    # Arrange
    now = datetime.now(timezone.utc)
    data = {
        "id": "member-123",
        "household_id": "household-456",
        "user_id": "user-789",
        "role": "admin",
        "joined_at": now,
    }

    # Act
    from models import HouseholdMemberResponse
    member = HouseholdMemberResponse(**data)

    # Assert
    assert member.id == "member-123"
    assert member.household_id == "household-456"
    assert member.user_id == "user-789"
    assert member.role == "admin"
    assert member.joined_at == now


def test_should_create_current_user_context_with_user_id_and_household_id_defaults_to_none():
    """should create CurrentUserContext with user_id and household_id defaults to None"""
    # Arrange / Act
    from models import CurrentUserContext
    ctx = CurrentUserContext(user_id="user-123")

    # Assert
    assert ctx.user_id == "user-123"
    assert ctx.household_id is None


def test_should_create_current_user_context_with_an_explicit_household_id():
    """should create CurrentUserContext with an explicit household_id"""
    # Arrange / Act
    from models import CurrentUserContext
    ctx = CurrentUserContext(user_id="user-123", household_id="household-456")

    # Assert
    assert ctx.user_id == "user-123"
    assert ctx.household_id == "household-456"
