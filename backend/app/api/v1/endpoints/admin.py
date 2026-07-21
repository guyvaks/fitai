import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
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
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), current_admin: User = Depends(require_admin)):
    if str(current_admin.id) == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # No ON DELETE CASCADE is configured on these FKs at the DB level, so
    # dependent rows must be removed explicitly (children before parents)
    # or db.delete(user) raises an IntegrityError that FastAPI turns into
    # an unhandled 500.
    workout_plan_ids = db.query(WorkoutPlan.id).filter(WorkoutPlan.user_id == user_id)
    nutrition_plan_ids = db.query(NutritionPlan.id).filter(NutritionPlan.user_id == user_id)
    session_ids = db.query(WorkoutSession.id).filter(WorkoutSession.user_id == user_id)

    db.query(Meal).filter(Meal.nutrition_plan_id.in_(nutrition_plan_ids)).delete(synchronize_session=False)
    db.query(WorkoutExercise).filter(WorkoutExercise.workout_plan_id.in_(workout_plan_ids)).delete(synchronize_session=False)
    db.query(ExerciseLog).filter(ExerciseLog.session_id.in_(session_ids)).delete(synchronize_session=False)

    for model in (
        WorkoutSession, NutritionPlan, WorkoutPlan, FoodLog, AISuggestion,
        SmartProgression, UserMemory, ExerciseMemory, FoodMemory,
        PersonalRecord, EnduranceLog, StrengthLog, HydrationLog, WeightLog,
        UserProfile,
    ):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    return {"ok": True}


@router.patch("/users/{user_id}/toggle-admin")
def toggle_admin(user_id: str, db: Session = Depends(get_db), current_admin: User = Depends(require_admin)):
    if str(current_admin.id) == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own admin status")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_admin = not user.is_admin
    db.commit()
    return {"id": str(user.id), "is_admin": user.is_admin}


@router.patch("/users/{user_id}/reset-password")
def reset_password(user_id: str, body: ResetPasswordRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
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
    foods = (
        db.query(FoodMaster)
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
        }
        for f in foods
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
