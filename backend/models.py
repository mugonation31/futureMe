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
# Intentional Spending Tracker — core models (50/30/20)
# ============================================================

BucketKey = Literal["fundamentals", "future_you", "fun"]
BudgetScope = Literal["personal", "household"]


class IncomeStreamCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., ge=0)

    @field_validator("label")
    @classmethod
    def sanitise_text_fields(cls, v):
        v = _sanitise_text(v)
        if not v:
            raise ValueError("label cannot be blank")
        return v


class IncomeStreamUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, ge=0)

    @field_validator("label", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class IncomeStreamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    budget_id: str
    label: str
    amount: float
    position: int = 0
    created_at: datetime
    updated_at: datetime


class LineItemCreate(BaseModel):
    bucket: BucketKey
    label: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., ge=0)

    @field_validator("label")
    @classmethod
    def sanitise_text_fields(cls, v):
        v = _sanitise_text(v)
        if not v:
            raise ValueError("label cannot be blank")
        return v


class LineItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bucket: Optional[BucketKey] = None
    label: Optional[str] = Field(None, min_length=1, max_length=200)
    amount: Optional[float] = Field(None, ge=0)

    @field_validator("label", mode="before")
    @classmethod
    def sanitise_text_fields(cls, v):
        if v is None:
            return v
        return _sanitise_text(v)


class LineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    budget_id: str
    bucket: BucketKey
    label: str
    amount: float
    position: int = 0
    created_at: datetime
    updated_at: datetime


class BudgetGoalsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fundamentals_goal_pct: Optional[float] = Field(None, ge=0, le=100)
    future_you_goal_pct: Optional[float] = Field(None, ge=0, le=100)
    fun_goal_pct: Optional[float] = Field(None, ge=0, le=100)
    currency: Optional[str] = Field(None, min_length=1, max_length=10)

    @field_validator("currency", mode="before")
    @classmethod
    def sanitise_currency(cls, v):
        if v is None:
            return v
        v = _sanitise_text(v)
        if not v:
            raise ValueError("currency cannot be blank")
        return v


class BudgetGoals(BaseModel):
    """The three editable goal percentages carried on a budget."""
    fundamentals_goal_pct: float
    future_you_goal_pct: float
    fun_goal_pct: float


class BucketDashboard(BaseModel):
    """Computed, colour-flagged summary for a single bucket."""
    bucket: BucketKey
    goal_pct: float
    ideal_amount: float
    actual_pct: float
    bucket_total: float
    available_to_spend: float
    is_over_flag: bool


class BucketView(BaseModel):
    """A bucket's line items plus its computed dashboard."""
    line_items: list[LineItemResponse] = Field(default_factory=list)
    dashboard: BucketDashboard


class BudgetBuckets(BaseModel):
    """The three buckets in canonical order: Fundamentals, Future You, Fun."""
    fundamentals: BucketView
    future_you: BucketView
    fun: BucketView


class AllocationStatus(BaseModel):
    """Whether the user has money left to allocate, is balanced, or over."""
    state: Literal["left", "balanced", "over"]
    amount: float
    message: str


class BudgetResponse(BaseModel):
    """The single monthly-budget payload the frontend reads.

    Ownership is scope-based: personal = user_id set + household_id NULL;
    household = household_id set + user_id NULL. Both are carried so later
    tasks can gate reads/writes by ownership.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str
    scope: BudgetScope
    user_id: Optional[str] = None
    household_id: Optional[str] = None
    month: date_type
    currency: str
    goals: BudgetGoals
    total_income: float
    income_streams: list[IncomeStreamResponse] = Field(default_factory=list)
    buckets: BudgetBuckets
    allocation_status: AllocationStatus


class HouseholdMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    role: str
    joined_at: datetime
