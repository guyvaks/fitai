import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import PushSubscription, User
from app.schemas.push import PushSubscriptionCreate, PushSubscriptionDelete

router = APIRouter()


@router.get("/vapid-public-key")
def get_vapid_public_key(current_user: User = Depends(get_current_user)):
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
def subscribe(
    payload: PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert by endpoint — re-subscribing the same browser endpoint under a
    different session (or a different user on a shared device) just updates
    the row rather than creating a duplicate."""
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == payload.endpoint
    ).first()

    if existing:
        existing.user_id = current_user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        db.commit()
        db.refresh(existing)
        return {"id": str(existing.id), "status": "updated"}

    subscription = PushSubscription(
        id=uuid.uuid4(),
        user_id=current_user.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
    )
    db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return {"id": str(subscription.id), "status": "created"}


@router.delete("/subscribe")
def unsubscribe(
    payload: PushSubscriptionDelete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subscription = db.query(PushSubscription).filter(
        PushSubscription.endpoint == payload.endpoint,
        PushSubscription.user_id == current_user.id,
    ).first()
    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    db.delete(subscription)
    db.commit()
    return {"ok": True}
