import json
import os
import re
from typing import Callable, Optional
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.fitness import ExerciseMaster
# app.core.config must load before crewai: importing crewai pulls in litellm,
# which runs its own load_dotenv() on import and can plant .env's placeholder
# ANTHROPIC_API_KEY in os.environ before pydantic-settings reads .env.local.
from crewai import Agent, Task, Crew, Process

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


# Sentinel returned by incomplete_plan_keys() when neither meal_plan nor
# workout_plan is present at all (total generation failure, e.g. the
# {"error": "no output"} fallback in _kickoff_and_extract) — distinct from a
# partial plan (a real key present but missing some days) so callers can
# surface a different, more accurate message for each case.
NO_PLAN_GENERATED = "no_plan_generated"


def incomplete_plan_keys(content: dict) -> list:
    """Which of 'meal_plan'/'workout_plan' are present in content but not a
    complete 7-day dict. Used at the approve-suggestion boundary to catch a
    plan _run_crew_with_retry gave up on (see MAX_PLAN_ATTEMPTS above) before
    it's saved — that function intentionally returns its best-effort partial
    result instead of raising, so callers that persist the result must check
    completeness themselves. Checks every key present independently, so a
    merged run_full_crew result with one complete plan and one partial one
    still gets flagged.

    Returns [NO_PLAN_GENERATED] (and only that) when neither plan key is
    present at all — a total generation failure, not a partial one."""
    if not isinstance(content, dict) or not any(key in content for key in _PLAN_DAY_KEYS):
        return [NO_PLAN_GENERATED]
    incomplete = []
    for key in _PLAN_DAY_KEYS:
        if key not in content:
            continue
        val = content[key]
        if not (isinstance(val, dict) and set(val.keys()) == _DAY_SET):
            incomplete.append(key)
    return incomplete


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
    from crewai import LLM
    # Explicit max_tokens (was a bare model-name string with no override,
    # unlike get_nutrition_agent() below) -- a full 7-day plan with several
    # exercises per day was observed getting cut off mid-week under the
    # implicit default ceiling. Matches nutrition's existing 16000.
    llm = LLM(model="anthropic/claude-sonnet-4-6", max_tokens=16000)
    return Agent(
        role="Professional Hebrew Fitness Coach",
        goal="Build a personalized weekly workout plan in Hebrew as JSON only",
        backstory="""מאמן כושר מוסמך עם התמחות באימוני כוח ואירובי.
        CRITICAL RULE: You MUST return raw JSON only. No markdown, no ```json, no explanation text.
        Your entire response must be a single valid JSON object starting with { and ending with }.""",
        verbose=False,
        allow_delegation=False,
        llm=llm,
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

    # Pre-computed single-sentence hint (avg satiety over the user's last 7
    # logged meals) -- see _build_profile_dict/build_satiety_hint. Omitted
    # entirely when there's not enough rated-meal history, same pattern as
    # rest_hint in build_workout_task. Never raw per-meal data.
    satiety_hint_text = profile.get("satiety_hint")
    satiety_hint = f"- {satiety_hint_text}\n" if satiety_hint_text else ""

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
{satiety_hint}
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


_NUTRITION_MEAL_FIELD_SPECS = {
    "total_calories": (0, 3000),
    "total_protein": (0, 300),
    "total_carbs": (0, 500),
    "total_fat": (0, 300),
}
_NUTRITION_ITEM_FIELD_SPECS = {
    "qty_g": (0, 2000),
    "calories": (0, 2000),
    "protein": (0, 300),
    "carbs": (0, 300),
    "fat": (0, 300),
}


def validate_nutrition_plan_guardrails(result: dict) -> list:
    """Deterministic schema + sane-value guardrail for a meal_plan, run inside
    the retry loop (before the paid judge call). Unlike workout, nutrition has
    no "rest day" concept and no closed equipment-style catalog to constrain
    against (food_master is only a lookup fallback in the calorie calculator,
    not a name list fed into this prompt) -- so this checks structure/values
    only, not a membership constraint. Empty return means the plan passed."""
    plan = result.get("meal_plan")
    if not isinstance(plan, dict):
        return ["meal_plan חסר או אינו אובייקט"]

    violations = []
    for day, meals in plan.items():
        if day not in _DAY_SET:
            continue
        if not isinstance(meals, list) or not meals:
            violations.append(f"{day}: meals חסר/ריק")
            continue
        for meal in meals:
            if not isinstance(meal, dict):
                violations.append(f"{day}: ארוחה שאינה אובייקט")
                continue
            meal_label = meal.get("name") or meal.get("meal_type") or "?"
            violations.extend(
                f"{day}/{meal_label}: {v}" for v in _validate_numeric_fields(meal, _NUTRITION_MEAL_FIELD_SPECS)
            )
            items = meal.get("items")
            if not isinstance(items, list) or not items:
                violations.append(f"{day}/{meal_label}: items חסר/ריק")
                continue
            for item in items:
                if not isinstance(item, dict):
                    violations.append(f"{day}/{meal_label}: מרכיב שאינו אובייקט")
                    continue
                item_label = item.get("name", "?")
                violations.extend(
                    f"{day}/{meal_label}/{item_label}: {v}"
                    for v in _validate_numeric_fields(item, _NUTRITION_ITEM_FIELD_SPECS)
                )
    return violations


def get_canonical_exercises():
    """Return every active exercise from exercises_master as a list of dicts.
    This is the single source of truth for exercise names the workout agent is
    allowed to use."""
    db = SessionLocal()
    try:
        exercises = db.query(ExerciseMaster).filter(ExerciseMaster.is_active.is_(True)).all()
        return [
            {
                "name_he": e.canonical_name_he,
                "name_en": e.canonical_name_en,
                "muscle_group": e.muscle_group_primary,
                "equipment": e.equipment,
                "aliases": e.aliases or [],
            }
            for e in exercises
        ]
    finally:
        db.close()


# The frontend's UserProfile.equipment checkboxes (Profile.jsx's
# EQUIPMENT_OPTIONS) are a small, closed, exhaustively-known set of Hebrew
# display values — the user's stored choice is literally that Hebrew string.
# exercises_master.equipment uses a completely separate English vocabulary
# (barbell/dumbbell/machine/...). Without this translation, a Hebrew
# "משקולות" never matches the English "dumbbell" it actually means, so
# _filter_exercises_by_equipment() silently falls back to bodyweight/"none"
# exercises only for every user with Hebrew equipment values — not an edge
# case, this hits any Hebrew-speaking user who picked real equipment.
#
# "ללא ציוד" needs no entry: it's already in _FREE_EQUIPMENT below, so it
# already contributes nothing to the *restriction* set (correctly — picking
# "no equipment" should not narrow the pool at all).
#
# "אופניים" (bike) / "שחייה" (swimming) are deliberately NOT mapped: there is
# no corresponding token anywhere in exercises_master's strength-equipment
# vocabulary — cardio equipment doesn't gate any exercise row today. Leaving
# them untranslated is a no-op (same as current behaviour), not a regression.
_HEBREW_EQUIPMENT_TRANSLATIONS = {
    "משקולות": {"dumbbell"},
    "מוט + משקולות": {"barbell", "dumbbell"},
    "trx": {"suspension_band"},  # frontend's own label is the Latin brand name "TRX"
    "מכשירי חדר כושר": {"machine"},
}


def _parse_equipment(raw) -> set:
    """Normalise the profile's equipment value into a lowercase token set,
    translating known Hebrew UI values to the English tokens
    exercises_master actually uses (see _HEBREW_EQUIPMENT_TRANSLATIONS).
    In the crew flow `profile['equipment']` comes straight off the ORM
    column, so it is usually a JSON-encoded string (e.g. '["משקולות"]');
    tolerate a plain string or an already-decoded list too."""
    if not raw:
        return set()
    if isinstance(raw, str):
        try:
            decoded = json.loads(raw)
        except json.JSONDecodeError:
            decoded = [raw]
    else:
        decoded = raw
    if isinstance(decoded, str):
        decoded = [decoded]

    tokens = set()
    for item in decoded:
        item = str(item).strip()
        if not item:
            continue
        lowered = item.lower()
        translated = _HEBREW_EQUIPMENT_TRANSLATIONS.get(item) or _HEBREW_EQUIPMENT_TRANSLATIONS.get(lowered)
        if translated is not None:
            tokens |= translated
        else:
            tokens.add(lowered)
    return tokens


# Equipment values that never require owned gear, so they stay available no
# matter what the user listed.
_FREE_EQUIPMENT = {"", "none", "bodyweight", "משקל גוף", "ללא ציוד"}


def _filter_exercises_by_equipment(exercises: list, equipment: set) -> list:
    """Keep exercises the user can actually perform: bodyweight/no-equipment
    ones are always allowed; the rest only if their equipment is one the user
    listed. If the user listed no equipment, don't restrict — a full canonical
    list is more useful to the agent than an empty one."""
    if not equipment:
        return exercises
    kept = []
    for ex in exercises:
        eq = (ex.get("equipment") or "").strip().lower()
        if eq in _FREE_EQUIPMENT or eq in equipment:
            kept.append(ex)
    return kept or exercises


def _build_exercise_name_set(exercises: list) -> set:
    """Lowercased set of every acceptable exercise name (Hebrew, English, and
    aliases) for case-insensitive validation of the agent's output."""
    names = set()
    for ex in exercises:
        for key in ("name_he", "name_en"):
            val = ex.get(key)
            if val:
                names.add(str(val).strip().lower())
        for alias in ex.get("aliases", []):
            if alias:
                names.add(str(alias).strip().lower())
    return names


def validate_workout_exercises(result: dict) -> list:
    """Check every exercise name in a workout_plan result against
    exercises_master (case-insensitive). Returns the list of unrecognised names.
    Logs a warning for each but never raises or mutates the result — for now this
    is observation only, not enforcement."""
    plan = result.get("workout_plan")
    if not isinstance(plan, dict):
        return []

    allowed = _build_exercise_name_set(get_canonical_exercises())
    if not allowed:
        return []

    unknown = []
    for day, day_plan in plan.items():
        if not isinstance(day_plan, dict):
            continue
        for ex in day_plan.get("exercises", []) or []:
            name = ex.get("name") if isinstance(ex, dict) else None
            if not name:
                continue
            if str(name).strip().lower() not in allowed:
                unknown.append(name)
                print(
                    f"[crew_agents] WARNING: workout exercise '{name}' (day {day}) "
                    "is not in exercises_master — AI may have invented it"
                )
    if unknown:
        print(
            f"[crew_agents] WARNING: {len(unknown)} exercise name(s) not found in "
            f"exercises_master: {unknown}"
        )
    return unknown


_WORKOUT_EXERCISE_FIELD_SPECS = {
    "sets": (1, 20),
    "weight_kg": (0, 500),
    "rest_seconds": (0, 600),
}
_WORKOUT_DAY_TYPES = {"strength", "cardio", "rest"}
_REPS_BOUNDS = (1, 100)


def _validate_reps_range(reps) -> list:
    """reps is normally {"min": N, "max": M} (rep-ranges), but a plain number
    is still accepted here too -- lenient backward compat in case the LLM
    reverts to the old single-number habit despite the prompt now asking for
    a range; the guardrail's job is to catch genuinely broken output, not to
    enforce the exact shape the prompt requests. Returns violation strings,
    empty means valid."""
    lo, hi = _REPS_BOUNDS
    if isinstance(reps, dict):
        rmin, rmax = reps.get("min"), reps.get("max")
        violations = []
        for label, val in (("min", rmin), ("max", rmax)):
            if not isinstance(val, (int, float)) or isinstance(val, bool) or not (lo <= val <= hi):
                violations.append(f"reps.{label}={val!r} (מותר {lo}-{hi})")
        if not violations and rmin > rmax:
            violations.append(f"reps.min({rmin}) > reps.max({rmax})")
        return violations
    if isinstance(reps, (int, float)) and not isinstance(reps, bool) and lo <= reps <= hi:
        return []
    return [f"reps={reps!r} לא תקין (צפוי {{'min','max'}} או מספר {lo}-{hi})"]


def validate_workout_plan_guardrails(result: dict, allowed_names: set) -> list:
    """Deterministic schema + sane-value + equipment guardrail for a
    workout_plan, run inside the retry loop (before the paid judge call) --
    unlike validate_workout_exercises() above (observation-only, logs but
    never rejects), a violation found here actually triggers a retry. Empty
    return means the plan passed everything."""
    plan = result.get("workout_plan")
    if not isinstance(plan, dict):
        return ["workout_plan חסר או אינו אובייקט"]

    violations = []
    for day, day_plan in plan.items():
        if day not in _DAY_SET or not isinstance(day_plan, dict):
            continue

        day_type = day_plan.get("type")
        if day_type not in _WORKOUT_DAY_TYPES:
            violations.append(f"{day}: type לא תקין ({day_type!r})")

        exercises = day_plan.get("exercises")
        if not isinstance(exercises, list):
            violations.append(f"{day}: exercises חסר או אינו מערך")
            continue
        if day_type != "rest" and not exercises:
            violations.append(f"{day}: יום {day_type} בלי אף תרגיל")

        for ex in exercises:
            if not isinstance(ex, dict):
                violations.append(f"{day}: תרגיל שאינו אובייקט")
                continue
            name = ex.get("name")
            if not name or not isinstance(name, str):
                violations.append(f"{day}: תרגיל בלי שם")
                continue
            if allowed_names and name.strip().lower() not in allowed_names:
                violations.append(f"{day}: תרגיל '{name}' לא ברשימה המורשית/הציוד הזמין")

            field_violations = _validate_numeric_fields(ex, _WORKOUT_EXERCISE_FIELD_SPECS)
            violations.extend(f"{day}/{name}: {v}" for v in field_violations)
            violations.extend(f"{day}/{name}: {v}" for v in _validate_reps_range(ex.get("reps")))

    return violations


def build_workout_task(agent, profile: dict, memory: dict, allowed_exercises: Optional[list] = None) -> Task:
    preferred_ex = memory.get("preferred_exercises", [])
    skipped_ex = memory.get("skipped_exercises", [])

    if allowed_exercises is None:
        equipment = _parse_equipment(profile.get("equipment"))
        allowed_exercises = _filter_exercises_by_equipment(get_canonical_exercises(), equipment)
    allowed_names_he = ", ".join(ex["name_he"] for ex in allowed_exercises if ex.get("name_he"))

    default_rest = profile.get("default_rest_seconds")
    # Only added when the user actually set a preference (Settings.jsx /
    # LiveWorkout's own settings modal) -- omitted entirely otherwise, so a
    # user with no preference sees the exact same prompt as before this was
    # wired in. A hint, not a hard requirement: the agent may still deviate
    # per exercise (e.g. longer rest for heavy compound lifts).
    rest_hint = (
        f"- זמן מנוחה מועדף בין סטים: {default_rest} שניות (אפשר לסטות במידת הצורך, זה רק כיוון)\n"
        if default_rest else ""
    )

    return Task(
        description=f"""החזר JSON בלבד. אסור טקסט לפני או אחרי ה-JSON. התחל ישירות עם {{ וסיים עם }}.

בנה תכנית אימונים שבועית מותאמת אישית בעברית עבור המשתמש הבא:
- משקל: {profile.get('weight_kg')} ק״ג
- מטרה: {profile.get('goal')}
- רמת פעילות: {profile.get('activity_level')}
- פציעות: {profile.get('injuries', 'אין')}
- ציוד זמין: {profile.get('equipment', 'ללא ציוד')}
- רשימת תרגילים מאושרת (בחר רק מתוכה): {allowed_names_he}
- חשוב: השתמש אך ורק בשמות תרגילים מהרשימה הזו. אסור להמציא שמות חדשים.
- תרגילים מועדפים: {', '.join(preferred_ex) if preferred_ex else 'לא צוין'}
- תרגילים שנדלגו: {', '.join(skipped_ex) if skipped_ex else 'לא צוין'}
{rest_hint}- לכל יום אימון (לא מנוחה) — עד 6 תרגילים בלבד, הערות (notes) קצרות עד 8 מילים. שמור על JSON קומפקטי כדי שהתשובה לא תיחתך.
- תרגילי משקל-גוף (מתח, שכיבות סמיכה, פלאנק וכו') — weight_kg: 0 הוא ערך תקין ונכון, לא שגיאה.
- reps הוא תמיד טווח, לא מספר בודד: אובייקט {{"min": X, "max": Y}}, למשל {{"min": 8, "max": 12}}. X חייב להיות קטן-או-שווה ל-Y.

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
          "reps": {{"min": 8, "max": 12}},
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


# ─── Stage 2: semantic "judge" validation ──────────────────────────────────
# Distinct from the structural completeness check above (_plan_key_with_
# all_days / incomplete_plan_keys), which only verifies JSON *shape* — all 7
# day keys present. A plan can pass that check and still be useless (every
# day empty/"rest" with no real content, or exercises/meals that don't match
# what the user asked for at all). This stage runs a second, cheap/fast LLM
# call whose only job is a pass/fail verdict — not content generation — kept
# on a small model with a short prompt so it adds only a few seconds to the
# existing ~60-70s generation flow, not a second full generation pass.
JUDGE_LLM_MODEL = "anthropic/claude-haiku-4-5"


def _judge_plan(plan_key: str, plan_value: dict, profile: dict) -> tuple:
    """Ask a cheap/fast model to sanity-check an already structurally-complete
    plan: real content per day (not empty/placeholder), roughly matching the
    user's stated goal/equipment. Returns (is_valid, reason).

    Fails OPEN, not closed: any problem with the judge call itself (API
    error, unparseable response) returns is_valid=True — a flaky judge call
    must never become a new source of false rejections on top of the crew
    generation flakiness this whole retry mechanism already exists for. Only
    an actual judge-returned {"valid": false} counts as a rejection."""
    kind = "תפריט תזונה שבועי" if plan_key == "meal_plan" else "תכנית אימונים שבועית"
    try:
        from crewai import LLM

        llm = LLM(model=JUDGE_LLM_MODEL, max_tokens=150)
        prompt = f"""אתה בודק QA גס בלבד — לא מבקר איכות. קיבלת {kind} בפורמט JSON עבור משתמש \
עם מטרה "{profile.get('goal')}" וציוד "{profile.get('equipment', 'ללא ציוד')}".

המטרה היחידה שלך היא לתפוס תוכניות **שבורות לגמרי**, לא לבקר תוכניות סבירות. \
תסמן valid=false **רק** אם קורה אחד מאלה בפועל:
- ימים ריקים לגמרי (מלבד ימי מנוחה מכוונים) או ערכי placeholder ברורים (למשל "foo", "xyz", "lorem ipsum", שם/מספר חסרי משמעות)
- ערכים בלתי אפשריים (למשל 0 חזרות בתרגיל פעיל, מאות סטים, משקל שלילי — \
אך שים לב: weight_kg: 0 הוא ערך **תקין ונפוץ** לתרגילי משקל-גוף כמו מתח/שכיבות סמיכה/פלאנק, לא באג)
- כל הימים זהים לחלוטין מילה במילה (העתק-הדבק ברור, לא רק דמיון סביר)
- שימוש בציוד שהמשתמש בבירור *אין* לו בכלל (למשל תרגיל מוט/ברבל כשצוין "ללא ציוד")

**אל** תסמן valid=false על ניואנסים כמו: תרגיל אחד שיכול להתבצע גם בלי הציוד שצוין, \
חלוקת קבוצות שרירים לא מושלמת, פירוט חסר, או כל דבר שהוא "אפשר היה טוב יותר" ולא "שבור בפועל". \
ספק, תסמן valid=true.

תוכנית:
{json.dumps(plan_value, ensure_ascii=False)[:4000]}

החזר אך ורק JSON בפורמט: {{"valid": true/false, "reason": "הסבר קצר במשפט אחד"}}"""

        raw = llm.call(prompt)
        parsed = _extract_json(str(raw))
        if isinstance(parsed, dict) and "valid" in parsed:
            return bool(parsed["valid"]), str(parsed.get("reason", ""))
        return True, "judge response unparseable — failing open"
    except Exception as e:
        return True, f"judge call failed — failing open ({e})"


# ─── Stage 1.5: deterministic output guardrails ────────────────────────────
# Distinct from both the structural check (JSON *shape* only) and the judge
# (semantic, LLM-based, fails open) -- this is a cheap, fully deterministic
# check on individual field values, shared by both nutrition and workout
# guardrails below since both domains reduce to "a list of dicts with
# bounded numeric fields", just at different nesting depths. Runs before the
# (paid) judge call so an attempt that's already deterministically broken
# never wastes an extra LLM call.
def _validate_numeric_fields(item: dict, specs: dict) -> list:
    """specs: {field_name: (min, max)}. Returns a list of Hebrew violation
    strings for any field that's missing, non-numeric, or out of range;
    empty list means the item passed every spec."""
    violations = []
    for field, (lo, hi) in specs.items():
        val = item.get(field)
        if not isinstance(val, (int, float)) or isinstance(val, bool) or not (lo <= val <= hi):
            violations.append(f"{field}={val!r} (מותר {lo}-{hi})")
    return violations


def _run_crew_with_retry(
    build_agent_and_task, plan_key: str, label: str, profile: dict,
    extra_validator: Optional[Callable[[dict], list]] = None,
) -> dict:
    """Run a fresh agent+task+crew up to MAX_PLAN_ATTEMPTS times, retrying
    whenever the result either (a) doesn't contain a full 7-day plan under
    `plan_key` (structural check), (a.5) fails `extra_validator` (deterministic
    schema/value/constraint guardrail, see above -- optional per-domain), or
    (b) does, but the judge (semantic check, see above) rejects it as not
    actually sane content. Each attempt is an
    independent LLM call (rebuilt from scratch) — the failure mode is a flaky
    LLM formatting slip, not a deterministic one, so a fresh attempt is
    expected to have a good chance of succeeding even when the prior one
    didn't.

    On final exhaustion after a judge rejection, the returned dict is
    replaced with the same {"error": ...} shape as a total structural
    failure (rather than returning the judge-rejected plan content) — so a
    plan that's structurally complete but semantically garbage is treated
    identically to "no output" at the approve boundary (incomplete_plan_keys
    returns NO_PLAN_GENERATED for both), not silently saved."""
    last_result = {"error": "no output"}
    for attempt in range(1, MAX_PLAN_ATTEMPTS + 1):
        agent, task = build_agent_and_task()
        crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
        last_result = _kickoff_and_extract(crew)

        if _plan_key_with_all_days(last_result) == plan_key:
            if extra_validator:
                violations = extra_validator(last_result)
                if violations:
                    reason = "; ".join(violations[:5])
                    print(
                        f"[crew_agents] WARNING: {label} attempt {attempt}/{MAX_PLAN_ATTEMPTS} passed the "
                        f"structural 7-day check but FAILED guardrail validation ({reason})"
                        + (" — retrying" if attempt < MAX_PLAN_ATTEMPTS else " — giving up, treating as no output")
                    )
                    last_result = {"error": "no output", "guardrail_rejected": True, "guardrail_reasons": violations}
                    continue

            valid, reason = _judge_plan(plan_key, last_result[plan_key], profile)
            if valid:
                if attempt > 1:
                    print(f"[crew_agents] {label}: got a complete, judge-approved 7-day plan on attempt {attempt}/{MAX_PLAN_ATTEMPTS}")
                return last_result

            print(
                f"[crew_agents] WARNING: {label} attempt {attempt}/{MAX_PLAN_ATTEMPTS} passed the structural "
                f"7-day check but FAILED judge validation ({reason})"
                + (" — retrying" if attempt < MAX_PLAN_ATTEMPTS else " — giving up, treating as no output")
            )
            last_result = {"error": "no output", "judge_rejected": True, "judge_reason": reason}
            continue

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
    """Run only the nutrition agent, retrying on an incomplete (not-7-day)
    plan, a guardrail violation (schema/values, see
    validate_nutrition_plan_guardrails), or a judge-rejected one (see
    _judge_plan)."""
    def build():
        agent = get_nutrition_agent()
        return agent, build_nutrition_task(agent, profile, memory)

    return _run_crew_with_retry(
        build, "meal_plan", "nutrition crew", profile,
        extra_validator=validate_nutrition_plan_guardrails,
    )


async def run_workout_crew(profile: dict, memory: dict) -> dict:
    """Run only the workout agent, retrying on an incomplete (not-7-day) plan,
    a guardrail violation (schema/values/equipment, see
    validate_workout_plan_guardrails), or a judge-rejected one (see
    _judge_plan). allowed_exercises/allowed_names are computed once here
    (not per-attempt inside build_workout_task) -- equipment/profile don't
    change between retries, so there's no need to re-query the DB each time."""
    equipment = _parse_equipment(profile.get("equipment"))
    allowed_exercises = _filter_exercises_by_equipment(get_canonical_exercises(), equipment)
    allowed_names = _build_exercise_name_set(allowed_exercises)

    def build():
        agent = get_workout_agent()
        return agent, build_workout_task(agent, profile, memory, allowed_exercises)

    result = _run_crew_with_retry(
        build, "workout_plan", "workout crew", profile,
        extra_validator=lambda r: validate_workout_plan_guardrails(r, allowed_names),
    )
    validate_workout_exercises(result)
    return result


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
