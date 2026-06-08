"""
Tests for ForgotPasswordRequest and ResetPasswordRequest Pydantic models.
"""
import pytest
from pydantic import ValidationError


# ============================================================
# Test 3: ResetPasswordRequest rejects password < 6 chars
# ============================================================

def test_should_reject_reset_password_request_with_short_password():
    """should reject ResetPasswordRequest with password shorter than 6 characters"""
    # Arrange / Act / Assert
    from models import ResetPasswordRequest
    with pytest.raises(ValidationError) as exc_info:
        ResetPasswordRequest(token="some-token", new_password="abc")
    errors = exc_info.value.errors()
    assert any("new_password" in str(e["loc"]) for e in errors)


# ============================================================
# Test 4: ResetPasswordRequest accepts password of exactly 6 chars
# ============================================================

def test_should_accept_reset_password_request_with_exactly_6_char_password():
    """should accept ResetPasswordRequest with password of exactly 6 characters"""
    # Arrange / Act
    from models import ResetPasswordRequest
    req = ResetPasswordRequest(token="some-token", new_password="abc123")

    # Assert
    assert req.new_password == "abc123"
    assert req.token == "some-token"


# ============================================================
# Test 5: ForgotPasswordRequest accepts valid email
# ============================================================

def test_should_accept_forgot_password_request_with_valid_email():
    """should accept ForgotPasswordRequest with a valid email"""
    # Arrange / Act
    from models import ForgotPasswordRequest
    req = ForgotPasswordRequest(email="user@example.com")

    # Assert
    assert req.email == "user@example.com"
