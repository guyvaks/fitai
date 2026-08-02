# CLAUDE.md

## 🚫 כלל ברזל - Production

**אין לדחוף, למזג, לפרוס, או לשנות הגדרות ב-production תחת שום תנאי, עד לסיום מלא של הפרויקט.**

זה כולל:
- `git push`/`git merge` לענף `main` (אם `main` מחובר ל-deploy אוטומטי ב-Railway)
- כל שינוי ישיר בהגדרות Railway (services, environment variables, database connections) בסביבת production
- כל migration או seed script שרץ מול ה-DB של production

**אישור מפורש נדרש בכל פעם**, ללא יוצא מן הכלל:
- "המשך" / "תמשיך" / אישור כללי **אינו** מספיק
- האישור חייב להיות מפורש וממוקד, למשל: "מאשר merge ל-main" או "מאשר deploy לפרודקשן"
- אם יש ספק אם פעולה "נוגעת" ב-production - התייחס אליה כאילו כן, ובקש אישור

כל העבודה השוטפת (תיקונים, פיצ'רים, בדיקות) מתבצעת אך ורק על `dev` ומול DB מקומי/staging נפרד.

## 📁 מבנה הפרויקט

- `backend/` — FastAPI + SQLAlchemy + Alembic (Python 3.12, conda env: fitai)
- `frontend/` — React + Vite + Tailwind v4 (Volt dark theme + light theme)
- Railway: production + staging עוקבים אחרי branch `main`
- DB: Railway Postgres (DATABASE_URL כ-reference variable, לא hardcoded)

## 🔄 Workflow

- עבודה על `dev`, merge ל-`main` רק עם אישור מפורש
- Railway לא מריץ migrations אוטומטית! אחרי כל merge שכולל migration חדשה יש להריץ אותה ידנית מול staging+production — ראה skill `railway-migration-deploy` לרצף המדויק. **גם הרצף הזה דורש אישור מפורש בכל פעם לפי כלל הברזל — הוא לא הרשאה עומדת.**

## 📊 exercises_master

- טבלה קנונית עם 388 תרגילים (עברית + אנגלית), כל קטגוריות הציוד
- CrewAI מוגבל לבחור רק מהרשימה הזו (prompt injection + validation logging)
- סינון לפי ציוד המשתמש, bodyweight תמיד זמין
- Seed script: `backend/seed_exercises_master.py` + `exercises_master_final.csv`

## 🎨 Frontend

- Mobile-only: max-width 430px wrapper ב-App.jsx, breakpoints מנוטרלים ל-9999px ב-index.css
- RTL עברי — שים לב ל-`dir="ltr"` על אלמנטים שצריכים כיוון שמאל-ימין (גרפים, gauges)
- Dark/Light theme: `ThemeContext.jsx`, toggle ב-Sidebar, נשמר per-user ב-`UserProfile`
- תזונה: טאב "תכנון שבועי" + טאב "מעקב יומי" (FoodLog מוזג לתוך Nutrition עם `?tab=daily`)

## 🔒 אבטחה

- כל הסודות רוטטו (ANTHROPIC_API_KEY, SECRET_KEY, Postgres passwords, admin password)
- `.env.local` (gitignored) מצביע ל-staging DB
- `DATABASE_URL` ב-Railway הוא **reference variable** (מתעדכן אוטומטית ברוטציה)

## 🧪 טסטים

- `conda activate fitai && cd backend && python -m pytest tests/ -v`
- 71 טסטים עוברים, 0 failures
- `ruff check .` → All checks passed

## 📝 תיעוד

- Obsidian vault: `~/Desktop/The Eigs Ai/The Eigs/Projects/FitAI/`
- Session logs, Known_Bugs, Change_Log, Next_Session_Context
