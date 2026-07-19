from typing import Optional

from pydantic import BaseModel, Field


class ExerciseSuggestionCreate(BaseModel):
    canonical_name_he: str = Field(..., min_length=1)
    canonical_name_en: Optional[str] = None
    category: str = Field(..., min_length=1)
    muscle_group_primary: str = Field(..., min_length=1)
    equipment: Optional[str] = "none"
