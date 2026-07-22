from tests.conftest import get_auth_headers

MANUAL_PLAN_PAYLOAD = {
    "week": {
        "sunday": [
            {
                "name": "Bench Press",
                "muscle_group": "chest",
                "notes": None,
                "sets": [{"weight_kg": 60, "reps": 10}, {"weight_kg": 60, "reps": 8}],
            }
        ]
    }
}


def _create_plan_and_start_session(client, headers):
    client.post("/api/v1/workouts/plan/manual", headers=headers, json=MANUAL_PLAN_PAYLOAD)
    response = client.post("/api/v1/workouts/sessions/start?day_of_week=sunday", headers=headers)
    return response.json()


def test_get_plan_not_found(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/workouts/plan", headers=headers)
    assert response.status_code == 404


def test_get_plan_unauthenticated(client):
    response = client.get("/api/v1/workouts/plan")
    assert response.status_code == 401


def test_create_manual_plan_success(client):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/workouts/plan/manual", headers=headers, json=MANUAL_PLAN_PAYLOAD)
    assert response.status_code == 200
    data = response.json()
    assert data["plan_data"]["sunday"]["exercises"][0]["name"] == "Bench Press"
    assert len(data["plan_data"]["sunday"]["exercises"][0]["sets"]) == 2


def test_create_manual_plan_unauthenticated(client):
    response = client.post("/api/v1/workouts/plan/manual", json=MANUAL_PLAN_PAYLOAD)
    assert response.status_code == 401


def test_create_manual_plan_invalid_day(client):
    headers = get_auth_headers(client)
    bad_payload = {"week": {"funday": [{"name": "x", "sets": [{"weight_kg": 1, "reps": 1}]}]}}
    response = client.post("/api/v1/workouts/plan/manual", headers=headers, json=bad_payload)
    assert response.status_code == 400


def test_create_manual_plan_no_exercises(client):
    headers = get_auth_headers(client)
    empty_payload = {"week": {"sunday": []}}
    response = client.post("/api/v1/workouts/plan/manual", headers=headers, json=empty_payload)
    assert response.status_code == 400


def test_create_manual_plan_exercise_with_no_sets_is_dropped(client):
    headers = get_auth_headers(client)
    payload = {"week": {"sunday": [{"name": "Empty Exercise", "sets": []}]}}
    response = client.post("/api/v1/workouts/plan/manual", headers=headers, json=payload)
    # no exercise ends up with any sets -> treated as if nothing was added
    assert response.status_code == 400


def test_start_session_creates_active_session(client):
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    assert session["status"] == "active"
    assert session["current_exercise_index"] == 0


def test_start_session_resumes_existing(client):
    headers = get_auth_headers(client)
    first = _create_plan_and_start_session(client, headers)
    second_response = client.post("/api/v1/workouts/sessions/start?day_of_week=sunday", headers=headers)
    assert second_response.status_code == 200
    assert second_response.json()["id"] == first["id"]


def test_get_active_session_not_found(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/workouts/sessions/active", headers=headers)
    assert response.status_code == 404


def test_get_active_session_found(client):
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    response = client.get("/api/v1/workouts/sessions/active", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == session["id"]


def test_complete_set_session_not_found(client):
    headers = get_auth_headers(client)
    response = client.patch(
        "/api/v1/workouts/sessions/00000000-0000-0000-0000-000000000000/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 0, "weight_kg": 60, "reps": 10, "exercise_name": "Bench Press"},
    )
    assert response.status_code == 404


def test_complete_set_regression_exercise_memory_uses_real_name(client):
    """Regression test: complete_set must write ExerciseMemory under the real
    exercise name sent by the client, not a synthetic 'exercise_{index}'
    placeholder — this is the bug that was fixed in workouts.py."""
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)

    response = client.patch(
        f"/api/v1/workouts/sessions/{session['id']}/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 0, "weight_kg": 62.5, "reps": 10, "exercise_name": "Bench Press"},
    )
    assert response.status_code == 200

    memory_response = client.get("/api/v1/workouts/exercise-memory/Bench Press", headers=headers)
    assert memory_response.status_code == 200
    memory = memory_response.json()
    assert memory is not None
    assert memory["exercise_name"] == "Bench Press"
    assert memory["last_weight_kg"] == 62.5
    assert memory["last_reps"] == 10

    # the old placeholder key must NOT have been used as a separate memory row
    placeholder_response = client.get("/api/v1/workouts/exercise-memory/exercise_0", headers=headers)
    assert placeholder_response.json() is None


def test_complete_set_falls_back_to_placeholder_when_name_missing(client):
    """When the client doesn't send exercise_name (older frontend build), the
    endpoint should still fall back to the synthetic placeholder rather than
    erroring — this preserves backward compatibility alongside the fix."""
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)

    response = client.patch(
        f"/api/v1/workouts/sessions/{session['id']}/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 0, "weight_kg": 50, "reps": 12},
    )
    assert response.status_code == 200

    memory_response = client.get("/api/v1/workouts/exercise-memory/exercise_0", headers=headers)
    memory = memory_response.json()
    assert memory is not None
    assert memory["exercise_name"] == "exercise_0"


def test_complete_set_normal_updates_exercise_memory(client):
    """Baseline: a normal (non-failure) set still updates ExerciseMemory as
    before -- the failure-set skip added alongside this must not change the
    default path."""
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)

    response = client.patch(
        f"/api/v1/workouts/sessions/{session['id']}/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 0, "weight_kg": 60, "reps": 10, "exercise_name": "Squat"},
    )
    assert response.status_code == 200
    assert response.json()["completed_sets"]["0_0"]["set_type"] == "normal"

    memory = client.get("/api/v1/workouts/exercise-memory/Squat", headers=headers).json()
    assert memory["last_weight_kg"] == 60
    assert memory["last_reps"] == 10


