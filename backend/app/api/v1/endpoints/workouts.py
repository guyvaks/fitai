from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.models.fitness import (
    WorkoutPlan, WorkoutExercise, WorkoutSession, ExerciseLog,
    ExerciseMemory, PersonalRecord
)
from pydantic import BaseModel
from typing import Optional, List
import datetime

router = APIRouter()

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

# --- Workout Plan endpoints ---

@router.get("/plan")
def get_workout_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = db.query(WorkoutPlan).filter(
        WorkoutPlan.user_id == current_user.id,
        WorkoutPlan.is_active == True
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="No active workout plan found")
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
        WorkoutPlan.is_active == True
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
        WorkoutSession.id == session_id,
        WorkoutSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update completed sets
    completed = dict(session.completed_sets or {})
    key = f"{data.exercise_index}_{data.set_index}"
    completed[key] = {"weight_kg": data.weight_kg, "reps": data.reps, "completed": True}
    session.completed_sets = completed
    session.current_exercise_index = data.exercise_index
    session.current_set_index = data.set_index + 1

    # Log exercise
    log = ExerciseLog(
        session_id=session_id,
        user_id=str(current_user.id),
        exercise_name=f"exercise_{data.exercise_index}",
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
        ExerciseMemory.exercise_name == f"exercise_{data.exercise_index}"
    ).first()
    if memory:
        memory.last_weight_kg = data.weight_kg
        memory.last_reps = data.reps
        memory.last_used_at = datetime.datetime.now(datetime.timezone.utc)
    else:
        memory = ExerciseMemory(
            user_id=current_user.id,
            exercise_name=f"exercise_{data.exercise_index}",
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
        WorkoutSession.id == session_id,
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
        WorkoutSession.id == session_id,
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
