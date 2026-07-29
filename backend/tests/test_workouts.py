import datetime
import uuid

from app.models.fitness import ExerciseMaster, WorkoutPlan, WorkoutSession
from tests.conftest import get_auth_headers

FULL_WEEK_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

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


def test_manual_full_week_replaces_stale_ai_wrapper(client, db_session):
    """A full 7-day manual submission (what ManualWorkoutBuilder.jsx always
    sends) must fully replace plan_data, not merge onto it -- otherwise an
    AI-approved plan "edited" via the manual builder would keep its stale
    workout_plan wrapper key sitting in the DB forever, and any day that
    comes back with zero exercises (a rest day) would have no flat key to
    shadow it, silently falling back to the old AI content instead of the
    now-empty day the user actually confirmed."""
    headers = get_auth_headers(client)
    from app.models.user import User
    user = db_session.query(User).filter(User.email == "test@example.com").first()

    ai_wrapped_plan_data = {
        "workout_plan": {
            day: (
                {"type": "strength", "name": "אימון", "exercises": [
                    {"name": "Old AI Exercise", "muscle_group": "chest",
                     "sets": 3, "reps": 10, "weight_kg": 40, "rest_seconds": 60}
                ]}
                if day == "sunday"
                else {"type": "rest", "name": "מנוחה", "exercises": []}
            )
            for day in FULL_WEEK_DAYS
        }
    }
    db_session.add(WorkoutPlan(user_id=user.id, plan_data=ai_wrapped_plan_data, is_active=True))
    db_session.commit()

    full_week_payload = {
        "week": {
            day: (
                [{"name": "New Manual Exercise", "muscle_group": "back", "notes": None,
                  "sets": [{"weight_kg": 20, "reps": 12}]}]
                if day == "sunday"
                else []
            )
            for day in FULL_WEEK_DAYS
        }
    }
    response = client.post("/api/v1/workouts/plan/manual", headers=headers, json=full_week_payload)
    assert response.status_code == 200
    plan_data = response.json()["plan_data"]

    # Stale AI wrapper is gone entirely, not just shadowed.
    assert "workout_plan" not in plan_data
    # The edited day has the new manual content.
    assert plan_data["sunday"]["exercises"][0]["name"] == "New Manual Exercise"
    # A day that came back empty (a real rest day) has an explicit empty
    # flat key -- not absent, which would fall back to nothing since the
    # wrapper is gone, or worse, keep falling back to stale AI content if
    # the wrapper had been left in place.
    assert plan_data["monday"]["exercises"] == []


def test_manual_partial_update_still_merges(client):
    """Backward-compat: a payload that doesn't cover all 7 days (the shape
    every existing test in this file uses) keeps the original merge-only-
    what-was-sent behavior -- only the full-week case changes."""
    headers = get_auth_headers(client)
    client.post("/api/v1/workouts/plan/manual", headers=headers, json=MANUAL_PLAN_PAYLOAD)

    monday_payload = {"week": {"monday": [
        {"name": "Squat", "muscle_group": "legs", "notes": None,
         "sets": [{"weight_kg": 80, "reps": 5}]}
    ]}}
    response = client.post("/api/v1/workouts/plan/manual", headers=headers, json=monday_payload)
    assert response.status_code == 200
    plan_data = response.json()["plan_data"]

    # Sunday from the first call is untouched, Monday from the second call is added.
    assert plan_data["sunday"]["exercises"][0]["name"] == "Bench Press"
    assert plan_data["monday"]["exercises"][0]["name"] == "Squat"


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


def _seed_exercise_master(db_session, name_he, muscle_group, name_en=None):
    exercise = ExerciseMaster(
        id=uuid.uuid4(),
        canonical_name_he=name_he,
        canonical_name_en=name_en,
        category="test",
        muscle_group_primary=muscle_group,
        equipment="none",
        aliases=[],
        is_active=True,
    )
    db_session.add(exercise)
    db_session.commit()
    return exercise


def _complete_a_set(client, headers, session_id, exercise_name, weight_kg=60, reps=10, exercise_index=0, set_index=0):
    return client.patch(
        f"/api/v1/workouts/sessions/{session_id}/set-complete",
        headers=headers,
        json={
            "exercise_index": exercise_index,
            "set_index": set_index,
            "weight_kg": weight_kg,
            "reps": reps,
            "exercise_name": exercise_name,
        },
    )


