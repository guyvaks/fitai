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
    get_password_hash,
    hash_reset_token,
    verify_password,
)
from app.core.config import settings
from app.models.user import PasswordResetToken, User
from app.schemas.auth import ForgotPasswordRequest, ResetPasswordConfirm, Token, UserLogin, UserRegister
from app.schemas.user import UserResponse
from app.services.email import send_password_reset_email

RESET_TOKEN_TTL_MINUTES = 30
GENERIC_FORGOT_PASSWORD_MESSAGE = "אם קיים חשבון עם כתובת זו, נשלח אליו קישור לאיפוס סיסמה"
GENERIC_RESET_PASSWORD_ERROR = "קישור האיפוס אינו תקין או שפג תוקפו"

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
    return user


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
def register(request: Request, user_data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    hashed_pw = get_password_hash(user_data.password)
    user = User(email=user_data.email, hashed_password=hashed_pw, full_name=user_data.full_name)
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(
        data={"sub": user.email},
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
            token_hash=hash_reset_token(raw_token),
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
    token_hash = hash_reset_token(body.token)
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


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
