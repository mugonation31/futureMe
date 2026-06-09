"""
Configuration module for loading environment variables
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    jwt_secret: str

    database_url: str

    cors_origins: str = "http://localhost:4200,http://localhost:4201"

    environment: str = "development"

    resend_api_key: str
    resend_from_email: str = "noreply@localhost"

    frontend_url: str = "http://localhost:4200"

    jwt_expiry_minutes: int = 60
    jwt_refresh_expiry_days: int = 7

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    def validate_cors_for_production(self) -> None:
        """Raise ValueError if wildcard CORS is configured in production."""
        if self.environment.strip().lower() != "production":
            return
        if any("*" in origin for origin in self.cors_origins_list):
            raise ValueError(
                "CORS wildcard (*) is not allowed in production. "
                "Set CORS_ORIGINS to specific allowed origins."
            )


settings = Settings()
