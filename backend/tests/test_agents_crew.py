"""Regression tests for the CrewAI 7-day plan validation/retry logic in
app.services.crew_agents. All LLM calls are mocked via Crew.kickoff — no real
Anthropic API requests happen here (cost, latency, non-determinism)."""
import asyncio
import json
import uuid

from app.models.fitness import ExerciseMaster
from app.services import crew_agents
from tests.conftest import TestingSessionLocal

DAYS = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")


class FakeCrewResult:
    def __init__(self, raw):
        self.raw = raw
        self.tasks_output = None


def make_fake_crew_class(kickoff_fn):
    """Build a stand-in for crewai.Crew that skips crewai's own pydantic
    validation of agents/tasks entirely — the retry/JSON-extraction logic
    under test doesn't depend on real Agent/Task objects, only on what
    kickoff() returns."""

    class FakeCrew:
        def __init__(self, agents=None, tasks=None, process=None, verbose=False):
            self.agents = agents
            self.tasks = tasks

        def kickoff(self):
            return kickoff_fn()

    return FakeCrew


def full_week_json(plan_key="meal_plan"):
    return json.dumps({plan_key: {day: {"meals": []} for day in DAYS}})


def partial_week_json(plan_key="meal_plan", num_days=1):
    return json.dumps({plan_key: {day: {"meals": []} for day in DAYS[:num_days]}})


def test_plan_key_with_all_days_accepts_complete_week():
    full = json.loads(full_week_json())
    assert crew_agents._plan_key_with_all_days(full) == "meal_plan"


def test_plan_key_with_all_days_rejects_partial_week():
    partial = json.loads(partial_week_json(num_days=1))
    assert crew_agents._plan_key_with_all_days(partial) is None


def test_incomplete_plan_keys_flags_no_plan_generated_when_no_plan_key_present():
    """Total generation failure — neither meal_plan nor workout_plan at all
    (e.g. the {"error": "no output"} fallback) — must be distinguished from a
    partial plan via the NO_PLAN_GENERATED sentinel."""
    assert crew_agents.incomplete_plan_keys({"error": "no output"}) == [crew_agents.NO_PLAN_GENERATED]


def test_incomplete_plan_keys_flags_no_plan_generated_for_non_dict_content():
    assert crew_agents.incomplete_plan_keys("not a dict") == [crew_agents.NO_PLAN_GENERATED]
    assert crew_agents.incomplete_plan_keys(None) == [crew_agents.NO_PLAN_GENERATED]


def test_incomplete_plan_keys_still_flags_partial_plan_by_name():
    """Existing behaviour must be unchanged: a plan key that IS present but
    incomplete is flagged by its own name, not the no-plan sentinel."""
    partial = json.loads(partial_week_json(num_days=1))
    assert crew_agents.incomplete_plan_keys(partial) == ["meal_plan"]


def test_incomplete_plan_keys_empty_for_complete_plan():
    full = json.loads(full_week_json())
    assert crew_agents.incomplete_plan_keys(full) == []


def _mock_judge_always_valid(monkeypatch):
    """The judge (_judge_plan) makes a real LLM call — every test of the
    structural retry/completeness logic mocks it to always pass, so these
    tests stay fast/free/deterministic and only exercise the logic under
    test. Judge-specific behaviour is covered separately below."""
    monkeypatch.setattr(crew_agents, "_judge_plan", lambda plan_key, plan_value, profile: (True, "mocked"))


def test_run_crew_with_retry_succeeds_on_first_attempt(monkeypatch):
    monkeypatch.setattr(
        crew_agents, "Crew", make_fake_crew_class(lambda: FakeCrewResult(full_week_json()))
    )
    _mock_judge_always_valid(monkeypatch)

    calls = {"n": 0}

    def build():
        calls["n"] += 1
        return object(), object()

    result = crew_agents._run_crew_with_retry(build, "meal_plan", "test", {})
    assert crew_agents._plan_key_with_all_days(result) == "meal_plan"
    assert calls["n"] == 1


