import json
import uuid
from datetime import datetime, timedelta, timezone

import webauthn
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url, options_to_json
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    decode_token,
    generate_password_reset_token,
    generate_verification_code,
    get_password_hash,
    hash_secret,
    verify_password,
)
from app.core.config import settings
from app.models.user import ConsentRecord, EmailVerificationCode, PasswordResetToken, User, WebAuthnCredential
from app.schemas.auth import (
    USERNAME_REGEX,
    ActivateAccountRequest,
    ActivateAccountSetUsernameRequest,
    ForgotAccessRequest,
    ResendVerificationRequest,
    ResetPasswordConfirm,
    Token,
    UsernameAvailabilityResponse,
    UserLogin,
    UserRegister,
    VerifyEmailRequest,
    WebAuthnLoginOptionsRequest,
    WebAuthnLoginVerifyRequest,
    WebAuthnRegisterVerifyRequest,
)
from app.schemas.user import UserResponse
from app.services.email import (
    send_account_recovery_email,
    send_new_device_email,
    send_pending_ai_access_email,
    send_verification_email,
)
from app.services.push_notifications import send_push_to_admins

RESET_TOKEN_TTL_MINUTES = 30
VERIFICATION_CODE_TTL_MINUTES = 15
# 10 minutes is deliberately short -- this token only needs to survive the
# gap between "prove you know the email+password" and "submit a username" in
# the same sitting, unlike the 7-day session token.
ACTIVATION_TOKEN_TTL_MINUTES = 10
# Also short -- a WebAuthn ceremony (browser biometric prompt + round trip)
# happens within seconds of requesting options, not minutes.
WEBAUTHN_CHALLENGE_TOKEN_TTL_MINUTES = 5
GENERIC_FORGOT_ACCESS_MESSAGE = "אם קיים חשבון עם כתובת זו, נשלח אליו אימייל עם שם המשתמש וקישור לאיפוס הסיסמה"
GENERIC_RESET_PASSWORD_ERROR = "קישור האיפוס אינו תקין או שפג תוקפו"
GENERIC_RESEND_VERIFICATION_MESSAGE = "אם קיים חשבון לא מאומת עם כתובת זו, נשלח אליו קוד אימות חדש"
GENERIC_VERIFY_EMAIL_ERROR = "הקוד שגוי או שפג תוקפו"
GENERIC_LOGIN_ERROR = "שם משתמש או סיסמה שגויים"
# Deliberately conflates three distinct failure reasons (unknown email, wrong
# password, account already migrated) into one indistinguishable message --
# see activate_account()'s docstring for why.
GENERIC_ACTIVATE_ACCOUNT_ERROR = "אימייל או סיסמה שגויים, או שהחשבון כבר הופעל"
GENERIC_WEBAUTHN_LOGIN_ERROR = "הכניסה נכשלה"
# Keep this in sync with the "עודכן לאחרונה" date shown on the privacy policy
# page (frontend/src/pages/PrivacyPolicy.jsx) -- bump both together whenever
# the policy's substance changes, so a consent record stays a meaningful
# answer to "which version did this user actually agree to."
PRIVACY_POLICY_VERSION = "2026-07-26"


def _issue_verification_code(db: Session, user: User) -> str:
    """(Re)generate the single verification code row for a user (register
    and resend-verification both call this) and return the raw code to send.
    """
    raw_code = generate_verification_code()
    existing = db.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).first()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_TTL_MINUTES)
    if existing:
        existing.code_hash = hash_secret(raw_code)
        existing.expires_at = expires_at
        existing.used_at = None
    else:
        db.add(EmailVerificationCode(
            user_id=user.id,
            code_hash=hash_secret(raw_code),
            expires_at=expires_at,
        ))
    db.commit()
    return raw_code


def _normalize_username(username: str) -> str:
    return username.strip().lower()


