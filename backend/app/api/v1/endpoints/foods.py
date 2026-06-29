from fastapi import APIRouter, Query
from app.data.foods import search_foods

router = APIRouter()


@router.get("/search")
def search(
    q: str = Query(default="", description="שם מאכל לחיפוש"),
    category: str = Query(default="", description="קטגוריה לסינון"),
):
    return search_foods(q, category)
