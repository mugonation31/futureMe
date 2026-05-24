"""
FastAPI backend for futureMe app with Supabase authentication
"""
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from auth import get_current_user
from models import (
    UserSettingsUpdate, UserSettingsResponse,
    DashboardStats, MessageResponse,
    CurrentUserContext,
    HouseholdCreate, HouseholdJoin, HouseholdResponse, HouseholdPublicResponse,
)
import database as db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.get_pool()
    yield
    await db.close_pool()


app = FastAPI(
    title="futureMe API",
    description="Backend API for futureMe home budgeting app",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "futureMe API is running", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "OK"}


# ============================================================
# Settings endpoints
# ============================================================

@app.get("/api/settings", response_model=UserSettingsResponse)
async def get_settings(context: CurrentUserContext = Depends(get_current_user)):
    user_settings = await db.get_user_settings(context.user_id)
    if not user_settings:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Settings not found")
    return user_settings


@app.put("/api/settings", response_model=UserSettingsResponse)
async def update_settings(
    settings_data: UserSettingsUpdate,
    context: CurrentUserContext = Depends(get_current_user)
):
    updated = await db.upsert_user_settings(context.user_id, settings_data)
    return updated


# ============================================================
# Dashboard endpoint
# ============================================================

@app.get("/api/dashboard", response_model=DashboardStats)
async def get_dashboard(context: CurrentUserContext = Depends(get_current_user)):
    stats = await db.get_dashboard_stats(context.user_id)
    return stats


# ============================================================
# Household endpoints
# ============================================================

@app.post("/api/households", response_model=HouseholdResponse)
async def create_household(
    body: HouseholdCreate,
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already belongs to a household",
        )
    household = await db.create_household(context.user_id, body.name)
    return household


@app.get("/api/households/me", response_model=HouseholdPublicResponse)
async def get_my_household(context: CurrentUserContext = Depends(get_current_user)):
    if context.household_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No household found",
        )
    household = await db.get_household_by_user(context.user_id)
    return household


@app.get("/api/households/invite-code", response_model=HouseholdResponse)
async def get_invite_code(context: CurrentUserContext = Depends(get_current_user)):
    """Owner-only: returns full household response including invite_code."""
    if context.household_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No household found",
        )
    role = await db.get_member_role(context.user_id, context.household_id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the household owner can view the invite code",
        )
    household = await db.get_household_by_user(context.user_id)
    return household


@app.post("/api/households/join", response_model=HouseholdPublicResponse)
async def join_household(
    body: HouseholdJoin,
    context: CurrentUserContext = Depends(get_current_user),
):
    # H5: rate-limit this endpoint to prevent invite-code enumeration.
    # Add slowapi middleware (pip install slowapi) before deploying to production.
    if context.household_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already belongs to a household",
        )
    household = await db.get_household_by_invite_code(body.invite_code)
    if household is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite code not found",
        )
    await db.join_household(context.user_id, household["id"])
    return household
