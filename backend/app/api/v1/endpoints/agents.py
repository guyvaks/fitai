import asyncio
import json
import uuid
from typing import Dict
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserProfile
from app.models.fitness import AISuggestion, UserMemory, NutritionPlan, WorkoutPlan

router = APIRouter()

# In-memory task status store (use Redis in production)
task_store: Dict[str, dict] = {}


def _normalise_content(raw: dict) -> dict:
    """Mirror of the frontend's normaliseContent() in AISuggestion.jsx —
    the AI crew doesn't always return a clean {meal_plan/workout_plan} dict
    at the top level (e.g. it's nested one level under raw_output/content),
    so approval must recognise those same wrapper shapes.

    Deliberately does NOT synthesise a fake single-day plan from a lone meal
    object — that used to silently turn a failed/incomplete generation into
    what looked like a legitimate one-day plan, which is exactly the "1 day
    instead of 7" bug this mirrors away from. If there's no real meal_plan/
    workout_plan, this returns content that fails the "meal_plan" in content
    check below, so approval correctly reports no valid content instead of
    persisting fabricated data."""
    if not isinstance(raw, dict):
        return {}

    if "meal_plan" in raw or "workout_plan" in raw:
        return raw

    if raw.get("raw_output"):
        try:
            parsed = json.loads(raw["raw_output"])
            if isinstance(parsed, dict) and ("meal_plan" in parsed or "workout_plan" in parsed):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass

    if isinstance(raw.get("content"), dict):
        return _normalise_content(raw["content"])

    return raw


def _build_profile_dict(profile) -> dict:
    return {
        "age": profile.age,
        "gender": profile.gender,
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "target_calories": profile.target_calories,
        "goal": profile.goal,
        "allergies": profile.allergies,
        "injuries": profile.injuries,
        "equipment": profile.equipment,
        "meals_per_day": profile.meals_per_day,
        "activity_level": profile.activity_level,
    }


def _run_in_background(task_id: str, crew_fn_name: str, profile_dict: dict, memory_dict: dict, user_id: str, suggestion_type: str):
    """Generic background runner — calls the named crew function."""
    from app.services.crew_agents import run_nutrition_crew, run_workout_crew, run_full_crew
    from app.core.database import SessionLocal

    crew_fns = {
        "nutrition": run_nutrition_crew,
        "workout": run_workout_crew,
        "full": run_full_crew,
    }
    crew_fn = crew_fns[crew_fn_name]

    task_store[task_id] = {"status": "running", "progress": "AI עובד על ההמלצות שלך..."}

    try:
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(crew_fn(profile_dict, memory_dict))
        loop.close()

        db = SessionLocal()
        try:
            suggestion = AISuggestion(
                user_id=user_id,
                suggestion_type=suggestion_type,
                content=result,
                status="pending",
                task_id=task_id,
            )
            db.add(suggestion)
            db.commit()
            db.refresh(suggestion)
            task_store[task_id] = {
                "status": "ready",
                "suggestion_id": str(suggestion.id),
                "content": result,
            }
        finally:
            db.close()
    except Exception as e:
        task_store[task_id] = {"status": "error", "error": str(e)}


def _start_task(background_tasks: BackgroundTasks, db: Session, current_user: User, crew_fn_name: str, suggestion_type: str) -> dict:
    """Shared logic: validate profile, create task_id, enqueue background job."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="נא להשלים את הפרופיל תחילה")

    memory_row = db.query(UserMemory).filter(UserMemory.user_id == current_user.id).first()
    memory = memory_row.memory_data if memory_row else {}

    task_id = str(uuid.uuid4())
    task_store[task_id] = {"status": "pending", "progress": "מתחיל..."}

    background_tasks.add_task(
        _run_in_background,
        task_id,
        crew_fn_name,
        _build_profile_dict(profile),
        memory,
        current_user.id,
        suggestion_type,
    )
    return {"task_id": task_id, "status": "pending", "suggestion_type": suggestion_type}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/nutrition")
def generate_nutrition_plan(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run only the nutrition agent — builds a weekly meal plan."""
    return _start_task(background_tasks, db, current_user, "nutrition", "nutrition")


@router.post("/workout")
def generate_workout_plan(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run only the workout agent — builds a weekly workout plan."""
    return _start_task(background_tasks, db, current_user, "workout", "workout")


@router.post("/full-plan")
def generate_full_plan(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run all 3 agents: nutrition + workout + supervisor."""
    return _start_task(background_tasks, db, current_user, "full", "both")


@router.get("/status/{task_id}")
def get_task_status(task_id: str):
    status = task_store.get(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.post("/approve/{suggestion_id}")
def approve_suggestion(
    suggestion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    suggestion = db.query(AISuggestion).filter(
        AISuggestion.id == uuid.UUID(suggestion_id),
        AISuggestion.user_id == current_user.id,
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    content = _normalise_content(suggestion.content)

    from app.services.crew_agents import incomplete_plan_keys

    incomplete = incomplete_plan_keys(content)
    if incomplete:
        raise HTTPException(
            status_code=400,
            detail=(
                "התוכנית שנוצרה חלקית ולא כוללת את כל 7 ימי השבוע "
                f"({', '.join(incomplete)}) — נסה ליצור תכנית מחדש"
            ),
        )

    saved_something = False

    if "meal_plan" in content:
        db.query(NutritionPlan).filter(NutritionPlan.user_id == current_user.id).update({"is_active": False})
        db.add(NutritionPlan(user_id=current_user.id, plan_data=content, is_active=True))
        saved_something = True

    if "workout_plan" in content:
        db.query(WorkoutPlan).filter(WorkoutPlan.user_id == current_user.id).update({"is_active": False})
        db.add(WorkoutPlan(user_id=current_user.id, plan_data=content, is_active=True))
        saved_something = True

    if not saved_something:
        raise HTTPException(status_code=400, detail="לא נמצא תוכן תקין לשמירה — נסה ליצור תכנית מחדש")

    suggestion.status = "approved"
    db.commit()
    return {"status": "approved", "message": "התכנית אושרה ונשמרה"}


@router.post("/reject/{suggestion_id}")
def reject_suggestion(
    suggestion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    suggestion = db.query(AISuggestion).filter(
        AISuggestion.id == uuid.UUID(suggestion_id),
        AISuggestion.user_id == current_user.id,
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    suggestion.status = "rejected"
    db.commit()
    return {"status": "rejected"}


@router.get("/pending")
def get_pending_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    suggestions = db.query(AISuggestion).filter(
        AISuggestion.user_id == current_user.id,
        AISuggestion.status == "pending",
    ).order_by(AISuggestion.created_at.desc()).all()
    return suggestions