def _check_username_available(db: Session, username: str) -> str:
    """Pre-flight collision check (format is already enforced by the Pydantic
    schema before this runs). Returns the normalized value on success.

    This is a UX convenience only, NOT the authoritative guard against a
    race (two clients grabbing the same username at once) -- callers must
    still wrap their commit in try/except IntegrityError, since
    User.username_normalized's unique index is the real source of truth.
    """
    normalized = _normalize_username(username)
    if db.query(User).filter(User.username_normalized == normalized).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="שם המשתמש כבר תפוס")
    return normalized


def _create_purpose_token(purpose: str, ttl_minutes: int, **claims) -> str:
    """A short-lived, single-purpose JWT for state that must survive one
    request round-trip but must never work as a general session -- see
    get_current_user's `purpose`-claim rejection below. Used for the
    activate-account bridge and WebAuthn challenges alike, rather than a new
    stateful table for each."""
    return create_access_token(
        data={"purpose": purpose, **claims},
        expires_delta=timedelta(minutes=ttl_minutes),
    )


def _decode_purpose_token(token: str, expected_purpose: str) -> dict:
    payload = decode_token(token)
    if not payload or payload.get("purpose") != expected_purpose:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="פג תוקף הבקשה, נסה שוב")
    return payload


def _guess_device_label(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    if "iPhone" in ua:
        return "iPhone"
    if "iPad" in ua:
        return "iPad"
    if "Android" in ua:
        return "Android"
    if "Macintosh" in ua:
        return "Mac"
    if "Windows" in ua:
        return "Windows"
    return "מכשיר"


router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    # Any token carrying a `purpose` claim (activate-account's activation
    # token, a WebAuthn challenge token) is scoped to that one specific
    # follow-up call and must never be accepted as a general session --
    # only a plain session token (no `purpose` claim at all) passes here.
    if not payload or payload.get("purpose"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = uuid.UUID(payload.get("sub"))
    except (TypeError, ValueError):
        # Fails closed on a malformed/legacy-format `sub` (e.g. an old
        # email-based token from before the sub-claim migration to user.id)
        # rather than 500ing -- the frontend's existing 401 interceptor
        # already turns this into a clean re-login prompt.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.is_active:
        # Checked here (not just at login) so a deactivated user's existing
        # token -- valid for up to ACCESS_TOKEN_EXPIRE_MINUTES (7 days) -- is
        # rejected immediately on the next request, not just at their next
        # login attempt.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="החשבון הושבת")
    return user


def _is_e2e_monitor_request(request: Request) -> bool:
    """True only for the scheduled E2E monitor's own requests (see
    monitoring/e2e-check.mjs), never for a real user -- E2E_MONITOR_SECRET is
    a server-side-only env var (GitHub Actions secret + Railway env var),
    never shipped to the frontend bundle or any client-reachable config
    endpoint. `settings.E2E_MONITOR_SECRET` is None by default in every
    environment, which makes this permanently False until an operator
    deliberately sets it -- so this can't accidentally start comparing a
    request header against an empty/falsy secret and matching.
    """
    secret = settings.E2E_MONITOR_SECRET
    return bool(secret) and request.headers.get("x-e2e-monitor-key") == secret


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def register(request: Request, background_tasks: BackgroundTasks, user_data: UserRegister, db: Session = Depends(get_db)):
    if not user_data.consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="יש לאשר את מדיניות הפרטיות כדי להירשם",
        )

    normalized_username = _check_username_available(db, user_data.username)

    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    hashed_pw = get_password_hash(user_data.password)
    user = User(
        email=user_data.email,
        hashed_password=hashed_pw,
        full_name=user_data.full_name,
        username=user_data.username,
        username_normalized=normalized_username,
        is_verified=False,
        preferred_language=user_data.preferred_language.value,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # The authoritative guard against a username (or email) collision
        # race that the pre-flight checks above couldn't catch -- two
        # concurrent registrations for the same username/email.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="שם המשתמש או האימייל כבר תפוסים, נסה שוב",
        )
    db.refresh(user)
    # Captured once, right after the first refresh, and reused for every
    # later reference in this function (ConsentRecord, the final token) --
    # deliberately never touching `user.id`/`user.email` again after this
    # point. Every commit below (ConsentRecord, _issue_verification_code)
    # expires every object in this session per SQLAlchemy's default
    # expire_on_commit; a later ORM attribute access would force a refresh
    # that re-populates the identity map with whatever is in the DB *at that
    # moment* -- and then, having been refreshed, that copy is never
    # invalidated by a subsequent external write on a different session (see
    # get_auth_headers's is_verified/ai_access_approved update in
    # conftest.py), so a later query in the same request or a later request
    # sharing this session (e.g. this test helper's own follow-up login)
    # would silently see stale data instead of what was actually just
    # written. Same reasoning the original code applied to user_data.email.
    user_id = user.id

    # The durable record of consent -- independent of whatever checkbox/copy
    # the frontend happens to render today, this is what answers "did this
    # user agree, and to what" later.
    db.add(ConsentRecord(user_id=user_id, policy_version=PRIVACY_POLICY_VERSION))
    db.commit()

    # New signups start ai_access_approved=False (see the User model), so
    # every registration needs an admin to look at it -- same
    # best-effort/synchronous pattern as the food/exercise pending-approval
    # notifications (see push_notifications.py's own docstring for why this
    # must never affect the caller).
    # user_data.email (the raw request field), not user.email -- touching an
    # attribute on the freshly-committed `user` ORM object here would force
    # an early refresh of it (SQLAlchemy expires objects after every commit),
    # which in the test suite's shared long-lived session can leave a stale
    # cached copy of `user` sitting in the identity map for a later request
    # in the same test (e.g. get_auth_headers's subsequent login) to pick up
    # instead of querying fresh. Both fields hold the identical string.
    send_push_to_admins(
        title="משתמש חדש ממתין לאישור גישת AI",
        body=user_data.email,
        url="/admin?tab=users",
        db=db,
    )
    # Email fallback for the same event -- push has proven unreliable in
    # practice (server sends clean, delivery to the device isn't
    # guaranteed). Independent of the push call above: each is
    # best-effort and swallows its own exceptions, so one failing has no
    # effect on the other or on registration itself.
    skip_real_email = _is_e2e_monitor_request(request)
    send_pending_ai_access_email(db, user_data.email, dry_run=skip_real_email)

    raw_code = _issue_verification_code(db, user)
    background_tasks.add_task(send_verification_email, user_data.email, raw_code, dry_run=skip_real_email)
    # Still returns a token for API-shape/backward-compat reasons (existing
    # tests assert on it), but the frontend deliberately does NOT use it to
    # establish a session -- Register.jsx calls the raw endpoint directly and
    # sends the user straight to the verify-email screen instead, so there's
    # no window where an unverified account has a working client-side
    # session. The only paths to a real session are login (blocked below
    # until verified) and a successful /verify-email.
    # user_id (captured local var above), not user.id -- see the comment at
    # its capture site for why touching the ORM attribute this late matters.
    access_token = create_access_token(
        data={"sub": str(user_id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.get("/username-available", response_model=UsernameAvailabilityResponse)
@limiter.limit("30/minute")
def username_available(request: Request, username: str, db: Session = Depends(get_db)):
    # Format check first, no DB hit -- keeps the debounced-keystroke UX cheap
    # and avoids a query for input that couldn't be valid anyway.
    if not USERNAME_REGEX.match(username):
        return UsernameAvailabilityResponse(available=False, reason="invalid_format")
    normalized = _normalize_username(username)
    taken = db.query(User).filter(User.username_normalized == normalized).first() is not None
    return UsernameAvailabilityResponse(available=not taken, reason="taken" if taken else None)


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    normalized = _normalize_username(user_data.username)
    user = db.query(User).filter(User.username_normalized == normalized).first()
    if user:
        password_valid = verify_password(user_data.password, user.hashed_password)
    else:
        # Always run a real bcrypt comparison, even when no account matches,
        # so this path takes about as long as a genuine wrong-password check
        # (see DUMMY_PASSWORD_HASH) -- otherwise the faster response time
        # alone would reveal that the username isn't registered. This also
        # covers pre-migration accounts (username IS NULL): username_normalized
        # is NULL there too, so `== normalized` never matches and they land
        # in this same generic branch -- no special-casing needed, and no way
        # to hint "you haven't migrated yet" without reopening enumeration
        # (that's why the login screen carries a visible activate-account
        # link instead).
        verify_password(user_data.password, DUMMY_PASSWORD_HASH)
        password_valid = False

    if not user or not password_valid:
        # Deliberately identical status code and message for "no such
        # account" and "wrong password" -- distinguishing them lets an
        # attacker enumerate registered usernames via the login endpoint.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_LOGIN_ERROR,
        )

    if not user.is_active:
        # Checked after the password (same reasoning as is_verified below --
        # doesn't reopen enumeration since it's only reachable once the
        # password is already confirmed correct).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="החשבון הושבת. פנה למנהל המערכת.",
        )

    if not user.is_verified:
        # Only reachable once the password has already been confirmed
        # correct, so this doesn't reopen the enumeration gap the generic
        # 401 above closes -- a wrong-password guess against an unverified
        # account still gets the same generic 401 as any other. A distinct
        # status (403) + structured detail (vs. the plain string above) lets
        # the frontend tell "wrong credentials" apart from "right
        # credentials, not verified yet" and route accordingly. Includes the
        # account's email (safe: only reachable post-password-check) so the
        # frontend doesn't have to ask the user to retype it before resending
        # a verification code.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_type": "EMAIL_NOT_VERIFIED",
                "message": "יש לאמת את כתובת האימייל שלך לפני ההתחברות",
                "email": user.email,
            },
        )

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.post("/activate-account")
@limiter.limit("5/hour")
def activate_account(request: Request, body: ActivateAccountRequest, db: Session = Depends(get_db)):
    """Phase 1 of the existing-user migration bridge. Accepts email+password
    ONLY for accounts where username IS NULL -- NOT a standing alternative to
    /login, which never accepts email for any account. See the User model's
    `username` column comment for the nullable-forever design this relies on.

    Unknown email, wrong password, and "this account already has a
    username" (already migrated, or never was a legacy account) are all
    deliberately indistinguishable here -- distinguishing any of them would
    make this endpoint an enumeration oracle for account existence/migration
    status, which forgot-password/login already go out of their way to
    avoid.
    """
    user = db.query(User).filter(User.email == body.email, User.username.is_(None)).first()
    if user:
        password_valid = verify_password(body.password, user.hashed_password)
    else:
        verify_password(body.password, DUMMY_PASSWORD_HASH)
        password_valid = False

    if not user or not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_ACTIVATE_ACCOUNT_ERROR)

    activation_token = _create_purpose_token(
        "activate_username", ACTIVATION_TOKEN_TTL_MINUTES, sub=str(user.id)
    )
    return {"activation_token": activation_token}


