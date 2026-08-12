from typing import Optional

from sqlalchemy.orm import Session

from app.models.fitness import FoodLog


def get_avg_satiety_last_7_meals(db: Session, user_id) -> Optional[float]:
    """Average satiety_level over the user's last 7 logged meals (by
    created_at desc), skipping nulls. None if fewer than 3 non-null values
    exist among those 7 -- not enough signal for a meaningful average."""
    rows = (
        db.query(FoodLog.satiety_level)
        .filter(FoodLog.user_id == user_id)
        .order_by(FoodLog.created_at.desc())
        .limit(7)
        .all()
    )
    values = [r[0] for r in rows if r[0] is not None]
    if len(values) < 3:
        return None
    return round(sum(values) / len(values), 1)


def is_low_satiety(db: Session, user_id) -> bool:
    """True iff the user's last 3 meals with a non-null satiety_level (by
    created_at desc, nulls skipped entirely rather than counted as gaps) are
    ALL <= 2. False if fewer than 3 non-null values exist at all."""
    rows = (
        db.query(FoodLog.satiety_level)
        .filter(FoodLog.user_id == user_id, FoodLog.satiety_level.isnot(None))
        .order_by(FoodLog.created_at.desc())
        .limit(3)
        .all()
    )
    values = [r[0] for r in rows]
    if len(values) < 3:
        return False
    return all(v <= 2 for v in values)


def satiety_label(avg: float) -> str:
    """Hebrew label for the CrewAI prompt-hint sentence. Slightly more
    permissive than is_low_satiety's per-meal <=2 threshold (an average
    blends in better meals) but still resolves to "low" before drifting
    into "normal" territory."""
    if avg <= 2.5:
        return "נמוך"
    if avg < 4:
        return "רגיל"
    return "גבוה"


def build_satiety_hint(db: Session, user_id) -> Optional[str]:
    """Pre-computed single-sentence hint for the nutrition CrewAI prompt, or
    None if there's insufficient data. Never includes raw per-meal data --
    only this one aggregate sentence is ever sent to the AI."""
    avg = get_avg_satiety_last_7_meals(db, user_id)
    if avg is None:
        return None
    return f"Average satiety over last 7 logged meals: {avg}/5 ({satiety_label(avg)})"
