import re

from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.user import PreferredLanguage

# 3-30 chars, Hebrew + Latin letters, digits, '.', '_', '-'. Explicit Hebrew
# Unicode range (not the "א-ת" literal) to avoid collation ambiguity across
# environments. Case-insensitivity/uniqueness is handled separately via
# User.username_normalized -- this regex only constrains character set/length.
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9א-ת._-]{3,30}$")

# Homoglyph/mixed-script collisions (e.g. visually-similar Hebrew/Latin
# characters) are a known, accepted, out-of-scope limitation -- no Unicode
# confusable-detection is applied here, only length/charset + case-insensitive
# exact matching.


def validate_username_format(value: str) -> str:
    if not USERNAME_REGEX.match(value):
        raise ValueError("שם המשתמש חייב להכיל 3-30 תווים: אותיות (עברית/אנגלית), ספרות, נקודה, מקף או קו תחתון")
    return value


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    username: str
    consent_given: bool
    # Storage-only for now (see User.preferred_language) -- omitted requests
    # default to "he", the current (and only actually implemented) UI language.
    preferred_language: PreferredLanguage = PreferredLanguage.he

    _validate_username = field_validator("username")(validate_username_format)


class UserLogin(BaseModel):
    # No email field, deliberately -- the regular login screen must never
    # accept email as an identifier. Pre-migration accounts (username IS
    # NULL) authenticate exclusively through POST /auth/activate-account.
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotAccessRequest(BaseModel):
    """Single combined recovery entry point covering both 'forgot username'
    and 'forgot password' -- the response is always generic regardless of
    whether the account exists, matching the pre-existing forgot-password
    anti-enumeration pattern. See send_account_recovery_email for how the
    emailed content (username reminder + reset link, or an activate-account
    pointer for pre-migration accounts) is decided."""

    email: EmailStr


class ResetPasswordConfirm(BaseModel):
    token: str
    new_password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class UsernameAvailabilityResponse(BaseModel):
    available: bool
    reason: str | None = None  # "taken" | "invalid_format" | None


class ActivateAccountRequest(BaseModel):
    """Phase 1 of the existing-user migration bridge (see auth.py). Accepts
    email+password ONLY for accounts where username IS NULL -- this is
    intentionally the one place besides forgot-password/reset-password that
    still asks for an email, since pre-migration accounts have no username
    yet to log in with."""

    email: EmailStr
    password: str


class ActivateAccountSetUsernameRequest(BaseModel):
    activation_token: str
    username: str

    _validate_username = field_validator("username")(validate_username_format)


class WebAuthnRegisterVerifyRequest(BaseModel):
    challenge_token: str
    credential: dict


class WebAuthnLoginOptionsRequest(BaseModel):
    username: str


class WebAuthnLoginVerifyRequest(BaseModel):
    username: str
    challenge_token: str
    credential: dict


class WebAuthnCredentialResponse(BaseModel):
    id: str
    device_label: str | None = None
    transports: str | None = None
    created_at: str
    last_used_at: str | None = None
