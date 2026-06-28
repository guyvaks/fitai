from pydantic import BaseModel
from typing import Optional, List
import datetime

class FoodLogCreate(BaseModel):
    date: Optional[datetime.date] = None
    meal_type: str  # breakfast, lunch, dinner, snack
    food_name: str
    quantity_g: float
    calories: float
    protein: float = 0
    carbs: float = 0
    fat: float = 0

class FoodLogResponse(BaseModel):
    id: str
    date: datetime.date
    meal_type: str
    food_name: str
    quantity_g: float
    calories: float
    protein: float
    carbs: float
    fat: float

    class Config:
        from_attributes = True

class NutritionPlanResponse(BaseModel):
    id: str
    user_id: str
    plan_data: dict
    is_active: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True
