from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.fitness import NutritionPlan, Meal, FoodLog
from app.schemas.nutrition import (
    NutritionPlanResponse, FoodLogCreate, FoodLogResponse
)
import datetime

router = APIRouter()


@router.get("/plan")
def get_nutrition_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(NutritionPlan).filter(
        NutritionPlan.user_id == current_user.id,
        NutritionPlan.is_active == True
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="No active nutrition plan found")
    return plan


@router.post("/food-log")
def log_food(
    entry: FoodLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = FoodLog(
        user_id=current_user.id,
        date=entry.date or datetime.date.today(),
        meal_type=entry.meal_type,
        food_name=entry.food_name,
        quantity_g=entry.quantity_g,
        calories=entry.calories,
        protein=entry.protein,
        carbs=entry.carbs,
        fat=entry.fat,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/food-log/{date}")
def get_food_log(
    date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import datetime as dt
    log_date = dt.date.fromisoformat(date)
    logs = db.query(FoodLog).filter(
        FoodLog.user_id == current_user.id,
        FoodLog.date == log_date
    ).all()
    return logs


@router.delete("/food-log/entry/{log_id}")
def delete_food_log(
    log_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import uuid
    log = db.query(FoodLog).filter(
        FoodLog.id == uuid.UUID(log_id),
        FoodLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.delete(log)
    db.commit()
    return {"status": "deleted"}
