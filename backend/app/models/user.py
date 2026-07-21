import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
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
    created_at = Column(DateTime(timezone=True), default=utcnow)

    profile = relationship("UserProfile", back_populates="user", uselist=False)
    nutrition_plans = relationship("NutritionPlan", back_populates="user")
    workout_plans = relationship("WorkoutPlan", back_populates="user")
    food_logs = relationship("FoodLog", back_populates="user")
    workout_sessions = relationship("WorkoutSession", back_populates="user")
    ai_suggestions = relationship("AISuggestion", back_populates="user")


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
