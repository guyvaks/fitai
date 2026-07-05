from typing import Optional
from pydantic_settings import BaseSettings

# Identifies the production Railway Postgres instance (see fitai_deployment_links
# memory / Session Log 2026-07-03) — used to fail fast if local dev ever points here.
PRODUCTION_DB_PORT = "31062"


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/fitai"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ENVIRONMENT: str = "development"
    ANTHROPIC_API_KEY: Optional[str] = None

    class Config:
        # .env holds safe placeholder defaults (committed-safe); .env.local holds
        # real local secrets (gitignored) and overrides .env when present.
        env_file = (".env", ".env.local")


settings = Settings()

if settings.ENVIRONMENT in ("development", "test") and f":{PRODUCTION_DB_PORT}/" in settings.DATABASE_URL:
    raise RuntimeError(
        f"Refusing to start: ENVIRONMENT={settings.ENVIRONMENT!r} but DATABASE_URL points at the "
        f"production database (port {PRODUCTION_DB_PORT}). Point .env.local at staging or a local DB instead."
    )
