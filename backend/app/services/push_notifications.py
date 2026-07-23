"""Web Push notifications for admins (pending food/exercise approvals).

Best-effort only: a dead subscription or a failed push must never affect the
caller (e.g. suggest_food/suggest_exercise must still return success to the
user). Errors are logged, not raised; expired subscriptions (404/410 from the
push service) are cleaned up as they're discovered.
"""
import json
import logging

from pywebpush import WebPushException, webpush
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import PushSubscription, User

logger = logging.getLogger(__name__)


def send_push_to_admins(title: str, body: str, url: str, db: Session) -> None:
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    try:
        subscriptions = (
            db.query(PushSubscription)
            .join(User, PushSubscription.user_id == User.id)
            .filter(User.is_admin.is_(True))
            .all()
        )
    except Exception:
        logger.exception("Failed to load admin push subscriptions")
        return

    payload = json.dumps({"title": title, "body": body, "url": url})

    for subscription in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT},
            )
        except WebPushException as e:
            status_code = getattr(e.response, "status_code", None)
            if status_code in (404, 410):
                db.query(PushSubscription).filter(
                    PushSubscription.id == subscription.id
                ).delete()
                db.commit()
            else:
                logger.warning("Push send failed for subscription %s: %s", subscription.id, e)
        except Exception:
            logger.exception("Unexpected error sending push to subscription %s", subscription.id)