@router.post("/activate-account/set-username", response_model=Token)
@limiter.limit("10/hour")
def activate_account_set_username(
    request: Request, body: ActivateAccountSetUsernameRequest, db: Session = Depends(get_db)
):
    """Phase 2: spend the activation token to choose a username and receive a
    real session in one step (no forced re-login right after proving
    credentials in phase 1)."""
    payload = _decode_purpose_token(body.activation_token, "activate_username")
    try:
        user_id = uuid.UUID(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="פג תוקף הבקשה, נסה שוב")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.username is not None:
        # Re-checking the DB row (not just trusting the token) is what makes
        # this a self-closing door: once username is set, this branch fires
        # permanently for this account, even against a still-unexpired
        # activation token (e.g. two tabs, or a retried request).
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="החשבון כבר הופעל")

    normalized = _check_username_available(db, body.username)
    user.username = body.username
    user.username_normalized = normalized
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="שם המשתמש כבר תפוס, נסה שם אחר",
        )

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.post("/forgot-access")
@limiter.limit("3/hour")
def forgot_access(
    request: Request,
    background_tasks: BackgroundTasks,
    body: ForgotAccessRequest,
    db: Session = Depends(get_db),
):
    """Combined 'forgot username' + 'forgot password' entry point -- one
    field, one generic response regardless of whether the account exists
    (same anti-enumeration reasoning as the old forgot-password). The
    emailed content is what actually differs: a username reminder + reset
    link for a migrated account, or an activate-account pointer for a
    pre-migration one -- see send_account_recovery_email.
    """
    user = db.query(User).filter(User.email == body.email).first()

    if user:
        raw_token = generate_password_reset_token()
        db.add(PasswordResetToken(
            user_id=user.id,
            token_hash=hash_secret(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        ))
        db.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        activate_link = f"{settings.FRONTEND_URL}/activate-account"
        # Sent after the response goes out (BackgroundTasks), not awaited here
        # -- otherwise Resend's network latency would make this branch
        # measurably slower than the "no such user" branch below, the same
        # class of timing side-channel as the login fix.
        background_tasks.add_task(
            send_account_recovery_email, user.email, reset_link, user.username, activate_link
        )

    return {"message": GENERIC_FORGOT_ACCESS_MESSAGE}


@router.post("/reset-password")
@limiter.limit("5/hour")
def reset_password_confirm(request: Request, body: ResetPasswordConfirm, db: Session = Depends(get_db)):
    token_hash = hash_secret(body.token)
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash
    ).first()

    now = datetime.now(timezone.utc)
    # SQLite (used in tests) doesn't preserve tzinfo on DateTime(timezone=True)
    # columns, returning naive datetimes on read even though we always store
    # UTC -- normalize before comparing so this isn't Postgres-only-correct.
    expires_at = reset_token.expires_at if reset_token else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if (
        not reset_token
        or reset_token.used_at is not None
        or expires_at < now
    ):
        # One generic message for "no such token", "already used", and
        # "expired" alike -- distinguishing them tells an attacker which
        # guesses are closer to a real (if stale) token.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_RESET_PASSWORD_ERROR)

    user = db.query(User).filter(User.id == reset_token.user_id).first()

    if verify_password(body.new_password, user.hashed_password):
        # Token stays unused -- this isn't an invalid/expired/reused link,
        # just a rejected choice of password, so the user can retry the same
        # link with a different one instead of having to request a new email.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית",
        )

    user.hashed_password = get_password_hash(body.new_password)
    reset_token.used_at = now
    db.commit()

    return {"message": "הסיסמה עודכנה בהצלחה"}


