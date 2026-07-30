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
from datetime import datetime

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


def send_account_recovery_email(
    to_email: str, reset_link: str, username: str | None, activate_link: str | None
) -> None:
    """Combined 'forgot username / forgot password' email, sent by
    /auth/forgot-access for any account that exists (the HTTP response is
    always generic regardless -- see forgot_access() -- so this content
    difference doesn't create a new response-shape/timing leak, only the
    same inherent "did an email arrive" signal any email-based recovery flow
    already has).

    - `username` set (migrated account): include it as a reminder alongside
      the reset-password link.
    - `username` None (pre-migration account, see User.username's nullable-
      forever design): no username to remind them of yet -- point at
      `activate_link` (POST /auth/activate-account's frontend page) instead.
      `reset_link` is still included either way, since a legacy user may
      have simply forgotten their password independent of migration status.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured -- skipping account recovery email send")
        return

    resend.api_key = settings.RESEND_API_KEY

    actual_to, subject, banner = _resolve_recipient_and_subject(to_email, "שחזור גישה ל-FitAI")

    if username:
        identity_html = f"<p>שם המשתמש שלך הוא: <strong>{username}</strong></p>"
    else:
        identity_html = (
            f'<p>עדיין לא בחרת שם משתמש לחשבון הזה. '
            f'<a href="{activate_link}">לחץ כאן כדי להפעיל את החשבון ולבחור שם משתמש</a>.</p>'
        )

    html = f"""
    <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        {banner}
        <h2>שחזור גישה ל-FitAI</h2>
        <p>קיבלנו בקשה לשחזור הגישה לחשבון שלך.</p>
        {identity_html}
        <p>לאיפוס הסיסמה, לחץ על הקישור הבא:</p>
        <p><a href="{reset_link}">{reset_link}</a></p>
        <p>קישור איפוס הסיסמה תקף ל-30 דקות. אם לא ביקשת זאת, אפשר להתעלם מהודעה זו.</p>
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
        logger.exception("Failed to send account recovery email via Resend")


def send_verification_email(to_email: str, code: str, dry_run: bool = False) -> None:
    """`dry_run=True` runs everything up to the actual Resend network call and
    then skips it -- see register()'s X-E2E-Monitor-Key handling, the only
    caller that ever passes this. The verification code is still written to
    the DB either way (that happens in register() before this is even
    scheduled), so a dry run doesn't weaken verification, it just doesn't
    spend a real send for a code nobody will read out of an inbox.
    """
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

    if dry_run:
        logger.info("dry_run=True -- skipping real Resend send of verification email to %s", actual_to)
        return

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [actual_to],
            "subject": subject,
            "html": html,
        })
    except Exception:
        logger.exception("Failed to send verification email via Resend")


def send_pending_ai_access_email(db: Session, new_user_email: str, dry_run: bool = False) -> None:
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
        <p>המשתמש <strong>{new_user_email}</strong> נרשם ל-FitAI וממתין לאישור גישה לתוכנת ה-AI.</p>
        <p><a href="{admin_link}">לפאנל הניהול</a></p>
    </div>
    """

    for admin_email in admin_emails:
        actual_to, subject, banner = _resolve_recipient_and_subject(
            admin_email, subject_base, context_email=new_user_email
        )
        if dry_run:
            logger.info("dry_run=True -- skipping real Resend send of pending-AI-access admin email to %s", actual_to)
            continue
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


def send_new_device_email(to_email: str, device_label: str, timestamp: datetime) -> None:
    """Sent after a new WebAuthn credential is registered on an account
    (webauthn_register_verify() in auth.py), so a stolen-password-then-
    register-a-device attack leaves a signal instead of none -- the account
    owner had no way to find out about a new biometric device otherwise.

    Best-effort/swallow-failures like send_account_recovery_email -- a
    Resend hiccup here must not turn registering a legitimate new device
    into a 500 for the user actually doing it.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured -- skipping new-device email send")
        return

    resend.api_key = settings.RESEND_API_KEY

    actual_to, subject, banner = _resolve_recipient_and_subject(to_email, "מכשיר חדש נוסף לחשבון FitAI שלך")

    formatted_time = timestamp.strftime("%d/%m/%Y %H:%M")
    safe_device_label = html.escape(device_label)

    html_body = f"""
    <div dir="rtl" style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        {banner}
        <h2>מכשיר חדש נוסף לחשבון שלך</h2>
        <p>מכשיר חדש נרשם עכשיו לכניסה עם Face ID / טביעת אצבע לחשבון שלך:</p>
        <p><strong>{safe_device_label}</strong> &mdash; {formatted_time}</p>
        <p>אם זה אתה, אין צורך לעשות דבר. אם אתה לא מזהה את הפעולה הזו, \
היכנס לחשבון שלך והסר את המכשיר תחת הגדרות &larr; כניסה עם Face ID / טביעת אצבע, \
ושקול לאפס את הסיסמה שלך.</p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [actual_to],
            "subject": subject,
            "html": html_body,
        })
    except Exception:
        logger.exception("Failed to send new-device email to %s", actual_to)
