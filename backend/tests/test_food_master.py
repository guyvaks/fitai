"""Tests for the FoodMaster pending-review flow — same pattern as
ExerciseMaster's POC (tests/test_exercises.py), adapted to food's own
fields: a category enum (validated at the schema level, not DB level) and
non-negative macro validation, neither of which exercises_master enforces."""
import uuid
from unittest.mock import patch

from app.models.fitness import FoodMaster
from app.models.user import PushSubscription, User
from tests.conftest import get_auth_headers

SUGGESTION_PAYLOAD = {
    "canonical_name_he": "עדשים כתומות מבושלות",
    "canonical_name_en": "Cooked Red Lentils",
    "category": "פחמימות",
    "calories_per_100g": 100,
    "protein_per_100g": 7.6,
    "carbs_per_100g": 17.5,
    "fat_per_100g": 0.4,
    "fiber_per_100g": 3.0,
}


def _make_admin(db_session, email="test@example.com"):
    user = db_session.query(User).filter(User.email == email).first()
    user.is_admin = True
    db_session.commit()


def _seed_food(db_session, name_he, is_active, name_en=None, created_by_user_id=None):
    food = FoodMaster(
        id=uuid.uuid4(),
        canonical_name_he=name_he,
        canonical_name_en=name_en,
        category="פחמימות",
        calories_per_100g=100,
        protein_per_100g=5,
        carbs_per_100g=20,
        fat_per_100g=1,
        fiber_per_100g=None,
        created_by_user_id=created_by_user_id,
        aliases=[],
        is_active=is_active,
    )
    db_session.add(food)
    db_session.commit()
    db_session.refresh(food)
    return food


def test_suggest_food_creates_pending(client, db_session):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/food-master/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["is_active"] is False
    assert body["status"] == "pending"

    row = db_session.query(FoodMaster).filter(FoodMaster.id == uuid.UUID(body["id"])).first()
    assert row is not None
    assert row.is_active is False
    assert row.canonical_name_he == SUGGESTION_PAYLOAD["canonical_name_he"]
    assert row.category == "פחמימות"


def test_suggest_food_unauthenticated_401(client):
    response = client.post("/api/v1/food-master/suggest", json=SUGGESTION_PAYLOAD)
    assert response.status_code == 401


