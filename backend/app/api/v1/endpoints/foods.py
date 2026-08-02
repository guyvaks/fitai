from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.fitness import FoodMaster

router = APIRouter()


def _matches_query(food: FoodMaster, needle: str) -> bool:
    """needle is already lowercased. Primary path is canonical_name_he
    (unchanged); aliases is an additional OR, not a replacement -- checked
    in Python rather than SQL since JSON-array containment isn't portable
    across the SQLite test engine and Postgres, and the table is small
    enough (~460 rows) that this costs nothing meaningful."""
    if needle in (food.canonical_name_he or "").lower():
        return True
    return any(needle in (alias or "").lower() for alias in (food.aliases or []))


@router.get("/search")
def search(
    q: str = Query(default="", description="שם מאכל לחיפוש"),
    category: str = Query(default="", description="קטגוריה לסינון"),
    db: Session = Depends(get_db),
):
    query = db.query(FoodMaster).filter(FoodMaster.is_active.is_(True))

    if category and category != "כל הקטגוריות":
        query = query.filter(FoodMaster.category == category)

    candidates = query.order_by(FoodMaster.canonical_name_he).all()

    q = q.strip()
    if q:
        needle = q.lower()
        candidates = [f for f in candidates if _matches_query(f, needle)]

    foods = candidates[:200]
    return [
        {
            "id": str(f.id),
            "name": f.canonical_name_he,
            "calories": f.calories_per_100g,
            "protein": f.protein_per_100g,
            "carbs": f.carbs_per_100g,
            "fat": f.fat_per_100g,
            "category": f.category,
            "category_en": f.category_en,
            "sugar_g": f.sugar_g,
            "sodium_mg": f.sodium_mg,
            "potassium_mg": f.potassium_mg,
            "calcium_mg": f.calcium_mg,
            "iron_mg": f.iron_mg,
            "saturated_fat_g": f.saturated_fat_g,
            "cholesterol_mg": f.cholesterol_mg,
            "fdc_id": f.fdc_id,
        }
        for f in foods
    ]
