from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class FoodCategory(str, Enum):
    PROTEIN = "חלבונים"
    DAIRY = "מוצרי חלב"
    CARBS = "פחמימות"
    VEGETABLES = "ירקות"
    FRUITS = "פירות"
    FATS = "שומנים"
    HEALTHY_SNACKS = "חטיפים בריאים"


class FoodSuggestionCreate(BaseModel):
    canonical_name_he: str = Field(..., min_length=1)
    canonical_name_en: Optional[str] = None
    category: FoodCategory
    calories_per_100g: float = Field(..., ge=0)
    protein_per_100g: float = Field(..., ge=0)
    carbs_per_100g: float = Field(..., ge=0)
    fat_per_100g: float = Field(..., ge=0)
    fiber_per_100g: Optional[float] = Field(default=None, ge=0)
