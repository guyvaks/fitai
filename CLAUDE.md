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
