import json
from typing import Optional
from crewai import Agent, Task, Crew, Process


def get_nutrition_agent():
    return Agent(
        role="Expert Hebrew Dietitian",
        goal="Build a personalized weekly meal plan in Hebrew as JSON only",
        backstory="""דיאטנית קלינית עם 15 שנות ניסיון, מתמחה בתזונה ספורטיבית.
        מחזירה JSON בלבד ללא טקסט חופשי.""",
        verbose=False,
        allow_delegation=False,
        llm="gpt-4o-mini",
    )


def get_workout_agent():
    return Agent(
        role="Professional Hebrew Fitness Coach",
        goal="Build a personalized weekly workout plan in Hebrew as JSON only",
        backstory="""מאמן כושר מוסמך עם התמחות באימוני כוח ואירובי.
        מחזיר JSON בלבד ללא טקסט חופשי.""",
        verbose=False,
        allow_delegation=False,
        llm="gpt-4o-mini",
    )


def get_supervisor_agent():
    return Agent(
        role="Health & Fitness Supervisor",
        goal="Review, combine and finalize nutrition and workout recommendations as JSON only",
        backstory="""מומחה בריאות בכיר שמאחד המלצות תזונה וכושר.
        מחזיר JSON סופי מאוחד בלבד.""",
        verbose=False,
        allow_delegation=False,
        llm="gpt-4o-mini",
    )


def build_nutrition_task(agent, profile: dict, memory: dict) -> Task:
    preferred = memory.get("preferred_foods", [])
    disliked = memory.get("disliked_foods", [])

    return Task(
        description=f"""בנה תפריט שבועי מותאם אישית בעברית.

פרופיל המשתמש:
- גיל: {profile.get('age')}, מין: {profile.get('gender')}
- גובה: {profile.get('height_cm')} ס״מ, משקל: {profile.get('weight_kg')} ק״ג
- יעד קלוריות יומי: {profile.get('target_calories')} קלוריות
- מטרה: {profile.get('goal')}
- אלרגיות: {profile.get('allergies', 'אין')}
- מספר ארוחות ביום: {profile.get('meals_per_day', 5)}
- מאכלים מועדפים: {', '.join(preferred) if preferred else 'לא צוין'}
- מאכלים לא מועדפים: {', '.join(disliked) if disliked else 'לא צוין'}

החזר JSON בלבד בפורמט הבא:
{{
  "meal_plan": {{
    "sunday": [
      {{
        "meal_type": "breakfast",
        "name": "שם הארוחה בעברית",
        "items": [
          {{"name": "שם מרכיב", "qty_g": 100, "calories": 200, "protein": 10, "carbs": 30, "fat": 5}}
        ],
        "total_calories": 400,
        "total_protein": 25,
        "total_carbs": 45,
        "total_fat": 10
      }}
    ],
    "monday": [],
    "tuesday": [],
    "wednesday": [],
    "thursday": [],
    "friday": [],
    "saturday": []
  }},
  "daily_totals": {{
    "sunday": {{"calories": 2100, "protein": 150, "carbs": 230, "fat": 65}}
  }},
  "grocery_list": ["פריט1", "פריט2"]
}}""",
        agent=agent,
        expected_output="JSON תקני של תפריט שבועי מלא בעברית",
    )


def build_workout_task(agent, profile: dict, memory: dict) -> Task:
    preferred_ex = memory.get("preferred_exercises", [])
    skipped_ex = memory.get("skipped_exercises", [])

    return Task(
        description=f"""בנה תכנית אימונים שבועית מותאמת אישית בעברית.

פרופיל:
- משקל: {profile.get('weight_kg')} ק״ג
- מטרה: {profile.get('goal')}
- רמת פעילות: {profile.get('activity_level')}
- פציעות: {profile.get('injuries', 'אין')}
- ציוד זמין: {profile.get('equipment', 'ללא ציוד')}
- תרגילים מועדפים: {', '.join(preferred_ex) if preferred_ex else 'לא צוין'}
- תרגילים שנדלגו: {', '.join(skipped_ex) if skipped_ex else 'לא צוין'}

החזר JSON בלבד:
{{
  "workout_plan": {{
    "sunday": {{
      "type": "strength",
      "name": "שם האימון",
      "exercises": [
        {{
          "name": "שם תרגיל",
          "muscle_group": "קבוצת שריר",
          "sets": 4,
          "reps": 10,
          "weight_kg": 0,
          "rest_seconds": 90,
          "notes": "הערות"
        }}
      ]
    }},
    "monday": {{"type": "rest", "name": "מנוחה", "exercises": []}},
    "tuesday": {{}},
    "wednesday": {{}},
    "thursday": {{}},
    "friday": {{}},
    "saturday": {{"type": "rest", "name": "מנוחה", "exercises": []}}
  }}
}}""",
        agent=agent,
        expected_output="JSON תקני של תכנית אימונים שבועית בעברית",
    )


def build_supervisor_task(agent, nutrition_result: str, workout_result: str, profile: dict, memory: dict) -> Task:
    rejected_reasons = memory.get("rejected_plan_reasons", [])

    return Task(
        description=f"""סקור ואחד את המלצות התזונה והכושר.

תפריט מוצע:
{nutrition_result}

תכנית אימונים מוצעת:
{workout_result}

בדוק:
1. הקלוריות בתפריט תואמות ליעד {profile.get('target_calories')} קלוריות
2. האימונים מתאימים לפציעות: {profile.get('injuries', 'אין')}
3. אין סתירות בין תזונה לאימונים
4. סיבות דחייה קודמות: {', '.join(rejected_reasons) if rejected_reasons else 'אין'}

החזר JSON סופי מאוחד:
{{
  "meal_plan": {{}},
  "workout_plan": {{}},
  "daily_totals": {{}},
  "grocery_list": [],
  "summary": "סיכום קצר בעברית",
  "adjustments_made": ["רשימת התאמות שנעשו"]
}}""",
        agent=agent,
        expected_output="JSON סופי מאוחד של תפריט ותכנית אימונים",
    )


async def run_ai_crew(profile: dict, memory: dict, suggestion_type: str = "both") -> dict:
    """Run CrewAI agents and return the final JSON recommendation."""

    nutrition_agent = get_nutrition_agent()
    workout_agent = get_workout_agent()
    supervisor = get_supervisor_agent()

    nutrition_task = build_nutrition_task(nutrition_agent, profile, memory)
    workout_task = build_workout_task(workout_agent, profile, memory)
    supervisor_task = build_supervisor_task(supervisor, "", "", profile, memory)

    crew = Crew(
        agents=[nutrition_agent, workout_agent, supervisor],
        tasks=[nutrition_task, workout_task, supervisor_task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()

    raw = str(result)
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw_output": raw, "error": "Could not parse JSON"}