def test_run_crew_with_retry_retries_after_incomplete_plan(monkeypatch):
    """This is the regression case for the '1 day instead of 7' CrewAI bug:
    the first attempt returns an incomplete plan, and the retry wrapper must
    not accept it silently — it should try again and succeed on attempt 2."""
    attempts = {"n": 0}

    def fake_kickoff():
        attempts["n"] += 1
        if attempts["n"] == 1:
            return FakeCrewResult(partial_week_json(num_days=1))
        return FakeCrewResult(full_week_json())

    monkeypatch.setattr(crew_agents, "Crew", make_fake_crew_class(fake_kickoff))
    _mock_judge_always_valid(monkeypatch)

    def build():
        return object(), object()

    result = crew_agents._run_crew_with_retry(build, "meal_plan", "test", {})
    assert crew_agents._plan_key_with_all_days(result) == "meal_plan"
    assert attempts["n"] == 2


def test_run_crew_with_retry_gives_up_after_max_attempts(monkeypatch):
    """If every attempt returns an incomplete plan, the wrapper must give up
    after MAX_PLAN_ATTEMPTS and return the best-effort partial result — it
    must NOT report success (this is what silently corrupted plans before)."""
    monkeypatch.setattr(
        crew_agents, "Crew", make_fake_crew_class(lambda: FakeCrewResult(partial_week_json(num_days=1)))
    )
    _mock_judge_always_valid(monkeypatch)

    def build():
        return object(), object()

    result = crew_agents._run_crew_with_retry(build, "meal_plan", "test", {})
    assert crew_agents._plan_key_with_all_days(result) != "meal_plan"
    assert "meal_plan" in result
    assert sorted(result["meal_plan"].keys()) == ["sunday"]


def test_run_crew_with_retry_retries_after_judge_rejects_structurally_complete_plan(monkeypatch):
    """The judge is a second, independent gate: a structurally-complete plan
    (all 7 days present) must still be retried if the judge rejects it as not
    actually sane content — this is the whole point of adding the judge on
    top of the structural check."""
    monkeypatch.setattr(
        crew_agents, "Crew", make_fake_crew_class(lambda: FakeCrewResult(full_week_json()))
    )
    judge_calls = {"n": 0}

    def fake_judge(plan_key, plan_value, profile):
        judge_calls["n"] += 1
        return (judge_calls["n"] >= 2), "second opinion" if judge_calls["n"] >= 2 else "looks like placeholder content"

    monkeypatch.setattr(crew_agents, "_judge_plan", fake_judge)

    def build():
        return object(), object()

    result = crew_agents._run_crew_with_retry(build, "meal_plan", "test", {})
    assert crew_agents._plan_key_with_all_days(result) == "meal_plan"
    assert judge_calls["n"] == 2


def test_run_crew_with_retry_gives_up_after_judge_rejects_every_attempt(monkeypatch):
    """If the judge rejects every attempt, the final result must look like a
    total generation failure ({"error": ...}, no plan_key) — NOT the
    judge-rejected plan content — so incomplete_plan_keys() treats it as
    NO_PLAN_GENERATED at the approve boundary instead of silently allowing a
    judge-rejected plan to be saved."""
    monkeypatch.setattr(
        crew_agents, "Crew", make_fake_crew_class(lambda: FakeCrewResult(full_week_json()))
    )
    monkeypatch.setattr(crew_agents, "_judge_plan", lambda plan_key, plan_value, profile: (False, "nonsensical content"))

    def build():
        return object(), object()

    result = crew_agents._run_crew_with_retry(build, "meal_plan", "test", {})
    assert "meal_plan" not in result
    assert result.get("judge_rejected") is True
    assert result["judge_reason"] == "nonsensical content"
    assert crew_agents.incomplete_plan_keys(result) == [crew_agents.NO_PLAN_GENERATED]


