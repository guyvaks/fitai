from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User, UserProfile
from app.models.fitness import (
    WorkoutPlan, WorkoutSession, ExerciseLog,
    ExerciseMemory, PersonalRecord, ExerciseMaster
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
    set_type: str = "normal"
    rir: Optional[int] = None

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
        # Always record the day, even with zero exercises -- an explicitly
        # empty day (a real rest day, or one the user cleared) must override
        # any stale content for that day rather than silently falling
        # through to it (see the full-week replace below).
        plan_data[day] = {"exercises": day_exercises}

    if not has_exercises:
        raise HTTPException(status_code=400, detail="לא נוספו תרגילים לתוכנית")

    existing = db.query(WorkoutPlan).filter(
        WorkoutPlan.user_id == current_user.id,
        WorkoutPlan.is_active.is_(True)
    ).first()

    if existing:
        if set(payload.week.keys()) == VALID_DAYS:
            # The only real caller today (ManualWorkoutBuilder.jsx) always
            # submits all 7 days -- that represents the complete intended
            # plan, so replace plan_data outright instead of merging.
            # Otherwise, an AI-approved plan opened for editing would keep
            # its stale "workout_plan" wrapper key sitting in the DB
            # forever after being "converted" to manual -- harmless under
            # the flat-first read fallback used elsewhere (LiveWorkout.jsx
            # etc.) for days that WERE resubmitted, but wrong for a day
            # that came back empty here (a rest day) with no flat key to
            # shadow it, which would silently keep reading the old AI
            # content instead of the now-empty rest day the user confirmed.
            existing.plan_data = plan_data
        else:
            # Partial update (fewer than all 7 days) -- preserve the
            # existing merge-only-what-was-sent behavior.
            prev = existing.plan_data or {}
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
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        # Postgres names the constraint in the message; SQLite instead names
        # the table+column. Check both so this works under either dialect.
        message = str(e.orig)
        if "ix_workout_sessions_one_active_per_user" not in message and (
            "workout_sessions.user_id" not in message
        ):
            raise
        # Lost the race to another concurrent request for this user — its
        # session is now the active one, so resume it instead of erroring.
        existing = db.query(WorkoutSession).filter(
            WorkoutSession.user_id == current_user.id,
            WorkoutSession.status == "active"
        ).first()
        return existing
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
    completed[key] = {"weight_kg": data.weight_kg, "reps": data.reps, "completed": True, "set_type": data.set_type, "rir": data.rir}
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
        set_type=data.set_type,
        rir=data.rir,
        completed=True,
        completed_at=datetime.datetime.now(datetime.timezone.utc)
    )
    db.add(log)

    # Update exercise memory -- skipped for failure sets, since a failed
    # attempt's weight/reps isn't a meaningful "previous" reference for next
    # time (typically lower than a real working set).
    if data.set_type != "failure":
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

