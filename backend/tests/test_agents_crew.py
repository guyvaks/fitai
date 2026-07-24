"""Regression tests for the CrewAI 7-day plan validation/retry logic in
app.services.crew_agents. All LLM calls are mocked via Crew.kickoff — no real
Anthropic API requests happen here (cost, latency, non-determinism)."""
import asyncio
import json

from app.services import crew_agents

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
    _mock_judge_always_valid(monkeypatch)

    result = asyncio.run(crew_agents.run_nutrition_crew({}, {}))
    assert sorted(result["meal_plan"].keys()) == sorted(DAYS)


def test_run_workout_crew_end_to_end_returns_full_week(monkeypatch):
    monkeypatch.setattr(
        crew_agents,
        "Crew",
        make_fake_crew_class(lambda: FakeCrewResult(full_week_json(plan_key="workout_plan"))),
    )
    monkeypatch.setattr(crew_agents, "get_workout_agent", lambda: object())
    monkeypatch.setattr(crew_agents, "build_workout_task", lambda agent, profile, memory: object())
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