def test_complete_set_failure_does_not_update_exercise_memory(client):
    """A failure set must not become the next session's 'previous' reference
    -- ExerciseMemory should stay untouched (not created, not overwritten)."""
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)

    response = client.patch(
        f"/api/v1/workouts/sessions/{session['id']}/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 0, "weight_kg": 40, "reps": 3, "exercise_name": "Squat", "set_type": "failure"},
    )
    assert response.status_code == 200
    assert response.json()["completed_sets"]["0_0"]["set_type"] == "failure"

    # No ExerciseMemory row should have been created at all for this exercise
    memory = client.get("/api/v1/workouts/exercise-memory/Squat", headers=headers).json()
    assert memory is None


def test_complete_set_failure_after_normal_does_not_overwrite_previous(client):
    """A normal set sets the 'previous' reference; a subsequent failure set on
    the same exercise must not overwrite it."""
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)

    client.patch(
        f"/api/v1/workouts/sessions/{session['id']}/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 0, "weight_kg": 60, "reps": 10, "exercise_name": "Squat"},
    )
    client.patch(
        f"/api/v1/workouts/sessions/{session['id']}/set-complete",
        headers=headers,
        json={"exercise_index": 0, "set_index": 1, "weight_kg": 45, "reps": 4, "exercise_name": "Squat", "set_type": "failure"},
    )

    memory = client.get("/api/v1/workouts/exercise-memory/Squat", headers=headers).json()
    assert memory["last_weight_kg"] == 60
    assert memory["last_reps"] == 10


def test_complete_session(client):
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    response = client.post(f"/api/v1/workouts/sessions/{session['id']}/complete", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"

    active_response = client.get("/api/v1/workouts/sessions/active", headers=headers)
    assert active_response.status_code == 404


def test_abandon_session(client):
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    response = client.delete(f"/api/v1/workouts/sessions/{session['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "abandoned"


def test_get_exercise_memory_not_found_returns_none(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/workouts/exercise-memory/Never Done", headers=headers)
    assert response.status_code == 200
    assert response.json() is None


def test_get_personal_records_empty(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/workouts/personal-records", headers=headers)
    assert response.status_code == 200
    assert response.json() == []
