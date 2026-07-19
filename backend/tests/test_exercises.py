"""Tests for the ExerciseMaster pending-review flow (POC for the same
pattern planned for food_master): POST /api/v1/exercises/suggest creates a
row with is_active=False, and only an admin approving/rejecting it via
/api/v1/admin/exercises/* changes that. The most important test in this
file is test_get_canonical_exercises_excludes_pending -- it proves a
pending exercise is genuinely invisible to the workout-generation AI agent,
not just hidden from some UI list."""
import uuid

from app.models.fitness import ExerciseMaster
from app.models.user import User
from app.services import crew_agents
from tests.conftest import TestingSessionLocal, get_auth_headers

SUGGESTION_PAYLOAD = {
    "canonical_name_he": "לחיצת כתפיים בישיבה",
    "canonical_name_en": "Seated Shoulder Press",
    "category": "shoulders",
    "muscle_group_primary": "Shoulders",
    "equipment": "dumbbells",
}


def _make_admin(db_session, email="test@example.com"):
    user = db_session.query(User).filter(User.email == email).first()
    user.is_admin = True
    db_session.commit()


def _seed_exercise(db_session, name_he, is_active, name_en=None):
    exercise = ExerciseMaster(
        id=uuid.uuid4(),
        canonical_name_he=name_he,
        canonical_name_en=name_en,
        category="test",
        muscle_group_primary="Test",
        equipment="none",
        aliases=[],
        is_active=is_active,
    )
    db_session.add(exercise)
    db_session.commit()
    db_session.refresh(exercise)
    return exercise


def test_suggest_exercise_creates_pending(client, db_session):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/exercises/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["is_active"] is False
    assert body["status"] == "pending"

    row = db_session.query(ExerciseMaster).filter(ExerciseMaster.id == uuid.UUID(body["id"])).first()
    assert row is not None
    assert row.is_active is False
    assert row.canonical_name_he == SUGGESTION_PAYLOAD["canonical_name_he"]


def test_suggest_exercise_unauthenticated_401(client):
    response = client.post("/api/v1/exercises/suggest", json=SUGGESTION_PAYLOAD)
    assert response.status_code == 401


def test_suggest_exercise_duplicate_of_active_returns_409(client, db_session):
    _seed_exercise(db_session, SUGGESTION_PAYLOAD["canonical_name_he"], is_active=True)
    headers = get_auth_headers(client)
    response = client.post("/api/v1/exercises/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["detail"]["is_active"] is True


def test_suggest_exercise_duplicate_of_pending_returns_409(client, db_session):
    _seed_exercise(db_session, SUGGESTION_PAYLOAD["canonical_name_he"], is_active=False)
    headers = get_auth_headers(client)
    response = client.post("/api/v1/exercises/suggest", headers=headers, json=SUGGESTION_PAYLOAD)
    assert response.status_code == 409
    assert response.json()["detail"]["is_active"] is False


def test_get_canonical_exercises_excludes_pending(db_session, monkeypatch):
    """The critical check: a pending exercise must be genuinely invisible to
    the AI agent's exercise list, not just filtered out of some admin view."""
    monkeypatch.setattr(crew_agents, "SessionLocal", TestingSessionLocal)

    active = _seed_exercise(db_session, "תרגיל פעיל", is_active=True)
    _seed_exercise(db_session, "תרגיל ממתין", is_active=False)

    names = [e["name_he"] for e in crew_agents.get_canonical_exercises()]
    assert active.canonical_name_he in names
    assert "תרגיל ממתין" not in names


def test_admin_pending_list_requires_admin_403(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/admin/exercises/pending", headers=headers)
    assert response.status_code == 403


def test_admin_pending_list_returns_only_pending(client, db_session):
    _seed_exercise(db_session, "תרגיל פעיל 2", is_active=True)
    pending = _seed_exercise(db_session, "תרגיל ממתין 2", is_active=False)

    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.get("/api/v1/admin/exercises/pending", headers=headers)
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert str(pending.id) in ids
    assert len(response.json()) == 1


def test_admin_approve_sets_is_active_true_and_becomes_visible_to_agent(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(crew_agents, "SessionLocal", TestingSessionLocal)

    pending = _seed_exercise(db_session, "תרגיל לאישור", is_active=False)
    headers = get_auth_headers(client)
    _make_admin(db_session)

    names_before = [e["name_he"] for e in crew_agents.get_canonical_exercises()]
    assert "תרגיל לאישור" not in names_before

    response = client.post(f"/api/v1/admin/exercises/{pending.id}/approve", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is True

    names_after = [e["name_he"] for e in crew_agents.get_canonical_exercises()]
    assert "תרגיל לאישור" in names_after


def test_admin_reject_deletes_row(client, db_session):
    pending = _seed_exercise(db_session, "תרגיל לדחייה", is_active=False)
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.delete(f"/api/v1/admin/exercises/{pending.id}/reject", headers=headers)
    assert response.status_code == 200

    assert db_session.query(ExerciseMaster).filter(ExerciseMaster.id == pending.id).first() is None


def test_admin_approve_not_found_404(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    response = client.post(
        f"/api/v1/admin/exercises/{uuid.uuid4()}/approve", headers=headers
    )
    assert response.status_code == 404


def test_admin_reject_not_found_404(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    response = client.delete(
        f"/api/v1/admin/exercises/{uuid.uuid4()}/reject", headers=headers
    )
    assert response.status_code == 404
