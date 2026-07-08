from fastapi import APIRouter, Query
from app.data.exercises import search_exercises

router = APIRouter()


@router.get("/search")
def search(
    q: str = Query(default="", description="שם תרגיל לחיפוש"),
    muscle_group: str = Query(default="", description="קבוצת שריר לסינון"),
):
    return search_exercises(q, muscle_group)