def test_judge_plan_fails_open_when_llm_call_raises(monkeypatch):
    """A judge-call failure (API error, timeout, etc.) must never itself
    become a new source of rejected plans — it fails open (treated as
    valid), so only a real judge-returned verdict of false counts."""

    class ExplodingLLM:
        def __init__(self, model, max_tokens):
            pass

        def call(self, prompt):
            raise RuntimeError("simulated API error")

    monkeypatch.setattr("crewai.LLM", ExplodingLLM)

    valid, reason = crew_agents._judge_plan("meal_plan", {"sunday": {}}, {"goal": "muscle_gain"})
    assert valid is True
    assert "failing open" in reason


def test_judge_plan_fails_open_when_response_unparseable(monkeypatch):
    class UnparseableLLM:
        def __init__(self, model, max_tokens):
            pass

        def call(self, prompt):
            return "not json at all, sorry"

    monkeypatch.setattr("crewai.LLM", UnparseableLLM)

    valid, reason = crew_agents._judge_plan("meal_plan", {"sunday": {}}, {"goal": "muscle_gain"})
    assert valid is True
    assert "failing open" in reason


def test_judge_plan_rejects_when_llm_returns_valid_false(monkeypatch):
    """Sanity check for the deliberately-nonsensical-plan scenario: a
    structurally valid but semantically bad plan (e.g. every day identical
    empty placeholder text) should get a real {"valid": false} verdict from
    the judge, not fail open."""

    class RejectingLLM:
        def __init__(self, model, max_tokens):
            pass

        def call(self, prompt):
            return '{"valid": false, "reason": "כל הימים ריקים לחלוטין, אין תוכן אמיתי"}'

    monkeypatch.setattr("crewai.LLM", RejectingLLM)

    nonsensical_plan = {day: {"exercises": []} for day in DAYS}
    valid, reason = crew_agents._judge_plan("workout_plan", nonsensical_plan, {"goal": "muscle_gain", "equipment": "dumbbells"})
    assert valid is False
    assert "ריקים" in reason


def test_run_nutrition_crew_end_to_end_returns_full_week(monkeypatch):
    monkeypatch.setattr(crew_agents, "Crew", make_fake_crew_class(lambda: FakeCrewResult(full_week_json())))
    monkeypatch.setattr(crew_agents, "get_nutrition_agent", lambda: object())
    monkeypatch.setattr(crew_agents, "build_nutrition_task", lambda agent, profile, memory: object())
    # This test only exercises the structural retry/wiring path -- the fake
    # {"meals": []} placeholder shape doesn't need to pass the (separately
    # tested below) value/schema guardrail.
    monkeypatch.setattr(crew_agents, "validate_nutrition_plan_guardrails", lambda result: [])
    _mock_judge_always_valid(monkeypatch)

    result = asyncio.run(crew_agents.run_nutrition_crew({}, {}))
    assert sorted(result["meal_plan"].keys()) == sorted(DAYS)


def test_run_workout_crew_end_to_end_returns_full_week(monkeypatch, db_session):
    # run_workout_crew now computes allowed_exercises/allowed_names up front
    # via get_canonical_exercises(), which opens its own SessionLocal() --
    # must be repointed at the in-memory test DB like the other DB-touching
    # tests in this file (db_session fixture also ensures the tables exist),
    # or it would try to reach real staging Postgres.
    monkeypatch.setattr(crew_agents, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        crew_agents,
        "Crew",
        make_fake_crew_class(lambda: FakeCrewResult(full_week_json(plan_key="workout_plan"))),
    )
    monkeypatch.setattr(crew_agents, "get_workout_agent", lambda: object())
    monkeypatch.setattr(crew_agents, "build_workout_task", lambda agent, profile, memory, allowed_exercises: object())
    # Same rationale as the nutrition test above: the {"meals": []} fake
    # shape isn't real workout content, so the guardrail (tested separately
    # below) is bypassed here to keep this test's scope to structural wiring.
    monkeypatch.setattr(crew_agents, "validate_workout_plan_guardrails", lambda result, allowed_names: [])
    _mock_judge_always_valid(monkeypatch)

    result = asyncio.run(crew_agents.run_workout_crew({}, {}))
    assert sorted(result["workout_plan"].keys()) == sorted(DAYS)


