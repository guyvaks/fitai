import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    # Python-side default=False applies to every new row the ORM inserts (new
    # signups, going forward). The migration's server_default=true is only
    # for rows that predate this column -- existing users are grandfathered
    # in as already-verified rather than retroactively locked out.
    is_verified = Column(Boolean, default=False, nullable=False)
    # Same grandfathering pattern as is_verified above: Python-side
    # default=False gates every new signup going forward, while the
    # migration's server_default=true grandfathers in existing users so this
    # new gate on an existing core feature doesn't retroactively lock anyone
    # out. Approval/revocation is admin-only (see admin.py) and one-time per
    # user, not per AI generation call.
    ai_access_approved = Column(Boolean, default=False, nullable=False)
    # NULL = unlimited (the default for everyone -- opt-in restriction, not a
    # blanket limit). A set integer caps how many AI generations
    # (nutrition/workout/full-plan combined) that user may run per UTC day.
    # Nullable, so no server_default/grandfathering concern like the two
    # booleans above -- existing rows simply get NULL for free.
    daily_ai_generation_limit = Column(Integer, nullable=True)
    # Storage-only for now -- no i18n/translation is wired up yet, the UI
    # stays Hebrew regardless of this value. Exists so the registration flow
    # and Settings page can capture/display the preference ahead of an
    # actual translation implementation.
    preferred_language = Column(String, nullable=False, default="he", server_default="he")
    # Deliberately nullable forever -- NOT a nullable-then-backfilled column.
    # username IS NULL is the permanent, DB-level marker for "pre-migration
    # account" (existed before username-based login shipped). There is no
    # backfill migration and there must never be a NOT NULL constraint added
    # here: every *new* account gets a username at registration (enforced in
    # the /register endpoint, an application-level invariant), while existing
    # accounts stay NULL until they self-serve through POST
    # /auth/activate-account. Stored as-typed for display.
    username = Column(String(30), nullable=True)
    # Lowercased mirror of `username`, used for uniqueness and every
    # lookup/login -- keeps case-insensitive matching a plain indexed
    # equality check instead of a Postgres functional index on lower(username).
    # Postgres unique indexes allow multiple NULLs, so this coexists fine with
    # every pre-migration row being NULL.
    username_normalized = Column(String(30), nullable=True, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    avatar_data = Column(LargeBinary, nullable=True)
    avatar_content_type = Column(String, nullable=True)
    avatar_updated_at = Column(DateTime(timezone=True), nullable=True)

    profile = relationship("UserProfile", back_populates="user", uselist=False)
    nutrition_plans = relationship("NutritionPlan", back_populates="user")
    workout_plans = relationship("WorkoutPlan", back_populates="user")
    food_logs = relationship("FoodLog", back_populates="user")
    workout_sessions = relationship("WorkoutSession", back_populates="user")
    ai_suggestions = relationship("AISuggestion", back_populates="user")
    # passive_deletes=True: this FK relies on the DB-level ON DELETE CASCADE
    # (unlike the relationships above, which are cleared explicitly before
    # the parent is deleted) -- without it, SQLAlchemy would try to UPDATE
    # webauthn_credentials.user_id to NULL on parent delete instead of
    # leaving it to the DB, which fails since that column is NOT NULL.
    webauthn_credentials = relationship("WebAuthnCredential", back_populates="user", passive_deletes=True)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    age = Column(Integer)
    gender = Column(String)
    height_cm = Column(Float)
    weight_kg = Column(Float)
    target_weight_kg = Column(Float)
    activity_level = Column(String)
    goal = Column(String)
    medical_conditions = Column(Text)
    injuries = Column(Text)
    allergies = Column(Text)
    equipment = Column(Text)
    meals_per_day = Column(Integer)
    meals_config = Column(JSON)
    endurance_tracking_config = Column(JSON)
    strength_tracking_config = Column(JSON)
    workout_preferences = Column(JSON)
    bmi = Column(Float)
    bmi_category = Column(String)
    bmr = Column(Float)
    tdee = Column(Float)
    target_calories = Column(Float)
    theme_preference = Column(String, nullable=False, default="dark", server_default="dark")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="profile")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String, nullable=False, unique=True)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # Only the SHA-256 hash of the raw token is stored -- the raw token lives
    # solely in the emailed link, so a DB read (backup, leak, admin query)
    # can never yield a usable reset token, mirroring how passwords
    # themselves are never stored in cleartext.
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class EmailVerificationCode(Base):
    __tablename__ = "email_verification_codes"

    # One row per user (unique user_id, not a history table like
    # password_reset_tokens) -- a verification code is looked up by
    # (email, code) together rather than by a globally-unique opaque token,
    # so there's exactly one "current" code per user to check against;
    # register/resend both upsert this row instead of accumulating history.
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class WebAuthnCredential(Base):
    __tablename__ = "webauthn_credentials"

    # Multiple rows per user are expected (one per enrolled device) -- only
    # credential_id is globally unique, per the WebAuthn spec (an
    # authenticator-issued credential ID never collides across users).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    credential_id = Column(String, nullable=False, unique=True, index=True)
    public_key = Column(String, nullable=False)
    sign_count = Column(Integer, nullable=False, default=0)
    transports = Column(String, nullable=True)
    device_label = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="webauthn_credentials")


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    # What makes consent "documented" rather than just a UI checkbox state --
    # a durable, timestamped record of which privacy policy version a user
    # actually agreed to, independent of whatever the frontend currently
    # renders. One row per registration (a history table, not upserted --
    # if the policy is ever re-consented-to after a material change, that's
    # a new row, not an overwrite of this one).
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    policy_version = Column(String, nullable=False)
    consented_at = Column(DateTime(timezone=True), default=utcnow)