@router.post("/verify-email", response_model=Token)
@limiter.limit("5/hour")
def verify_email(request: Request, body: VerifyEmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    code_row = (
        db.query(EmailVerificationCode).filter(EmailVerificationCode.user_id == user.id).first()
        if user else None
    )

    now = datetime.now(timezone.utc)
    expires_at = code_row.expires_at if code_row else None
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if (
        not user
        or not code_row
        or code_row.used_at is not None
        or expires_at < now
        or hash_secret(body.code) != code_row.code_hash
    ):
        # One generic message for "no such user", "no code issued", "already
        # used", "expired", and "wrong code" alike -- same principle as
        # reset-password: don't tell a guesser which reason it failed for.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_VERIFY_EMAIL_ERROR)

    user.is_verified = True
    code_row.used_at = now
    db.commit()

    # Log the user straight in on success -- they already proved control of
    # the email, no reason to make them submit a separate login afterward.
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.post("/resend-verification")
@limiter.limit("3/hour")
def resend_verification(
    request: Request,
    background_tasks: BackgroundTasks,
    body: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    # Same generic-response principle as forgot-access: whether the email
    # exists, and whether it's already verified, are both things this
    # endpoint must not reveal one way or the other.
    user = db.query(User).filter(User.email == body.email).first()

    if user and not user.is_verified:
        raw_code = _issue_verification_code(db, user)
        background_tasks.add_task(send_verification_email, user.email, raw_code)

    return {"message": GENERIC_RESEND_VERIFICATION_MESSAGE}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# WebAuthn (Face ID / fingerprint) -- optional alternate login, offered at
# registration and manageable later in Settings. Registration ceremony
# requires an existing session (a credential must attach to a real user
# row); login ceremony deliberately does not, since it IS how a session gets
# established.
# ---------------------------------------------------------------------------


@router.post("/webauthn/register/options")
@limiter.limit("10/hour")
def webauthn_register_options(
    request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    existing_creds = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.user_id == current_user.id
    ).all()
    options = webauthn.generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=current_user.id.bytes,
        user_name=current_user.username,
        user_display_name=current_user.full_name,
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
            for c in existing_creds
        ],
        # Discoverable credential (resident key), required rather than
        # merely preferred -- this is what makes the Login.jsx biometric
        # button/conditional-autofill flow possible at all: the browser can
        # only surface "which account?" from the authenticator itself, with
        # zero typed input, if the credential was stored resident-side with
        # its own copy of the user handle. Every platform authenticator this
        # feature targets (Face ID, Touch ID, Windows Hello, Android
        # biometric unlock) supports resident keys, so requiring it doesn't
        # meaningfully narrow who can enroll.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            require_resident_key=True,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    challenge_token = _create_purpose_token(
        "webauthn_reg_challenge",
        WEBAUTHN_CHALLENGE_TOKEN_TTL_MINUTES,
        sub=str(current_user.id),
        challenge=bytes_to_base64url(options.challenge),
    )
    return {"options": json.loads(options_to_json(options)), "challenge_token": challenge_token}


