from pydantic import BaseModel, Field
from typing import Optional, List
import datetime

class FoodLogCreate(BaseModel):
    date: Optional[datetime.date] = None
    meal_type: str  # breakfast, lunch, dinner, snack
    food_name: str
    quantity_g: float = Field(..., gt=0)
    calories: float = Field(..., ge=0)
    protein: float = Field(0, ge=0)
    carbs: float = Field(0, ge=0)
    fat: float = Field(0, ge=0)

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

class ManualFoodItem(BaseModel):
    name: str
    qty_g: float = Field(..., gt=0)
    calories: float = Field(..., ge=0)
    protein: float = Field(0, ge=0)
    carbs: float = Field(0, ge=0)
    fat: float = Field(0, ge=0)

class ManualMeal(BaseModel):
    meal_type: str  # breakfast, lunch, dinner, snack
    items: List[ManualFoodItem]

class ManualPlanCreate(BaseModel):
    # keyed by day_of_week (sunday..saturday) -> list of meals for that day
    week: dict[str, List[ManualMeal]]

class NutritionPlanResponse(BaseModel):
    id: str
    user_id: str
    plan_data: dict
    is_active: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class CalorieCalcRequest(BaseModel):
    type: str  # "text" | "image"
    query: Optional[str] = None
    image_base64: Optional[str] = None
    image_media_type: str = "image/jpeg"
