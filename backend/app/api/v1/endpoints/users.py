import base64
import datetime
import io
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.user import User, UserProfile
from app.models.fitness import WeightLog
from app.schemas.user import (
    AvatarUpload,
    PreferredLanguageUpdate,
    UserProfileCreate,
    UserProfileResponse,
    UserProfileUpdate,
)
from app.services import storage as avatar_storage
from app.services.metrics import calculate_all_metrics

router = APIRouter()

AVATAR_SIZE = 256
# Raw base64 text length cap (~8MB decoded), rejected before decoding to
# avoid spending effort on absurdly large payloads.
MAX_AVATAR_BASE64_CHARS = 11_000_000


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
    """Build the profile response, parsing the equipment JSON string to a list.

    Must NOT mutate the ORM row: assigning a list back to `profile.equipment`
    (a Text column) makes the object dirty, so the next flush on that session
    tries to bind a Python list to the column and raises. Build a detached
    response model instead — see test_update_theme_with_equipment_set_does_not_500.
    """
    data = {name: getattr(profile, name, None) for name in UserProfileResponse.model_fields}
    equipment = data.get("equipment")
    if equipment and isinstance(equipment, str):
        try:
            data["equipment"] = json.loads(equipment)
        except Exception:
            data["equipment"] = [equipment]
    return UserProfileResponse.model_validate(data)


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
    return _deserialize_equipment(profile)


@router.patch("/preferred-language")
def update_preferred_language(
    body: PreferredLanguageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Storage-only (see User.preferred_language) -- does not change the
    # actual UI language, no i18n is wired up yet.
    current_user.preferred_language = body.preferred_language.value
    db.commit()
    return {"preferred_language": current_user.preferred_language}


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


@router.post("/avatar")
def upload_avatar(
    payload: AvatarUpload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    image_base64 = payload.image_base64
    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    # Tolerate data-URL input from the browser ("data:image/png;base64,...."),
    # matching the same convention already used for the calorie-calculator
    # image endpoint.
    if image_base64.startswith("data:"):
        _, _, image_base64 = image_base64.partition(",")

    if len(image_base64) > MAX_AVATAR_BASE64_CHARS:
        raise HTTPException(status_code=400, detail="Image too large")

    try:
        raw = base64.b64decode(image_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        # verify() invalidates the file object for further use, so reopen.
        image = Image.open(io.BytesIO(raw))
        image = image.convert("RGB")
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="File is not a valid image")

    # Center-crop to a square, then resize to the fixed avatar size.
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((AVATAR_SIZE, AVATAR_SIZE))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)

    path = avatar_storage.upload_avatar(current_user.id, buffer.getvalue(), "image/jpeg")

    current_user.avatar_url = path
    current_user.avatar_updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(current_user)

    return {"avatar_updated_at": current_user.avatar_updated_at}


@router.get("/avatar/{user_id}")
def get_avatar(user_id: str, db: Session = Depends(get_db)):
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Avatar not found")

    user = db.query(User).filter(User.id == parsed_id).first()
    if not user or not user.avatar_url:
        raise HTTPException(status_code=404, detail="Avatar not found")

    signed_url = avatar_storage.get_signed_url(user.avatar_url)
    # Bucket is private -- the signed URL itself expires (see get_signed_url),
    # so it must not be cached past that window.
    return RedirectResponse(
        url=signed_url,
        status_code=307,
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.delete("/avatar")
def delete_avatar(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.avatar_url:
        avatar_storage.delete_avatar(current_user.id)
    current_user.avatar_url = None
    current_user.avatar_updated_at = None
    db.commit()
    return {"detail": "Avatar removed"}
