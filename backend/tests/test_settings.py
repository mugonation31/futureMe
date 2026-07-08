"""
Tests for user settings endpoints (GET/PUT /api/settings).

The old company-settings feature (bank details, company name) was retired in
the Intentional Spending Tracker pivot. Settings now hold the user's
display_name, currency, and monthly_budget only.
"""
import pytest
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock

from models import CurrentUserContext


SAMPLE_SETTINGS = {
    "user_id": "user-123",
    "display_name": "Ada Lovelace",
    "currency": "$",
    "monthly_budget": 2500.0,
    "created_at": datetime(2026, 1, 15, tzinfo=timezone.utc),
    "updated_at": datetime(2026, 1, 15, tzinfo=timezone.utc),
}


def get_test_app():
    """App with auth overridden to a fixed user context."""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides[get_current_user] = lambda: CurrentUserContext(
            user_id="user-123"
        )
        return app


def get_test_app_no_auth():
    """App without the auth override (to exercise the real 401 path)."""
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        from main import app
        from auth import get_current_user
        app.dependency_overrides.pop(get_current_user, None)
        return app


# ============================================================
# GET /api/settings — defaults when the user has none yet
# ============================================================

@pytest.mark.asyncio
async def test_should_return_default_settings_when_user_has_none():
    """GET returns a sensible default (no 404) when no settings row exists."""
    app = get_test_app()
    with patch("database.get_user_settings", new_callable=AsyncMock, return_value=None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/settings")

    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "user-123"
    assert data["currency"] == "GBP"
    assert data["monthly_budget"] is None


# ============================================================
# GET /api/settings — returns the stored settings when present
# ============================================================

@pytest.mark.asyncio
async def test_should_return_settings_when_they_exist():
    """GET echoes the stored user settings."""
    app = get_test_app()
    with patch("database.get_user_settings", new_callable=AsyncMock, return_value=SAMPLE_SETTINGS):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/settings")

    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "user-123"
    assert data["display_name"] == "Ada Lovelace"
    assert data["currency"] == "$"
    assert data["monthly_budget"] == 2500.0


# ============================================================
# PUT /api/settings — upsert
# ============================================================

@pytest.mark.asyncio
async def test_should_upsert_settings_on_put():
    """PUT persists changes via upsert and returns the updated settings."""
    app = get_test_app()
    update_data = {"currency": "$", "display_name": "Ada Lovelace"}
    with patch("database.upsert_user_settings", new_callable=AsyncMock, return_value=SAMPLE_SETTINGS) as upsert:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put("/api/settings", json=update_data)

    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "$"
    assert data["display_name"] == "Ada Lovelace"
    # Upsert is always scoped to the authenticated caller's user id.
    assert upsert.await_args.args[0] == "user-123"
    # The SUBMITTED payload (not just the mocked return) round-trips to the DB
    # layer — asserting against await_args, since the mock echoes SAMPLE_SETTINGS
    # regardless of input.
    submitted = upsert.await_args.args[1]
    assert submitted.currency == "$"
    assert submitted.display_name == "Ada Lovelace"


# ============================================================
# GET /api/settings — 401 without auth
# ============================================================

@pytest.mark.asyncio
async def test_should_return_401_when_no_auth_token_on_settings():
    """GET without a bearer token is rejected."""
    app = get_test_app_no_auth()
    with patch("database.get_pool", new_callable=AsyncMock), \
         patch("database.close_pool", new_callable=AsyncMock):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/settings")

    assert response.status_code in (401, 403)