def test_sessions_history_empty(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/workouts/sessions/history", headers=headers)
    assert response.status_code == 200
    assert response.json() == []


def test_sessions_history_excludes_active_sessions(client):
    headers = get_auth_headers(client)
    _create_plan_and_start_session(client, headers)  # still active, not completed
    response = client.get("/api/v1/workouts/sessions/history", headers=headers)
    assert response.json() == []


def test_sessions_history_includes_completed_session_with_aggregates(client):
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    _complete_a_set(client, headers, session["id"], "Bench Press", weight_kg=60, reps=10, set_index=0)
    _complete_a_set(client, headers, session["id"], "Bench Press", weight_kg=60, reps=8, set_index=1)
    client.post(f"/api/v1/workouts/sessions/{session['id']}/complete", headers=headers)

    response = client.get("/api/v1/workouts/sessions/history", headers=headers)
    assert response.status_code == 200
    history = response.json()
    assert len(history) == 1
    entry = history[0]
    assert entry["id"] == session["id"]
    assert entry["total_sets"] == 2
    assert entry["total_volume_kg"] == 60 * 10 + 60 * 8
    assert entry["duration_seconds"] is not None


def test_session_detail_not_found_for_session_id_that_does_not_exist(client):
    headers = get_auth_headers(client)
    response = client.get(
        "/api/v1/workouts/sessions/00000000-0000-0000-0000-000000000000/detail", headers=headers
    )
    assert response.status_code == 404


def test_session_detail_not_found_for_other_users_session(client):
    headers_a = get_auth_headers(client, email="a@example.com", username="usera")
    session = _create_plan_and_start_session(client, headers_a)

    headers_b = get_auth_headers(client, email="b@example.com", username="userb")
    response = client.get(f"/api/v1/workouts/sessions/{session['id']}/detail", headers=headers_b)
    assert response.status_code == 404


def test_session_detail_computes_muscle_split(client, db_session):
    _seed_exercise_master(db_session, "לחיצת חזה", "Chest", name_en="Bench Press")
    _seed_exercise_master(db_session, "סקוואט", "Legs", name_en="Squat")

    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    _complete_a_set(client, headers, session["id"], "Bench Press", set_index=0)
    _complete_a_set(client, headers, session["id"], "Bench Press", set_index=1)
    _complete_a_set(client, headers, session["id"], "Squat", exercise_index=1, set_index=0)
    client.post(f"/api/v1/workouts/sessions/{session['id']}/complete", headers=headers)

    response = client.get(f"/api/v1/workouts/sessions/{session['id']}/detail", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_sets"] == 3
    split_by_muscle = {row["muscle_group"]: row["percentage"] for row in data["muscle_split"]}
    assert split_by_muscle["Chest"] == round(2 / 3 * 100, 1)
    assert split_by_muscle["Legs"] == round(1 / 3 * 100, 1)


def test_session_detail_unmapped_exercise_falls_back_to_other(client):
    """A free-text exercise name (e.g. added via LiveWorkout's 'add exercise'
    flow) that doesn't match any exercises_master row must be bucketed as
    'אחר', not dropped or crash the request."""
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    _complete_a_set(client, headers, session["id"], "תרגיל שהמצאתי")
    client.post(f"/api/v1/workouts/sessions/{session['id']}/complete", headers=headers)

    response = client.get(f"/api/v1/workouts/sessions/{session['id']}/detail", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["muscle_split"] == [{"muscle_group": "אחר", "percentage": 100.0}]


def test_session_detail_calories_none_without_profile(client):
    headers = get_auth_headers(client)
    session = _create_plan_and_start_session(client, headers)
    _complete_a_set(client, headers, session["id"], "Bench Press")
    client.post(f"/api/v1/workouts/sessions/{session['id']}/complete", headers=headers)

    response = client.get(f"/api/v1/workouts/sessions/{session['id']}/detail", headers=headers)
    assert response.json()["estimated_calories"] is None


def test_session_detail_calories_computed_with_profile_weight(client, db_session):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/profile",
        headers=headers,
        json={
            "age": 30,
            "gender": "male",
            "height_cm": 180,
            "weight_kg": 80,
            "activity_level": "moderately_active",
            "goal": "muscle_gain",
            "meals_per_day": 4,
        },
    )
    session = _create_plan_and_start_session(client, headers)
    _complete_a_set(client, headers, session["id"], "Bench Press")

    # A real workout has measurable duration; backdate started_at so the
    # session doesn't round down to 0 seconds (which would legitimately
    # yield no calorie estimate, same as a missing duration).
    row = db_session.query(WorkoutSession).filter(WorkoutSession.id == uuid.UUID(session["id"])).first()
    row.started_at = row.started_at - datetime.timedelta(minutes=45)
    db_session.commit()

    client.post(f"/api/v1/workouts/sessions/{session['id']}/complete", headers=headers)

    response = client.get(f"/api/v1/workouts/sessions/{session['id']}/detail", headers=headers)
    assert response.json()["estimated_calories"] is not None
    assert response.json()["estimated_calories"] > 0
