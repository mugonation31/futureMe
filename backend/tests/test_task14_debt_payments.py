"""
Task 14 — Backend: debt payment models + endpoints

Acceptance criteria:
1. DebtPaymentCreate Pydantic model with amount: Decimal gt=0 and paid_for_month: date
2. DebtPaymentResponse Pydantic model (id, debt_id, household_id, user_id, amount, paid_for_month, confirmed_at)
3. Backend normalises paid_for_month to the first of the month before insert
4. POST /api/debts/{debt_id}/payments — confirms a payment (household-scoped), returns updated derived debt balance
5. A second confirmation for same (debt_id, paid_for_month) must be rejected with 409 — handle asyncpg.UniqueViolationError
6. GET /api/debts/{debt_id}/payments — lists confirmed payments, household-scoped, newest first
7. 401 if unauthenticated, 403/404 if the debt is not in caller's household

Tests follow the mock pattern from test_task13_debt_balance.py.
"""
import pytest
from decimal import Decimal
from datetime import date
from unittest.mock import MagicMock, AsyncMock, patch


# ============================================================
# Shared helpers (mirror pattern from test_task13_debt_balance.py)
# ============================================================

def make_row(data: dict):
    """Create a fake asyncpg-style row from a dict."""
    return type("Row", (), {
        "__iter__": lambda self: iter(data.items()),
        "items": lambda self: data.items(),
        "keys": lambda self: data.keys(),
        "__getitem__": lambda self, k: data[k],
    })()


def make_mock_pool(mock_conn):
    """Build a mock asyncpg pool that yields mock_conn on acquire()."""
    mock_pool = MagicMock()
    acquire_ctx = MagicMock()
    acquire_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    acquire_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = acquire_ctx
    return mock_pool


# ============================================================
# Test 1 — DebtPaymentCreate model accepts valid input
# ============================================================

def test_should_accept_valid_amount_and_paid_for_month_in_debt_payment_create():
    """should accept valid amount (Decimal gt=0) and paid_for_month (date) in DebtPaymentCreate"""
    from models import DebtPaymentCreate

    # Arrange + Act
    payment = DebtPaymentCreate(amount=Decimal("250.00"), paid_for_month=date(2026, 6, 16))

    # Assert
    assert payment.amount == Decimal("250.00")
    assert payment.paid_for_month == date(2026, 6, 16)


# ============================================================
# Test 2 — DebtPaymentCreate rejects amount <= 0
# ============================================================

def test_should_reject_non_positive_amount_in_debt_payment_create():
    """should reject amount <= 0 in DebtPaymentCreate"""
    from models import DebtPaymentCreate
    from pydantic import ValidationError

    # Assert — zero is rejected
    with pytest.raises(ValidationError):
        DebtPaymentCreate(amount=Decimal("0"), paid_for_month=date(2026, 6, 1))

    # Assert — negative is rejected
    with pytest.raises(ValidationError):
        DebtPaymentCreate(amount=Decimal("-50.00"), paid_for_month=date(2026, 6, 1))


# ============================================================
# Test 3 — DebtPaymentResponse has all required fields
# ============================================================

def test_should_have_all_required_fields_in_debt_payment_response():
    """should have id, debt_id, household_id, user_id, amount, paid_for_month, confirmed_at in DebtPaymentResponse"""
    from models import DebtPaymentResponse

    fields = DebtPaymentResponse.model_fields
    required_fields = {"id", "debt_id", "household_id", "user_id", "amount", "paid_for_month", "confirmed_at"}

    for field in required_fields:
        assert field in fields, (
            f"DebtPaymentResponse must have field '{field}'"
        )


# ============================================================
# Test 4 — create_debt_payment normalises paid_for_month to first of month
# ============================================================

