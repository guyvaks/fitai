"""Tests for the FoodMaster pending-review flow — same pattern as
ExerciseMaster's POC (tests/test_exercises.py), adapted to food's own
fields: a category enum (validated at the schema level, not DB level) and
non-negative macro validation, neither of which exercises_master enforces."""
import uuid

from app.models.fitness import FoodMaster
from app.models.user import User
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


def _seed_food(db_session, name_he, is_active, name_en=None):
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
