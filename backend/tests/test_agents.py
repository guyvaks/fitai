"""Endpoint-level tests for /api/v1/agents/*. The crew functions are mocked
(no real Anthropic/CrewAI calls), and the background task's own DB session
(app.core.database.SessionLocal, separate from the request-scoped get_db
override) is redirected to the same in-memory test DB so nothing touches
the real staging/production database."""
import pytest

import app.core.database as database_module
from app.services import crew_agents
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
    """The background task opens its own SessionLocal() rather than using the
    request-scoped get_db override, so it must be repointed at the test DB
    too, or it would try to reach the real staging Postgres."""
    monkeypatch.setattr(database_module, "SessionLocal", TestingSessionLocal)


async def _fake_full_week(profile, memory, plan_key="meal_plan"):
    return {plan_key: {day: {"meals": []} for day in DAYS}}


async def _fake_nutrition_crew(profile, memory):
    return await _fake_full_week(profile, memory, "meal_plan")


async def _fake_workout_crew(profile, memory):
    return await _fake_full_week(profile, memory, "workout_plan")


async def _fake_invalid_crew(profile, memory):
    return {"error": "no output"}


def test_generate_nutrition_unauthenticated(client):
    response = client.post("/api/v1/agents/nutrition")
    assert response.status_code == 401


def test_generate_nutrition_no_profile(client):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/agents/nutrition", headers=headers)
    assert response.status_code == 400


def test_generate_workout_unauthenticated(client):
    response = client.post("/api/v1/agents/workout")
    assert response.status_code == 401


def test_generate_full_plan_unauthenticated(client):
    response = client.post("/api/v1/agents/full-plan")
    assert response.status_code == 401