@pytest.mark.asyncio
async def test_should_normalise_paid_for_month_to_first_of_month_in_create_debt_payment():
    """should normalise paid_for_month to first of month (e.g. 2026-06-16 → 2026-06-01) before insert"""
    import database

    # Arrange — DB returns the inserted payment row
    payment_row = make_row({
        "id": "pay-uuid",
        "debt_id": "debt-uuid",
        "household_id": "hh-uuid",
        "user_id": "user-uuid",
        "amount": Decimal("200.00"),
        "paid_for_month": date(2026, 6, 1),   # normalised to first of month
        "confirmed_at": "2026-06-16T12:00:00Z",
    })
    # get_debts returns the updated debt with derived balance
    debt_row = make_row({
        "id": "debt-uuid",
        "household_id": "hh-uuid",
        "name": "Car Loan",
        "starting_balance": Decimal("5000.00"),
        "balance": Decimal("4800.00"),
        "interest_rate": Decimal("5.0"),
        "minimum_payment": Decimal("200.00"),
        "created_at": "2025-01-01",
        "updated_at": "2026-06-16",
    })

    debt_ownership_row = make_row({"id": "debt-uuid"})

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [debt_ownership_row, payment_row]

    mock_pool = make_mock_pool(mock_conn)

    from models import DebtPaymentCreate
    data = DebtPaymentCreate(amount=Decimal("200.00"), paid_for_month=date(2026, 6, 16))

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.create_debt_payment("debt-uuid", "hh-uuid", "user-uuid", data)

    # Assert — the INSERT SQL was called with the first of the month (2026-06-01), not 2026-06-16
    # call_args_list[1] is the second call (INSERT), [0] is ownership check
    insert_call_args = mock_conn.fetchrow.call_args_list[1][0]  # positional args to second fetchrow
    # insert_call_args[0] is SQL, remaining are values; find the date param
    date_params = [p for p in insert_call_args[1:] if isinstance(p, date)]
    assert date_params, "create_debt_payment must pass a date parameter to the DB INSERT"
    assert date_params[0] == date(2026, 6, 1), (
        f"paid_for_month must be normalised to first of month (2026-06-01), got {date_params[0]}"
    )


# ============================================================
# Test 5 — create_debt_payment returns the inserted payment row
# ============================================================

@pytest.mark.asyncio
async def test_should_return_payment_row_from_create_debt_payment():
    """should return the inserted payment data from create_debt_payment"""
    import database

    payment_row = make_row({
        "id": "pay-uuid",
        "debt_id": "debt-uuid",
        "household_id": "hh-uuid",
        "user_id": "user-uuid",
        "amount": Decimal("300.00"),
        "paid_for_month": date(2026, 6, 1),
        "confirmed_at": "2026-06-16T12:00:00Z",
    })

    debt_ownership_row = make_row({"id": "debt-uuid"})

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [debt_ownership_row, payment_row]

    mock_pool = make_mock_pool(mock_conn)

    from models import DebtPaymentCreate
    data = DebtPaymentCreate(amount=Decimal("300.00"), paid_for_month=date(2026, 6, 1))

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.create_debt_payment("debt-uuid", "hh-uuid", "user-uuid", data)

    assert result["id"] == "pay-uuid"
    assert result["amount"] == Decimal("300.00")
    assert result["paid_for_month"] == date(2026, 6, 1)


# ============================================================
# Test 6 — create_debt_payment raises DuplicatePaymentError on UniqueViolation
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_on_duplicate_debt_payment():
    """should raise a distinct error when same (debt_id, paid_for_month) already exists"""
    import database
    import asyncpg

    # Arrange — ownership check (first fetchrow) succeeds; INSERT (second fetchrow) raises UniqueViolation
    debt_row = make_row({"id": "debt-uuid"})

    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [
        debt_row,                                            # ownership check passes
        asyncpg.UniqueViolationError("duplicate key"),       # INSERT raises
    ]

    mock_pool = make_mock_pool(mock_conn)

    from models import DebtPaymentCreate
    data = DebtPaymentCreate(amount=Decimal("200.00"), paid_for_month=date(2026, 6, 1))

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        with pytest.raises(ValueError, match="[Aa]lready|[Dd]uplicate|[Cc]onfirmed"):
            await database.create_debt_payment("debt-uuid", "hh-uuid", "user-uuid", data)


