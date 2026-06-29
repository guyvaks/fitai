import json
import os
import re
from typing import Optional
from crewai import Agent, Task, Crew, Process
from app.core.config import settings

# Ensure ANTHROPIC_API_KEY is set in the environment for CrewAI/LiteLLM
if settings.ANTHROPIC_API_KEY:
    os.environ["ANTHROPIC_API_KEY"] = settings.ANTHROPIC_API_KEY


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

    days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    # Build a concrete example for each day so the AI sees 7 real entries (compact format)
    days_example = ""
    for i, day in enumerate(days):
        comma = "," if i < len(days) - 1 else ""
        meals_example = ", ".join(
            f'{{"meal_type":"{mt}","name":"שם","items":[{{"name":"מרכיב","qty_g":100,"calories":150,"protein":20,"carbs":15,"fat":5}}],"total_calories":{cal // meals_per_day},"total_protein":35,"total_carbs":40,"total_fat":12}}'
            for mt in meal_types
        )
        days_example += f'    "{day}": [{meals_example}]{comma}\n'

    totals_example = ",\n    ".join(
        f'"{day}": {{"calories": {cal}, "protein": 150, "carbs": 200, "fat": 65}}'
        for day in days
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


def _extract_json(text: str) -> dict:
    """Extract JSON from text, preferring objects that contain plan-level keys."""
    text = str(text).strip()

    # 1. Direct parse
    try:
        d = json.loads(text)
        if isinstance(d, dict):
            return d
    except json.JSONDecodeError:
        pass

    # 2. Strip markdown code fences
    for fence in ("```json", "```"):
        if fence in text:
            for part in text.split(fence)[1:]:
                candidate = part.split("```")[0].strip()
                try:
                    d = json.loads(candidate)
                    if isinstance(d, dict):
                        return d
                except json.JSONDecodeError:
                    continue

    # 3. Collect ALL complete top-level JSON objects via depth-counting,
    #    then pick the one with preferred keys (meal_plan / workout_plan),
    #    or the largest one as fallback.
    candidates = []
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

    if candidates:
        # Prefer any candidate that has a plan-level key
        for c in candidates:
            if _PREFERRED_KEYS & set(c.keys()):
                return c
        # Fallback: return the largest candidate by number of keys (deepest plan)
        return max(candidates, key=lambda c: len(str(c)))

    return {"raw_output": text, "error": "Could not parse JSON"}


def _kickoff_and_extract(crew) -> dict:
    """Kick off a crew and extract JSON from the full raw output."""
    result = crew.kickoff()

    # Collect all candidate text sources, pick the longest
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

    # Fallback to str()
    if not candidates_text:
        candidates_text.append(str(result))

    # Try each source; prefer the one that yields a plan-level key
    best = None
    for text in candidates_text:
        parsed = _extract_json(text)
        if parsed.get('meal_plan') or parsed.get('workout_plan'):
            return parsed
        if best is None or len(str(parsed)) > len(str(best)):
            best = parsed

    return best or {"error": "no output"}


async def run_nutrition_crew(profile: dict, memory: dict) -> dict:
    """Run only the nutrition agent."""
    agent = get_nutrition_agent()
    task = build_nutrition_task(agent, profile, memory)
    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
    return _kickoff_and_extract(crew)


async def run_workout_crew(profile: dict, memory: dict) -> dict:
    """Run only the workout agent."""
    agent = get_workout_agent()
    task = build_workout_task(agent, profile, memory)
    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)
    return _kickoff_and_extract(crew)


async def run_full_crew(profile: dict, memory: dict) -> dict:
    """Run nutrition + workout agents in sequence, then merge results."""
    # Run nutrition agent
    nutrition_agent = get_nutrition_agent()
    nutrition_task = build_nutrition_task(nutrition_agent, profile, memory)
    nutrition_crew = Crew(agents=[nutrition_agent], tasks=[nutrition_task], process=Process.sequential, verbose=False)
    nutrition_result = _kickoff_and_extract(nutrition_crew)

    # Run workout agent
    workout_agent = get_workout_agent()
    workout_task = build_workout_task(workout_agent, profile, memory)
    workout_crew = Crew(agents=[workout_agent], tasks=[workout_task], process=Process.sequential, verbose=False)
    workout_result = _kickoff_and_extract(workout_crew)

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
