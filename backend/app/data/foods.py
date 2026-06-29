"""
Israeli Hebrew food database — 60 common foods with nutritional values per 100g.
"""

FOODS = [
    # ── חלבונים ──────────────────────────────────────────────────────────────
    {"id": 1,  "name": "חזה עוף",               "calories": 165, "protein": 31.0, "carbs": 0.0,  "fat": 3.6,  "category": "חלבונים"},
    {"id": 2,  "name": "שוק עוף",                "calories": 209, "protein": 26.0, "carbs": 0.0,  "fat": 11.0, "category": "חלבונים"},
    {"id": 3,  "name": "סטייק בקר (אנטריקוט)",   "calories": 271, "protein": 26.0, "carbs": 0.0,  "fat": 18.0, "category": "חלבונים"},
    {"id": 4,  "name": "טונה בשמן (משומר)",       "calories": 184, "protein": 25.5, "carbs": 0.0,  "fat": 8.2,  "category": "חלבונים"},
    {"id": 5,  "name": "טונה במים (משומר)",       "calories": 116, "protein": 25.5, "carbs": 0.0,  "fat": 1.0,  "category": "חלבונים"},
    {"id": 6,  "name": "סלמון",                   "calories": 208, "protein": 20.0, "carbs": 0.0,  "fat": 13.0, "category": "חלבונים"},
    {"id": 7,  "name": "ביצה שלמה",               "calories": 155, "protein": 13.0, "carbs": 1.1,  "fat": 11.0, "category": "חלבונים"},
    {"id": 8,  "name": "חלבון ביצה",              "calories": 52,  "protein": 11.0, "carbs": 0.7,  "fat": 0.2,  "category": "חלבונים"},
    {"id": 9,  "name": "המבורגר בקר (90% רזה)",   "calories": 218, "protein": 26.1, "carbs": 0.0,  "fat": 12.3, "category": "חלבונים"},
    {"id": 10, "name": "שניצל עוף (ללא פירורים)", "calories": 170, "protein": 30.0, "carbs": 0.0,  "fat": 5.0,  "category": "חלבונים"},
    {"id": 11, "name": "קציצות הודו",              "calories": 149, "protein": 29.0, "carbs": 0.0,  "fat": 3.0,  "category": "חלבונים"},
    {"id": 12, "name": "גבינת קוטג' 1%",          "calories": 72,  "protein": 12.0, "carbs": 3.0,  "fat": 1.0,  "category": "מוצרי חלב"},
    {"id": 61, "name": "גבינת קוטג' 5%",          "calories": 121, "protein": 11.0, "carbs": 3.5,  "fat": 5.0,  "category": "מוצרי חלב"},
    {"id": 62, "name": "גבינת קוטג' 9%",          "calories": 150, "protein": 10.0, "carbs": 3.5,  "fat": 9.0,  "category": "מוצרי חלב"},

    # ── מוצרי חלב ────────────────────────────────────────────────────────────
    {"id": 13, "name": "יוגורט יווני 0%",         "calories": 59,  "protein": 10.0, "carbs": 3.6,  "fat": 0.4,  "category": "מוצרי חלב"},
    {"id": 14, "name": "יוגורט רגיל 3%",          "calories": 61,  "protein": 3.5,  "carbs": 4.7,  "fat": 3.3,  "category": "מוצרי חלב"},
    {"id": 15, "name": "חלב 3%",                  "calories": 61,  "protein": 3.2,  "carbs": 4.8,  "fat": 3.0,  "category": "מוצרי חלב"},
    {"id": 16, "name": "גבינה צהובה 28%",         "calories": 356, "protein": 25.0, "carbs": 1.0,  "fat": 28.0, "category": "מוצרי חלב"},
    {"id": 17, "name": "גבינה בולגרית 5%",        "calories": 95,  "protein": 10.0, "carbs": 1.5,  "fat": 5.0,  "category": "מוצרי חלב"},
    {"id": 18, "name": "גבינה לבנה 5%",           "calories": 95,  "protein": 8.0,  "carbs": 3.0,  "fat": 5.0,  "category": "מוצרי חלב"},
    {"id": 19, "name": "שמנת חמוצה 15%",          "calories": 162, "protein": 2.7,  "carbs": 3.4,  "fat": 15.0, "category": "מוצרי חלב"},
    {"id": 63, "name": "לבן 1%",                  "calories": 40,  "protein": 3.5,  "carbs": 4.0,  "fat": 1.0,  "category": "מוצרי חלב"},
    {"id": 64, "name": "ריקוטה",                  "calories": 134, "protein": 9.0,  "carbs": 3.0,  "fat": 10.0, "category": "מוצרי חלב"},

    # ── פחמימות ───────────────────────────────────────────────────────────────
    {"id": 20, "name": "אורז לבן מבושל",          "calories": 130, "protein": 2.7,  "carbs": 28.0, "fat": 0.3,  "category": "פחמימות"},
    {"id": 21, "name": "אורז מלא מבושל",          "calories": 112, "protein": 2.6,  "carbs": 23.5, "fat": 0.9,  "category": "פחמימות"},
    {"id": 22, "name": "פסטה מבושלת",             "calories": 158, "protein": 5.8,  "carbs": 31.0, "fat": 0.9,  "category": "פחמימות"},
    {"id": 23, "name": "קינואה מבושלת",           "calories": 120, "protein": 4.4,  "carbs": 21.3, "fat": 1.9,  "category": "פחמימות"},
    {"id": 24, "name": "לחם לבן",                 "calories": 265, "protein": 9.0,  "carbs": 49.0, "fat": 3.2,  "category": "פחמימות"},
    {"id": 25, "name": "לחם מלא",                 "calories": 247, "protein": 13.0, "carbs": 41.0, "fat": 4.2,  "category": "פחמימות"},
    {"id": 26, "name": "פיתה לבנה",               "calories": 275, "protein": 9.1,  "carbs": 55.0, "fat": 1.2,  "category": "פחמימות"},
    {"id": 27, "name": "בטטה מבושלת",             "calories": 86,  "protein": 1.6,  "carbs": 20.0, "fat": 0.1,  "category": "פחמימות"},
    {"id": 28, "name": "תפוח אדמה מבושל",         "calories": 77,  "protein": 2.0,  "carbs": 17.0, "fat": 0.1,  "category": "פחמימות"},
    {"id": 29, "name": "שיבולת שועל (יבש)",       "calories": 389, "protein": 17.0, "carbs": 66.0, "fat": 7.0,  "category": "פחמימות"},
    {"id": 30, "name": "עדשים מבושלות",           "calories": 116, "protein": 9.0,  "carbs": 20.0, "fat": 0.4,  "category": "פחמימות"},
    {"id": 31, "name": "חומוס (ממרח)",            "calories": 177, "protein": 8.0,  "carbs": 20.0, "fat": 8.0,  "category": "פחמימות"},
    {"id": 68, "name": "שעועית לבנה מבושלת",      "calories": 127, "protein": 8.7,  "carbs": 22.6, "fat": 0.5,  "category": "פחמימות"},

    # ── ירקות ─────────────────────────────────────────────────────────────────
    {"id": 32, "name": "ברוקולי",                 "calories": 34,  "protein": 2.8,  "carbs": 7.0,  "fat": 0.4,  "category": "ירקות"},
    {"id": 33, "name": "תרד",                     "calories": 23,  "protein": 2.9,  "carbs": 3.6,  "fat": 0.4,  "category": "ירקות"},
    {"id": 34, "name": "עגבנייה",                 "calories": 18,  "protein": 0.9,  "carbs": 3.9,  "fat": 0.2,  "category": "ירקות"},
    {"id": 35, "name": "מלפפון",                  "calories": 16,  "protein": 0.7,  "carbs": 3.6,  "fat": 0.1,  "category": "ירקות"},
    {"id": 36, "name": "גזר",                     "calories": 41,  "protein": 0.9,  "carbs": 10.0, "fat": 0.2,  "category": "ירקות"},
    {"id": 37, "name": "כרוב",                    "calories": 25,  "protein": 1.3,  "carbs": 5.8,  "fat": 0.1,  "category": "ירקות"},
    {"id": 38, "name": "פלפל אדום",               "calories": 31,  "protein": 1.0,  "carbs": 6.0,  "fat": 0.3,  "category": "ירקות"},
    {"id": 39, "name": "חסה",                     "calories": 15,  "protein": 1.4,  "carbs": 2.9,  "fat": 0.2,  "category": "ירקות"},
    {"id": 40, "name": "בצל",                     "calories": 40,  "protein": 1.1,  "carbs": 9.3,  "fat": 0.1,  "category": "ירקות"},
    {"id": 41, "name": "שום",                     "calories": 149, "protein": 6.4,  "carbs": 33.0, "fat": 0.5,  "category": "ירקות"},
    {"id": 42, "name": "זוקיני",                  "calories": 17,  "protein": 1.2,  "carbs": 3.1,  "fat": 0.3,  "category": "ירקות"},
    {"id": 65, "name": "כרובית",                  "calories": 25,  "protein": 1.9,  "carbs": 5.0,  "fat": 0.3,  "category": "ירקות"},
    {"id": 66, "name": "פטריות שמפיניון",         "calories": 22,  "protein": 3.1,  "carbs": 3.3,  "fat": 0.3,  "category": "ירקות"},
    {"id": 67, "name": "תירס מבושל",              "calories": 96,  "protein": 3.4,  "carbs": 21.0, "fat": 1.5,  "category": "ירקות"},

    # ── פירות ─────────────────────────────────────────────────────────────────
    {"id": 43, "name": "בננה",                    "calories": 89,  "protein": 1.1,  "carbs": 23.0, "fat": 0.3,  "category": "פירות"},
    {"id": 44, "name": "תפוח",                    "calories": 52,  "protein": 0.3,  "carbs": 14.0, "fat": 0.2,  "category": "פירות"},
    {"id": 45, "name": "תפוז",                    "calories": 47,  "protein": 0.9,  "carbs": 12.0, "fat": 0.1,  "category": "פירות"},
    {"id": 46, "name": "ענבים",                   "calories": 67,  "protein": 0.6,  "carbs": 17.0, "fat": 0.4,  "category": "פירות"},
    {"id": 47, "name": "אבטיח",                   "calories": 30,  "protein": 0.6,  "carbs": 7.6,  "fat": 0.2,  "category": "פירות"},
    {"id": 48, "name": "תות שדה",                 "calories": 32,  "protein": 0.7,  "carbs": 7.7,  "fat": 0.3,  "category": "פירות"},
    {"id": 49, "name": "מנגו",                    "calories": 60,  "protein": 0.8,  "carbs": 15.0, "fat": 0.4,  "category": "פירות"},
    {"id": 50, "name": "אבוקדו",                  "calories": 160, "protein": 2.0,  "carbs": 9.0,  "fat": 15.0, "category": "פירות"},

    # ── שומנים ───────────────────────────────────────────────────────────────
    {"id": 51, "name": "שמן זית",                 "calories": 884, "protein": 0.0,  "carbs": 0.0,  "fat": 100.0,"category": "שומנים"},
    {"id": 52, "name": "חמאת בוטנים",             "calories": 588, "protein": 25.0, "carbs": 20.0, "fat": 50.0, "category": "שומנים"},
    {"id": 53, "name": "שקדים",                   "calories": 579, "protein": 21.0, "carbs": 22.0, "fat": 50.0, "category": "שומנים"},
    {"id": 54, "name": "אגוזי מלך",               "calories": 654, "protein": 15.0, "carbs": 14.0, "fat": 65.0, "category": "שומנים"},
    {"id": 55, "name": "טחינה גולמית",            "calories": 592, "protein": 17.0, "carbs": 21.0, "fat": 53.0, "category": "שומנים"},

    # ── חטיפים בריאים ────────────────────────────────────────────────────────
    {"id": 56, "name": "חטיף חלבון (מוצק)",       "calories": 350, "protein": 30.0, "carbs": 35.0, "fat": 8.0,  "category": "חטיפים בריאים"},
    {"id": 57, "name": "אדממה (פולי סויה)",        "calories": 121, "protein": 11.9, "carbs": 8.9,  "fat": 5.2,  "category": "חטיפים בריאים"},
    {"id": 58, "name": "גרנולה (ללא סוכר)",       "calories": 380, "protein": 10.0, "carbs": 55.0, "fat": 14.0, "category": "חטיפים בריאים"},
    {"id": 59, "name": "חומוס שחור מבושל",        "calories": 132, "protein": 8.9,  "carbs": 22.0, "fat": 0.6,  "category": "חטיפים בריאים"},
    {"id": 60, "name": "פופקורן (ללא חמאה)",      "calories": 375, "protein": 11.0, "carbs": 74.0, "fat": 4.5,  "category": "חטיפים בריאים"},
    {"id": 69, "name": "אבקת חלבון (וואי)",       "calories": 400, "protein": 80.0, "carbs": 8.0,  "fat": 5.0,  "category": "חטיפים בריאים"},
]


def search_foods(query: str, category: str = "", limit: int = 200) -> list:
    """Search foods by Hebrew name and optional category."""
    q = query.strip().lower()
    results = FOODS if not q else [f for f in FOODS if q in f["name"].lower()]
    if category and category != "כל הקטגוריות":
        results = [f for f in results if f["category"] == category]
    results = sorted(results, key=lambda f: f["name"])
    return results[:limit]
