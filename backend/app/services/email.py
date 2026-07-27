"""Transactional email via Resend.

Best-effort only, mirroring push_notifications.py: a Resend outage or a
missing API key must never turn into a 500 or a response the caller can use
to distinguish "email exists" from "email doesn't exist" -- the forgot-password
endpoint always returns the same generic message regardless of what happens
here, and this function is called from a FastAPI BackgroundTask *after* that
response is already sent.
"""
import html
import logging

import resend
from sqlalchemy.orm import Session

from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_recipient_and_subject(
    to_email: str, subject: str, context_email: str | None = None
) -> tuple[str, str, str]:
    """Apply the sandbox-override redirect (see RESEND_SANDBOX_OVERRIDE_EMAIL in
    config.py) if configured, returning (actual_to, subject, banner_html).

    `context_email` is who the message is *about* for the bracketed subject
    and banner -- defaults to `to_email`, which is correct for
    password-reset/verification (the recipient and the subject are the same
    person). Pass it explicitly when the real recipient differs from who the
    message concerns (e.g. an admin notification about a different user) --
    swapping `to_email` itself in that case would also redirect the actual
    send once no override is configured, not just the display text.
    """
    override = settings.RESEND_SANDBOX_OVERRIDE_EMAIL
    if not override:
        return to_email, subject, ""
    subject_context = context_email or to_email
    banner = (
        f'<p style="background:#fff3cd;padding:8px;border-radius:4px;">'
        f"<strong>עבור משתמש:</strong> {subject_context}</p>"
    )
    return override, f"[{subject_context}] {subject}", banner


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


def send_pending_ai_access_email(db: Session, new_user_email: str) -> None:
    """Email fallback alongside send_push_to_admins() (push_notifications.py)
    for the same event -- a new signup landing in the unapproved
    ai_access_approved state. Push has proven unreliable in practice (no
    server-side errors, but delivery to the device isn't guaranteed), so
    admins get a second, independent channel for the same notification.

    Queries admins directly (User.is_admin) rather than a configured admin
    email, matching send_push_to_admins()'s own approach -- there's no
    existing "admin email" setting in this codebase to reuse.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured -- skipping pending AI access admin email send")
        return

    from app.models.user import User

    admin_emails = [
        row.email for row in db.query(User.email).filter(User.is_admin.is_(True)).all()
    ]
    if not admin_emails:
        return

    resend.api_key = settings.RESEND_API_KEY

    admin_link = f"{settings.FRONTEND_URL}/admin?tab=users"
    subject_base = "משתמש חדש ממתין לאישור גישת AI"

    html_base = f"""
    <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        {{banner}}
        <h2>משתמש חדש ממתין לאישור</h2>
        <p>המשתמש <strong>{new_user_email}</strong> נרשם ל-FitAI וממתין לאישור גישה לתכונת ה-AI.</p>
        <p><a href="{admin_link}">לפאנל הניהול</a></p>
    </div>
    """

    for admin_email in admin_emails:
        actual_to, subject, banner = _resolve_recipient_and_subject(
            admin_email, subject_base, context_email=new_user_email
        )
        try:
            resend.Emails.send({
                "from": settings.RESEND_FROM_EMAIL,
                "to": [actual_to],
                "subject": subject,
                "html": html_base.format(banner=banner),
            })
        except Exception:
            logger.exception("Failed to send pending-AI-access admin email to %s", admin_email)


def send_admin_composed_email(to_email: str, subject: str, body: str) -> None:
    """Free-form email an admin composes for one or more users (bulk actions
    in the admin panel). Subject/body are admin-authored but still
    HTML-escaped before interpolation -- they end up in an HTML email like
    any other user-facing content here, so the same injection risk applies.

    Unlike the other senders in this module, this one deliberately does NOT
    swallow send failures: the bulk-admin endpoint that calls this needs to
    report per-user success/failure back to the admin (there's no email-
    enumeration concern to protect here, unlike forgot-password/verification,
    since the admin already has the recipient list).
    """
    if not settings.RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY not configured")

    resend.api_key = settings.RESEND_API_KEY

    safe_subject = html.escape(subject)
    safe_body = html.escape(body).replace("\n", "<br>")
    actual_to, resolved_subject, banner = _resolve_recipient_and_subject(to_email, safe_subject)

    email_html = f"""
    <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        {banner}
        <p>{safe_body}</p>
    </div>
    """

    resend.Emails.send({
        "from": settings.RESEND_FROM_EMAIL,
        "to": [actual_to],
        "subject": resolved_subject,
        "html": email_html,
    })
