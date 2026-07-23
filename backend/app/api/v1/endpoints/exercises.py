import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.data.exercises import search_exercises
from app.models.fitness import ExerciseMaster
from app.models.user import User
from app.schemas.exercises import ExerciseSuggestionCreate
from app.services.push_notifications import send_push_to_admins

router = APIRouter()


@router.get("/search")
def search(
    q: str = Query(default="", description="שם תרגיל לחיפוש"),
    muscle_group: str = Query(default="", description="קבוצת שריר לסינון"),
):
    # NOTE: this searches the small static autocomplete list in
    # app/data/exercises.py, not the exercises_master DB table below —
    # they are separate data sources. exercises_master is the canonical
    # list the workout-generation AI agent is constrained to (see
    # app.services.crew_agents.get_canonical_exercises).
    return search_exercises(q, muscle_group)


@router.post("/suggest", status_code=status.HTTP_201_CREATED)
def suggest_exercise(
    payload: ExerciseSuggestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user may suggest a missing canonical exercise. It is
    saved with is_active=False (pending) and stays invisible to
    get_canonical_exercises() — and therefore to the AI agent — until an
    admin approves it via POST /api/v1/admin/exercises/{id}/approve."""
    name_he = payload.canonical_name_he.strip()
    name_en = payload.canonical_name_en.strip() if payload.canonical_name_en else None

    name_match_conditions = [func.lower(ExerciseMaster.canonical_name_he) == name_he.lower()]
    if name_en:
        name_match_conditions.append(func.lower(ExerciseMaster.canonical_name_en) == name_en.lower())

    duplicate = db.query(ExerciseMaster).filter(or_(*name_match_conditions)).first()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "תרגיל עם שם דומה כבר קיים במערכת",
                "existing_id": str(duplicate.id),
                "existing_name_he": duplicate.canonical_name_he,
                "is_active": duplicate.is_active,
            },
        )

    exercise = ExerciseMaster(
        id=uuid.uuid4(),
        canonical_name_he=name_he,
        canonical_name_en=name_en,
        category=payload.category.strip(),
        muscle_group_primary=payload.muscle_group_primary.strip(),
        equipment=(payload.equipment or "none").strip(),
        aliases=[],
        is_active=False,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)

    send_push_to_admins(
        title="תרגיל חדש ממתין לאישור",
        body=exercise.canonical_name_he,
        url="/admin?tab=exercises",
        db=db,
    )

    return {
        "id": str(exercise.id),
        "canonical_name_he": exercise.canonical_name_he,
        "canonical_name_en": exercise.canonical_name_en,
        "is_active": exercise.is_active,
        "status": "pending",
    }
