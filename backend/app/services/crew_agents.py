import json
import os
import re
from typing import Optional
from crewai import Agent, Task, Crew, Process
from app.core.config import settings

# Ensure ANTHROPIC_API_KEY is set in the environment for CrewAI/LiteLLM
if settings.ANTHROPIC_API_KEY:
    os.environ["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY

DAYS = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
_DAY_SET = set(DAYS)
_PLAN_DAY_KEYS = ("meal_plan", "workout_plan")

# The LLM occasionally emits syntactically-valid-but-incomplete JSON (e.g. a
# misplaced closing brace that terminates the top-level object right after a
# single day instead of all 7 — observed directly in live testing). Without
# a day-count check, that incomplete result looks just as "valid" as a real
# one, so we retry a few times before giving up.
MAX_PLAN_ATTEMPTS = 3


def _plan_key_with_all_days(d: dict) -> Optional[str]:
    """Return 'meal_plan' or 'workout_plan' if d contains one with exactly the
    7 expected day keys, else None."""
    if not isinstance(d, dict):
        return None
    for key in _PLAN_DAY_KEYS:
        val = d.get(key)
        if isinstance(val, dict) and set(val.keys()) == _DAY_SET:
            return key
    return None


def get_nutrition_agent():
    from crewai import LLM
    llm = LLM(model="anthropic/claude-sonnet-4-6", max_tokens=16000)
    return Agent(
        role="Expert Hebrew Dietitian",
        goal="Build a complete 7-day personalized weekly meal plan in Hebrew as a single JSON object",
        backstory="""אתה תזונאי מומחה עם 15 שנות ניסיון בתזונה ספורטיבית. בנה תפריט שבועי מלא לכל 7 ימי השבוע.
        החזר JSON בלבד בפורמט המבוקש בדיוק — ללא טקסט לפני או אחרי, ללא markdown, ללא ```json.
        התשובה שלך חייבת להיות אובייקט JSON יחיד שמתחיל ב-{ ומסתיים ב-}.
        כל 7 הימים (sunday עד saturday) חייבים להכיל ארוחות מלאות — אסור להחזיר מערכים ריקים.
        השתמש בשמות קצרים למרכיבים ולארוחות כדי לחסוך מקום.""",
        verbose=False,
        allow_delegation=False,
        llm=llm,
    )


def get_workout_agent():
    return Agent(
        role="Professional Hebrew Fitness Coach",
        goal="Build a personalized weekly workout plan in Hebrew as JSON only",
        backstory="""מאמן כושר מוסמך עם התמחות באימוני כוח ואירובי.
        CRITICAL RULE: You MUST return raw JSON only. No markdown, no ```json, no explanation text.
        Your entire response must be a single valid JSON object starting with { and ending with }.""",
        verbose=False,
        allow_delegation=False,
        llm="anthropic/claude-sonnet-4-6",
    )


def get_supervisor_agent():
    return Agent(
        role="Health & Fitness Supervisor",
        goal="Review, combine and finalize nutrition and workout recommendations as JSON only",
        backstory="""מומחה בריאות בכיר שמאחד המלצות תזונה וכושר.
        CRITICAL RULE: You MUST return raw JSON only. No markdown, no ```json, no explanation text.
        Your entire response must be a single valid JSON object starting with { and ending with }.""",
        verbose=False,
        allow_delegation=False,
        llm="anthropic/claude-sonnet-4-6",
    )


def build_nutrition_task(agent, profile: dict, memory: dict) -> Task:
    preferred = memory.get("preferred_foods", [])
    disliked = memory.get("disliked_foods", [])

    meals_per_day = profile.get('meals_per_day', 3)
    meal_types = ["breakfast", "lunch", "dinner", "snack", "pre_workout"][:meals_per_day]

    cal = profile.get('target_calories', 2000)

    # Build a concrete example for each day so the AI sees 7 real entries (compact format)
    days_example = ""
    for i, day in enumerate(DAYS):
        comma = "," if i < len(DAYS) - 1 else ""
        meals_example = ", ".join(
            f'{{"meal_type":"{mt}","name":"שם","items":[{{"name":"מרכיב","qty_g":100,"calories":150,"protein":20,"carbs":15,"fat":5}}],"total_calories":{cal // meals_per_day},"total_protein":35,"total_carbs":40,"total_fat":12}}'
            for mt in meal_types
        )
        days_example += f'    "{day}": [{meals_example}]{comma}\n'

    totals_example = ",\n    ".join(
        f'"{day}": {{"calories": {cal}, "protein": 150, "carbs": 200, "fat": 65}}'
        for day in DAYS
    )

    return Task(
        description=f"""אתה תזונאי מומחה. בנה תפריט שבועי מלא לכל 7 ימי השבוע.
החזר JSON בלבד בפורמט הבא בדיוק — ללא טקסט לפני או אחרי:

פרטי המשתמש:
- גיל: {profile.get('age')}, מין: {profile.get('gender')}
- גובה: {profile.get('height_cm')} ס״מ, משקל: {profile.get('weight_kg')} ק״ג
- יעד קלורי יומי: {cal} קלוריות
- מטרה: {profile.get('goal')}
- אלרגיות: {profile.get('allergies', 'אין')}
- מספר ארוחות ביום: {meals_per_day} ({', '.join(meal_types)})
- מאכלים מועדפים: {', '.join(preferred) if preferred else 'לא צוין'}
- מאכלים לא מועדפים: {', '.join(disliked) if disliked else 'לא צוין'}

כללים מחייבים:
- כל 7 הימים (sunday, monday, tuesday, wednesday, thursday, friday, saturday) חייבים להופיע
- לכל יום בנה {meals_per_day} ארוחות שונות ומגוונות עם מרכיבים אמיתיים בעברית
- לכל ארוחה — עד 3 מרכיבים בלבד (items) כדי לשמור על JSON קומפקטי
- שמות קצרים לארוחות ולמרכיבים (עד 4 מילים)
- אסור מערכים ריקים [] בשום יום
- התחל בדיוק עם {{ וסיים בדיוק עם }}

{{
  "meal_plan": {{
{days_example}  }},
  "daily_totals": {{
    {totals_example}
  }},
  "grocery_list": ["פריט1", "פריט2", "פריט3"]
}}""",
        agent=agent,
        expected_output="JSON object only with meal_plan containing all 7 days (sunday through saturday), each with full meal arrays, plus daily_totals and grocery_list. No text outside the JSON braces.",
    )


def build_workout_task(agent, profile: dict, memory: dict) -> Task:
    preferred_ex = memory.get("preferred_exercises", [])
    skipped_ex = memory.get("skipped_exercises", [])

    return Task(
        description=f"""החזר JSON בלבד. אסור טקסט לפני או אחרי ה-JSON. התחל ישירות עם {{ וסיים עם }}.

בנה תכנית אימונים שבועית מותאמת אישית בעברית עבור המשתמש הבא:
- משקל: {profile.get('weight_kg')} ק״ג
- מטרה: {profile.get('goal')}
- רמת פעילות: {profile.get('activity_level')}
- פציעות: {profile.get('injuries', 'אין')}
- ציוד זמין: {profile.get('equipment', 'ללא ציוד')}
- תרגילים מועדפים: {', '.join(preferred_ex) if preferred_ex else 'לא צוין'}
- תרגילים שנדלגו: {', '.join(skipped_ex) if skipped_ex else 'לא צוין'}

החזר אך ורק את ה-JSON הבא — ללא הסבר, ללא markdown, ללא ```json:
{{
  "workout_plan": {{
    "sunday": {{
      "type": "strength",
      "name": "שם האימון בעברית",
      "exercises": [
        {{
          "name": "שם תרגיל בעברית",
          "muscle_group": "קבוצת שריר",
          "sets": 4,
          "reps": 10,
          "weight_kg": 60,
          "rest_seconds": 90,
          "notes": "הערות"
        }}
      ]
    }},
    "monday": {{"type": "rest", "name": "מנוחה", "exercises": []}},
    "tuesday": {{"type": "strength", "name": "שם האימון", "exercises": []}},
    "wednesday": {{"type": "cardio", "name": "אירובי", "exercises": []}},
    "thursday": {{"type": "strength", "name": "שם האימון", "exercises": []}},
    "friday": {{"type": "rest", "name": "מנוחה", "exercises": []}},
    "saturday": {{"type": "rest", "name": "מנוחה", "exercises": []}}
  }}
}}""",
        agent=agent,
        expected_output="Valid JSON object only. No markdown, no explanation, no code fences. Start with { and end with }.",
    )


def build_supervisor_task(agent, nutrition_result: str, workout_result: str, profile: dict, memory: dict) -> Task:
    rejected_reasons = memory.get("rejected_plan_reasons", [])

    return Task(
        description=f"""החזר JSON בלבד. אסור טקסט לפני או אחרי ה-JSON. התחל ישירות עם {{ וסיים עם }}.

בדוק ואחד את הנתונים הבאים:
- יעד קלוריות: {profile.get('target_calories')}
- פציעות: {profile.get('injuries', 'אין')}
- סיבות דחייה קודמות: {', '.join(rejected_reasons) if rejected_reasons else 'אין'}

תפריט מוצע: {nutrition_result}
תכנית אימונים מוצעת: {workout_result}

החזר אך ורק את ה-JSON הבא עם meal_plan ו-workout_plan המלאים מהנתונים לעיל — ללא הסבר, ללא markdown, ללא ```json:
{{
  "meal_plan": {{}},
  "workout_plan": {{}},
  "daily_totals": {{}},
  "grocery_list": [],
  "summary": "סיכום קצר בעברית",
  "adjustments_made": ["רשימת התאמות שנעשו"]
}}""",
        agent=agent,
        expected_output="Valid JSON object only. No markdown, no explanation, no code fences. Start with { and end with }.",
    )


_PREFERRED_KEYS = {"meal_plan", "workout_plan", "meals", "plan"}


def _json_candidates(text: str) -> list:
    """Collect every plausible top-level JSON object found in text: a direct
    full-text parse, any markdown-fenced blocks, and every complete brace-balanced
    substring (depth-counting). The LLM sometimes emits a misplaced/extra closing
    brace that ends the top-level object early — that still parses as "valid"
    JSON, just an incomplete one — so we can't stop at the first parseable
    candidate; the caller decides which candidate is actually complete."""
    text = str(text).strip()
    candidates = []

    try:
        d = json.loads(text)
        if isinstance(d, dict):
            candidates.append(d)
    except json.JSONDecodeError:
        pass

    for fence in ("```json", "```"):
        if fence in text:
            for part in text.split(fence)[1:]:
                candidate = part.split("```")[0].strip()
                try:
                    d = json.loads(candidate)
                    if isinstance(d, dict):
                        candidates.append(d)
                except json.JSONDecodeError:
                    continue

    for m in re.finditer(r'\{', text):
        start = m.start()
        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    try:
                        d = json.loads(candidate)
                        if isinstance(d, dict):
                            candidates.append(d)
                    except json.JSONDecodeError:
                        pass
                    break

    return candidates


def _extract_json(text: str) -> dict:
    """Extract JSON from text. Prefers a candidate whose plan (meal_plan /
    workout_plan) contains all 7 expected days; falls back to any candidate
    with a preferred top-level key, then the largest candidate found."""
    candidates = _json_candidates(text)
    if not candidates:
        return {"raw_output": str(text).strip(), "error": "Could not parse JSON"}

    for c in candidates:
        if _plan_key_with_all_days(c):
            return c

    for c in candidates:
        if _PREFERRED_KEYS & set(c.keys()):
            return c

    return max(candidates, key=lambda c: len(str(c)))


def _kickoff_and_extract(crew) -> dict:
    """Kick off a crew and extract JSON from the full raw output. Returns
    immediately on the first source that yields a complete 7-day plan; only
    falls back to a partial result (for the retry wrapper to catch) if none do."""
    result = crew.kickoff()

    candidates_text = []
    raw_attr = getattr(result, 'raw', None)
    if raw_attr:
        candidates_text.append(raw_attr)

    tasks_output = getattr(result, 'tasks_output', None)
    if tasks_output:
        for t in tasks_output:
            t_raw = getattr(t, 'raw', None)
            if t_raw:
                candidates_text.append(t_raw)

    if not candidates_text:
        candidates_text.append(str(result))

    best = None
    for text in candidates_text:
        parsed = _extract_json(text)
        if _plan_key_with_all_days(parsed):
            return parsed
        if parsed.get('meal_plan') or parsed.get('workout_plan'):
            if best is None or len(str(parsed)) > len(str(best)):
                best = parsed

    return best or {"error": "no output"}


def _run_crew_with_retry(build_agent_and_task, plan_key: str, label: str) -> dict:
    """Run a fresh agent+task+crew up to MAX_PLAN_ATTEMPTS times, retrying whenever
    the result doesn't contain a full 7-day plan under `plan_key`. Each attempt is
    an independent LLM call (rebuilt from scratch) — the failure mode is a flaky
    LLM formatting slip, not a deterministic one, so a fresh attempt is expected
    to have a good chance of succeeding even when the prior one didn't."""
    last_result = {"error": "no output"}
    for attempt in range(1, MAX_PLAN_ATTEMPTS + 1):
        agent, task = build_agent_and_task()
        crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
        last_result = _kickoff_and_extract(crew)

        if _plan_key_with_all_days(last_result) == plan_key:
            if attempt > 1:
                print(f"[crew_agents] {label}: got a complete 7-day plan on attempt {attempt}/{MAX_PLAN_ATTEMPTS}")
            return last_result

        found_days = None
        plan_val = last_result.get(plan_key)
        if isinstance(plan_val, dict):
            found_days = sorted(plan_val.keys())
        print(
            f"[crew_agents] WARNING: {label} attempt {attempt}/{MAX_PLAN_ATTEMPTS} did not return a "
            f"complete 7-day '{plan_key}' (days found: {found_days}, top-level keys: {list(last_result.keys())})"
            + (" — retrying" if attempt < MAX_PLAN_ATTEMPTS else " — giving up, returning best-effort result")
        )

    return last_result


async def run_nutrition_crew(profile: dict, memory: dict) -> dict:
    """Run only the nutrition agent, retrying on an incomplete (not-7-day) plan."""
    def build():
        agent = get_nutrition_agent()
        return agent, build_nutrition_task(agent, profile, memory)

    return _run_crew_with_retry(build, "meal_plan", "nutrition crew")


async def run_workout_crew(profile: dict, memory: dict) -> dict:
    """Run only the workout agent, retrying on an incomplete (not-7-day) plan."""
    def build():
        agent = get_workout_agent()
        return agent, build_workout_task(agent, profile, memory)

    return _run_crew_with_retry(build, "workout_plan", "workout crew")


async def run_full_crew(profile: dict, memory: dict) -> dict:
    """Run nutrition + workout agents (each independently retried), then merge results."""
    nutrition_result = await run_nutrition_crew(profile, memory)
    workout_result = await run_workout_crew(profile, memory)

    # Merge both results into one payload
    merged = {}
    if "meal_plan" in nutrition_result:
        merged["meal_plan"] = nutrition_result["meal_plan"]
    if "daily_totals" in nutrition_result:
        merged["daily_totals"] = nutrition_result["daily_totals"]
    if "grocery_list" in nutrition_result:
        merged["grocery_list"] = nutrition_result["grocery_list"]
    if "workout_plan" in workout_result:
        merged["workout_plan"] = workout_result["workout_plan"]

    if not merged:
        merged = {"error": "Both agents failed", "nutrition": nutrition_result, "workout": workout_result}

    return merged
