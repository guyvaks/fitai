import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# Used to run a real bcrypt comparison on the login path when no user matches
# the given email, so that path isn't measurably faster than a real wrong-password
# check -- that timing gap would otherwise leak whether an email is registered.
DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Returns the full JWT payload (not just `sub`) so callers can inspect
    extra claims -- e.g. the `purpose` claim on the activate-account bridge's
    short-lived token, which must never be accepted as a general session by
    get_current_user."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def generate_password_reset_token() -> str:
    """A random, opaque, single-use token for the forgot-password link.

    Not a JWT: a JWT signed with SECRET_KEY would be independently verifiable
    (and thus impossible to invalidate early or mark "already used") without
    also tracking used ones in the DB anyway -- a random token looked up
    against a DB row gets single-use and expiry for free from the same table.
    """
    return secrets.token_urlsafe(32)


def generate_verification_code() -> str:
    """A random 6-digit numeric code for the email-verification screen.

    Zero-padded so it's always 6 characters (secrets.randbelow can return a
    short number) -- the user reads and types this manually, unlike the
    reset token above which only ever travels inside a clicked link.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_secret(raw_value: str) -> str:
    """SHA-256 of a token/code, for at-rest storage.

    Shared by the password-reset token and the email-verification code --
    both are short-lived, rate-limited, server-generated secrets, not
    low-entropy user-chosen ones, so a plain fast hash is appropriate for
    both (unlike passwords, which need bcrypt's slow, salted hashing).
    Deliberately not bcrypt: bcrypt's per-hash random salt means the same
    input hashes differently every time, so it can't be used for an equality
    lookup (`WHERE token_hash = ?` / `WHERE code_hash = ?`).
    """
    return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()
