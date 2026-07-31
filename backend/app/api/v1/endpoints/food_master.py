import uuid
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.fitness import FoodMaster
from app.models.user import User
from app.schemas.food import FoodSuggestionCreate
from app.services.push_notifications import send_push_to_admins

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
                "category": duplicate.category,
                "calories_per_100g": duplicate.calories_per_100g,
                "protein_per_100g": duplicate.protein_per_100g,
                "carbs_per_100g": duplicate.carbs_per_100g,
                "fat_per_100g": duplicate.fat_per_100g,
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
        created_by_user_id=current_user.id,
        aliases=[],
        is_active=False,
    )
    db.add(food)
    db.commit()
    db.refresh(food)

    send_push_to_admins(
        title="מוצר חדש ממתין לאישור",
        body=food.canonical_name_he,
        url="/admin?tab=foods",
        db=db,
    )

    return {
        "id": str(food.id),
        "canonical_name_he": food.canonical_name_he,
        "canonical_name_en": food.canonical_name_en,
        "is_active": food.is_active,
        "status": "pending",
    }


@router.get("/check-similar")
def check_similar_food(
    name_he: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fuzzy pre-check so users don't create near-duplicate foods. Read-only,
    non-blocking — an empty list (no match clears the 0.6 threshold) is the
    expected common case, not an error."""
    query = (name_he or "").strip()
    if not query:
        return []

    candidates = db.query(FoodMaster).filter(FoodMaster.is_active.is_(True)).all()
    scored = []
    for food in candidates:
        ratio_he = SequenceMatcher(None, query, food.canonical_name_he or "").ratio()
        ratio_en = (
            SequenceMatcher(None, query, food.canonical_name_en or "").ratio()
            if food.canonical_name_en
            else 0.0
        )
        best = max(ratio_he, ratio_en)
        if best >= 0.6:
            scored.append((best, food))

    scored.sort(key=lambda pair: pair[0], reverse=True)

    return [
        {
            "id": str(food.id),
            "canonical_name_he": food.canonical_name_he,
            "canonical_name_en": food.canonical_name_en,
            "category": food.category,
            "category_en": food.category_en,
            "calories_per_100g": food.calories_per_100g,
            "protein_per_100g": food.protein_per_100g,
            "carbs_per_100g": food.carbs_per_100g,
            "fat_per_100g": food.fat_per_100g,
            "sugar_g": food.sugar_g,
            "sodium_mg": food.sodium_mg,
            "potassium_mg": food.potassium_mg,
            "calcium_mg": food.calcium_mg,
            "iron_mg": food.iron_mg,
            "saturated_fat_g": food.saturated_fat_g,
            "cholesterol_mg": food.cholesterol_mg,
            "fdc_id": food.fdc_id,
            "similarity": round(ratio, 4),
        }
        for ratio, food in scored[:5]
    ]
