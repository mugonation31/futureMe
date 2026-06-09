"""
Pydantic models for request/response validation
"""
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
from datetime import date as date_type

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


# ============================================================
# Auth models
# ============================================================

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1, max_length=100)

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
# Category models
# ============================================================

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=7)

    @field_validator("color")
    @classmethod
    def color_must_be_hex(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", v):
            raise ValueError("color must be a valid hex color code (e.g. #FF5733)")
        return v


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: Optional[str] = None
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: bool
    created_at: datetime


# ============================================================
# Transaction models
# ============================================================

class TransactionCreate(BaseModel):
    amount: float = Field(..., gt=0)
    type: Literal["expense", "income"]
    description: Optional[str] = None
    date: date_type = Field(default_factory=date_type.today)
    category_id: Optional[str] = None


class TransactionUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    type: Optional[Literal["expense", "income"]] = None
    description: Optional[str] = None
    date: Optional[date_type] = None
    category_id: Optional[str] = None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    amount: float
    type: str
    description: Optional[str] = None
    date: date_type
    created_at: datetime
    updated_at: datetime


class CategorySpend(BaseModel):
    category_name: str
    spent: float


# ============================================================
# Dashboard models
# ============================================================

class DashboardStats(BaseModel):
    total_budget: float = 0.0
    total_spent: float = 0.0
    remaining_budget: float = 0.0
    savings_rate: float = 0.0
    category_breakdown: list[CategorySpend] = []


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


class HouseholdMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    household_id: str
    user_id: str
    role: str
    joined_at: datetime