def test_extract_json_prefers_candidate_with_all_days():
    text = (
        "some preamble text "
        + partial_week_json(num_days=1)
        + " noise "
        + full_week_json()
    )
    extracted = crew_agents._extract_json(text)
    assert crew_agents._plan_key_with_all_days(extracted) == "meal_plan"


def test_extract_json_handles_unparseable_text():
    extracted = crew_agents._extract_json("not json at all")
    assert extracted["error"] == "Could not parse JSON"


# ─── Hebrew/English equipment vocabulary mismatch (regression) ────────────
# UserProfile.equipment stores the Hebrew label the user actually clicked in
# Profile.jsx's fixed EQUIPMENT_OPTIONS checkboxes; exercises_master.equipment
# uses an unrelated English vocabulary (barbell/dumbbell/machine/...).
# Without translation, _filter_exercises_by_equipment() never matched a
# Hebrew value against its English equivalent and silently fell back to
# bodyweight-only exercises for every user with real (Hebrew) equipment.

def test_parse_equipment_translates_dumbbells_hebrew_to_english_token():
    assert crew_agents._parse_equipment('["משקולות"]') == {"dumbbell"}


def test_parse_equipment_translates_bar_plus_dumbbells_to_both_english_tokens():
    assert crew_agents._parse_equipment('["מוט + משקולות"]') == {"barbell", "dumbbell"}


def test_parse_equipment_translates_trx_case_insensitively():
    assert crew_agents._parse_equipment('["TRX"]') == {"suspension_band"}
    assert crew_agents._parse_equipment('["trx"]') == {"suspension_band"}


def test_parse_equipment_translates_gym_machines_to_machine_token():
    assert crew_agents._parse_equipment('["מכשירי חדר כושר"]') == {"machine"}


def test_parse_equipment_combines_multiple_hebrew_values():
    assert crew_agents._parse_equipment(
        '["משקולות", "מוט + משקולות", "שחייה"]'
    ) == {"dumbbell", "barbell", "שחייה"}


def test_parse_equipment_leaves_unmapped_hebrew_values_as_is():
    """"אופניים"/"שחייה" (bike/swimming) have no corresponding token in
    exercises_master's strength-equipment vocabulary — left untranslated is
    a no-op (matches nothing, same as before this fix), not a regression."""
    assert crew_agents._parse_equipment('["אופניים"]') == {"אופניים"}
    assert crew_agents._parse_equipment('["שחייה"]') == {"שחייה"}


def test_parse_equipment_no_equipment_returns_empty_set():
    assert crew_agents._parse_equipment(None) == set()
    assert crew_agents._parse_equipment('[]') == set()


def test_filter_exercises_by_hebrew_equipment_matches_english_tagged_exercises(monkeypatch, db_session):
    """End-to-end for the actual bug: a real ExerciseMaster row tagged with
    the English 'dumbbell' token must be reachable by a user whose profile
    equipment is the Hebrew "משקולות" — this is exactly what silently failed
    (fell back to bodyweight-only) before the translation fix."""
    monkeypatch.setattr(crew_agents, "SessionLocal", TestingSessionLocal)

    def _seed(name_he, equipment):
        ex = ExerciseMaster(
            id=uuid.uuid4(),
            canonical_name_he=name_he,
            canonical_name_en=name_he,
            category="test",
            muscle_group_primary="Test",
            equipment=equipment,
            aliases=[],
            is_active=True,
        )
        db_session.add(ex)

    _seed("שכיבות סמיכה", "none")
    _seed("לחיצת חזה עם משקולות", "dumbbell")
    _seed("סקוואט עם מוט", "barbell")
    _seed("לחיצת רגליים במכונה", "machine")
    db_session.commit()

    equipment = crew_agents._parse_equipment('["משקולות"]')
    allowed = crew_agents._filter_exercises_by_equipment(
        crew_agents.get_canonical_exercises(), equipment
    )
    allowed_names = {ex["name_he"] for ex in allowed}

    assert "לחיצת חזה עם משקולות" in allowed_names  # dumbbell — the actual bug
    assert "שכיבות סמיכה" in allowed_names  # none/bodyweight — always allowed
    assert "סקוואט עם מוט" not in allowed_names  # barbell — user didn't list it
    assert "לחיצת רגליים במכונה" not in allowed_names  # machine — user didn't list it