def test_status_not_found(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/agents/status/does-not-exist", headers=headers)
    assert response.status_code == 404


def test_generate_nutrition_success_produces_ready_suggestion(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    response = client.post("/api/v1/agents/nutrition", headers=headers)
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    status_response = client.get(f"/api/v1/agents/status/{task_id}", headers=headers)
    assert status_response.status_code == 200
    data = status_response.json()
    assert data["status"] == "ready"
    assert sorted(data["content"]["meal_plan"].keys()) == sorted(DAYS)
    assert "suggestion_id" in data


def test_generate_workout_success_produces_ready_suggestion(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_workout_crew", _fake_workout_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    response = client.post("/api/v1/agents/workout", headers=headers)
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    status_response = client.get(f"/api/v1/agents/status/{task_id}", headers=headers)
    assert status_response.json()["status"] == "ready"


def test_generate_full_plan_success(client, monkeypatch):
    _patch_background_db(monkeypatch)

    async def fake_full_crew(profile, memory):
        return {
            "meal_plan": {day: {"meals": []} for day in DAYS},
            "workout_plan": {day: {"exercises": []} for day in DAYS},
        }

    monkeypatch.setattr(crew_agents, "run_full_crew", fake_full_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    response = client.post("/api/v1/agents/full-plan", headers=headers)
    assert response.status_code == 200
    task_id = response.json()["task_id"]

    status_response = client.get(f"/api/v1/agents/status/{task_id}", headers=headers)
    data = status_response.json()
    assert data["status"] == "ready"
    assert "meal_plan" in data["content"]
    assert "workout_plan" in data["content"]


def test_approve_suggestion_not_found(client):
    headers = get_auth_headers(client)
    response = client.post(
        "/api/v1/agents/approve/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert response.status_code == 404


def test_approve_suggestion_unauthenticated(client):
    response = client.post("/api/v1/agents/approve/some-id")
    assert response.status_code == 401


def test_approve_suggestion_success_activates_nutrition_plan(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    task_id = client.post("/api/v1/agents/nutrition", headers=headers).json()["task_id"]
    suggestion_id = client.get(f"/api/v1/agents/status/{task_id}", headers=headers).json()["suggestion_id"]

    approve_response = client.post(f"/api/v1/agents/approve/{suggestion_id}", headers=headers)
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"

    plan_response = client.get("/api/v1/nutrition/plan", headers=headers)
    assert plan_response.status_code == 200
    assert sorted(plan_response.json()["plan_data"]["meal_plan"].keys()) == sorted(DAYS)


def test_approve_suggestion_with_invalid_content_returns_400(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_invalid_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    task_id = client.post("/api/v1/agents/nutrition", headers=headers).json()["task_id"]
    suggestion_id = client.get(f"/api/v1/agents/status/{task_id}", headers=headers).json()["suggestion_id"]

    approve_response = client.post(f"/api/v1/agents/approve/{suggestion_id}", headers=headers)
    assert approve_response.status_code == 400


@pytest.mark.xfail(
    reason=(
        "KNOWN BUG (retry-path mapping, 2026-07-19, not fixed by this task): when "
        "_run_crew_with_retry exhausts MAX_PLAN_ATTEMPTS on an incomplete plan, it "
        "returns the partial dict as-is (e.g. only 1 of 7 days) instead of raising. "
        "That partial dict still has the 'meal_plan'/'workout_plan' key, and "
        "_normalise_content()/approve_suggestion() in agents.py only check for that "
        "key's presence — they never call _plan_key_with_all_days to check day "
        "completeness. So a retry-exhausted partial plan sails through "
        "generate -> status='ready' -> approve -> saved to NutritionPlan/WorkoutPlan "
        "as if it were a complete, valid plan. This is the same failure family as the "
        "historical '1 day instead of 7' bug, at the approve-time boundary instead of "
        "the generation boundary. Fix requires a completeness guard in "
        "_normalise_content or approve_suggestion; out of scope here."
    ),
    strict=True,
)
def test_approve_suggestion_with_retry_exhausted_partial_plan_is_rejected(client, monkeypatch):
    """Desired behavior once fixed: a suggestion whose content is exactly what
    _run_crew_with_retry returns after giving up (meal_plan present, but only
    1 of 7 days) must be rejected at approve time (400), the same way a fully
    empty {'error': 'no output'} result already is (see
    test_approve_suggestion_with_invalid_content_returns_400). strict=True means
    this test must stay RED (fail) until the completeness guard is added — an
    unexpected pass (XPASS) will itself fail the suite, flagging that the xfail
    marker needs to be removed."""
    _patch_background_db(monkeypatch)

    async def _fake_retry_exhausted_crew(profile, memory):
        # Exactly the shape _run_crew_with_retry returns on exhaustion: has the
        # 'meal_plan' key, but only 1 of the 7 required days.
        return {"meal_plan": {"sunday": {"meals": []}}}

    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_retry_exhausted_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    task_id = client.post("/api/v1/agents/nutrition", headers=headers).json()["task_id"]
    suggestion_id = client.get(
        f"/api/v1/agents/status/{task_id}", headers=headers
    ).json()["suggestion_id"]

    approve_response = client.post(f"/api/v1/agents/approve/{suggestion_id}", headers=headers)
    assert approve_response.status_code == 400


def test_reject_suggestion_success(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    task_id = client.post("/api/v1/agents/nutrition", headers=headers).json()["task_id"]
    suggestion_id = client.get(f"/api/v1/agents/status/{task_id}", headers=headers).json()["suggestion_id"]

    reject_response = client.post(f"/api/v1/agents/reject/{suggestion_id}", headers=headers)
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"


def test_reject_suggestion_not_found(client):
    headers = get_auth_headers(client)
    response = client.post(
        "/api/v1/agents/reject/00000000-0000-0000-0000-000000000000", headers=headers
    )
    assert response.status_code == 404


def test_get_pending_suggestions_lifecycle(client, monkeypatch):
    _patch_background_db(monkeypatch)
    monkeypatch.setattr(crew_agents, "run_nutrition_crew", _fake_nutrition_crew)

    headers = get_auth_headers(client)
    _create_profile(client, headers)

    empty_response = client.get("/api/v1/agents/pending", headers=headers)
    assert empty_response.status_code == 200
    assert empty_response.json() == []

    task_id = client.post("/api/v1/agents/nutrition", headers=headers).json()["task_id"]
    suggestion_id = client.get(f"/api/v1/agents/status/{task_id}", headers=headers).json()["suggestion_id"]

    pending_response = client.get("/api/v1/agents/pending", headers=headers)
    assert len(pending_response.json()) == 1
    assert pending_response.json()[0]["id"] == suggestion_id

    client.post(f"/api/v1/agents/approve/{suggestion_id}", headers=headers)

    after_approve_response = client.get("/api/v1/agents/pending", headers=headers)
    assert after_approve_response.json() == []


def test_get_pending_suggestions_unauthenticated(client):
    response = client.get("/api/v1/agents/pending")
    assert response.status_code == 401
