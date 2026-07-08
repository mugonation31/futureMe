"""
Tests for configuration module
"""
import os
import pytest


def test_should_load_settings_with_default_cors_origins_when_env_vars_are_set(monkeypatch):
    """should load settings with default cors_origins when env vars are set"""
    # Arrange
    monkeypatch.setenv("JWT_SECRET", "a-secret-that-is-at-least-32-characters-long")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "test@example.com")
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    # CORS_ORIGINS unset so we observe the code default, and ignore any .env file
    # so the assertion is deterministic regardless of the local environment.
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    # Act
    from config import Settings
    settings = Settings(_env_file=None)

    # Assert
    assert settings.jwt_secret == "a-secret-that-is-at-least-32-characters-long"
    assert settings.database_url == "postgresql://localhost/test"
    assert settings.cors_origins == "http://localhost:4200,http://localhost:4201"
    assert settings.environment == "development"
    assert settings.resend_api_key == "test-key"
    assert settings.resend_from_email == "test@example.com"


def test_should_parse_comma_separated_cors_origins_into_a_list(monkeypatch):
    """should parse comma-separated cors_origins into a list"""
    # Arrange
    monkeypatch.setenv("JWT_SECRET", "a-secret-that-is-at-least-32-characters-long")
    monkeypatch.setenv("DATABASE_URL", "postgresql://localhost/test")
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "test@example.com")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:4200, http://localhost:3000")

    # Act
    from config import Settings
    settings = Settings()

    # Assert
    assert settings.cors_origins_list == ["http://localhost:4200", "http://localhost:3000"]
