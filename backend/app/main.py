from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.v1.endpoints import auth, users, nutrition, agents, workouts, foods, exercises, admin, food_master, push
from app.core.rate_limit import limiter, rate_limit_exceeded_handler

app = FastAPI(title="FitAI API", version="1.0.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    # Starlette's allow_origins does exact string matching only -- "https://*.railway.app"
    # here previously was a silent no-op (never matched any real Origin header), which
    # masked the fact that staging's frontend domain was never actually allowed. This
    # regex is scoped to fitai's own two known Railway domains specifically, not all of
    # railway.app / up.railway.app, since that suffix is shared by every Railway-hosted
    # app on the platform -- with allow_credentials=True, a broader match would let any
    # other Railway app make credentialed requests here.
    allow_origin_regex=r"^https://(fitai-frontend-staging|poetic-vitality-production-41ea)\.up\.railway\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(nutrition.router, prefix="/api/v1/nutrition", tags=["nutrition"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["agents"])
app.include_router(workouts.router, prefix="/api/v1/workouts", tags=["workouts"])
app.include_router(foods.router, prefix="/api/v1/foods", tags=["foods"])
app.include_router(exercises.router, prefix="/api/v1/exercises", tags=["exercises"])
app.include_router(food_master.router, prefix="/api/v1/food-master", tags=["food-master"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(push.router, prefix="/api/v1/push", tags=["push"])


@app.get("/health")
def health():
    return {"status": "ok"}
