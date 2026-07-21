import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.fitness import FoodMaster
from app.models.user import User
from app.schemas.food import FoodSuggestionCreate

router = APIRouter()


@router.post("/suggest", status_code=status.HTTP_201_CREATED)
def suggest_food(
    payload: FoodSuggestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user may suggest a missing canonical food. It is
    saved with is_active=False (pending) and stays invisible to any
    is_active-filtered lookup until an admin approves it via
    POST /api/v1/admin/food-master/{id}/approve."""
    name_he = payload.canonical_name_he.strip()
    name_en = payload.canonical_name_en.strip() if payload.canonical_name_en else None

    name_match_conditions = [func.lower(FoodMaster.canonical_name_he) == name_he.lower()]
    if name_en:
        name_match_conditions.append(func.lower(FoodMaster.canonical_name_en) == name_en.lower())

    duplicate = db.query(FoodMaster).filter(or_(*name_match_conditions)).first()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "מוצר מזון עם שם דומה כבר קיים במערכת",
                "existing_id": str(duplicate.id),
                "existing_name_he": duplicate.canonical_name_he,
                "is_active": duplicate.is_active,
            },
        )

    food = FoodMaster(
        id=uuid.uuid4(),
        canonical_name_he=name_he,
        canonical_name_en=name_en,
        category=payload.category.value,
        calories_per_100g=payload.calories_per_100g,
        protein_per_100g=payload.protein_per_100g,
        carbs_per_100g=payload.carbs_per_100g,
        fat_per_100g=payload.fat_per_100g,
        fiber_per_100g=payload.fiber_per_100g,
        aliases=[],
        is_active=False,
    )
    db.add(food)
    db.commit()
    db.refresh(food)

    return {
        "id": str(food.id),
        "canonical_name_he": food.canonical_name_he,
        "canonical_name_en": food.canonical_name_en,
        "is_active": food.is_active,
        "status": "pending",
    }
