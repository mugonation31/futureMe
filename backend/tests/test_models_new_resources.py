"""
Tests for new resource Pydantic models:
Accounts, Income, Expenses, Debts, SavingsGoals, DashboardStats
"""
import pytest
from pydantic import ValidationError


# ============================================================
# Test 1: AccountCreate rejects name longer than 100 chars
# ============================================================

def test_should_reject_account_create_when_name_exceeds_100_chars():
    """should reject AccountCreate when name is longer than 100 characters"""
    # Arrange
    from models import AccountCreate
    long_name = "A" * 101

    # Act / Assert
    with pytest.raises(ValidationError):
        AccountCreate(name=long_name, type="checking")


# ============================================================
# Test 2: AccountCreate rejects invalid type
# ============================================================

def test_should_reject_account_create_when_type_is_not_valid():
    """should reject AccountCreate when type is not checking, savings, or cash"""
    # Arrange
    from models import AccountCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        AccountCreate(name="My Account", type="credit_card")


# ============================================================
# Test 3: AccountCreate accepts balance=0 (ge=0, not gt=0)
# ============================================================

def test_should_accept_account_create_with_balance_zero():
    """should accept AccountCreate when balance is 0 (ge=0 allows zero)"""
    # Arrange
    from models import AccountCreate

    # Act
    account = AccountCreate(name="My Account", type="checking", balance=0)

    # Assert
    assert account.balance == 0.0


# ============================================================
# Test 4: IncomeCreate rejects amount=0 (gt=0 required)
# ============================================================

def test_should_reject_income_create_when_amount_is_zero():
    """should reject IncomeCreate when amount is 0 (gt=0 required)"""
    # Arrange
    from models import IncomeCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        IncomeCreate(source="Salary", amount=0, frequency="monthly")


# ============================================================
# Test 5: IncomeCreate rejects invalid frequency
# ============================================================

def test_should_reject_income_create_when_frequency_is_invalid():
    """should reject IncomeCreate when frequency is not monthly, weekly, or annual"""
    # Arrange
    from models import IncomeCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        IncomeCreate(source="Salary", amount=3000.0, frequency="daily")


# ============================================================
# Test 6: ExpenseCreate accepts category=None (optional)
# ============================================================

def test_should_accept_expense_create_with_category_as_none():
    """should accept ExpenseCreate when category is None (optional field)"""
    # Arrange
    from models import ExpenseCreate

    # Act
    expense = ExpenseCreate(amount=50.0)

    # Assert
    assert expense.category is None


# ============================================================
# Test 7: ExpenseCreate rejects amount=0
# ============================================================

def test_should_reject_expense_create_when_amount_is_zero():
    """should reject ExpenseCreate when amount is 0 (gt=0 required)"""
    # Arrange
    from models import ExpenseCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        ExpenseCreate(amount=0)


# ============================================================
# Test 8: DebtCreate rejects interest_rate > 100
# ============================================================

def test_should_reject_debt_create_when_interest_rate_exceeds_100():
    """should reject DebtCreate when interest_rate is greater than 100"""
    # Arrange
    from models import DebtCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        DebtCreate(name="Car Loan", balance=5000.0, interest_rate=101.0)


# ============================================================
# Test 9: DebtCreate rejects balance=0 (gt=0 required)
# ============================================================

def test_should_reject_debt_create_when_balance_is_zero():
    """should reject DebtCreate when balance is 0 (gt=0 required)"""
    # Arrange
    from models import DebtCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        DebtCreate(name="Car Loan", balance=0)


# ============================================================
# Test 10: SavingsGoalCreate rejects current_amount > target_amount
# ============================================================

def test_should_reject_savings_goal_create_when_current_exceeds_target():
    """should reject SavingsGoalCreate when current_amount exceeds target_amount"""
    # Arrange
    from models import SavingsGoalCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        SavingsGoalCreate(name="Holiday Fund", target_amount=1000.0, current_amount=1001.0)


