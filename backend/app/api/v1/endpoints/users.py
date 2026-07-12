import datetime
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.user import User, UserProfile
from app.models.fitness import WeightLog
from app.schemas.user import UserProfileCreate, UserProfileResponse, UserProfileUpdate
from app.services.metrics import calculate_all_metrics

router = APIRouter()


def _upsert_weight_log(db: Session, user_id, weight_kg: float) -> None:
    """Record today's weight as a history point, updating the existing entry
    if the user already logged one today rather than creating a duplicate."""
    today = datetime.date.today()
    entry = db.query(WeightLog).filter(
        WeightLog.user_id == user_id,
        WeightLog.date == today,
    ).first()
    if entry:
        entry.weight_kg = weight_kg
    else:
        db.add(WeightLog(id=uuid.uuid4(), user_id=user_id, date=today, weight_kg=weight_kg))


def _deserialize_equipment(profile):
    """Deserialize equipment JSON string to list in-place."""
    if profile.equipment and isinstance(profile.equipment, str):
        try:
            profile.equipment = json.loads(profile.equipment)
        except Exception:
            profile.equipment = [profile.equipment]
    return profile


@router.get("/profile", response_model=UserProfileResponse)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return _deserialize_equipment(profile)


@router.post("/profile", response_model=UserProfileResponse)
def create_or_update_profile(
    profile_data: UserProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metrics = calculate_all_metrics(
        profile_data.weight_kg,
        profile_data.height_cm,
        profile_data.age,
        profile_data.gender.value,
        profile_data.activity_level.value,
        profile_data.goal.value,
    )

    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(id=uuid.uuid4(), user_id=current_user.id)
        db.add(profile)

    data = profile_data.model_dump()
    # Serialize enum values and equipment list
    data["gender"] = profile_data.gender.value
    data["activity_level"] = profile_data.activity_level.value
    data["goal"] = profile_data.goal.value
    if profile_data.theme_preference is not None:
        data["theme_preference"] = profile_data.theme_preference.value
    else:
        data.pop("theme_preference", None)
    if data.get("equipment") is not None:
        data["equipment"] = json.dumps(data["equipment"])

    for key, value in data.items():
        setattr(profile, key, value)
    for key, value in metrics.items():
        setattr(profile, key, value)

    _upsert_weight_log(db, current_user.id, profile_data.weight_kg)

    db.commit()
    db.refresh(profile)
    return _deserialize_equipment(profile)


@router.put("/profile", response_model=UserProfileResponse)
def update_profile(
    profile_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        profile = UserProfile(id=uuid.uuid4(), user_id=current_user.id)
        db.add(profile)

    update_data = profile_data.model_dump(exclude_unset=True)
    if update_data.get("theme_preference") is not None:
        update_data["theme_preference"] = update_data["theme_preference"].value
    for field, value in update_data.items():
        setattr(profile, field, value)

    if update_data.get("weight_kg") is not None:
        _upsert_weight_log(db, current_user.id, update_data["weight_kg"])

    db.commit()
    db.refresh(profile)
    return profile


@router.get("/metrics", response_model=UserProfileResponse)
def get_metrics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return _deserialize_equipment(profile)


@router.get("/weight-history")
def get_weight_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    entries = db.query(WeightLog).filter(
        WeightLog.user_id == current_user.id
    ).order_by(WeightLog.date.asc()).all()
    return [
        {"date": str(e.date), "weight_kg": e.weight_kg, "body_fat_pct": e.body_fat_pct}
        for e in entries
    ]
