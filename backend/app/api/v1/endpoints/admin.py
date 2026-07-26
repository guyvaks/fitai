import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import get_password_hash
from app.models.user import User, UserProfile
from app.models.fitness import (
    NutritionPlan, Meal, FoodLog, WorkoutPlan, WorkoutExercise,
    WorkoutSession, ExerciseLog, AISuggestion, SmartProgression,
    UserMemory, ExerciseMemory, FoodMemory, PersonalRecord,
    EnduranceLog, StrengthLog, HydrationLog, WeightLog, ExerciseMaster,
    FoodMaster,
)


class ResetPasswordRequest(BaseModel):
    new_password: str


class DailyAiLimitRequest(BaseModel):
    # None (or omitting the field entirely, since it has a default) means
    # "unlimited" -- the same meaning as the column's own NULL. Reject
    # negative numbers; 0 is allowed (a legitimate, if unusual, "fully
    # blocked but still access-approved" state).
    daily_limit: Optional[int] = Field(default=None, ge=0)


class BulkFoodIdsRequest(BaseModel):
    ids: List[str]

router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "is_admin": u.is_admin,
            "ai_access_approved": u.ai_access_approved,
            "daily_ai_generation_limit": u.daily_ai_generation_limit,
            "created_at": u.created_at,
        }
        for u in users
    ]


