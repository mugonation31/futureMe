"""
Tests for email_service.py — password reset email sending via Resend SDK.
"""
import pytest
from unittest.mock import patch, AsyncMock


# ============================================================
# Test 1: send_password_reset_email calls Resend with correct args
# ============================================================

@pytest.mark.asyncio
async def test_should_call_resend_with_correct_to_subject_html():
    """should call Resend with correct to/subject/html when send_password_reset_email is called"""
    # Arrange
    mock_send = AsyncMock(return_value=AsyncMock(id="email-id-123"))

    with patch("resend.Emails.send_async", mock_send):
        from email_service import send_password_reset_email

        # Act
        await send_password_reset_email(
            to_email="user@example.com",
            reset_url="https://example.com/reset?token=abc123",
        )

    # Assert
    mock_send.assert_called_once()
    call_params = mock_send.call_args[0][0]
    assert call_params["to"] == ["user@example.com"]
    assert "password" in call_params["subject"].lower()
    assert "https://example.com/reset?token=abc123" in call_params["html"]


# ============================================================
# Test 2: send_password_reset_email raises when Resend errors
# ============================================================

@pytest.mark.asyncio
async def test_should_raise_when_resend_returns_error():
    """should raise an exception when Resend returns an error"""
    # Arrange
    mock_send = AsyncMock(side_effect=Exception("Resend API error"))

    with patch("resend.Emails.send_async", mock_send):
        from email_service import send_password_reset_email

        # Act / Assert
        with pytest.raises(Exception, match="Resend API error"):
            await send_password_reset_email(
                to_email="user@example.com",
                reset_url="https://example.com/reset?token=abc123",
            )