# ============================================================
# Test 7 — get_debt_payments returns payments newest first, household-scoped
# ============================================================

@pytest.mark.asyncio
async def test_should_return_payments_newest_first_in_get_debt_payments():
    """should return debt payments newest first, scoped to the debt and household"""
    import database

    payment_rows = [
        make_row({
            "id": "pay-2",
            "debt_id": "debt-uuid",
            "household_id": "hh-uuid",
            "user_id": "user-uuid",
            "amount": Decimal("200.00"),
            "paid_for_month": date(2026, 6, 1),
            "confirmed_at": "2026-06-16T12:00:00Z",
        }),
        make_row({
            "id": "pay-1",
            "debt_id": "debt-uuid",
            "household_id": "hh-uuid",
            "user_id": "user-uuid",
            "amount": Decimal("150.00"),
            "paid_for_month": date(2026, 5, 1),
            "confirmed_at": "2026-05-15T12:00:00Z",
        }),
    ]

    debt_ownership_row = make_row({"id": "debt-uuid"})

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = debt_ownership_row
    mock_conn.fetch.return_value = payment_rows

    mock_pool = make_mock_pool(mock_conn)

    with patch("database.get_pool", new_callable=AsyncMock, return_value=mock_pool):
        result = await database.get_debt_payments("debt-uuid", "hh-uuid")

    assert len(result) == 2
    assert result[0]["id"] == "pay-2"   # newest first
    assert result[1]["id"] == "pay-1"

    # Verify SQL is household-scoped and orders by newest first
    call_args = mock_conn.fetch.call_args
    sql = call_args[0][0].lower()
    assert "household_id" in sql, "get_debt_payments SQL must scope by household_id"
    assert "order by" in sql, "get_debt_payments SQL must ORDER BY to return newest first"
    assert "desc" in sql, "get_debt_payments SQL must use DESC order for newest first"


# ============================================================
# Test 8 — POST /api/debts/{debt_id}/payments returns 201 with payment data
# ============================================================

@pytest.mark.asyncio
async def test_should_return_201_with_payment_on_post_debt_payment():
    """should return 201 with payment data when POST /api/debts/{debt_id}/payments succeeds"""
    from fastapi.testclient import TestClient
    from datetime import datetime as dt

    payment_result = {
        "id": "pay-uuid",
        "debt_id": "debt-uuid",
        "household_id": "hh-uuid",
        "user_id": "user-uuid",
        "amount": Decimal("200.00"),
        "paid_for_month": date(2026, 6, 1),
        "confirmed_at": dt(2026, 6, 16, 12, 0, 0),
    }

    with patch("database.create_debt_payment", new_callable=AsyncMock, return_value=payment_result), \
         patch("database.get_debt_payments", new_callable=AsyncMock, return_value=[payment_result]):
        from main import app
        from auth import get_current_user
        from models import CurrentUserContext

        app.dependency_overrides[get_current_user] = lambda: CurrentUserContext(
            user_id="user-uuid", household_id="hh-uuid"
        )

        client = TestClient(app)
        response = client.post(
            "/api/debts/debt-uuid/payments",
            json={"amount": "200.00", "paid_for_month": "2026-06-16"},
        )

        app.dependency_overrides = {}

    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["id"] == "pay-uuid"
    assert data["debt_id"] == "debt-uuid"


# ============================================================
# Test 9 — POST /api/debts/{debt_id}/payments returns 409 on duplicate
# ============================================================

