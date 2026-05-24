"""
Tests for configuration module
"""
import os
import pytest


def test_should_load_settings_with_default_cors_origins_when_env_vars_are_set(monkeypatch):
    """should load settings with default cors_origins when env vars are set"""
    # Arrange
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
    monkeypatch.setenv("SENDGRID_API_KEY", "test-key")
    monkeypatch.setenv("SENDGRID_FROM_EMAIL", "test@example.com")
    monkeypatch.delenv("ENVIRONMENT", raising=False)

    # Act
    from config import Settings
    settings = Settings()

    # Assert
    assert settings.supabase_url == "https://test.supabase.co"
    assert settings.supabase_jwt_secret == "test-secret"
    assert settings.database_url == "postgresql://localhost/test"
    assert settings.cors_origins == "http://localhost:4200"
    assert settings.environment == "development"
    assert settings.sendgrid_api_key == "test-key"
    assert settings.sendgrid_from_email == "test@example.com"


def test_should_parse_comma_separated_cors_origins_into_a_list(monkeypatch):
    """should parse comma-separated cors_origins into a list"""
    # Arrange
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
    monkeypatch.setenv("SENDGRID_API_KEY", "test-key")
    monkeypatch.setenv("SENDGRID_FROM_EMAIL", "test@example.com")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:4200, http://localhost:3000")

    # Act
    from config import Settings
    settings = Settings()

    # Assert
    assert settings.cors_origins_list == ["http://localhost:4200", "http://localhost:3000"]
