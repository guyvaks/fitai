from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

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
from app.models.user import ConsentRecord, EmailVerificationCode, PasswordResetToken, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    ResendVerificationRequest,
    ResetPasswordConfirm,
    Token,
    UserLogin,
    UserRegister,
    VerifyEmailRequest,
)
from app.schemas.user import UserResponse
from app.services.email import (
    send_password_reset_email,
    send_pending_ai_access_email,
    send_verification_email,
)
from app.services.push_notifications import send_push_to_admins

RESET_TOKEN_TTL_MINUTES = 30
VERIFICATION_CODE_TTL_MINUTES = 15
GENERIC_FORGOT_PASSWORD_MESSAGE = "אם קיים חשבון עם כתובת זו, נשלח אליו קישור לאיפוס סיסמה"
GENERIC_RESET_PASSWORD_ERROR = "קישור האיפוס אינו תקין או שפג תוקפו"
GENERIC_RESEND_VERIFICATION_MESSAGE = "אם קיים חשבון לא מאומת עם כתובת זו, נשלח אליו קוד אימות חדש"
GENERIC_VERIFY_EMAIL_ERROR = "הקוד שגוי או שפג תוקפו"
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

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    email = decode_token(token)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.is_active:
        # Checked here (not just at login) so a deactivated user's existing
        # token -- valid for up to ACCESS_TOKEN_EXPIRE_MINUTES (7 days) -- is
        # rejected immediately on the next request, not just at their next
        # login attempt.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="החשבון הושבת")
    return user


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def register(request: Request, background_tasks: BackgroundTasks, user_data: UserRegister, db: Session = Depends(get_db)):
    if not user_data.consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="יש לאשר את מדיניות הפרטיות כדי להירשם",
        )

    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    hashed_pw = get_password_hash(user_data.password)
    user = User(email=user_data.email, hashed_password=hashed_pw, full_name=user_data.full_name, is_verified=False)
    db.add(user)
    db.commit()
    db.refresh(user)

    # The durable record of consent -- independent of whatever checkbox/copy
    # the frontend happens to render today, this is what answers "did this
    # user agree, and to what" later.
    db.add(ConsentRecord(user_id=user.id, policy_version=PRIVACY_POLICY_VERSION))
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
    send_pending_ai_access_email(db, user_data.email)

    raw_code = _issue_verification_code(db, user)
    background_tasks.add_task(send_verification_email, user_data.email, raw_code)

    # Still returns a token for API-shape/backward-compat reasons (existing
    # tests assert on it), but the frontend deliberately does NOT use it to
    # establish a session -- Register.jsx calls the raw endpoint directly and
    # sends the user straight to the verify-email screen instead, so there's
    # no window where an unverified account has a working client-side
    # session. The only paths to a real session are login (blocked below
    # until verified) and a successful /verify-email.
    access_token = create_access_token(
        data={"sub": user_data.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(request: Request, user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()
    if user:
        password_valid = verify_password(user_data.password, user.hashed_password)
    else:
        # Always run a real bcrypt comparison, even when no account matches,
        # so this path takes about as long as a genuine wrong-password check
        # (see DUMMY_PASSWORD_HASH) -- otherwise the faster response time
        # alone would reveal that the email isn't registered.
        verify_password(user_data.password, DUMMY_PASSWORD_HASH)
        password_valid = False

    if not user or not password_valid:
        # Deliberately identical status code and message for "no such
        # account" and "wrong password" -- distinguishing them lets an
        # attacker enumerate registered emails via the login endpoint.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="אימייל או סיסמה שגויים",
        )

    if not user.is_active:
        # Checked after the password (same reasoning as is_verified below --
        # doesn't reopen email enumeration since it's only reachable once the
        # password is already confirmed correct).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="החשבון הושבת. פנה למנהל המערכת.",
        )

    if not user.is_verified:
        # Only reachable once the password has already been confirmed
        # correct, so this doesn't reopen the email-enumeration gap the
        # generic 401 above closes -- a wrong-password guess against an
        # unverified account still gets the same generic 401 as any other.
        # A distinct status (403) + structured detail (vs. the plain string
        # above) lets the frontend tell "wrong credentials" apart from
        # "right credentials, not verified yet" and route accordingly.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_type": "EMAIL_NOT_VERIFIED",
                "message": "יש לאמת את כתובת האימייל שלך לפני ההתחברות",
            },
        )

    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return Token(access_token=access_token)


@router.post("/forgot-password")
@limiter.limit("3/hour")
def forgot_password(
    request: Request,
    background_tasks: BackgroundTasks,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    # Always the same response regardless of whether the email is registered
    # -- an endpoint whose whole purpose is "does this email exist" is a
    # textbook enumeration target if it answers differently either way.
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
        # Sent after the response goes out (BackgroundTasks), not awaited here
        # -- otherwise Resend's network latency would make this branch
        # measurably slower than the "no such user" branch below, the same
        # class of timing side-channel as the login fix.
        background_tasks.add_task(send_password_reset_email, user.email, reset_link)

    return {"message": GENERIC_FORGOT_PASSWORD_MESSAGE}


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
        data={"sub": user.email},
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
    # Same generic-response principle as forgot-password: whether the email
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
