from pydantic import BaseModel, EmailStr

from app.schemas.user import PreferredLanguage


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    consent_given: bool
    # Storage-only for now (see User.preferred_language) -- omitted requests
    # default to "he", the current (and only actually implemented) UI language.
    preferred_language: PreferredLanguage = PreferredLanguage.he


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    email: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordConfirm(BaseModel):
    token: str
    new_password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr
