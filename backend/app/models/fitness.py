import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, Date
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class NutritionPlan(Base):
    __tablename__ = "nutrition_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plan_data = Column(JSON)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="nutrition_plans")
    meals = relationship("Meal", back_populates="nutrition_plan")


class Meal(Base):
    __tablename__ = "meals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nutrition_plan_id = Column(UUID(as_uuid=True), ForeignKey("nutrition_plans.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    day_of_week = Column(String)
    meal_type = Column(String)
    name = Column(String)
    items = Column(JSON)
    total_calories = Column(Float)
    total_protein = Column(Float)
    total_carbs = Column(Float)
    total_fat = Column(Float)

    nutrition_plan = relationship("NutritionPlan", back_populates="meals")


class FoodLog(Base):
    __tablename__ = "food_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    meal_type = Column(String)
    food_name = Column(String)
    quantity_g = Column(Float)
    calories = Column(Float)
    protein = Column(Float)
    carbs = Column(Float)
    fat = Column(Float)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="food_logs")


class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plan_data = Column(JSON)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="workout_plans")
    exercises = relationship("WorkoutExercise", back_populates="workout_plan")
    sessions = relationship("WorkoutSession", back_populates="workout_plan")


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workout_plan_id = Column(UUID(as_uuid=True), ForeignKey("workout_plans.id"), nullable=False)
    day_of_week = Column(String)
    name = Column(String)
    muscle_group = Column(String)
    sets = Column(Integer)
    reps = Column(Integer)
    weight_kg = Column(Float)
    rest_seconds = Column(Integer)
    notes = Column(Text)
    order_index = Column(Integer)

    workout_plan = relationship("WorkoutPlan", back_populates="exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    workout_plan_id = Column(UUID(as_uuid=True), ForeignKey("workout_plans.id"), nullable=True)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True))
    current_exercise_index = Column(Integer, default=0)
    current_set_index = Column(Integer, default=0)
    completed_sets = Column(JSON, default=list)
    status = Column(String, default="active")  # active/completed/abandoned

    user = relationship("User", back_populates="workout_sessions")
    workout_plan = relationship("WorkoutPlan", back_populates="sessions")
    exercise_logs = relationship("ExerciseLog", back_populates="session")


class ExerciseLog(Base):
    __tablename__ = "exercise_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("workout_sessions.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    exercise_name = Column(String)
    set_number = Column(Integer)
    weight_kg = Column(Float)
    reps = Column(Integer)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True))

    session = relationship("WorkoutSession", back_populates="exercise_logs")


class AISuggestion(Base):
    __tablename__ = "ai_suggestions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    suggestion_type = Column(String)  # nutrition/workout/both
    content = Column(JSON)
    status = Column(String, default="pending")  # pending/approved/rejected
    task_id = Column(String)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="ai_suggestions")


class SmartProgression(Base):
    __tablename__ = "smart_progressions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    analysis_data = Column(JSON)
    suggestions = Column(JSON)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class UserMemory(Base):
    __tablename__ = "user_memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    memory_data = Column(JSON)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ExerciseMemory(Base):
    __tablename__ = "exercise_memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    exercise_name = Column(String, nullable=False)
    last_weight_kg = Column(Float)
    last_reps = Column(Integer)
    last_set_count = Column(Integer)
    last_used_at = Column(DateTime(timezone=True))


class FoodMemory(Base):
    __tablename__ = "food_memories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    food_name = Column(String, nullable=False)
    calories_per_100g = Column(Float)
    protein = Column(Float)
    carbs = Column(Float)
    fat = Column(Float)
    times_eaten = Column(Integer, default=0)
    last_eaten_at = Column(DateTime(timezone=True))


class PersonalRecord(Base):
    __tablename__ = "personal_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    exercise_name = Column(String, nullable=False)
    record_weight_kg = Column(Float)
    record_reps = Column(Integer)
    achieved_at = Column(DateTime(timezone=True))
    previous_record_kg = Column(Float)
    calculated_1rm = Column(Float)


class EnduranceLog(Base):
    __tablename__ = "endurance_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date)
    activity_type = Column(String)
    duration_min = Column(Float)
    distance_km = Column(Float)
    elevation_m = Column(Float)
    avg_heart_rate = Column(Integer)
    avg_pace = Column(Float)
    zones_time = Column(JSON)
    notes = Column(Text)


class StrengthLog(Base):
    __tablename__ = "strength_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    exercise_name = Column(String)
    date = Column(Date)
    sets_completed = Column(Integer)
    weight_kg = Column(Float)
    reps = Column(Integer)
    calculated_1rm = Column(Float)
    relative_strength_ratio = Column(Float)


class WeightLog(Base):
    __tablename__ = "weight_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False)
    weight_kg = Column(Float, nullable=False)
    body_fat_pct = Column(Float)


class HydrationLog(Base):
    __tablename__ = "hydration_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date = Column(Date)
    target_ml = Column(Integer)
    consumed_ml = Column(Integer)
    entries = Column(JSON)
    workout_bonus_ml = Column(Integer)
    weather_bonus_ml = Column(Integer)


class ExerciseMaster(Base):
    __tablename__ = "exercises_master"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name_en = Column(String, nullable=True, unique=True)
    canonical_name_he = Column(String, nullable=False)
    category = Column(String, nullable=False)
    muscle_group_primary = Column(String, nullable=True)
    equipment = Column(String, nullable=True, default="none")
    aliases = Column(JSON, default=list)
    is_active = Column(Boolean, default=True, nullable=False)
