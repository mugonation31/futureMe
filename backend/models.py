"""
Pydantic models for request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class UserSettingsUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=200)
    currency: Optional[str] = Field(None, max_length=10)
    monthly_budget: Optional[float] = Field(None, ge=0)


class UserSettingsResponse(BaseModel):
    id: str
    user_id: str
    display_name: Optional[str]
    currency: Optional[str]
    monthly_budget: Optional[float]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_budget: float = 0.0
    total_spent: float = 0.0
    remaining_budget: float = 0.0
    savings_rate: float = 0.0


class MessageResponse(BaseModel):
    message: str


class HouseholdCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class HouseholdJoin(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=20)


class HouseholdPublicResponse(BaseModel):
    """Household data safe to return to any member (no invite_code)."""
    id: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class HouseholdResponse(BaseModel):
    """Full household data including invite_code — owner-only endpoints."""
    id: str
    name: str
    invite_code: str
    created_at: datetime
    created_by: str

    class Config:
        from_attributes = True


class HouseholdMemberResponse(BaseModel):
    id: str
    household_id: str
    user_id: str
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class CurrentUserContext(BaseModel):
    user_id: str
    household_id: Optional[str] = None
