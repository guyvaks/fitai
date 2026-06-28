import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.user import User, UserProfile
from app.schemas.user import UserProfileCreate, UserProfileResponse, UserProfileUpdate
from app.services.metrics import calculate_all_metrics

router = APIRouter()


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
    if data.get("equipment") is not None:
        data["equipment"] = json.dumps(data["equipment"])

    for key, value in data.items():
        setattr(profile, key, value)
    for key, value in metrics.items():
        setattr(profile, key, value)

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

    for field, value in profile_data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile


@router.get("/metrics", response_model=UserProfileResponse)
def get_metrics(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return _deserialize_equipment(profile)