# ============================================================
# Test 11: SavingsGoalCreate accepts current_amount == target_amount (boundary)
# ============================================================

def test_should_accept_savings_goal_create_when_current_equals_target():
    """should accept SavingsGoalCreate when current_amount equals target_amount (boundary)"""
    # Arrange
    from models import SavingsGoalCreate

    # Act
    goal = SavingsGoalCreate(name="Holiday Fund", target_amount=1000.0, current_amount=1000.0)

    # Assert
    assert goal.current_amount == goal.target_amount


# ============================================================
# Test 12: DashboardStats has correct default values
# ============================================================

def test_should_create_dashboard_stats_with_correct_defaults():
    """should create DashboardStats with all numeric defaults as zero and empty savings list"""
    # Arrange / Act
    from models import DashboardStats

    stats = DashboardStats()

    # Assert
    assert stats.total_income == 0.0
    assert stats.total_expenses == 0.0
    assert stats.net_position == 0.0
    assert stats.savings_progress == []
    assert stats.emergency_fund_status.current_amount == 0.0
    assert stats.emergency_fund_status.target_amount == 0.0
    assert stats.emergency_fund_status.months_covered is None
    assert stats.debt_summary.total_owed == 0.0
    assert stats.debt_summary.total_minimum_payments == 0.0
    assert stats.debt_summary.debt_count == 0


# ============================================================
# Test 13: SavingsGoalUpdate rejects current_amount > target_amount
# ============================================================

def test_should_reject_savings_goal_update_when_current_exceeds_target():
    """should reject SavingsGoalUpdate when current_amount > target_amount (both provided)"""
    # Arrange
    from models import SavingsGoalUpdate

    # Act / Assert
    with pytest.raises(ValidationError):
        SavingsGoalUpdate(target_amount=500.0, current_amount=600.0)


# ============================================================
# Test 14: DebtUpdate does not expose a balance field (derived from payment log)
# ============================================================

def test_should_not_expose_balance_on_debt_update():
    """should not allow direct balance mutation via DebtUpdate — balance is derived from the payment log"""
    # Arrange
    from models import DebtUpdate
    import pydantic

    # Act — passing balance should either be silently ignored (extra='ignore')
    # or raise a validation error; either way, the model must not have a balance field
    debt = DebtUpdate(name="Car loan")

    # Assert — DebtUpdate has no balance attribute
    assert not hasattr(debt, "balance"), (
        "DebtUpdate must not expose a 'balance' field — balance is derived "
        "from starting_balance minus confirmed payments"
    )


# ============================================================
# Test 15: AccountCreate rejects currency shorter than 3 chars
# ============================================================

def test_should_reject_account_create_when_currency_is_shorter_than_3_chars():
    """should reject AccountCreate when currency is shorter than 3 characters (not valid ISO-4217)"""
    # Arrange
    from models import AccountCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        AccountCreate(name="My Account", type="checking", currency="GB")


# ============================================================
# Test 16: IncomeCreate.source rejects string with NUL byte
# ============================================================

def test_should_reject_income_create_when_source_contains_nul_byte():
    """should reject IncomeCreate when source contains a NUL byte (security: BiDi/NUL sanitisation)"""
    # Arrange
    from models import IncomeCreate

    # Act / Assert
    with pytest.raises(ValidationError):
        IncomeCreate(source="Salary\x00hack", amount=1000.0, frequency="monthly")


# ============================================================
# Test 17: ExpenseCreate.description strips leading/trailing whitespace
# ============================================================

def test_should_strip_whitespace_from_expense_create_description():
    """should strip leading and trailing whitespace from ExpenseCreate.description"""
    # Arrange
    from models import ExpenseCreate

    # Act
    expense = ExpenseCreate(amount=10.0, description="  groceries  ")

    # Assert
    assert expense.description == "groceries"
