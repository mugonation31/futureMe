"""
Tests for SEC-4: Tightened CORS configuration
"""
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport


# ---------------------------------------------------------------------------
# Helper: build an app with specific CORS settings, bypassing the lifespan
# DB pool so we never need a real database connection.
# ---------------------------------------------------------------------------

def _make_app(cors_origins: str, environment: str = "development"):
    """Re-create the FastAPI app with overridden CORS settings."""
    import importlib
    import config
    import main as main_module

    with patch.object(config.settings, "cors_origins", cors_origins), \
         patch.object(config.settings, "environment", environment):
        importlib.reload(main_module)
        return main_module.app


# ---------------------------------------------------------------------------
# Test 1 — listed origin receives Access-Control-Allow-Origin
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_should_return_acao_header_for_listed_origin():
    """should return Access-Control-Allow-Origin header when origin is in the allowed list"""
    app = _make_app("http://localhost:4200")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/health",
            headers={"Origin": "http://localhost:4200"},
        )

    assert "access-control-allow-origin" in response.headers
    assert response.headers["access-control-allow-origin"] == "http://localhost:4200"


# ---------------------------------------------------------------------------
# Test 2 — unlisted origin does NOT receive Access-Control-Allow-Origin
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_should_not_return_acao_header_for_unlisted_origin():
    """should NOT return Access-Control-Allow-Origin header when origin is not in the allowed list"""
    app = _make_app("http://localhost:4200")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/health",
            headers={"Origin": "http://evil.example.com"},
        )

    assert "access-control-allow-origin" not in response.headers


# ---------------------------------------------------------------------------
# Test 3 — production startup with CORS_ORIGINS=* raises ValueError
# ---------------------------------------------------------------------------

def test_should_raise_on_startup_when_production_and_wildcard_cors():
    """should raise ValueError when ENVIRONMENT=production and CORS_ORIGINS contains wildcard"""
    import config

    with patch.object(config.settings, "cors_origins", "*"), \
         patch.object(config.settings, "environment", "production"):
        with pytest.raises(ValueError, match="wildcard"):
            config.settings.validate_cors_for_production()


# ---------------------------------------------------------------------------
# Test 4 — production startup with specific origins does NOT raise
# ---------------------------------------------------------------------------

def test_should_not_raise_on_startup_when_production_and_specific_cors():
    """should NOT raise when ENVIRONMENT=production and CORS_ORIGINS has specific origins"""
    import config

    with patch.object(config.settings, "cors_origins", "https://app.futureme.io"), \
         patch.object(config.settings, "environment", "production"):
        # Should not raise
        config.settings.validate_cors_for_production()


# ---------------------------------------------------------------------------
# Test 5 — development mode with CORS_ORIGINS=* does NOT raise
# ---------------------------------------------------------------------------

def test_should_not_raise_on_startup_when_development_and_wildcard_cors():
    """should NOT raise when ENVIRONMENT=development and CORS_ORIGINS=*"""
    import config

    with patch.object(config.settings, "cors_origins", "*"), \
         patch.object(config.settings, "environment", "development"):
        # Should not raise
        config.settings.validate_cors_for_production()


# ---------------------------------------------------------------------------
# Test 6 — allow_methods is restricted (OPTIONS preflight returns only allowed methods)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_should_restrict_allow_methods_to_approved_set():
    """should restrict allow_methods to GET, POST, PATCH, DELETE, OPTIONS"""
    app = _make_app("http://localhost:4200")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "GET",
            },
        )

    allowed = response.headers.get("access-control-allow-methods", "")
    allowed_methods = {m.strip().upper() for m in allowed.split(",")}
    approved = {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
    assert allowed_methods.issubset(approved), (
        f"Unexpected methods advertised: {allowed_methods - approved}"
    )
    assert "HEAD" not in allowed_methods


# ---------------------------------------------------------------------------
# Test 7 — allow_headers is restricted (OPTIONS preflight returns only allowed headers)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_should_restrict_allow_headers_to_approved_set():
    """should restrict allow_headers to Authorization and Content-Type"""
    app = _make_app("http://localhost:4200")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:4200",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization",
            },
        )

    allowed = response.headers.get("access-control-allow-headers", "")
    allowed_headers = {h.strip().lower() for h in allowed.split(",") if h.strip()}
    explicitly_approved = {"authorization", "content-type"}
    cors_simple_headers = {"accept", "accept-language", "content-language"}
    approved = explicitly_approved | cors_simple_headers
    assert allowed_headers.issubset(approved), (
        f"Unexpected headers advertised: {allowed_headers - approved}"
    )
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers
