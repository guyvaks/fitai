import asyncio
import uuid
from typing import Dict
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserProfile
from app.models.fitness import AISuggestion, UserMemory, NutritionPlan, WorkoutPlan
import json

router = APIRouter()

# In-memory task status store (use Redis in production)
task_store: Dict[str, dict] = {}


def run_crew_sync(task_id: str, profile_dict: dict, memory_dict: dict, user_id: str, db_url: str):
    """Run in background thread."""
    from app.services.crew_agents import run_ai_crew
    from app.core.database import SessionLocal

    task_store[task_id] = {"status": "running", "progress": "AI עובד על ההמלצות שלך..."}

    try:
        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(run_ai_crew(profile_dict, memory_dict))
        loop.close()

        db = SessionLocal()
        try:
            suggestion = AISuggestion(
                user_id=user_id,
                suggestion_type="both",
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


@router.post("/generate")
def generate_ai_plan(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=400, detail="נא להשלים את הפרופיל תחילה")

    memory_row = db.query(UserMemory).filter(UserMemory.user_id == current_user.id).first()
    memory = memory_row.memory_data if memory_row else {}

    task_id = str(uuid.uuid4())
    task_store[task_id] = {"status": "pending", "progress": "מתחיל..."}

    profile_dict = {
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

    from app.core.config import settings
    background_tasks.add_task(
        run_crew_sync, task_id, profile_dict, memory, str(current_user.id), settings.DATABASE_URL
    )

    return {"task_id": task_id, "status": "pending"}


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
        AISuggestion.id == suggestion_id,
        AISuggestion.user_id == current_user.id
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    suggestion.status = "approved"

    content = suggestion.content

    if "meal_plan" in content:
        db.query(NutritionPlan).filter(
            NutritionPlan.user_id == current_user.id
        ).update({"is_active": False})

        plan = NutritionPlan(
            user_id=current_user.id,
            plan_data=content,
            is_active=True,
        )
        db.add(plan)

    if "workout_plan" in content:
        db.query(WorkoutPlan).filter(
            WorkoutPlan.user_id == current_user.id
        ).update({"is_active": False})

        plan = WorkoutPlan(
            user_id=current_user.id,
            plan_data=content,
            is_active=True,
        )
        db.add(plan)

    db.commit()
    return {"status": "approved", "message": "התכנית אושרה ונשמרה"}


@router.post("/reject/{suggestion_id}")
def reject_suggestion(
    suggestion_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    suggestion = db.query(AISuggestion).filter(
        AISuggestion.id == suggestion_id,
        AISuggestion.user_id == current_user.id
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
        AISuggestion.status == "pending"
    ).order_by(AISuggestion.created_at.desc()).all()
    return suggestions