@router.post("/webauthn/register/verify")
@limiter.limit("10/hour")
def webauthn_register_verify(
    request: Request,
    background_tasks: BackgroundTasks,
    body: WebAuthnRegisterVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload = _decode_purpose_token(body.challenge_token, "webauthn_reg_challenge")
    if payload.get("sub") != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="פג תוקף הבקשה, נסה שוב")

    try:
        verification = webauthn.verify_registration_response(
            credential=body.credential,
            expected_challenge=base64url_to_bytes(payload["challenge"]),
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="אימות המכשיר נכשל")

    credential_id_b64 = bytes_to_base64url(verification.credential_id)
    if db.query(WebAuthnCredential).filter(WebAuthnCredential.credential_id == credential_id_b64).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="המכשיר הזה כבר רשום")

    transports = None
    if isinstance(body.credential, dict):
        raw_transports = body.credential.get("response", {}).get("transports")
        if raw_transports:
            transports = ",".join(raw_transports)

    device_label = _guess_device_label(request)
    db.add(WebAuthnCredential(
        user_id=current_user.id,
        credential_id=credential_id_b64,
        public_key=bytes_to_base64url(verification.credential_public_key),
        sign_count=verification.sign_count,
        transports=transports,
        device_label=device_label,
    ))
    db.commit()

    # Best-effort, after commit -- see send_new_device_email's docstring for
    # why this exists (a stolen-password-then-register-a-device attack
    # otherwise leaves no signal at all).
    background_tasks.add_task(
        send_new_device_email, current_user.email, device_label, datetime.now(timezone.utc)
    )

    return {"message": "המכשיר נרשם בהצלחה"}


