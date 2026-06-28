# FitAI 🏋️

פלטפורמת בריאות, תזונה וכושר מבוססת AI בעברית.

האפליקציה מחליפה דיאטנית ומאמן כושר — המשתמש מקבל תפריט תזונה ותכנית אימונים מותאמים אישית, עם מעקב יומי, אימון בלייב וסוכני AI.

---

## Stack

| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | React + Vite + Tailwind CSS (RTL) |
| Backend | FastAPI + Python |
| Database | PostgreSQL (Railway) |
| Auth | JWT |
| AI Agents | CrewAI + GPT-4o-mini |
| גרפים | Recharts |
| Deployment | Railway |

---

## תכונות

- **הרשמה והתחברות** — JWT auth מלא
- **פרופיל ומדדים** — BMI / BMR / TDEE / יעד קלוריות
- **תזונה** — תפריט שבועי, יומן אכילה יומי עם מאקרו
- **סוכני AI** — 3 סוכני CrewAI (תזונאי + מאמן + Supervisor) עם approval flow
- **אימונים** — תכנית שבועית + מסך אימון חי
- **Live Workout** — טיימר מנוחה, שמירה אוטומטית לאחר כל סט
- **התקדמות** — שיאים אישיים + גרפים

---

## התקנה מקומית

### דרישות
- Python 3.11+
- Node.js 18+
- PostgreSQL

### Backend

```bash
cd backend
cp .env.example .env
# ערוך את .env עם הערכים שלך
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

הפרונטאנד יהיה זמין בכתובת: `http://localhost:5173`

---

## משתני סביבה

צור קובץ `backend/.env` על בסיס `backend/.env.example`:

```env
DATABASE_URL=postgresql://user:password@host:port/dbname
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
ENVIRONMENT=development
OPENAI_API_KEY=sk-proj-...
```

---

## API Endpoints

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/users/profile
POST   /api/v1/users/profile
GET    /api/v1/users/metrics

GET    /api/v1/nutrition/plan
POST   /api/v1/nutrition/food-log
GET    /api/v1/nutrition/food-log/{date}

POST   /api/v1/agents/generate
GET    /api/v1/agents/status/{task_id}
POST   /api/v1/agents/approve/{id}
POST   /api/v1/agents/reject/{id}

GET    /api/v1/workouts/plan
POST   /api/v1/workouts/sessions/start
PATCH  /api/v1/workouts/sessions/{id}/set-complete
POST   /api/v1/workouts/sessions/{id}/complete
```

תיעוד מלא זמין ב: `http://localhost:8000/docs`

---

## מבנה הפרויקט

```
fitai/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   ← auth, users, nutrition, workouts, agents
│   │   ├── core/               ← config, database, security
│   │   ├── models/             ← SQLAlchemy models (18 טבלאות)
│   │   ├── schemas/            ← Pydantic schemas
│   │   └── services/           ← metrics, crew_agents
│   ├── alembic/                ← migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/         ← Layout, Sidebar, Header, UI
│       ├── pages/              ← כל עמודי האפליקציה
│       ├── hooks/              ← useAuth, usePolling, useWorkoutSession
│       └── services/           ← Axios API client
└── railway.toml
```

---

## Deployment — Railway

1. צור פרויקט ב-Railway
2. הוסף PostgreSQL database
3. הגדר Environment Variables:
   - `DATABASE_URL`
   - `SECRET_KEY`
   - `OPENAI_API_KEY`
4. חבר את ה-repo ל-Railway לדפלוי אוטומטי
