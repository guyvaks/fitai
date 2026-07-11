from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.fitness import NutritionPlan, Meal, FoodLog
from app.schemas.nutrition import (
    NutritionPlanResponse, FoodLogCreate, FoodLogResponse, ManualPlanCreate, CalorieCalcRequest
)
import datetime

router = APIRouter()

VALID_DAYS = {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}


@router.get("/plan")
def get_nutrition_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(NutritionPlan).filter(
        NutritionPlan.user_id == current_user.id,
        NutritionPlan.is_active == True
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="No active nutrition plan found")
    return plan


@router.post("/plan/manual")
def create_manual_plan(
    payload: ManualPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    unknown_days = set(payload.week.keys()) - VALID_DAYS
    if unknown_days:
        raise HTTPException(status_code=400, detail=f"ימים לא תקינים: {', '.join(unknown_days)}")

    meal_plan = {}
    daily_totals = {}
    has_items = False

    for day, meals in payload.week.items():
        day_meals = []
        totals = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0}
        for meal in meals:
            if not meal.items:
                continue
            has_items = True
            meal_totals = {
                "calories": sum(i.calories for i in meal.items),
                "protein": sum(i.protein for i in meal.items),
                "carbs": sum(i.carbs for i in meal.items),
                "fat": sum(i.fat for i in meal.items),
            }
            day_meals.append({
                "meal_type": meal.meal_type,
                "items": [i.model_dump() for i in meal.items],
                "total_calories": round(meal_totals["calories"], 1),
                "total_protein": round(meal_totals["protein"], 1),
                "total_carbs": round(meal_totals["carbs"], 1),
                "total_fat": round(meal_totals["fat"], 1),
            })
            for k in totals:
                totals[k] += meal_totals[k]
        if day_meals:
            meal_plan[day] = day_meals
            daily_totals[day] = {k: round(v, 1) for k, v in totals.items()}

    if not has_items:
        raise HTTPException(status_code=400, detail="לא נוספו פריטי מזון לתפריט")

    existing = db.query(NutritionPlan).filter(
        NutritionPlan.user_id == current_user.id,
        NutritionPlan.is_active == True
    ).first()

    if existing:
        # Merge into the existing active plan: days that were sent are added/replaced,
        # days that were not sent stay untouched.
        prev = existing.plan_data or {}
        merged_meal_plan = {**(prev.get("meal_plan") or {}), **meal_plan}
        merged_daily_totals = {**(prev.get("daily_totals") or {}), **daily_totals}
        # Reassign a new dict so SQLAlchemy tracks the JSON column as dirty.
        existing.plan_data = {"meal_plan": merged_meal_plan, "daily_totals": merged_daily_totals}
        plan = existing
    else:
        plan_data = {"meal_plan": meal_plan, "daily_totals": daily_totals}
        plan = NutritionPlan(user_id=current_user.id, plan_data=plan_data, is_active=True)
        db.add(plan)

    db.commit()
    db.refresh(plan)
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


@router.post("/calculate-calories")
def calculate_calories(
    payload: CalorieCalcRequest,
    current_user: User = Depends(get_current_user)
):
    from app.services.calorie_calculator import calculate_from_text, calculate_from_image

    if payload.type == "text":
        if not payload.query:
            raise HTTPException(status_code=400, detail="query is required for type=text")
        items = calculate_from_text(payload.query)
    elif payload.type == "image":
        if not payload.image_base64:
            raise HTTPException(status_code=400, detail="image_base64 is required for type=image")
        items = calculate_from_image(payload.image_base64, payload.image_media_type)
    else:
        raise HTTPException(status_code=400, detail="type must be 'text' or 'image'")

    return {"items": items}
