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


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        return email
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


def hash_reset_token(raw_token: str) -> str:
    """SHA-256 of the raw token, for at-rest storage.

    Deliberately not bcrypt: bcrypt's per-hash random salt means the same
    input hashes differently every time, so it can't be used for an equality
    lookup (`WHERE token_hash = ?`) -- and it doesn't need to be slow like a
    password hash, since the token itself is already a high-entropy random
    value (unguessable by brute force) rather than a low-entropy user-chosen
    secret.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