@router.post("/webauthn/login/options")
@limiter.limit("10/minute")
def webauthn_login_options(request: Request, body: WebAuthnLoginOptionsRequest, db: Session = Depends(get_db)):
    # Usernameless/discoverable-credential path (Login.jsx's biometric
    # button and conditional-autofill call) omits username entirely --
    # allow_credentials stays None/empty so the browser asks the
    # authenticator "which resident credential fits this site?" instead of
    # the server pre-scoping to one account. The typed-username path (kept
    # for callers that already know it) still works exactly as before.
    normalized = _normalize_username(body.username) if body.username else None
    allow_credentials = None
    if normalized:
        user = db.query(User).filter(User.username_normalized == normalized).first()
        if user:
            creds = db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == user.id).all()
            if creds:
                allow_credentials = [
                    PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id)) for c in creds
                ]
    # An unknown username, or a known one with no enrolled credentials, both
    # still produce a well-formed options payload (empty allow-list) rather
    # than a 404 -- same enumeration-safety principle as everywhere else in
    # this file: this endpoint must not reveal which usernames have
    # WebAuthn enabled.
    options = webauthn.generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        allow_credentials=allow_credentials,
    )
    challenge_token = _create_purpose_token(
        "webauthn_login_challenge",
        WEBAUTHN_CHALLENGE_TOKEN_TTL_MINUTES,
        challenge=bytes_to_base64url(options.challenge),
    )
    return {"options": json.loads(options_to_json(options)), "challenge_token": challenge_token}


