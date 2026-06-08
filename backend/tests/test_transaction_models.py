"""
Tests for transaction and category Pydantic models (Task 21).
"""
import pytest
from pydantic import ValidationError
from datetime import date

from models import (
    CategoryCreate,
    TransactionCreate,
    TransactionUpdate,
    DashboardStats,
)


# ============================================================
# CategoryCreate
# ============================================================

def test_category_create_valid():
    """should accept a CategoryCreate with a valid name"""
    cat = CategoryCreate(name="Food")
    assert cat.name == "Food"
    assert cat.icon is None
    assert cat.color is None


def test_category_create_rejects_empty_name():
    """should raise ValidationError when CategoryCreate is given an empty name"""
    with pytest.raises(ValidationError):
        CategoryCreate(name="")


# ============================================================
# TransactionCreate
# ============================================================

def test_transaction_create_rejects_zero_amount():
    """should raise ValidationError when TransactionCreate amount is 0"""
    with pytest.raises(ValidationError):
        TransactionCreate(amount=0, type="expense")


def test_transaction_create_rejects_negative_amount():
    """should raise ValidationError when TransactionCreate amount is negative"""
    with pytest.raises(ValidationError):
        TransactionCreate(amount=-1, type="income")


def test_transaction_create_rejects_invalid_type():
    """should raise ValidationError when TransactionCreate type is not expense or income"""
    with pytest.raises(ValidationError):
        TransactionCreate(amount=10.0, type="other")


# ============================================================
# TransactionUpdate
# ============================================================

def test_transaction_update_all_optional():
    """should create a valid TransactionUpdate with no arguments"""
    update = TransactionUpdate()
    assert update.amount is None
    assert update.type is None
    assert update.description is None
    assert update.date is None
    assert update.category_id is None


# ============================================================
# DashboardStats
# ============================================================

def test_dashboard_stats_has_category_breakdown():
    """should default category_breakdown to an empty list"""
    stats = DashboardStats()
    assert stats.category_breakdown == []
