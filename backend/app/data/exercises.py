"""
Israeli Hebrew exercise database — common strength exercises grouped by muscle group.
"""

EXERCISES = [
    # ── חזה ──────────────────────────────────────────────────────────────────
    {"id": 1,  "name": "לחיצת חזה במוט",           "muscle_group": "חזה"},
    {"id": 2,  "name": "לחיצת חזה בשיפוע",          "muscle_group": "חזה"},
    {"id": 3,  "name": "פרפר בכבלים",               "muscle_group": "חזה"},
    {"id": 4,  "name": "שכיבות סמיכה",              "muscle_group": "חזה"},

    # ── גב ───────────────────────────────────────────────────────────────────
    {"id": 5,  "name": "מתח רחב",                   "muscle_group": "גב"},
    {"id": 6,  "name": "חתירה בישיבה",              "muscle_group": "גב"},
    {"id": 7,  "name": "חתירה עם מוט",              "muscle_group": "גב"},
    {"id": 8,  "name": "פולי עליון",                "muscle_group": "גב"},
    {"id": 9,  "name": "דדליפט",                    "muscle_group": "גב"},

    # ── רגליים ───────────────────────────────────────────────────────────────
    {"id": 10, "name": "סקוואט",                    "muscle_group": "רגליים"},
    {"id": 11, "name": "לחיצת רגליים",              "muscle_group": "רגליים"},
    {"id": 12, "name": "לאנג'ים",                   "muscle_group": "רגליים"},
    {"id": 13, "name": "פשיטת ברך במכונה",          "muscle_group": "רגליים"},
    {"id": 14, "name": "כפיפת ברך במכונה",          "muscle_group": "רגליים"},
    {"id": 15, "name": "עליות שוק",                 "muscle_group": "רגליים"},

    # ── כתפיים ───────────────────────────────────────────────────────────────
    {"id": 16, "name": "לחיצת כתפיים",              "muscle_group": "כתפיים"},
    {"id": 17, "name": "הרחקת כתפיים לצד",          "muscle_group": "כתפיים"},
    {"id": 18, "name": "הרחקת כתפיים לפנים",        "muscle_group": "כתפיים"},
    {"id": 19, "name": "חתירה זקופה",               "muscle_group": "כתפיים"},

    # ── ביצפס ────────────────────────────────────────────────────────────────
    {"id": 20, "name": "כפיפת מרפקים במוט",        "muscle_group": "ביצפס"},
    {"id": 21, "name": "כפיפת מרפקים בפטיש",        "muscle_group": "ביצפס"},

    # ── טריצפס ───────────────────────────────────────────────────────────────
    {"id": 22, "name": "פשיטת מרפקים בכבל",         "muscle_group": "טריצפס"},
    {"id": 23, "name": "מקבילים",                   "muscle_group": "טריצפס"},

    # ── בטן ──────────────────────────────────────────────────────────────────
    {"id": 24, "name": "כפיפות בטן",                "muscle_group": "בטן"},
    {"id": 25, "name": "פלאנק",                     "muscle_group": "בטן"},
]


def search_exercises(query: str, muscle_group: str = "", limit: int = 200) -> list:
    """Search exercises by Hebrew name and optional muscle group."""
    q = query.strip().lower()
    results = EXERCISES if not q else [e for e in EXERCISES if q in e["name"].lower()]
    if muscle_group and muscle_group != "כל הקבוצות":
        results = [e for e in results if e["muscle_group"] == muscle_group]
    results = sorted(results, key=lambda e: e["name"])
    return results[:limit]
