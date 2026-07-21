from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.fitness import FoodMaster

router = APIRouter()


@router.get("/search")
def search(
    q: str = Query(default="", description="שם מאכל לחיפוש"),
    category: str = Query(default="", description="קטגוריה לסינון"),
    db: Session = Depends(get_db),
):
    query = db.query(FoodMaster).filter(FoodMaster.is_active.is_(True))

    q = q.strip()
    if q:
        query = query.filter(func.lower(FoodMaster.canonical_name_he).contains(q.lower()))
    if category and category != "כל הקטגוריות":
        query = query.filter(FoodMaster.category == category)

    foods = query.order_by(FoodMaster.canonical_name_he).limit(200).all()
    return [
        {
            "id": str(f.id),
            "name": f.canonical_name_he,
            "calories": f.calories_per_100g,
            "protein": f.protein_per_100g,
            "carbs": f.carbs_per_100g,
            "fat": f.fat_per_100g,
            "category": f.category,
        }
        for f in foods
    ]
