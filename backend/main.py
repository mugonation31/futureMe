"""
FastAPI backend for futureMe app
"""
from fastapi import FastAPI, Depends, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta, date as date_type
from typing import Optional
import jwt as pyjwt

from config import settings
from auth import get_current_user
from models import (
    UserSettingsUpdate, UserSettingsResponse,
    MessageResponse,
    CurrentUserContext,
    HouseholdCreate, HouseholdJoin, HouseholdResponse, HouseholdPublicResponse,
    RegisterRequest, LoginRequest, AuthResponse, AuthUser,
    RefreshRequest, AccessTokenResponse,
    ForgotPasswordRequest, ResetPasswordRequest,
    BudgetResponse, BudgetScope,
    IncomeStreamCreate, IncomeStreamUpdate, IncomeStreamResponse,
    LineItemCreate, LineItemUpdate, LineItemResponse,
    BudgetGoalsUpdate,
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
        return UserSettingsResponse(
            user_id=context.user_id,
            currency="GBP",
            monthly_budget=None,
            updated_at=datetime.now(timezone.utc),
        )
    return user_settings


@app.put("/api/settings", response_model=UserSettingsResponse)
async def update_settings(
    settings_data: UserSettingsUpdate,
    context: CurrentUserContext = Depends(get_current_user)
):
    updated = await db.upsert_user_settings(context.user_id, settings_data)
    return updated


# ============================================================
# Dashboard endpoint (stub — rebuilt in Task 22+ as the budget payload)
# ============================================================

@app.get("/api/dashboard")
async def get_dashboard(context: CurrentUserContext = Depends(get_current_user)):
    """Placeholder until the monthly-budget dashboard lands (Task 22+)."""
    return {"message": "Dashboard is being rebuilt for the Intentional Spending Tracker."}


# ============================================================
# Budget endpoint — current-month bootstrap (auto-create + seed)
# ============================================================

# How far from the current month a client may request. Bounds the auto-create
# write amplification (each new month seeds a budget + starter line items).
_MAX_BUDGET_MONTHS_AWAY = 12


def _budget_response_with_scope_invariant(data: dict) -> BudgetResponse:
    """Validate an assembled budget dict and enforce the scope invariant:
    personal budgets carry no household_id, household budgets carry no user_id.
    """
    budget = BudgetResponse.model_validate(data)
    if budget.scope == "personal":
        budget.household_id = None
    else:
        budget.user_id = None
    return budget


@app.get("/api/budget", response_model=BudgetResponse)
async def get_budget(
    month: Optional[date_type] = Query(
        None, description="Any date in the target month; normalised to first-of-month."
    ),
    scope: BudgetScope = Query("household"),
    context: CurrentUserContext = Depends(get_current_user),
):
    """Return the caller's budget for a month+scope, creating+seeding it on first access.

    Scope-branched auth: a single route cannot swap dependencies by query param, so
    we depend on get_current_user and enforce household membership in-handler when
    scope='household'. Tenant scoping (the WHERE predicate) lives entirely in the
    database layer.
    """
    # Default + normalise: DB CHECK requires month = first-of-month.
    today = datetime.now(timezone.utc).date()
    current_month = date_type(today.year, today.month, 1)
    if month is None:
        month = current_month
    else:
        month = month.replace(day=1)

    # Clamp to a sane window: this GET auto-creates a budget + seed rows per
    # distinct month, so reject far-off months to prevent write amplification.
    months_from_now = (month.year - current_month.year) * 12 + (
        month.month - current_month.month
    )
    if abs(months_from_now) > _MAX_BUDGET_MONTHS_AWAY:
        raise HTTPException(
            status_code=422,
            detail=f"month must be within {_MAX_BUDGET_MONTHS_AWAY} months of the current month",
        )

    async def _currency() -> str:
        """User's currency preference if present, else the DB default '$'."""
        user_settings = await db.get_user_settings(context.user_id)
        return (user_settings or {}).get("currency") or "$"

    if scope == "household":
        # get_household_by_user joins household_members WHERE user_id = caller, so a
        # non-None result already proves membership — no extra role check needed.
        household = await db.get_household_by_user(context.user_id)
        if household is None:
            raise HTTPException(status_code=403, detail="Not a member of any household")
        household_id = household["id"]
        await db.ensure_budget_for_month(
            "household", month=month, household_id=household_id, currency=await _currency()
        )
        data = await db.get_budget("household", month=month, household_id=household_id)
    else:
        await db.ensure_budget_for_month(
            "personal", month=month, user_id=context.user_id, currency=await _currency()
        )
        data = await db.get_budget("personal", month=month, user_id=context.user_id)

    if data is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    # Guarantee the BudgetResponse scope invariant (Task 21 deferred item).
    return _budget_response_with_scope_invariant(data)


# ============================================================
# Income streams — CRUD under a parent budget (Task 23)
# ============================================================
#
# Tenant isolation is enforced ENTIRELY in the database layer: each mutation
# gates on caller ownership of the parent budget in the same SQL statement
# (see database._owned_budget_predicate). The route never trusts the path
# budget_id — it forwards the caller's own user_id and treats a None result
# (not found / not owned) as a 404.


@app.post(
    "/api/budget/{budget_id}/income",
    response_model=IncomeStreamResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_income_stream(
    budget_id: str,
    body: IncomeStreamCreate,
    context: CurrentUserContext = Depends(get_current_user),
):
    row = await db.create_income_stream(
        budget_id, context.user_id, body.label, body.amount
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    return row


@app.patch(
    "/api/budget/{budget_id}/income/{income_id}",
    response_model=IncomeStreamResponse,
)
async def update_income_stream(
    budget_id: str,
    income_id: str,
    body: IncomeStreamUpdate,
    context: CurrentUserContext = Depends(get_current_user),
):
    row = await db.update_income_stream(
        budget_id, income_id, context.user_id,
        label=body.label, amount=body.amount,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Income stream not found")
    return row


@app.delete(
    "/api/budget/{budget_id}/income/{income_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_income_stream(
    budget_id: str,
    income_id: str,
    context: CurrentUserContext = Depends(get_current_user),
):
    deleted = await db.delete_income_stream(budget_id, income_id, context.user_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Income stream not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================
# Bucket line items + goals/currency — CRUD under a parent budget (Task 24)
# ============================================================
#
# Same isolation contract as income streams: every mutation gates on caller
# ownership of the parent budget in the SAME SQL statement (see
# database._owned_budget_predicate). The route never trusts the path budget_id —
# it forwards the caller's own user_id and treats a None result as a 404.


@app.post(
    "/api/budget/{budget_id}/line-items",
    response_model=LineItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_line_item(
    budget_id: str,
    body: LineItemCreate,
    context: CurrentUserContext = Depends(get_current_user),
):
    row = await db.create_line_item(
        budget_id, context.user_id, body.bucket, body.label, body.amount
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    return row


@app.patch(
    "/api/budget/{budget_id}/line-items/{item_id}",
    response_model=LineItemResponse,
)
async def update_line_item(
    budget_id: str,
    item_id: str,
    body: LineItemUpdate,
    context: CurrentUserContext = Depends(get_current_user),
):
    row = await db.update_line_item(
        budget_id, item_id, context.user_id,
        bucket=body.bucket, label=body.label, amount=body.amount,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Line item not found")
    return row


@app.delete(
    "/api/budget/{budget_id}/line-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_line_item(
    budget_id: str,
    item_id: str,
    context: CurrentUserContext = Depends(get_current_user),
):
    deleted = await db.delete_line_item(budget_id, item_id, context.user_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Line item not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch("/api/budget/{budget_id}", response_model=BudgetResponse)
async def update_budget_goals(
    budget_id: str,
    body: BudgetGoalsUpdate,
    context: CurrentUserContext = Depends(get_current_user),
):
    data = await db.update_budget_goals(
        budget_id, context.user_id,
        fundamentals_goal_pct=body.fundamentals_goal_pct,
        future_you_goal_pct=body.future_you_goal_pct,
        fun_goal_pct=body.fun_goal_pct,
        currency=body.currency,
    )
    if data is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    # Guarantee the BudgetResponse scope invariant (mirrors GET /api/budget).
    return _budget_response_with_scope_invariant(data)


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


