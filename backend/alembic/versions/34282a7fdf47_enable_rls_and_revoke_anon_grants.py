"""enable RLS + revoke anon/authenticated grants on all public tables

Revision ID: 34282a7fdf47
Revises: a1f4c9e7d3b6
Create Date: 2026-08-12 00:00:00.000000

Supabase's advisor flagged rls_disabled_in_public + sensitive_columns_exposed
(2026-08-09). Investigation confirmed live on staging (the app DB has lived
on Supabase Postgres since the 2026-08-07 migration, same project as the
avatars/exercise-media storage buckets -- NOT a separate unused project as
older comments in config.py/storage.py claimed):

- RLS was OFF on all 28 public-schema tables, no exceptions.
- Supabase's project-creation default privileges grant `anon` AND
  `authenticated` full SELECT/INSERT/UPDATE/DELETE/TRUNCATE on every new
  table in `public`, regardless of whether it's created via the dashboard
  or (as here) via Alembic connecting as the schema owner -- confirmed
  directly via information_schema.role_table_grants, not assumed.
- The backend never queries through PostgREST/an anon key (plain
  SQLAlchemy over DATABASE_URL; the only supabase-py usage is
  storage.py's avatars bucket, which uses the service_role key and
  therefore bypasses RLS regardless of what this migration does).

So the backend needs zero PostgREST-facing roles: RLS-enabled-with-no-
policies (default-deny) is the intended end state, not a starting point to
add policies onto. The REVOKE is defense-in-depth on top of RLS, not a
replacement for it -- either alone stops today's blanket anon access, but
both together mean a future accidental `GRANT` or a future permissive
policy each need the other to still be exploitable.

Does NOT touch ALTER DEFAULT PRIVILEGES, so a table added by a future
migration will again be born with RLS off and anon/authenticated grants,
per Supabase's project-level defaults -- out of scope here, flagged for a
follow-up if new tables become a recurring source of this drift.

*** PRODUCTION GUARD (added 2026-08-13, before this ever ran there) ***
`anon`/`authenticated` are Supabase-provisioned roles that don't exist on
production's database (plain Railway Postgres, confirmed via
`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')`
returning 0 rows there). A bare `REVOKE ... FROM anon, authenticated`
would raise `role "anon" does not exist` and abort the migration chain.
The REVOKE/GRANT below are wrapped in a DO block that only targets
whichever of those two roles actually exists, and is a no-op (does
nothing, including on production) when neither does. The ENABLE/DISABLE
ROW LEVEL SECURITY loops don't reference either role and are unaffected
by this -- RLS still gets enabled everywhere, including on production,
which is correct and desired regardless of the anon/authenticated
question.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '34282a7fdf47'
down_revision: Union[str, None] = 'a1f4c9e7d3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All 28 public-schema tables, as enumerated directly from pg_class against
# staging on 2026-08-12 (query in the investigation, not from models.py, so
# it also catches alembic_version itself).
PUBLIC_TABLES = [
    "ai_suggestions",
    "alembic_version",
    "consent_records",
    "email_verification_codes",
    "endurance_logs",
    "exercise_logs",
    "exercise_memories",
    "exercises_master",
    "food_logs",
    "food_master",
    "food_memories",
    "food_portions",
    "hydration_logs",
    "meals",
    "nutrition_plans",
    "password_reset_tokens",
    "personal_records",
    "push_subscriptions",
    "smart_progressions",
    "strength_logs",
    "user_memories",
    "user_profiles",
    "users",
    "webauthn_credentials",
    "weight_logs",
    "workout_exercises",
    "workout_plans",
    "workout_sessions",
]


def upgrade() -> None:
    for table in PUBLIC_TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY;')

    # Defense-in-depth: even if RLS were ever disabled again (or a
    # permissive policy added) by mistake, anon/authenticated have no
    # table-level grant left to fall back on. Guarded (see module
    # docstring) so this is a no-op on a DB where those roles don't exist,
    # e.g. production's plain Railway Postgres.
    op.execute("""
        DO $$
        DECLARE
            target_roles text;
        BEGIN
            SELECT string_agg(quote_ident(rolname), ', ')
            INTO target_roles
            FROM pg_roles
            WHERE rolname IN ('anon', 'authenticated');

            IF target_roles IS NOT NULL THEN
                EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %s', target_roles);
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    # Restore the original blanket grant Supabase's project defaults set up,
    # matching the pre-migration state exactly (confirmed via
    # information_schema.role_table_grants: both roles held every privilege
    # -- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER -- which is
    # what `ALL` expands to for a table). Guarded the same way as upgrade().
    op.execute("""
        DO $$
        DECLARE
            target_roles text;
        BEGIN
            SELECT string_agg(quote_ident(rolname), ', ')
            INTO target_roles
            FROM pg_roles
            WHERE rolname IN ('anon', 'authenticated');

            IF target_roles IS NOT NULL THEN
                EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %s', target_roles);
            END IF;
        END
        $$;
    """)

    for table in PUBLIC_TABLES:
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY;')
