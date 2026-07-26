"""Transactional email via Resend.

Best-effort only, mirroring push_notifications.py: a Resend outage or a
missing API key must never turn into a 500 or a response the caller can use
to distinguish "email exists" from "email doesn't exist" -- the forgot-password
endpoint always returns the same generic message regardless of what happens
here, and this function is called from a FastAPI BackgroundTask *after* that
response is already sent.
"""
import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_recipient_and_subject(to_email: str, subject: str) -> tuple[str, str, str]:
    """Apply the sandbox-override redirect (see RESEND_SANDBOX_OVERRIDE_EMAIL in
    config.py) if configured, returning (actual_to, subject, banner_html).
    """
    override = settings.RESEND_SANDBOX_OVERRIDE_EMAIL
    if not override:
        return to_email, subject, ""
    banner = (
        f'<p style="background:#fff3cd;padding:8px;border-radius:4px;">'
        f"<strong>עבור משתמש:</strong> {to_email}</p>"
    )
    return override, f"[{to_email}] {subject}", banner


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured -- skipping password reset email send")
        return

    resend.api_key = settings.RESEND_API_KEY

    actual_to, subject, banner = _resolve_recipient_and_subject(to_email, "איפוס סיסמה ל-FitAI")

    html = f"""
    <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        {banner}
        <h2>איפוס סיסמה ל-FitAI</h2>
        <p>קיבלנו בקשה לאיפוס הסיסמה שלך. לחץ על הקישור הבא כדי לבחור סיסמה חדשה:</p>
        <p><a href="{reset_link}">{reset_link}</a></p>
        <p>הקישור תקף ל-30 דקות. אם לא ביקשת לאפס את הסיסמה, אפשר להתעלם מהודעה זו.</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [actual_to],
            "subject": subject,
            "html": html,
        })
    except Exception:
        logger.exception("Failed to send password reset email via Resend")


def send_verification_email(to_email: str, code: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured -- skipping verification email send")
        return

    resend.api_key = settings.RESEND_API_KEY

    actual_to, subject, banner = _resolve_recipient_and_subject(to_email, "קוד אימות ל-FitAI")

    html = f"""
    <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        {banner}
        <h2>ברוכים הבאים ל-FitAI!</h2>
        <p>קוד האימות שלך הוא:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">{code}</p>
        <p>הזן את הקוד באפליקציה כדי לאמת את כתובת המייל שלך. הקוד תקף ל-15 דקות.</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [actual_to],
            "subject": subject,
            "html": html,
        })
    except Exception:
        logger.exception("Failed to send verification email via Resend")