@router.delete("/sessions/{session_id}/set-complete")
def uncomplete_set(
    session_id: str,
    exercise_index: int,
    set_index: int,
    exercise_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Undo a single set's completion -- the checkmark-toggle counterpart to
    PATCH .../set-complete. Clears the session's completed_sets entry and
    deletes the matching ExerciseLog row (so it doesn't linger as a phantom
    "previous session" reference). Does not touch ExerciseMemory -- if an
    earlier set in this same exercise is still completed, its memory update
    already reflects a real logged set; leaving a stale memory value after
    an undo is a minor, acceptable gap (the same memory row gets corrected
    on the next real completion regardless)."""
    session = db.query(WorkoutSession).filter(
        WorkoutSession.id == uuid.UUID(session_id),
        WorkoutSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    completed = dict(session.completed_sets or {})
    key = f"{exercise_index}_{set_index}"
    completed.pop(key, None)
    session.completed_sets = completed

    if exercise_name:
        db.query(ExerciseLog).filter(
            ExerciseLog.session_id == session.id,
            ExerciseLog.exercise_name == exercise_name,
            ExerciseLog.set_number == set_index + 1,
        ).delete()

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

@router.get("/exercise-history/{exercise_name}")
def get_exercise_history(
    exercise_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Per-set breakdown (not just a single aggregate like /exercise-memory)
    of the most recent *other* session that logged this exercise -- powers
    the set-logging table's PREVIOUS column, e.g. set 2 shows what set 2
    was last time, not a single repeated value across every row. Only
    "completed" sessions qualify -- an abandoned session's sets are often
    untouched draft defaults (e.g. 0kg, saved because it was the very first
    time this exercise was ever logged and there was no prior weight to
    default to) rather than a real performance, so surfacing them as
    "previous" would be misleading."""
    last_session_id = (
        db.query(ExerciseLog.session_id)
        .join(WorkoutSession, WorkoutSession.id == ExerciseLog.session_id)
        .filter(
            ExerciseLog.user_id == current_user.id,
            ExerciseLog.exercise_name == exercise_name,
            ExerciseLog.completed.is_(True),
            WorkoutSession.status == "completed",
        )
        .order_by(WorkoutSession.started_at.desc())
        .limit(1)
        .scalar()
    )
    if not last_session_id:
        return {"sets": []}

    logs = (
        db.query(ExerciseLog)
        .filter(
            ExerciseLog.session_id == last_session_id,
            ExerciseLog.exercise_name == exercise_name,
            ExerciseLog.completed.is_(True),
        )
        .order_by(ExerciseLog.set_number.asc())
        .all()
    )
    return {
        "sets": [
            {"set_number": log.set_number, "weight_kg": log.weight_kg, "reps": log.reps, "rir": log.rir}
            for log in logs
        ]
    }

@router.get("/exercise-stats/{exercise_name}")
def get_exercise_stats(
    exercise_name: str,
    range: str = "3m",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Powers the per-exercise History tab: weight PR, volume PR, and a
    weight-over-time graph. Deliberately computed live from ExerciseLog
    rather than the PersonalRecord table -- PersonalRecord is read in
    several places (personal-records, reports) but nothing anywhere ever
    writes to it, so it's empty in practice. Both PRs here are exact,
    query-derived facts, not dependent on that unpopulated table."""
    days = 365 if range == "1y" else 90
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)

    base_filter = [
        ExerciseLog.user_id == current_user.id,
        ExerciseLog.exercise_name == exercise_name,
        ExerciseLog.completed.is_(True),
    ]

    # Weight PR: the single heaviest completed set ever logged for this exercise.
    weight_pr_log = (
        db.query(ExerciseLog)
        .filter(*base_filter)
        .order_by(ExerciseLog.weight_kg.desc())
        .first()
    )
    weight_pr = (
        {"weight_kg": weight_pr_log.weight_kg, "reps": weight_pr_log.reps, "achieved_at": weight_pr_log.completed_at}
        if weight_pr_log else None
    )

    # Volume PR: the single session with the highest total (weight*reps) for this exercise.
    volume_row = (
        db.query(
            ExerciseLog.session_id,
            func.sum(ExerciseLog.weight_kg * ExerciseLog.reps).label("volume_kg"),
            func.max(ExerciseLog.completed_at).label("achieved_at"),
        )
        .filter(*base_filter)
        .group_by(ExerciseLog.session_id)
        .order_by(func.sum(ExerciseLog.weight_kg * ExerciseLog.reps).desc())
        .first()
    )
    volume_pr = (
        {"volume_kg": round(float(volume_row.volume_kg or 0), 1), "achieved_at": volume_row.achieved_at}
        if volume_row else None
    )

    # Graph: best (max) weight logged per day, within the requested range.
    day = func.date(ExerciseLog.completed_at)
    graph_rows = (
        db.query(day.label("day"), func.max(ExerciseLog.weight_kg).label("weight_kg"))
        .filter(*base_filter, ExerciseLog.completed_at >= cutoff)
        .group_by(day)
        .order_by(day.asc())
        .all()
    )
    graph = [
        {"date": r.day if isinstance(r.day, str) else r.day.isoformat(), "weight_kg": r.weight_kg}
        for r in graph_rows
    ]

    # Weekly log: every completed session touching this exercise within
    # range, grouped by ISO week -- done in Python (not a DB date_trunc) to
    # stay portable between Postgres (prod) and SQLite (test suite).
    session_rows = (
        db.query(
            ExerciseLog.session_id,
            func.max(ExerciseLog.completed_at).label("date"),
            func.count(ExerciseLog.id).label("sets_completed"),
            func.sum(ExerciseLog.weight_kg * ExerciseLog.reps).label("volume_kg"),
        )
        .filter(*base_filter, ExerciseLog.completed_at >= cutoff)
        .group_by(ExerciseLog.session_id)
        .order_by(func.max(ExerciseLog.completed_at).desc())
        .all()
    )
    weeks = {}
    for r in session_rows:
        if not r.date:
            continue
        iso_year, iso_week, _ = r.date.isocalendar()
        week_key = f"{iso_year}-W{iso_week:02d}"
        week_start = (r.date - datetime.timedelta(days=r.date.isoweekday() - 1)).date().isoformat()
        weeks.setdefault(week_key, {"week_start": week_start, "sessions": []})
        weeks[week_key]["sessions"].append({
            "date": r.date.isoformat(),
            "sets_completed": r.sets_completed,
            "volume_kg": round(float(r.volume_kg or 0), 1),
        })
    weekly_log = [weeks[k] for k in sorted(weeks.keys(), reverse=True)]

    return {
        "weight_pr": weight_pr,
        "volume_pr": volume_pr,
        "graph": graph,
        "weekly_log": weekly_log,
    }

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


# Single MET constant for resistance-training sessions -- not a per-exercise
# table, just a reasonable moderate-to-vigorous estimate (typical range 3.5-6)
# since there's no heart-rate/device data to base a real one on.
_RESISTANCE_TRAINING_MET = 5.0


def _session_duration_seconds(session: WorkoutSession) -> Optional[int]:
    if session.started_at and session.completed_at:
        return int((session.completed_at - session.started_at).total_seconds())
    return None


def _estimate_calories(weight_kg: Optional[float], duration_seconds: Optional[int]) -> Optional[float]:
    """kcal ≈ (MET × 3.5 × weight_kg / 200) kcal/min × duration in minutes.
    Returns None (never a guessed number) if either input is missing."""
    if not weight_kg or not duration_seconds:
        return None
    kcal_per_minute = (_RESISTANCE_TRAINING_MET * 3.5 * weight_kg) / 200
    return round(kcal_per_minute * (duration_seconds / 60))


def _exercise_name_to_muscle_group(db: Session) -> dict:
    """Lowercased exercise name/alias -> muscle_group_primary, for every
    active canonical exercise. Names not found here (e.g. free-text
    exercises added via LiveWorkout's "add exercise" flow) fall back to
    'אחר' at the call site rather than being dropped."""
    lookup = {}
    exercises = db.query(ExerciseMaster).filter(ExerciseMaster.is_active.is_(True)).all()
    for ex in exercises:
        muscle = ex.muscle_group_primary or "אחר"
        for name in (ex.canonical_name_he, ex.canonical_name_en, *(ex.aliases or [])):
            if name:
                lookup[str(name).strip().lower()] = muscle
    return lookup


@router.get("/sessions/history")
def get_sessions_history(
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    sessions = (
        db.query(WorkoutSession)
        .filter(WorkoutSession.user_id == current_user.id, WorkoutSession.status == "completed")
        .order_by(WorkoutSession.completed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    agg_by_session = {}
    session_ids = [s.id for s in sessions]
    if session_ids:
        rows = (
            db.query(
                ExerciseLog.session_id,
                func.sum(ExerciseLog.weight_kg * ExerciseLog.reps).label("volume_kg"),
                func.count(ExerciseLog.id).label("total_sets"),
            )
            .filter(ExerciseLog.session_id.in_(session_ids), ExerciseLog.completed.is_(True))
            .group_by(ExerciseLog.session_id)
            .all()
        )
        agg_by_session = {r.session_id: r for r in rows}

    result = []
    for session in sessions:
        agg = agg_by_session.get(session.id)
        result.append({
            "id": str(session.id),
            "started_at": session.started_at,
            "completed_at": session.completed_at,
            "duration_seconds": _session_duration_seconds(session),
            "total_volume_kg": round(float(agg.volume_kg or 0), 1) if agg else 0,
            "total_sets": int(agg.total_sets) if agg else 0,
        })
    return result


@router.get("/sessions/{session_id}/detail")
def get_session_detail(
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

    logs = db.query(ExerciseLog).filter(
        ExerciseLog.session_id == session.id,
        ExerciseLog.completed.is_(True),
    ).all()

    total_volume_kg = sum((log.weight_kg or 0) * (log.reps or 0) for log in logs)
    total_sets = len(logs)
    duration_seconds = _session_duration_seconds(session)

    muscle_counts = {}
    if logs:
        name_to_muscle = _exercise_name_to_muscle_group(db)
        for log in logs:
            muscle = name_to_muscle.get((log.exercise_name or "").strip().lower(), "אחר")
            muscle_counts[muscle] = muscle_counts.get(muscle, 0) + 1

    muscle_split = [
        {"muscle_group": muscle, "percentage": round(count / total_sets * 100, 1)}
        for muscle, count in sorted(muscle_counts.items(), key=lambda kv: -kv[1])
    ] if total_sets else []

    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    weight_kg = profile.weight_kg if profile else None

    return {
        "id": str(session.id),
        "started_at": session.started_at,
        "completed_at": session.completed_at,
        "duration_seconds": duration_seconds,
        "total_volume_kg": round(total_volume_kg, 1),
        "total_sets": total_sets,
        "estimated_calories": _estimate_calories(weight_kg, duration_seconds),
        "muscle_split": muscle_split,
    }


# --- Weekly / monthly workout reports ---

def _week_start(d: datetime.date) -> datetime.date:
    """Sunday of the week containing d (Sunday-Saturday weeks, matching the
    day-of-week convention already used across the plan/day endpoints)."""
    days_since_sunday = (d.weekday() + 1) % 7  # Python weekday(): Mon=0..Sun=6
    return d - datetime.timedelta(days=days_since_sunday)


def _last_closed_week() -> tuple:
    """The most recently completed Sunday-Saturday week (not the current,
    still-in-progress one)."""
    this_week_start = _week_start(datetime.date.today())
    start = this_week_start - datetime.timedelta(days=7)
    end = this_week_start - datetime.timedelta(days=1)
    return start, end


def _last_closed_month() -> tuple:
    """The most recently completed calendar month."""
    first_of_this_month = datetime.date.today().replace(day=1)
    end = first_of_this_month - datetime.timedelta(days=1)
    start = end.replace(day=1)
    return start, end


def _period_stats(db: Session, user_id, start_date: datetime.date, end_date: datetime.date) -> dict:
    start_dt = datetime.datetime.combine(start_date, datetime.time.min, tzinfo=datetime.timezone.utc)
    end_dt = datetime.datetime.combine(end_date, datetime.time.max, tzinfo=datetime.timezone.utc)

    sessions = db.query(WorkoutSession).filter(
        WorkoutSession.user_id == user_id,
        WorkoutSession.status == "completed",
        WorkoutSession.completed_at >= start_dt,
        WorkoutSession.completed_at <= end_dt,
    ).all()

    total_duration_seconds = sum(_session_duration_seconds(s) or 0 for s in sessions)

    total_volume_kg = 0.0
    session_ids = [s.id for s in sessions]
    if session_ids:
        total_volume_kg = db.query(
            func.coalesce(func.sum(ExerciseLog.weight_kg * ExerciseLog.reps), 0.0)
        ).filter(
            ExerciseLog.session_id.in_(session_ids),
            ExerciseLog.completed.is_(True),
        ).scalar() or 0.0

    prs = db.query(PersonalRecord).filter(
        PersonalRecord.user_id == user_id,
        PersonalRecord.achieved_at >= start_dt,
        PersonalRecord.achieved_at <= end_dt,
    ).order_by(PersonalRecord.achieved_at.desc()).all()

    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    weight_kg = profile.weight_kg if profile else None

    return {
        "sessions_completed": len(sessions),
        "total_duration_seconds": total_duration_seconds,
        "total_volume_kg": round(total_volume_kg, 1),
        "estimated_calories": _estimate_calories(weight_kg, total_duration_seconds),
        "personal_records": [
            {
                "exercise_name": pr.exercise_name,
                "record_weight_kg": pr.record_weight_kg,
                "record_reps": pr.record_reps,
                "achieved_at": pr.achieved_at,
            }
            for pr in prs
        ],
    }


@router.get("/frequency-history")
def get_frequency_history(
    weeks: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sessions-completed-per-week series, most recent `weeks` weeks including
    the current (still in-progress) one -- reuses _period_stats() per week
    rather than a dedicated aggregate query, since this is a page-load-only
    call, not a hot path."""
    weeks = min(max(weeks, 1), 52)
    current_week_start = _week_start(datetime.date.today())
    result = []
    for i in range(weeks - 1, -1, -1):
        week_start = current_week_start - datetime.timedelta(days=7 * i)
        week_end = week_start + datetime.timedelta(days=6)
        stats = _period_stats(db, current_user.id, week_start, week_end)
        result.append({
            "week_start": week_start.isoformat(),
            "sessions_completed": stats["sessions_completed"],
        })
    return result


@router.get("/reports/pending")
def get_pending_reports(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Weekly/monthly report(s) for the most recently closed period(s), if not
    already marked seen. Both can come back at once (e.g. first login of a
    new month). A period with zero completed sessions is skipped -- an empty
    report isn't worth surfacing."""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    reports = []

    week_start, week_end = _last_closed_week()
    if not profile or profile.last_weekly_report_seen != week_start:
        stats = _period_stats(db, current_user.id, week_start, week_end)
        if stats["sessions_completed"] > 0:
            reports.append({"period": "weekly", "period_start": week_start, "period_end": week_end, **stats})

    month_start, month_end = _last_closed_month()
    if not profile or profile.last_monthly_report_seen != month_start:
        stats = _period_stats(db, current_user.id, month_start, month_end)
        if stats["sessions_completed"] > 0:
            reports.append({"period": "monthly", "period_start": month_start, "period_end": month_end, **stats})

    return reports


class ReportDismiss(BaseModel):
    period: str  # "weekly" | "monthly"
    period_start: datetime.date


@router.post("/reports/dismiss")
def dismiss_report(payload: ReportDismiss, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # A user can complete workouts and dismiss a report before ever filling
    # out the profile onboarding form -- UserProfile rows are created lazily
    # everywhere else in this app (see PUT /profile), so this must too rather
    # than 404ing on a legitimate case.
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(id=uuid.uuid4(), user_id=current_user.id)
        db.add(profile)
    if payload.period == "weekly":
        profile.last_weekly_report_seen = payload.period_start
    elif payload.period == "monthly":
        profile.last_monthly_report_seen = payload.period_start
    else:
        raise HTTPException(status_code=400, detail="Invalid period")
    db.commit()
    return {"status": "ok"}