@router.post("/webauthn/login/verify", response_model=Token)
@limiter.limit("5/minute")
def webauthn_login_verify(request: Request, body: WebAuthnLoginVerifyRequest, db: Session = Depends(get_db)):
    payload = _decode_purpose_token(body.challenge_token, "webauthn_login_challenge")

    # The credential ID (globally unique, see WebAuthnCredential.credential_id)
    # is what actually resolves the user -- not username, which is now
    # optional and typically absent entirely for the discoverable/
    # usernameless flow. This is the standard discoverable-credential
    # pattern: the authenticator, not a typed identifier, tells the server
    # which account this assertion is for.
    credential_id_b64 = body.credential.get("id") if isinstance(body.credential, dict) else None
    stored = (
        db.query(WebAuthnCredential).filter(WebAuthnCredential.credential_id == credential_id_b64).first()
        if credential_id_b64 else None
    )
    user = db.query(User).filter(User.id == stored.user_id).first() if stored else None

    if not user or not stored:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_WEBAUTHN_LOGIN_ERROR)

    try:
        verification = webauthn.verify_authentication_response(
            credential=body.credential,
            expected_challenge=base64url_to_bytes(payload["challenge"]),
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGIN,
            credential_public_key=base64url_to_bytes(stored.public_key),
            credential_current_sign_count=stored.sign_count,
        )
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_WEBAUTHN_LOGIN_ERROR)

    stored.sign_count = verification.new_sign_count
    stored.last_used_at = datetime.now(timezone.utc)
    db.commit()

    # Same account-state gating as password login, for parity.
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="החשבון הושבת. פנה למנהל המערכת.")
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_type": "EMAIL_NOT_VERIFIED",
                "message": "יש לאמת את כתובת האימייל שלך לפני ההתחברות",
                "email": user.email,
            },
        )

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.get("/webauthn/credentials")
def list_webauthn_credentials(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    creds = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.user_id == current_user.id
    ).order_by(WebAuthnCredential.created_at).all()
    return [
        {
            "id": str(c.id),
            "device_label": c.device_label,
            "transports": c.transports,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
        }
        for c in creds
    ]


@router.delete("/webauthn/credentials/{credential_id}")
@limiter.limit("20/hour")
def delete_webauthn_credential(
    request: Request,
    credential_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        cred_uuid = uuid.UUID(credential_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="המכשיר לא נמצא")

    # Scoped to current_user.id in the query itself (not fetched-then-checked)
    # so another user's credential 404s instead of 403ing -- doesn't confirm
    # that credential ID exists at all, matching this file's enumeration-safety
    # posture elsewhere.
    cred = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.id == cred_uuid, WebAuthnCredential.user_id == current_user.id
    ).first()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="המכשיר לא נמצא")

    db.delete(cred)
    db.commit()
    return {"message": "המכשיר הוסר"}
