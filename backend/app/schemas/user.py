import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr


class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool
    is_admin: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityLevel(str, Enum):
    sedentary = "sedentary"
    lightly_active = "lightly_active"
    moderately_active = "moderately_active"
    very_active = "very_active"
    extra_active = "extra_active"


class Goal(str, Enum):
    weight_loss = "weight_loss"
    muscle_gain = "muscle_gain"
    maintenance = "maintenance"
    fitness_improvement = "fitness_improvement"


class Gender(str, Enum):
    male = "male"
    female = "female"


class ThemePreference(str, Enum):
    dark = "dark"
    light = "light"


class UserProfileCreate(BaseModel):
    age: int
    gender: Gender
    height_cm: float
    weight_kg: float
    target_weight_kg: Optional[float] = None
    activity_level: ActivityLevel
    goal: Goal
    medical_conditions: Optional[str] = None
    injuries: Optional[str] = None
    allergies: Optional[str] = None
    equipment: Optional[List[str]] = None
    meals_per_day: int = 5
    theme_preference: Optional[ThemePreference] = None


class UserProfileResponse(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    activity_level: Optional[str] = None
    goal: Optional[str] = None
    medical_conditions: Optional[str] = None
    injuries: Optional[str] = None
    allergies: Optional[str] = None
    equipment: Optional[List[str]] = None
    meals_per_day: Optional[int] = None
    bmi: Optional[float] = None
    bmi_category: Optional[str] = None
    bmr: Optional[float] = None
    tdee: Optional[float] = None
    target_calories: Optional[float] = None
    theme_preference: Optional[str] = None

    model_config = {"from_attributes": True}


# Keep backward-compat alias
class UserProfileUpdate(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    target_weight_kg: Optional[float] = None
    activity_level: Optional[str] = None
    goal: Optional[str] = None
    medical_conditions: Optional[str] = None
    injuries: Optional[str] = None
    allergies: Optional[str] = None
    equipment: Optional[str] = None
    meals_per_day: Optional[int] = None
    theme_preference: Optional[ThemePreference] = None
