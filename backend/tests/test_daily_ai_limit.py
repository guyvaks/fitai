"""Tests for the per-user daily AI-generation limit (daily_ai_generation_limit
on User): NULL means unlimited (default for everyone), a set integer caps how
many of the three generate endpoints may succeed per UTC day, counted via
AISuggestion rows created today. See _check_daily_ai_limit in agents.py."""
from datetime import timedelta

import app.core.database as database_module
from app.models.user import User
from app.models.fitness import AISuggestion
from app.services import crew_agents
from app.api.v1.endpoints.agents import _start_of_today_utc
from tests.conftest import TestingSessionLocal, get_auth_headers

DAYS = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")

PROFILE_PAYLOAD = {
    "age": 30,
    "gender": "male",
    "height_cm": 180,
    "weight_kg": 80,
    "activity_level": "moderately_active",
    "goal": "muscle_gain",
    "meals_per_day": 4,
}


def _create_profile(client, headers):
    client.post("/api/v1/users/profile", headers=headers, json=PROFILE_PAYLOAD)


def _patch_background_db(monkeypatch):
    monkeypatch.setattr(database_module, "SessionLocal", TestingSessionLocal)


async def _fake_nutrition_crew(profile, memory):
    return {"meal_plan": {day: {"meals": []} for day in DAYS}}


def _set_limit(email, limit):
    session = TestingSessionLocal()
    try:
        session.query(User).filter(User.email == email).update({"daily_ai_generation_limit": limit})
        session.commit()
    finally:
        session.close()


def test_unlimited_by_default_multiple_generations_all_succeed(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    email = "unlimited-ai@example.com"
    headers = get_auth_headers(client, email=email)
    _create_profile(client, headers)

    for _ in range(3):
        response = client.post("/api/v1/agents/nutrition", headers=headers)
        assert response.status_code == 200


def test_blocked_at_the_nth_generation(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    email = "limited-ai@example.com"
    headers = get_auth_headers(client, email=email)
    _create_profile(client, headers)
    _set_limit(email, 2)

    first = client.post("/api/v1/agents/nutrition", headers=headers)
    assert first.status_code == 200
    second = client.post("/api/v1/agents/nutrition", headers=headers)
    assert second.status_code == 200

    third = client.post("/api/v1/agents/nutrition", headers=headers)
    assert third.status_code == 429
    assert "2" in third.json()["detail"]

    # All three generate endpoints share the same counter/gate.
    workout_attempt = client.post("/api/v1/agents/workout", headers=headers)
    assert workout_attempt.status_code == 429


def test_allowed_again_after_the_utc_day_boundary(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    email = "boundary-ai@example.com"
    headers = get_auth_headers(client, email=email)
    _create_profile(client, headers)
    _set_limit(email, 1)

    response = client.post("/api/v1/agents/nutrition", headers=headers)
    assert response.status_code == 200

    blocked = client.post("/api/v1/agents/nutrition", headers=headers)
    assert blocked.status_code == 429

    # Simulate the earlier generation having happened yesterday by
    # backdating its AISuggestion row past today's UTC midnight boundary --
    # the gate must only count rows created today.
    session = TestingSessionLocal()
    try:
        user = session.query(User).filter(User.email == email).first()
        session.query(AISuggestion).filter(AISuggestion.user_id == user.id).update({
            "created_at": _start_of_today_utc() - timedelta(hours=1),
        })
        session.commit()
    finally:
        session.close()

    allowed_again = client.post("/api/v1/agents/nutrition", headers=headers)
    assert allowed_again.status_code == 200


def test_failed_generation_does_not_count_against_limit(client, monkeypatch):
    _patch_background_db(monkeypatch)

    async def _fake_invalid_crew(profile, memory):
        return {"error": "no output"}

    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_invalid_crew)

    email = "failed-gen-ai@example.com"
    headers = get_auth_headers(client, email=email)
    _create_profile(client, headers)
    _set_limit(email, 1)

    # This "succeeds" at the HTTP level (task starts) but the crew fn's
    # output has no meal_plan key -- approve.py's own validation handles
    # that separately; what matters here is no AISuggestion row is written
    # on a raised exception, so it must not consume the quota. Use a crew fn
    # that raises instead, matching _run_in_background's except Exception.
    def _raise(*args, **kwargs):
        raise RuntimeError("crew failed")

    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _raise)
    first = client.post("/api/v1/agents/nutrition", headers=headers)
    assert first.status_code == 200
    task_id = first.json()["task_id"]
    status_response = client.get(f"/api/v1/agents/status/{task_id}", headers=headers)
    assert status_response.json()["status"] == "error"

    # Quota untouched -- a real (successful) generation should still be allowed.
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)
    second = client.post("/api/v1/agents/nutrition", headers=headers)
    assert second.status_code == 200
