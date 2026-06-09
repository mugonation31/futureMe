"""
FastAPI backend for futureMe app
"""
from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional
import jwt as pyjwt

from config import settings
from auth import get_current_user
from models import (
    UserSettingsUpdate, UserSettingsResponse,
    DashboardStats, MessageResponse,
    CurrentUserContext,
    HouseholdCreate, HouseholdJoin, HouseholdResponse, HouseholdPublicResponse,
    RegisterRequest, LoginRequest, AuthResponse, AuthUser,
    RefreshRequest, AccessTokenResponse,
    CategoryCreate, CategoryResponse,
    TransactionCreate, TransactionUpdate, TransactionResponse,
    ForgotPasswordRequest, ResetPasswordRequest,
)
import database as db
import email_service
import hashlib


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_cors_for_production()
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _create_access_token(user_id: str, email: str, display_name: Optional[str]) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "display_name": display_name,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "purpose": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expiry_days),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm="HS256")


@app.get("/")
def root():
    return {"message": "futureMe API is running", "version": "1.0.0"}


@app.get("/health")
def health_check():
    return {"status": "OK"}


# ============================================================
# Auth endpoints
# ============================================================

@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
async def register(body: RegisterRequest):
    try:
        user = await db.create_user(body.email, body.password, body.first_name, body.last_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    token = _create_access_token(user["id"], user["email"], user.get("display_name"))
    refresh_token = _create_refresh_token(user["id"])
    return AuthResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=AuthUser(id=user["id"], email=user["email"], display_name=user.get("display_name")),
    )


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    user = await db.get_user_by_email(body.email)
    if not user or not db.verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = _create_access_token(user["id"], user["email"], user.get("display_name"))
    refresh_token = _create_refresh_token(user["id"])
    return AuthResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=AuthUser(id=user["id"], email=user["email"], display_name=user.get("display_name")),
    )


@app.post("/api/auth/refresh", response_model=AccessTokenResponse)
async def refresh_token(body: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    try:
        payload = pyjwt.decode(body.refresh_token, settings.jwt_secret, algorithms=["HS256"])
    except (pyjwt.ExpiredSignatureError, pyjwt.PyJWTError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    if payload.get("purpose") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token purpose")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Retrieve user to get email and display_name for the new access token
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access_token = _create_access_token(user["id"], user["email"], user.get("display_name"))
    return AccessTokenResponse(access_token=new_access_token)


@app.post("/api/auth/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest):
    """Initiate password reset. Always returns 200 to prevent email enumeration."""
    user = await db.get_user_by_email(body.email)
    try:
        if user:
            # Generate a short-lived HS256 JWT for the reset link
            expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
            reset_payload = {
                "sub": user["id"],
                "purpose": "password_reset",
                "exp": expires_at,
            }
            reset_token = pyjwt.encode(reset_payload, settings.jwt_secret, algorithm="HS256")

            # Store sha256(token) in DB so we can look it up and invalidate it
            token_hash = hashlib.sha256(reset_token.encode()).hexdigest()
            await db.create_password_reset_token(user["id"], token_hash, expires_at)

            reset_url = f"{settings.frontend_url}/reset-password?token={reset_token}"
            await email_service.send_password_reset_email(user["email"], reset_url)
    except Exception:
        # Swallow all errors to preserve anti-enumeration: callers must never be able
        # to distinguish a registered email (which might throw) from an unknown one.
        pass

    return MessageResponse(message="If that email is registered, a reset link has been sent.")


@app.post("/api/auth/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest):
    """Complete password reset using the token from the email link."""
    # Verify JWT signature and expiry
    try:
        payload = pyjwt.decode(body.token, settings.jwt_secret, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token has expired")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    # Verify purpose claim
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    # Look up token record by hash
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    token_record = await db.get_password_reset_token(token_hash)

    if not token_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token not found or already used")

    # Reject if already used
    if token_record.get("used_at") is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token has already been used")

    # Reject if expired (DB-level check as belt-and-suspenders)
    if token_record["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token has expired")

    # Hash new password and update user record + invalidate token atomically
    new_password_hash = db.hash_password(body.new_password)
    await db.reset_password_with_token(token_hash, user_id, new_password_hash)

    return MessageResponse(message="Password has been reset successfully.")


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
    stats = await db.get_dashboard_stats(context.user_id, context.household_id)
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


# ============================================================
# Category endpoints
# ============================================================

@app.get("/api/categories", response_model=list[CategoryResponse])
async def get_categories(context: CurrentUserContext = Depends(get_current_user)):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    return await db.get_categories(context.household_id)


@app.post("/api/categories", response_model=CategoryResponse, status_code=201)
async def create_category(
    body: CategoryCreate,
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    return await db.create_category(context.household_id, body.name, body.icon, body.color)


# ============================================================
# Transaction endpoints
# ============================================================

@app.get("/api/transactions", response_model=list[TransactionResponse])
async def get_transactions(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    return await db.get_transactions(context.household_id, month)


@app.post("/api/transactions", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    body: TransactionCreate,
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    return await db.create_transaction(context.household_id, context.user_id, body)


@app.get("/api/transactions/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: str,
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    t = await db.get_transaction(context.household_id, transaction_id)
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return t


@app.patch("/api/transactions/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    existing = await db.get_transaction(context.household_id, transaction_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    if existing["user_id"] != context.user_id:
        role = await db.get_member_role(context.user_id, context.household_id)
        if role != "owner":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this transaction")
    updated = await db.update_transaction(context.household_id, transaction_id, body)
    return updated


@app.delete("/api/transactions/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: str,
    context: CurrentUserContext = Depends(get_current_user),
):
    if context.household_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Household required")
    existing = await db.get_transaction(context.household_id, transaction_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    if existing["user_id"] != context.user_id:
        role = await db.get_member_role(context.user_id, context.household_id)
        if role != "owner":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this transaction")
    await db.delete_transaction(context.household_id, transaction_id)