def test_filter_exercises_by_gym_machines_equipment_opts_in_to_machine_exercises(monkeypatch, db_session):
    """Follow-up to the Hebrew equipment mapping fix: exercises_master's
    largest single category ("machine", 136/388 exercises) had no
    corresponding Profile.jsx checkbox at all, so no user could ever reach
    it. Confirms the new "מכשירי חדר כושר" option (a) unlocks machine-tagged
    exercises when selected, and (b) is a pure opt-in — a profile that
    doesn't have it set (the default for every existing user, no migration)
    must NOT gain access to machine exercises, i.e. no retroactive
    behavior change for users who haven't touched their profile since this
    was added."""
    monkeypatch.setattr(crew_agents, "SessionLocal", TestingSessionLocal)

    def _seed(name_he, equipment):
        ex = ExerciseMaster(
            id=uuid.uuid4(),
            canonical_name_he=name_he,
            canonical_name_en=name_he,
            category="test",
            muscle_group_primary="Test",
            equipment=equipment,
            aliases=[],
            is_active=True,
        )
        db_session.add(ex)

    _seed("שכיבות סמיכה", "none")
    _seed("לחיצת רגליים במכונה", "machine")
    db_session.commit()

    exercises = crew_agents.get_canonical_exercises()

    # Opted in: machine exercises now reachable.
    equipment_with_machines = crew_agents._parse_equipment('["מכשירי חדר כושר"]')
    allowed_with_machines = {
        ex["name_he"] for ex in crew_agents._filter_exercises_by_equipment(exercises, equipment_with_machines)
    }
    assert "לחיצת רגליים במכונה" in allowed_with_machines
    assert "שכיבות סמיכה" in allowed_with_machines  # bodyweight always allowed too

    # Not opted in (e.g. existing user with equipment=None/unset, or any
    # profile that simply didn't pick this new option): machine exercises
    # must NOT appear — no retroactive assumption of gym access.
    equipment_without_machines = crew_agents._parse_equipment('["משקולות"]')
    allowed_without_machines = {
        ex["name_he"] for ex in crew_agents._filter_exercises_by_equipment(exercises, equipment_without_machines)
    }
    assert "לחיצת רגליים במכונה" not in allowed_without_machines

    # Existing user with no equipment set at all (None) — the actual default
    # for every profile that predates this change. This is pre-existing,
    # unrelated behavior this fix does not touch: _filter_exercises_by_
    # equipment's documented "no equipment listed -> don't restrict" rule
    # already returned the full unfiltered list (including machine) before
    # this change, and still does — confirming this specific case's result
    # is identical, not newly "unlocked" by adding the checkbox.
    equipment_unset = crew_agents._parse_equipment(None)
    allowed_unset = {
        ex["name_he"] for ex in crew_agents._filter_exercises_by_equipment(exercises, equipment_unset)
    }
    assert allowed_unset == {"שכיבות סמיכה", "לחיצת רגליים במכונה"}  # unchanged: "no restriction" fallback, pre-existing


# ─── Output guardrails (deterministic schema/value/constraint checks) ─────
# Regression coverage for the 9.8.2026 fix: the workout agent was observed
# generating cut-off/impossible-value/wrong-equipment plans repeatedly, and
# the retry loop had no deterministic check to catch that before the (fail-
# open, semantic-only) judge -- see validate_workout_plan_guardrails /
# validate_nutrition_plan_guardrails / _run_crew_with_retry's extra_validator
# param in crew_agents.py.

