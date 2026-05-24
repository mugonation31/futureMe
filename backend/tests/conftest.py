"""
Test configuration and fixtures
"""
import os

# Set environment variables before any imports that need them
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-key-for-testing-only")
os.environ.setdefault("DATABASE_URL", "postgresql://localhost/test")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:4200")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SENDGRID_API_KEY", "test-sendgrid-key")
os.environ.setdefault("SENDGRID_FROM_EMAIL", "test@example.com")
os.environ.setdefault("RESEND_API_KEY", "test-resend-key")
os.environ.setdefault("RESEND_FROM_EMAIL", "test@example.com")
