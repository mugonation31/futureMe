"""
FastAPI backend for futureMe app
"""
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
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
    DashboardStats,
    AccountCreate, AccountUpdate, AccountResponse,
    IncomeCreate, IncomeUpdate, IncomeResponse,
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    DebtCreate, DebtUpdate, DebtResponse,
    DebtPaymentCreate, DebtPaymentResponse,
    SavingsGoalCreate, SavingsGoalUpdate, SavingsGoalResponse,
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


# Authorization policy: all endpoints that require a household must use this
# dependency. It ensures the user is authenticated AND belongs to a household.
def require_household(context: CurrentUserContext = Depends(get_current_user)) -> CurrentUserContext:
    """Dependency that enforces a household is set up, returning the full user context."""
    if not context.household_id:
        raise HTTPException(status_code=403, detail="Household not set up")
    return context


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
# Dashboard endpoint
# ============================================================

@app.get("/api/dashboard", response_model=DashboardStats)
async def get_dashboard(context: CurrentUserContext = Depends(get_current_user)):
    if not context.household_id:
        return DashboardStats()
    stats = await db.get_dashboard_stats(context.household_id)
    return DashboardStats(**stats)


# ============================================================
# Accounts endpoints
# ============================================================

@app.get("/api/accounts", response_model=list[AccountResponse])
async def list_accounts(ctx: CurrentUserContext = Depends(require_household)):
    return await db.get_accounts(ctx.household_id)


@app.post("/api/accounts", response_model=AccountResponse, status_code=201)
async def create_account(
    body: AccountCreate,
    ctx: CurrentUserContext = Depends(require_household),
):
    return await db.create_account(ctx.household_id, body)


@app.patch("/api/accounts/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: str,
    body: AccountUpdate,
    ctx: CurrentUserContext = Depends(require_household),
):
    account = await db.update_account(account_id, ctx.household_id, body)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@app.delete("/api/accounts/{account_id}", status_code=204)
async def delete_account(
    account_id: str,
    ctx: CurrentUserContext = Depends(require_household),
):
    deleted = await db.delete_account(account_id, ctx.household_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Account not found")


# ============================================================
# Income endpoints
# ============================================================

@app.get("/api/income", response_model=list[IncomeResponse])
async def list_income(ctx: CurrentUserContext = Depends(require_household)):
    return await db.get_income_entries(ctx.household_id)


@app.post("/api/income", response_model=IncomeResponse, status_code=201)
async def create_income(
    body: IncomeCreate,
    ctx: CurrentUserContext = Depends(require_household),
):
    return await db.create_income_entry(ctx.household_id, ctx.user_id, body)


@app.patch("/api/income/{entry_id}", response_model=IncomeResponse)
async def update_income(
    entry_id: str,
    body: IncomeUpdate,
    ctx: CurrentUserContext = Depends(require_household),
):
    entry = await db.update_income_entry(entry_id, ctx.household_id, body)
    if entry is None:
        raise HTTPException(status_code=404, detail="Income entry not found")
    return entry


@app.delete("/api/income/{entry_id}", status_code=204)
async def delete_income(
    entry_id: str,
    ctx: CurrentUserContext = Depends(require_household),
):
    deleted = await db.delete_income_entry(entry_id, ctx.household_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Income entry not found")


# ============================================================
# Expenses endpoints
# ============================================================

@app.get("/api/expenses", response_model=list[ExpenseResponse])
async def list_expenses(ctx: CurrentUserContext = Depends(require_household)):
    return await db.get_expenses(ctx.household_id)


@app.post("/api/expenses", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    body: ExpenseCreate,
    ctx: CurrentUserContext = Depends(require_household),
):
    return await db.create_expense(ctx.household_id, ctx.user_id, body)


@app.patch("/api/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    ctx: CurrentUserContext = Depends(require_household),
):
    expense = await db.update_expense(expense_id, ctx.household_id, body)
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@app.delete("/api/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: str,
    ctx: CurrentUserContext = Depends(require_household),
):
    deleted = await db.delete_expense(expense_id, ctx.household_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Expense not found")


# ============================================================
# Debts endpoints
# ============================================================

@app.get("/api/debts", response_model=list[DebtResponse])
async def list_debts(ctx: CurrentUserContext = Depends(require_household)):
    return await db.get_debts(ctx.household_id)


@app.post("/api/debts", response_model=DebtResponse, status_code=201)
async def create_debt(
    body: DebtCreate,
    ctx: CurrentUserContext = Depends(require_household),
):
    return await db.create_debt(ctx.household_id, ctx.user_id, body)


@app.patch("/api/debts/{debt_id}", response_model=DebtResponse)
async def update_debt(
    debt_id: str,
    body: DebtUpdate,
    ctx: CurrentUserContext = Depends(require_household),
):
    debt = await db.update_debt(debt_id, ctx.household_id, body)
    if debt is None:
        raise HTTPException(status_code=404, detail="Debt not found")
    return debt


@app.delete("/api/debts/{debt_id}", status_code=204)
async def delete_debt(
    debt_id: str,
    ctx: CurrentUserContext = Depends(require_household),
):
    deleted = await db.delete_debt(debt_id, ctx.household_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Debt not found")


@app.post("/api/debts/{debt_id}/payments", response_model=DebtPaymentResponse, status_code=201)
async def confirm_debt_payment(
    debt_id: str,
    body: DebtPaymentCreate,
    ctx: CurrentUserContext = Depends(require_household),
):
    try:
        payment = await db.create_debt_payment(debt_id, ctx.household_id, ctx.user_id, body)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return payment


@app.get("/api/debts/{debt_id}/payments", response_model=list[DebtPaymentResponse])
async def list_debt_payments(
    debt_id: str,
    ctx: CurrentUserContext = Depends(require_household),
):
    try:
        payments = await db.get_debt_payments(debt_id, ctx.household_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return payments


# ============================================================
# Savings Goals endpoints
# ============================================================

@app.get("/api/savings-goals", response_model=list[SavingsGoalResponse])
async def list_savings_goals(ctx: CurrentUserContext = Depends(require_household)):
    return await db.get_savings_goals(ctx.household_id)


@app.post("/api/savings-goals", response_model=SavingsGoalResponse, status_code=201)
async def create_savings_goal(
    body: SavingsGoalCreate,
    ctx: CurrentUserContext = Depends(require_household),
):
    return await db.create_savings_goal(ctx.household_id, body)


@app.patch("/api/savings-goals/{goal_id}", response_model=SavingsGoalResponse)
async def update_savings_goal(
    goal_id: str,
    body: SavingsGoalUpdate,
    ctx: CurrentUserContext = Depends(require_household),
):
    goal = await db.update_savings_goal(goal_id, ctx.household_id, body)
    if goal is None:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    return goal


@app.delete("/api/savings-goals/{goal_id}", status_code=204)
async def delete_savings_goal(
    goal_id: str,
    ctx: CurrentUserContext = Depends(require_household),
):
    deleted = await db.delete_savings_goal(goal_id, ctx.household_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Savings goal not found")


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


