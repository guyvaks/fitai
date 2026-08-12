"""alter default privileges to stop future tables inheriting anon/authenticated grants

Revision ID: 5b3a80e7fd1e
Revises: 34282a7fdf47
Create Date: 2026-08-12 00:00:00.000000

Closes a gap left by 34282a7fdf47 (enable RLS + revoke anon/authenticated
grants on all 28 *existing* public tables): that migration fixed the tables
that existed at the time, but Supabase's project-level default privileges
(set up once, at project creation, outside of any migration) still grant
`anon`/`authenticated` full CRUD on every *new* table the moment it's
created -- regardless of who creates it or how, including Alembic
connecting as the schema-owning role. Without this migration, the very
next `op.create_table(...)` in a future migration would silently re-open
exactly the hole 34282a7fdf47 just closed.

`ALTER DEFAULT PRIVILEGES` only affects objects created *after* it runs, by
the role that runs it (or the role(s) named in a FOR ROLE clause -- omitted
here because Alembic always connects as the same schema-owning role that
originally received Supabase's default grants, so there is only one role
whose future-object defaults need overriding). It has zero effect on
already-existing tables, which is exactly why 34282a7fdf47 had to enumerate
and fix them explicitly first.

*** IMPORTANT -- READ BEFORE ADDING A NEW TABLE IN A FUTURE MIGRATION ***
This migration stops a new table from being *reachable* via PostgREST's
anon/authenticated roles (no grant, so `42501 permission denied` even if
someone has a valid anon/authenticated key). It does NOT enable Row Level
Security on that new table -- Postgres has no default-privilege equivalent
for RLS, `rowsecurity` is a per-table flag set only by `ALTER TABLE ...
ENABLE ROW LEVEL SECURITY`, there is no `ALTER DEFAULT ... ENABLE RLS`.
A new table is therefore safe by *absence of grant* (this migration) but
NOT by RLS (still off, silently). That's an adequate belt (no grant = no
PostgREST access at all, matching every other table in this schema right
now), but not both belt and suspenders. Every future migration that adds a
table MUST include its own:

    op.execute('ALTER TABLE public."<new_table>" ENABLE ROW LEVEL SECURITY;')

See the CLAUDE.md migration-conventions note added alongside this file.

*** PRODUCTION GUARD (added 2026-08-13, before this ever ran there) ***
Same issue as 34282a7fdf47: `anon`/`authenticated` don't exist on
production's plain Railway Postgres (confirmed via pg_roles, 0 rows), so a
bare `ALTER DEFAULT PRIVILEGES ... FROM anon, authenticated` would raise
`role "anon" does not exist` and abort the migration chain there. Wrapped
the same way -- a DO block that only names whichever of the two roles
actually exists, and does nothing at all when neither does.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5b3a80e7fd1e'
down_revision: Union[str, None] = '34282a7fdf47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Guarded (see module docstring) so this is a no-op on a DB where
    # anon/authenticated don't exist, e.g. production's plain Railway
    # Postgres.
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
                EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %s', target_roles);
            END IF;
        END
        $$;
    """)


def downgrade() -> None:
    # Restores Supabase's original project-level default: new tables again
    # get the blanket anon/authenticated grant automatically. Matches what
    # 34282a7fdf47's downgrade() restores for already-existing tables, so a
    # full downgrade of both leaves the DB exactly as it was pre-2026-08-12.
    # Guarded the same way as upgrade().
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
                EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %s', target_roles);
            END IF;
        END
        $$;
    """)
