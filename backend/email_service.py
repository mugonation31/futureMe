"""
Email service using Resend SDK for sending transactional emails.
"""
import html
import resend
from config import settings

resend.api_key = settings.resend_api_key


async def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """Send a password-reset email via Resend.

    Args:
        to_email: The recipient's email address.
        reset_url: The full URL the user should follow to reset their password.

    Raises:
        Exception: Re-raises any error returned by the Resend SDK.
    """
    params: resend.Emails.SendParams = {
        "from": settings.resend_from_email,
        "to": [to_email],
        "subject": "Reset your password",
        "html": (
            f"<p>You requested a password reset.</p>"
            f"<p><a href='{html.escape(reset_url)}'>Click here to reset your password</a></p>"
            f"<p>This link expires in 1 hour. If you did not request this, ignore this email.</p>"
        ),
    }

    await resend.Emails.send_async(params)