@pytest.mark.asyncio
async def test_should_return_409_on_duplicate_debt_payment_post():
    """should return 409 when same (debt_id, paid_for_month) is confirmed twice"""
    from fastapi.testclient import TestClient

    with patch(
        "database.create_debt_payment",
        new_callable=AsyncMock,
        side_effect=ValueError("Already confirmed for this month"),
    ):
        from main import app
        from auth import get_current_user
        from models import CurrentUserContext

        app.dependency_overrides[get_current_user] = lambda: CurrentUserContext(
            user_id="user-uuid", household_id="hh-uuid"
        )

        client = TestClient(app)
        response = client.post(
            "/api/debts/debt-uuid/payments",
            json={"amount": "200.00", "paid_for_month": "2026-06-01"},
        )

        app.dependency_overrides = {}

    assert response.status_code == 409, f"Expected 409, got {response.status_code}: {response.text}"


# ============================================================
# Test 10 — POST /api/debts/{debt_id}/payments returns 404 when debt not in household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_debt_not_in_household_on_post_payment():
    """should return 404 when the debt does not belong to the caller's household"""
    from fastapi.testclient import TestClient

    with patch(
        "database.create_debt_payment",
        new_callable=AsyncMock,
        side_effect=LookupError("Debt not found"),
    ):
        from main import app
        from auth import get_current_user
        from models import CurrentUserContext

        app.dependency_overrides[get_current_user] = lambda: CurrentUserContext(
            user_id="user-uuid", household_id="hh-uuid"
        )

        client = TestClient(app)
        response = client.post(
            "/api/debts/other-debt-uuid/payments",
            json={"amount": "200.00", "paid_for_month": "2026-06-01"},
        )

        app.dependency_overrides = {}

    assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"


# ============================================================
# Test 11 — GET /api/debts/{debt_id}/payments returns list newest first
# ============================================================

@pytest.mark.asyncio
async def test_should_return_list_of_payments_on_get_debt_payments():
    """should return list of confirmed payments newest first on GET /api/debts/{debt_id}/payments"""
    from fastapi.testclient import TestClient
    from datetime import datetime as dt

    payments = [
        {
            "id": "pay-2",
            "debt_id": "debt-uuid",
            "household_id": "hh-uuid",
            "user_id": "user-uuid",
            "amount": Decimal("200.00"),
            "paid_for_month": date(2026, 6, 1),
            "confirmed_at": dt(2026, 6, 16, 12, 0, 0),
        },
        {
            "id": "pay-1",
            "debt_id": "debt-uuid",
            "household_id": "hh-uuid",
            "user_id": "user-uuid",
            "amount": Decimal("150.00"),
            "paid_for_month": date(2026, 5, 1),
            "confirmed_at": dt(2026, 5, 15, 12, 0, 0),
        },
    ]

    with patch("database.get_debt_payments", new_callable=AsyncMock, return_value=payments):
        from main import app
        from auth import get_current_user
        from models import CurrentUserContext

        app.dependency_overrides[get_current_user] = lambda: CurrentUserContext(
            user_id="user-uuid", household_id="hh-uuid"
        )

        client = TestClient(app)
        response = client.get("/api/debts/debt-uuid/payments")

        app.dependency_overrides = {}

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert len(data) == 2
    assert data[0]["id"] == "pay-2"
    assert data[1]["id"] == "pay-1"


# ============================================================
# Test 12 — GET /api/debts/{debt_id}/payments returns 404 for debt not in household
# ============================================================

@pytest.mark.asyncio
async def test_should_return_404_when_debt_not_in_household_on_get_payments():
    """should return 404 when the debt does not belong to the caller's household"""
    from fastapi.testclient import TestClient

    with patch(
        "database.get_debt_payments",
        new_callable=AsyncMock,
        side_effect=LookupError("Debt not found"),
    ):
        from main import app
        from auth import get_current_user
        from models import CurrentUserContext

        app.dependency_overrides[get_current_user] = lambda: CurrentUserContext(
            user_id="user-uuid", household_id="hh-uuid"
        )

        client = TestClient(app)
        response = client.get("/api/debts/other-debt-uuid/payments")

        app.dependency_overrides = {}

    assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
