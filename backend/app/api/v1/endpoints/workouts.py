from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.fitness import (
    WorkoutPlan, WorkoutSession, ExerciseLog,
    ExerciseMemory, PersonalRecord
)
from pydantic import BaseModel, Field
from typing import Optional, List
import datetime
import uuid

router = APIRouter()

VALID_DAYS = {"sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"}

# --- Schemas (inline for simplicity) ---

class ExerciseUpdate(BaseModel):
    name: str
    muscle_group: str
    sets: int
    reps: int
    weight_kg: float
    rest_seconds: int = 90
    notes: Optional[str] = None
    order_index: int = 0

class SessionSetComplete(BaseModel):
    exercise_index: int
    set_index: int
    weight_kg: float
    reps: int
    exercise_name: Optional[str] = None

class ManualWorkoutSet(BaseModel):
    weight_kg: float = Field(0, ge=0)
    reps: int = Field(..., ge=1)

class ManualWorkoutExercise(BaseModel):
    name: str
    muscle_group: str = ""
    notes: Optional[str] = None
    sets: List[ManualWorkoutSet]

class ManualWorkoutPlanCreate(BaseModel):
    # keyed by day_of_week (sunday..saturday) -> list of exercises for that day
    week: dict[str, List[ManualWorkoutExercise]]

# --- Workout Plan endpoints ---

@router.get("/plan")
def get_workout_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(WorkoutPlan).filter(
        WorkoutPlan.user_id == current_user.id,
        WorkoutPlan.is_active.is_(True)
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="No active workout plan found")
    return plan

@router.post("/plan/manual")
def create_manual_workout_plan(
    payload: ManualWorkoutPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    unknown_days = set(payload.week.keys()) - VALID_DAYS
    if unknown_days:
        raise HTTPException(status_code=400, detail=f"ימים לא תקינים: {', '.join(unknown_days)}")

    plan_data = {}
    has_exercises = False

    for day, exercises in payload.week.items():
        day_exercises = []
        for ex in exercises:
            if not ex.sets:
                continue
            has_exercises = True
            day_exercises.append({
                "name": ex.name,
                "muscle_group": ex.muscle_group,
                "notes": ex.notes,
                "sets": [s.model_dump() for s in ex.sets],
            })
        if day_exercises:
            plan_data[day] = {"exercises": day_exercises}

    if not has_exercises:
        raise HTTPException(status_code=400, detail="לא נוספו תרגילים לתוכנית")

    existing = db.query(WorkoutPlan).filter(
        WorkoutPlan.user_id == current_user.id,
        WorkoutPlan.is_active.is_(True)
    ).first()

    if existing:
        # Merge into the existing active plan: days that were sent are added/replaced,
        # days that were not sent stay untouched.
        prev = existing.plan_data or {}
        # Reassign a new dict so SQLAlchemy tracks the JSON column as dirty.
        existing.plan_data = {**prev, **plan_data}
        plan = existing
    else:
        plan = WorkoutPlan(user_id=current_user.id, plan_data=plan_data, is_active=True)
        db.add(plan)

    db.commit()
    db.refresh(plan)
    return plan

# --- Session endpoints ---

@router.post("/sessions/start")
def start_session(
    day_of_week: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check for existing active session
    existing = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == current_user.id,
        WorkoutSession.status == "active"
    ).first()
    if existing:
        return existing  # Resume existing session

    plan = db.query(WorkoutPlan).filter(
        WorkoutPlan.user_id == current_user.id,
        WorkoutPlan.is_active.is_(True)
    ).first()

    session = WorkoutSession(
        user_id=current_user.id,
        workout_plan_id=plan.id if plan else None,
        started_at=datetime.datetime.now(datetime.timezone.utc),
        current_exercise_index=0,
        current_set_index=0,
        completed_sets={},
        status="active"
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.get("/sessions/active")
def get_active_session(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    session = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == current_user.id,
        WorkoutSession.status == "active"
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="No active session")
    return session

@router.patch("/sessions/{session_id}/set-complete")
def complete_set(
    session_id: str,
    data: SessionSetComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == uuid.UUID(session_id),
        WorkoutSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Prefer the real exercise name (sent from the client, which already knows
    # it); fall back to the old synthetic placeholder only if it's missing so
    # older frontend builds don't break.
    exercise_name = data.exercise_name or f"exercise_{data.exercise_index}"

    # Update completed sets
    completed = dict(session.completed_sets or {})
    key = f"{data.exercise_index}_{data.set_index}"
    completed[key] = {"weight_kg": data.weight_kg, "reps": data.reps, "completed": True}
    session.completed_sets = completed
    session.current_exercise_index = data.exercise_index
    session.current_set_index = data.set_index + 1

    # Log exercise
    log = ExerciseLog(
        session_id=session.id,
        user_id=current_user.id,
        exercise_name=exercise_name,
        set_number=data.set_index + 1,
        weight_kg=data.weight_kg,
        reps=data.reps,
        completed=True,
        completed_at=datetime.datetime.now(datetime.timezone.utc)
    )
    db.add(log)

    # Update exercise memory
    memory = db.query(ExerciseMemory).filter(
        ExerciseMemory.user_id == current_user.id,
        ExerciseMemory.exercise_name == exercise_name
    ).first()
    if memory:
        memory.last_weight_kg = data.weight_kg
        memory.last_reps = data.reps
        memory.last_used_at = datetime.datetime.now(datetime.timezone.utc)
    else:
        memory = ExerciseMemory(
            user_id=current_user.id,
            exercise_name=exercise_name,
            last_weight_kg=data.weight_kg,
            last_reps=data.reps,
            last_used_at=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(memory)

    db.commit()
    db.refresh(session)
    return session

@router.post("/sessions/{session_id}/complete")
def complete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == uuid.UUID(session_id),
        WorkoutSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "completed"
    session.completed_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    return {"status": "completed", "message": "אימון הושלם בהצלחה! 💪"}

@router.delete("/sessions/{session_id}")
def abandon_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == uuid.UUID(session_id),
        WorkoutSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "abandoned"
    db.commit()
    return {"status": "abandoned"}

@router.get("/exercise-memory/{exercise_name}")
def get_exercise_memory(
    exercise_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    memory = db.query(ExerciseMemory).filter(
        ExerciseMemory.user_id == current_user.id,
        ExerciseMemory.exercise_name == exercise_name
    ).first()
    return memory

@router.get("/personal-records")
def get_personal_records(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    records = db.query(PersonalRecord).filter(
        PersonalRecord.user_id == current_user.id
    ).order_by(PersonalRecord.achieved_at.desc()).all()
    return records


@router.get("/volume-history")
def get_volume_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Daily training volume (SUM of weight_kg * reps) from completed sets, ascending by date."""
    day = func.date(ExerciseLog.completed_at)
    rows = (
        db.query(
            day.label("day"),
            func.sum(ExerciseLog.weight_kg * ExerciseLog.reps).label("volume_kg"),
        )
        .filter(
            ExerciseLog.user_id == current_user.id,
            ExerciseLog.completed.is_(True),
            ExerciseLog.completed_at.isnot(None),
        )
        .group_by(day)
        .order_by(day.asc())
        .all()
    )
    return [
        {
            "date": r.day if isinstance(r.day, str) else r.day.isoformat(),
            "volume_kg": round(float(r.volume_kg or 0), 1),
        }
        for r in rows
    ]