def sane_workout_plan():
    return {
        "workout_plan": {
            "sunday": {"type": "strength", "name": "פלג גוף עליון", "exercises": [
                {"name": "לחיצת חזה", "muscle_group": "חזה", "sets": 4, "reps": 10, "weight_kg": 60, "rest_seconds": 90, "notes": ""},
            ]},
            "monday": {"type": "rest", "name": "מנוחה", "exercises": []},
            "tuesday": {"type": "strength", "name": "פלג גוף תחתון", "exercises": [
                {"name": "סקוואט", "muscle_group": "רגליים", "sets": 4, "reps": 8, "weight_kg": 80, "rest_seconds": 120, "notes": ""},
            ]},
            "wednesday": {"type": "cardio", "name": "אירובי", "exercises": [
                {"name": "ריצה", "muscle_group": "לב-ריאה", "sets": 1, "reps": 1, "weight_kg": 0, "rest_seconds": 0, "notes": ""},
            ]},
            "thursday": {"type": "strength", "name": "גב", "exercises": [
                {"name": "מתח שלילי", "muscle_group": "גב", "sets": 3, "reps": 8, "weight_kg": 0, "rest_seconds": 90, "notes": ""},
            ]},
            "friday": {"type": "rest", "name": "מנוחה", "exercises": []},
            "saturday": {"type": "rest", "name": "מנוחה", "exercises": []},
        }
    }


_ALLOWED_WORKOUT_NAMES = {"לחיצת חזה", "סקוואט", "ריצה", "מתח שלילי"}


def test_validate_workout_plan_guardrails_accepts_sane_plan():
    assert crew_agents.validate_workout_plan_guardrails(sane_workout_plan(), _ALLOWED_WORKOUT_NAMES) == []


def test_validate_workout_plan_guardrails_allows_weight_kg_zero_for_bodyweight_exercise():
    """Regression for the false-positive the judge used to raise on
    weight_kg: 0 for bodyweight moves like negative pull-ups (see the judge
    prompt clarification in _judge_plan) -- the deterministic guardrail must
    never flag 0 as out of range; 0-500 is the accepted range."""
    violations = crew_agents.validate_workout_plan_guardrails(sane_workout_plan(), _ALLOWED_WORKOUT_NAMES)
    assert not any("מתח שלילי" in v and "weight_kg" in v for v in violations)


def test_validate_workout_plan_guardrails_rejects_zero_sets():
    plan = sane_workout_plan()
    plan["workout_plan"]["sunday"]["exercises"][0]["sets"] = 0
    violations = crew_agents.validate_workout_plan_guardrails(plan, _ALLOWED_WORKOUT_NAMES)
    assert any("sets" in v for v in violations)


def test_validate_workout_plan_guardrails_rejects_unlisted_exercise_name():
    """This is what turns validate_workout_exercises() (pre-existing,
    observation-only, never rejects) into actual enforcement -- an
    equipment-violating/invented name now fails the guardrail and triggers
    a retry instead of only being logged."""
    plan = sane_workout_plan()
    plan["workout_plan"]["sunday"]["exercises"][0]["name"] = "תרגיל מומצא"
    violations = crew_agents.validate_workout_plan_guardrails(plan, _ALLOWED_WORKOUT_NAMES)
    assert any("תרגיל מומצא" in v for v in violations)


def test_validate_workout_plan_guardrails_ignores_equipment_check_when_allowed_names_empty():
    """An empty allowed_names set means "don't restrict" (mirrors
    _filter_exercises_by_equipment's own no-equipment-listed behaviour), not
    "reject everything"."""
    plan = sane_workout_plan()
    plan["workout_plan"]["sunday"]["exercises"][0]["name"] = "תרגיל כלשהו"
    assert crew_agents.validate_workout_plan_guardrails(plan, set()) == []


def test_validate_workout_plan_guardrails_rejects_empty_exercises_on_strength_day():
    plan = sane_workout_plan()
    plan["workout_plan"]["sunday"]["exercises"] = []
    violations = crew_agents.validate_workout_plan_guardrails(plan, _ALLOWED_WORKOUT_NAMES)
    assert any("sunday" in v and "בלי אף תרגיל" in v for v in violations)


