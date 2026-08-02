---
name: railway-migration-deploy
description: Steps to run a new Alembic migration against FitAI's staging/production Postgres via the Railway CLI, after a merge to main that includes a new migration. Use when a merge to main added a migration file and it needs to be applied to the live databases.
---

Railway does not run migrations automatically. After any merge to `main` that includes a new migration:

1. `cd ~/fitai/backend`
2. `railway link` → project fitai → **production** → **Postgres**
3. `railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" ENVIRONMENT=production alembic upgrade head'`
4. Verify: `railway run bash -c 'psql "$DATABASE_PUBLIC_URL" -c "SELECT * FROM alembic_version;"'`
5. Repeat steps 2-4 for **staging** too (if not already run there)

Notes:
- `ENVIRONMENT=production` is required to bypass the guard in `config.py` that blocks a dev→production connection.
- Important: `railway link` to **Postgres** (not fitai backend) — that's where `DATABASE_PUBLIC_URL` lives.

⚠️ This sequence requires explicit approval every time per the production hard rule in CLAUDE.md — it is not a standing authorization.