def test_suggest_food_duplicate_of_active_returns_409(client, db_session):
    _seed_food(db_session, SUGGESTION_PAYLOAD["canonical_name_he"], is_active=True)
    headers = get_auth_headers(client)
    response = client.post("/api/v1/food-master/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["detail"]["is_active"] is True


def test_suggest_food_duplicate_of_pending_returns_409(client, db_session):
    _seed_food(db_session, SUGGESTION_PAYLOAD["canonical_name_he"], is_active=False)
    headers = get_auth_headers(client)
    response = client.post("/api/v1/food-master/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["detail"]["is_active"] is False


def test_suggest_food_duplicate_409_includes_macros(client, db_session):
    existing = _seed_food(db_session, SUGGESTION_PAYLOAD["canonical_name_he"], is_active=True)
    headers = get_auth_headers(client)
    response = client.post("/api/v1/food-master/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["category"] == existing.category
    assert detail["calories_per_100g"] == existing.calories_per_100g
    assert detail["protein_per_100g"] == existing.protein_per_100g
    assert detail["carbs_per_100g"] == existing.carbs_per_100g
    assert detail["fat_per_100g"] == existing.fat_per_100g


def test_suggest_food_invalid_category_returns_422(client):
    headers = get_auth_headers(client)
    payload = {**SUGGESTION_PAYLOAD, "canonical_name_he": "מוצר בקטגוריה לא קיימת", "category": "לא קטגוריה אמיתית"}
    response = client.post("/api/v1/food-master/suggest", headers=headers, json=payload)
    assert response.status_code == 422


def test_suggest_food_negative_macro_returns_422(client):
    headers = get_auth_headers(client)
    payload = {**SUGGESTION_PAYLOAD, "canonical_name_he": "מוצר עם קלוריות שליליות", "calories_per_100g": -10}
    response = client.post("/api/v1/food-master/suggest", headers=headers, json=payload)
    assert response.status_code == 422


def test_admin_pending_list_requires_admin_403(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/admin/food-master/pending", headers=headers)
    assert response.status_code == 403


def test_admin_pending_list_returns_only_pending(client, db_session):
    _seed_food(db_session, "מוצר פעיל", is_active=True)
    pending = _seed_food(db_session, "מוצר ממתין", is_active=False)

    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.get("/api/v1/admin/food-master/pending", headers=headers)
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert str(pending.id) in ids
    assert len(response.json()) == 1


def test_admin_approve_sets_is_active_true(client, db_session):
    pending = _seed_food(db_session, "מוצר לאישור", is_active=False)
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.post(f"/api/v1/admin/food-master/{pending.id}/approve", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is True

    db_session.refresh(pending)
    assert pending.is_active is True


def test_admin_reject_deletes_row(client, db_session):
    pending = _seed_food(db_session, "מוצר לדחייה", is_active=False)
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.delete(f"/api/v1/admin/food-master/{pending.id}/reject", headers=headers)
    assert response.status_code == 200

    assert db_session.query(FoodMaster).filter(FoodMaster.id == pending.id).first() is None


def test_admin_approve_not_found_404(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    response = client.post(
        f"/api/v1/admin/food-master/{uuid.uuid4()}/approve", headers=headers
    )
    assert response.status_code == 404


def test_admin_reject_not_found_404(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    response = client.delete(
        f"/api/v1/admin/food-master/{uuid.uuid4()}/reject", headers=headers
    )
    assert response.status_code == 404


def test_check_similar_returns_above_threshold_excludes_below(client, db_session):
    close_match = _seed_food(db_session, "עוף בגריל", is_active=True)
    _seed_food(db_session, "תפוח עץ", is_active=True)
    headers = get_auth_headers(client)

    response = client.get(
        "/api/v1/food-master/check-similar",
        params={"name_he": "עוף על הגריל"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    ids = [row["id"] for row in body]
    assert str(close_match.id) in ids
    assert all(row["similarity"] >= 0.6 for row in body)
    similarities = [row["similarity"] for row in body]
    assert similarities == sorted(similarities, reverse=True)


def test_check_similar_requires_auth_401(client):
    response = client.get(
        "/api/v1/food-master/check-similar", params={"name_he": "עוף"}
    )
    assert response.status_code == 401


def test_check_similar_empty_when_no_match(client, db_session):
    _seed_food(db_session, "תפוח עץ", is_active=True)
    headers = get_auth_headers(client)

    response = client.get(
        "/api/v1/food-master/check-similar",
        params={"name_he": "xyz completely unrelated 12345"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == []


def test_admin_pending_includes_created_by_email_when_present(client, db_session):
    get_auth_headers(client, email="suggester@example.com")
    suggester = db_session.query(User).filter(User.email == "suggester@example.com").first()
    pending = _seed_food(
        db_session, "מוצר עם מציע", is_active=False, created_by_user_id=suggester.id
    )

    admin_headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.get("/api/v1/admin/food-master/pending", headers=admin_headers)
    assert response.status_code == 200
    row = next(r for r in response.json() if r["id"] == str(pending.id))
    assert row["created_by_email"] == "suggester@example.com"


def test_admin_pending_created_by_email_null_when_no_user(client, db_session):
    pending = _seed_food(db_session, "מוצר ללא מציע", is_active=False)

    admin_headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.get("/api/v1/admin/food-master/pending", headers=admin_headers)
    assert response.status_code == 200
    row = next(r for r in response.json() if r["id"] == str(pending.id))
    assert row["created_by_email"] is None


def test_suggest_food_sends_push_to_admins(client, db_session, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public-key")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private-key")
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:test@example.com")

    get_auth_headers(client, email="admin@example.com")
    admin = db_session.query(User).filter(User.email == "admin@example.com").first()
    admin.is_admin = True
    db_session.add(PushSubscription(
        id=uuid.uuid4(),
        user_id=admin.id,
        endpoint="https://push.example.com/v1/admin-endpoint",
        p256dh="admin-p256dh",
        auth="admin-auth",
    ))
    db_session.commit()

    headers = get_auth_headers(client, email="suggester2@example.com")

    with patch("app.services.push_notifications.webpush") as mock_webpush:
        response = client.post("/api/v1/food-master/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
        assert response.status_code == 201

        assert mock_webpush.called
        call_kwargs = mock_webpush.call_args.kwargs
        assert call_kwargs["subscription_info"]["endpoint"] == "https://push.example.com/v1/admin-endpoint"
        import json
        payload = json.loads(call_kwargs["data"])
        assert payload["title"] == "מוצר חדש ממתין לאישור"
        assert payload["body"] == SUGGESTION_PAYLOAD["canonical_name_he"]
        assert payload["url"] == "/admin?tab=foods"