def _parse_user_id_or_404(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), current_admin: User = Depends(require_admin)):
    if str(current_admin.id) == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    parsed_id = _parse_user_id_or_404(user_id)
    user = db.query(User).filter(User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # No ON DELETE CASCADE is configured on these FKs at the DB level, so
    # dependent rows must be removed explicitly (children before parents)
    # or db.delete(user) raises an IntegrityError that FastAPI turns into
    # an unhandled 500.
    workout_plan_ids = db.query(WorkoutPlan.id).filter(WorkoutPlan.user_id == parsed_id)
    nutrition_plan_ids = db.query(NutritionPlan.id).filter(NutritionPlan.user_id == parsed_id)
    session_ids = db.query(WorkoutSession.id).filter(WorkoutSession.user_id == parsed_id)

    db.query(Meal).filter(Meal.nutrition_plan_id.in_(nutrition_plan_ids)).delete(synchronize_session=False)
    db.query(WorkoutExercise).filter(WorkoutExercise.workout_plan_id.in_(workout_plan_ids)).delete(synchronize_session=False)
    db.query(ExerciseLog).filter(ExerciseLog.session_id.in_(session_ids)).delete(synchronize_session=False)

    for model in (
        WorkoutSession, NutritionPlan, WorkoutPlan, FoodLog, AISuggestion,
        SmartProgression, UserMemory, ExerciseMemory, FoodMemory,
        PersonalRecord, EnduranceLog, StrengthLog, HydrationLog, WeightLog,
        UserProfile,
    ):
        db.query(model).filter(model.user_id == parsed_id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    return {"ok": True}


@router.patch("/users/{user_id}/toggle-ai-access")
def toggle_ai_access(user_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    parsed_id = _parse_user_id_or_404(user_id)
    user = db.query(User).filter(User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.ai_access_approved = not user.ai_access_approved
    db.commit()
    return {"id": str(user.id), "ai_access_approved": user.ai_access_approved}


@router.patch("/users/{user_id}/daily-ai-limit")
def set_daily_ai_limit(
    user_id: str,
    body: DailyAiLimitRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    parsed_id = _parse_user_id_or_404(user_id)
    user = db.query(User).filter(User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.daily_ai_generation_limit = body.daily_limit
    db.commit()
    return {"id": str(user.id), "daily_ai_generation_limit": user.daily_ai_generation_limit}


@router.patch("/users/{user_id}/reset-password")
@limiter.limit("20/hour")
def reset_password(request: Request, user_id: str, body: ResetPasswordRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    parsed_id = _parse_user_id_or_404(user_id)
    user = db.query(User).filter(User.id == parsed_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": "סיסמה עודכנה בהצלחה"}


@router.get("/exercises/pending")
def list_pending_exercises(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    exercises = (
        db.query(ExerciseMaster)
        .filter(ExerciseMaster.is_active.is_(False))
        .order_by(ExerciseMaster.canonical_name_he)
        .all()
    )
    return [
        {
            "id": str(e.id),
            "canonical_name_he": e.canonical_name_he,
            "canonical_name_en": e.canonical_name_en,
            "category": e.category,
            "muscle_group_primary": e.muscle_group_primary,
            "equipment": e.equipment,
        }
        for e in exercises
    ]


@router.post("/exercises/{exercise_id}/approve")
def approve_exercise(exercise_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    exercise = db.query(ExerciseMaster).filter(ExerciseMaster.id == uuid.UUID(exercise_id)).first()
    if not exercise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    exercise.is_active = True
    db.commit()
    return {"id": str(exercise.id), "is_active": exercise.is_active}


@router.delete("/exercises/{exercise_id}/reject")
def reject_exercise(exercise_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    exercise = db.query(ExerciseMaster).filter(ExerciseMaster.id == uuid.UUID(exercise_id)).first()
    if not exercise:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    db.delete(exercise)
    db.commit()
    return {"ok": True}


@router.get("/food-master/pending")
def list_pending_foods(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = (
        db.query(FoodMaster, User.email)
        .outerjoin(User, FoodMaster.created_by_user_id == User.id)
        .filter(FoodMaster.is_active.is_(False))
        .order_by(FoodMaster.canonical_name_he)
        .all()
    )
    return [
        {
            "id": str(f.id),
            "canonical_name_he": f.canonical_name_he,
            "canonical_name_en": f.canonical_name_en,
            "category": f.category,
            "calories_per_100g": f.calories_per_100g,
            "protein_per_100g": f.protein_per_100g,
            "carbs_per_100g": f.carbs_per_100g,
            "fat_per_100g": f.fat_per_100g,
            "fiber_per_100g": f.fiber_per_100g,
            "created_by_user_id": str(f.created_by_user_id) if f.created_by_user_id else None,
            "created_by_email": email,
        }
        for f, email in rows
    ]


@router.post("/food-master/{food_id}/approve")
def approve_food(food_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    food = db.query(FoodMaster).filter(FoodMaster.id == uuid.UUID(food_id)).first()
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    food.is_active = True
    db.commit()
    return {"id": str(food.id), "is_active": food.is_active}


@router.delete("/food-master/{food_id}/reject")
def reject_food(food_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    food = db.query(FoodMaster).filter(FoodMaster.id == uuid.UUID(food_id)).first()
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food not found")
    db.delete(food)
    db.commit()
    return {"ok": True}


def _parse_valid_uuids(ids: List[str]) -> List[uuid.UUID]:
    valid = []
    for raw_id in ids:
        try:
            valid.append(uuid.UUID(raw_id))
        except ValueError:
            continue
    return valid


@router.post("/food-master/bulk-approve")
def bulk_approve_foods(payload: BulkFoodIdsRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    valid_ids = _parse_valid_uuids(payload.ids)
    if not valid_ids:
        return {"updated_ids": []}

    matched = db.query(FoodMaster.id).filter(FoodMaster.id.in_(valid_ids)).all()
    updated_ids = [str(row[0]) for row in matched]

    db.query(FoodMaster).filter(FoodMaster.id.in_(valid_ids)).update(
        {"is_active": True}, synchronize_session=False
    )
    db.commit()
    return {"updated_ids": updated_ids}


@router.delete("/food-master/bulk-reject")
def bulk_reject_foods(payload: BulkFoodIdsRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    valid_ids = _parse_valid_uuids(payload.ids)
    if not valid_ids:
        return {"deleted_ids": []}

    matched = db.query(FoodMaster.id).filter(FoodMaster.id.in_(valid_ids)).all()
    deleted_ids = [str(row[0]) for row in matched]

    db.query(FoodMaster).filter(FoodMaster.id.in_(valid_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted_ids": deleted_ids}
