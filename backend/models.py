"""
Pydantic models for request/response validation
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, Literal
from datetime import datetime, date as date_type

_SPECIAL_CHARS = set("!@#$%^&*()_+-=[]{}|;':\",./<>?")


def _validate_password_complexity(v: str) -> str:
    """Require at least one digit and one special character."""
    has_digit = any(c.isdigit() for c in v)
    has_special = any(c in _SPECIAL_CHARS for c in v)
    if not has_digit or not has_special:
        raise ValueError(
            "Password must contain at least one digit and one special character (e.g. !, @, #)."
        )
    return v


def _sanitise_text(v: str) -> str:
    """Strip whitespace, reject NUL bytes and BiDi control characters."""
    v = v.strip()
    bidi = set(range(0x202A, 0x202F)) | set(range(0x2066, 0x206A))
    if any(ord(c) == 0 or ord(c) in bidi for c in v):
        raise ValueError("contains invalid characters")
    return v


# ============================================================
# Auth models
# ============================================================

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=6)
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)

    @field_validator("first_name", "last_name")
    @classmethod
    def names_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be blank or whitespace-only")
        bidi = set(range(0x202A, 0x202F)) | set(range(0x2066, 0x206A))
        if any(ord(c) in bidi or ord(c) == 0 for c in v):
            raise ValueError("contains invalid characters")
        return v

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., max_length=2048)
    new_password: str = Field(..., min_length=6)

    @field_validator("new_password")
    @classmethod
    def new_password_complexity(cls, v: str) -> str:
        return _validate_password_complexity(v)


class LoginRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=1)


class AuthUser(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: AuthUser


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str


# ============================================================
# Settings models
# ============================================================

class UserSettingsUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=200)
    currency: Optional[str] = Field(None, max_length=10)
    monthly_budget: Optional[float] = Field(None, ge=0)


class UserSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    display_name: Optional[str] = None
    currency: Optional[str] = None
    monthly_budget: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: datetime


# ============================================================
# Shared models
# ============================================================

class MessageResponse(BaseModel):
    message: str


class CurrentUserContext(BaseModel):
    user_id: str
    household_id: Optional[str] = None


# ============================================================
# Household models
# ============================================================

class HouseholdCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class HouseholdJoin(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=20)


class HouseholdPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class HouseholdResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    invite_code: str
    created_at: datetime
    created_by: str


# ============================================================
# Account models
# ============================================================

class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: Literal["checking", "savings", "cash"]
    balance: float = Field(default=0.0, ge=0)
    currency: str = Field(default="GBP", min_length=3, max_length=3)

    @field_validator("name")
    @classmethod
    def sanitise_text_fields(cls, v):
        return _sanitise_text(v)


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[Literal["checking", "savings", "cash"]] = None
    balance: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)

    @field_validator("name", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    name: str
    type: str
    balance: float
    currency: str
    created_at: datetime
    updated_at: datetime


# ============================================================
# Income models
# ============================================================

class IncomeCreate(BaseModel):
    source: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    frequency: Literal["monthly", "weekly", "annual"]

    @field_validator("source")
    @classmethod
    def sanitise_text_fields(cls, v):
        return _sanitise_text(v)


class IncomeUpdate(BaseModel):
    source: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, gt=0)
    frequency: Optional[Literal["monthly", "weekly", "annual"]] = None

    @field_validator("source", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class IncomeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    source: str
    amount: float
    frequency: str
    created_at: datetime
    updated_at: datetime


# ============================================================
# Expense models
# ============================================================

class ExpenseCreate(BaseModel):
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: float = Field(..., gt=0)
    date: date_type = Field(default_factory=date_type.today)
    is_recurring: bool = False

    @field_validator("category", "description", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class ExpenseUpdate(BaseModel):
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: Optional[float] = Field(None, gt=0)
    date: Optional[date_type] = None
    is_recurring: Optional[bool] = None

    @field_validator("category", "description", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    category: Optional[str]
    description: Optional[str]
    amount: float
    date: date_type
    is_recurring: bool
    created_at: datetime
    updated_at: datetime


# ============================================================
# Debt models
# ============================================================

class DebtCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    balance: float = Field(..., gt=0)
    interest_rate: float = Field(default=0.0, ge=0, le=100)
    minimum_payment: float = Field(default=0.0, ge=0)
    target_payoff_date: Optional[date_type] = None

    @field_validator("name")
    @classmethod
    def sanitise_text_fields(cls, v):
        return _sanitise_text(v)


class DebtUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    balance: Optional[float] = Field(None, ge=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    minimum_payment: Optional[float] = Field(None, ge=0)
    target_payoff_date: Optional[date_type] = None

    @field_validator("name", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class DebtResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    name: str
    balance: float
    interest_rate: float
    minimum_payment: float
    target_payoff_date: Optional[date_type]
    created_at: datetime
    updated_at: datetime


# ============================================================
# Savings goal models
# ============================================================

class SavingsGoalCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    target_amount: float = Field(..., gt=0)
    current_amount: float = Field(default=0.0, ge=0)
    deadline: Optional[date_type] = None

    @field_validator("name")
    @classmethod
    def sanitise_text_fields(cls, v):
        return _sanitise_text(v)

    @field_validator("current_amount")
    @classmethod
    def current_must_not_exceed_target(cls, v, info):
        target = info.data.get("target_amount")
        if target is not None and v > target:
            raise ValueError("current_amount cannot exceed target_amount")
        return v


class SavingsGoalUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    target_amount: Optional[float] = Field(None, gt=0)
    current_amount: Optional[float] = Field(None, ge=0)
    deadline: Optional[date_type] = None

    @field_validator("name", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)

    @field_validator("current_amount")
    @classmethod
    def current_must_not_exceed_target(cls, v, info):
        target = info.data.get("target_amount")
        if v is not None and target is not None and v > target:
            raise ValueError("current_amount cannot exceed target_amount")
        return v


class SavingsGoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    name: str
    target_amount: float
    current_amount: float
    deadline: Optional[date_type]
    created_at: datetime
    updated_at: datetime


# ============================================================
# Dashboard models
# ============================================================

class DebtSummary(BaseModel):
    total_owed: float = 0.0
    total_minimum_payments: float = 0.0
    debt_count: int = 0


class EmergencyFundStatus(BaseModel):
    current_amount: float = 0.0
    target_amount: float = 0.0
    months_covered: Optional[float] = None


class SavingsProgress(BaseModel):
    goal_name: str
    target_amount: float
    current_amount: float
    percent: float


class DashboardStats(BaseModel):
    total_income: float = 0.0
    total_expenses: float = 0.0
    net_position: float = 0.0
    emergency_fund_status: EmergencyFundStatus = Field(default_factory=EmergencyFundStatus)
    debt_summary: DebtSummary = Field(default_factory=DebtSummary)
    savings_progress: list[SavingsProgress] = Field(default_factory=list)


class HouseholdMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    role: str
    joined_at: datetime