def test_validate_workout_plan_guardrails_allows_empty_exercises_on_rest_day():
    violations = crew_agents.validate_workout_plan_guardrails(sane_workout_plan(), _ALLOWED_WORKOUT_NAMES)
    assert not any("monday" in v for v in violations)


def test_validate_workout_plan_guardrails_missing_plan_key():
    assert crew_agents.validate_workout_plan_guardrails({"error": "no output"}, set()) != []


def sane_nutrition_plan():
    meal = {
        "meal_type": "breakfast", "name": "ארוחת בוקר",
        "items": [{"name": "ביצים", "qty_g": 100, "calories": 150, "protein": 12, "carbs": 1, "fat": 10}],
        "total_calories": 150, "total_protein": 12, "total_carbs": 1, "total_fat": 10,
    }
    return {"meal_plan": {day: [dict(meal, items=[dict(meal["items"][0])])] for day in DAYS}}


def test_validate_nutrition_plan_guardrails_accepts_sane_plan():
    assert crew_agents.validate_nutrition_plan_guardrails(sane_nutrition_plan()) == []


def test_validate_nutrition_plan_guardrails_rejects_out_of_range_calories():
    plan = sane_nutrition_plan()
    plan["meal_plan"]["sunday"][0]["items"][0]["calories"] = 9000
    violations = crew_agents.validate_nutrition_plan_guardrails(plan)
    assert any("calories" in v for v in violations)


def test_validate_nutrition_plan_guardrails_rejects_empty_meals_for_a_day():
    plan = sane_nutrition_plan()
    plan["meal_plan"]["sunday"] = []
    violations = crew_agents.validate_nutrition_plan_guardrails(plan)
    assert any("sunday" in v for v in violations)


def test_validate_nutrition_plan_guardrails_missing_plan_key():
    assert crew_agents.validate_nutrition_plan_guardrails({"error": "no output"}) != []


def test_run_crew_with_retry_retries_after_guardrail_violation(monkeypatch):
    attempts = {"n": 0}

    def fake_kickoff():
        attempts["n"] += 1
        return FakeCrewResult(full_week_json(plan_key="workout_plan"))

    monkeypatch.setattr(crew_agents, "Crew", make_fake_crew_class(fake_kickoff))
    _mock_judge_always_valid(monkeypatch)

    def validator(result):
        return [] if attempts["n"] >= 2 else ["forced violation"]

    def build():
        return object(), object()

    result = crew_agents._run_crew_with_retry(build, "workout_plan", "test", {}, extra_validator=validator)
    assert crew_agents._plan_key_with_all_days(result) == "workout_plan"
    assert attempts["n"] == 2


def test_run_crew_with_retry_gives_up_after_guardrail_rejects_every_attempt(monkeypatch):
    """Final-exhaustion shape must match the judge-rejection shape
    (guardrail_rejected/guardrail_reasons alongside the existing
    judge_rejected/judge_reason), and the guardrail must be checked BEFORE
    the (paid) judge call -- an attempt that's already deterministically
    broken must never waste an extra LLM call on the judge."""
    monkeypatch.setattr(
        crew_agents, "Crew", make_fake_crew_class(lambda: FakeCrewResult(full_week_json(plan_key="workout_plan")))
    )
    judge_calls = {"n": 0}

    def fake_judge(plan_key, plan_value, profile):
        judge_calls["n"] += 1
        return True, "mocked"

    monkeypatch.setattr(crew_agents, "_judge_plan", fake_judge)

    def build():
        return object(), object()

    result = crew_agents._run_crew_with_retry(
        build, "workout_plan", "test", {}, extra_validator=lambda r: ["always broken"]
    )
    assert "workout_plan" not in result
    assert result.get("guardrail_rejected") is True
    assert result["guardrail_reasons"] == ["always broken"]
    assert judge_calls["n"] == 0
