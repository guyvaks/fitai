"""Real end-to-end regression test for the workout-plan generation flow —
the one test in this suite that calls the *live* Anthropic API rather than
mocking crew_agents. Everything else in tests/test_agents*.py mocks the LLM
call for speed/cost/determinism; this file exists specifically to close a
gap those mocked tests structurally cannot cover.

Why this exists: the "no_plan_generated" production bug (an AISuggestion
saved with content = {"error": "no output"}) was never caught by the app's
existing E2E/health-check monitoring, because that monitoring only asserts
that POST /api/v1/agents/workout returns 200 — which it does the moment the
background task is *enqueued*, regardless of whether the crew run behind it
ever produces usable content. A status-code-only check passes even when the
generation fails completely. This test instead drives the real pipeline
(register -> profile -> generate -> poll -> approve-boundary check) and
asserts on the actual resulting plan content, structure, and judge verdict.

Marked `e2e` and excluded from the default `pytest tests/` run (see
`pytest_collection_modifyitems` in tests/conftest.py) because it is slow
(~60-90s, sometimes longer with retries) and makes real, billed Anthropic API
calls. Run it explicitly:

    pytest tests/test_e2e_workout_generation.py -m e2e -v
"""
import time

import pytest

import app.core.database as database_module
from app.services.crew_agents import DAYS, incomplete_plan_keys
from tests.conftest import TestingSessionLocal, get_auth_headers

PROFILE_PAYLOAD = {
    "age": 30,
    "gender": "male",
    "height_cm": 180,
    "weight_kg": 80,
    "activity_level": "moderately_active",
    "goal": "muscle_gain",
    "equipment": ["dumbbells", "barbell"],
    "meals_per_day": 4,
}


@pytest.mark.e2e
def test_workout_generation_produces_real_judge_approved_plan(client, monkeypatch):
    """Full real pipeline, no mocking of the crew/judge/LLM layer: this is
    the content-level check the existing status-code-only E2E monitoring
    never made. A regression that reintroduces "no output" (or a judge-
    rejected plan slipping through) fails this test even though
    POST /agents/workout would still return 200."""
    monkeypatch.setattr(database_module, "SessionLocal", TestingSessionLocal)

    headers = get_auth_headers(client, email="e2e-real-workout@example.com")
    profile_resp = client.post("/api/v1/users/profile", headers=headers, json=PROFILE_PAYLOAD)
    assert profile_resp.status_code in (200, 201), profile_resp.text

    generate_resp = client.post("/api/v1/agents/workout", headers=headers)
    assert generate_resp.status_code == 200
    task_id = generate_resp.json()["task_id"]

    status = None
    # Real generation is ~60-70s; MAX_PLAN_ATTEMPTS retries (structural or
    # judge) can each add another full attempt, so allow generous headroom.
    for _ in range(30):
        status = client.get(f"/api/v1/agents/status/{task_id}", headers=headers).json()
        if status.get("status") in ("ready", "error"):
            break
        time.sleep(10)

    assert status is not None, "polling never returned a terminal status"
    assert status["status"] == "ready", f"generation task did not complete successfully: {status}"

    content = status["content"]

    # The actual assertion a status-code-only check can never make: real,
    # structurally complete content — not {"error": "no output"} and not a
    # judge-rejected plan (incomplete_plan_keys treats both identically, see
    # crew_agents.NO_PLAN_GENERATED).
    assert incomplete_plan_keys(content) == [], (
        f"generated content failed the completeness/judge check: {content}"
    )
    assert "workout_plan" in content
    plan = content["workout_plan"]
    assert sorted(plan.keys()) == sorted(DAYS)
    for day, day_plan in plan.items():
        assert isinstance(day_plan, dict)
        assert "type" in day_plan
        assert "exercises" in day_plan
