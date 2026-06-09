"""
Tests for CategoryBudget Pydantic models (Task 31).
"""
import pytest
from pydantic import ValidationError

from models import (
    CategoryBudgetUpsert,
    CategoryBudgetResponse,
    CategorySpend,
)

VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"  # 36 chars


# ============================================================
# Test 1: should accept CategoryBudgetUpsert with a valid monthly_limit > 0
# ============================================================

def test_category_budget_upsert_valid():
    """should accept CategoryBudgetUpsert with a valid monthly_limit > 0"""
    obj = CategoryBudgetUpsert(category_id=VALID_UUID, monthly_limit=150.0)

    assert obj.category_id == VALID_UUID
    assert obj.monthly_limit == 150.0


# ============================================================
# Test 2: should raise ValidationError when CategoryBudgetUpsert monthly_limit is 0
# ============================================================

def test_category_budget_upsert_rejects_zero_limit():
    """should raise ValidationError when CategoryBudgetUpsert monthly_limit is 0"""
    with pytest.raises(ValidationError):
        CategoryBudgetUpsert(category_id=VALID_UUID, monthly_limit=0)


# ============================================================
# Test 3: should raise ValidationError when CategoryBudgetUpsert monthly_limit is negative
# ============================================================

def test_category_budget_upsert_rejects_negative_limit():
    """should raise ValidationError when CategoryBudgetUpsert monthly_limit is negative"""
    with pytest.raises(ValidationError):
        CategoryBudgetUpsert(category_id=VALID_UUID, monthly_limit=-50.0)


def test_category_budget_upsert_rejects_overlimit():
    """should raise ValidationError when monthly_limit exceeds 1,000,000,000"""
    with pytest.raises(ValidationError):
        CategoryBudgetUpsert(category_id=VALID_UUID, monthly_limit=1_000_000_001.0)


def test_category_budget_upsert_rejects_short_category_id():
    """should raise ValidationError when category_id is shorter than 36 chars"""
    with pytest.raises(ValidationError):
        CategoryBudgetUpsert(category_id="too-short", monthly_limit=100.0)


def test_category_budget_upsert_rejects_long_category_id():
    """should raise ValidationError when category_id is longer than 36 chars"""
    with pytest.raises(ValidationError):
        CategoryBudgetUpsert(category_id="a" * 37, monthly_limit=100.0)


# ============================================================
# Test 4: should create CategoryBudgetResponse with all required fields
# ============================================================

def test_category_budget_response_has_required_fields():
    """should create CategoryBudgetResponse with all required fields"""
    from datetime import datetime

    obj = CategoryBudgetResponse(
        id="budget-uuid-001",
        household_id="household-uuid-123",
        category_id=VALID_UUID,
        category_name="Groceries",
        monthly_limit=200.0,
        created_at=datetime(2026, 1, 1, 0, 0, 0),
        updated_at=datetime(2026, 1, 1, 0, 0, 0),
    )

    assert obj.id == "budget-uuid-001"
    assert obj.household_id == "household-uuid-123"
    assert obj.category_id == VALID_UUID
    assert obj.category_name == "Groceries"
    assert obj.monthly_limit == 200.0


# ============================================================
# Test 5: should have budget field as Optional[float] defaulting to None on CategorySpend
# ============================================================

def test_category_spend_budget_field_defaults_to_none():
    """should have budget field as Optional[float] defaulting to None on CategorySpend"""
    # Arrange / Act
    obj = CategorySpend(category_name="Food", spent=55.0)

    # Assert
    assert obj.budget is None


def test_category_spend_budget_field_accepts_float():
    """should accept a float value for the budget field on CategorySpend"""
    # Arrange / Act
    obj = CategorySpend(category_name="Food", spent=55.0, budget=200.0)

    # Assert
    assert obj.budget == 200.0
