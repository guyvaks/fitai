"""
One-off data migration: copy existing users.avatar_data (Postgres bytea)
into Supabase Storage and set users.avatar_url.

Does NOT touch avatar_data/avatar_content_type -- those columns are left in
place so this is safe to re-run and safe to roll back (nothing is dropped).
Safe to re-run: any user who already has avatar_url set is skipped.

Usage: python scripts/migrate_avatars_to_supabase.py [--dry-run]

Must be run with DATABASE_URL/SUPABASE_* pointed at the environment you
intend to migrate (staging first) -- this script does not select an
environment for you and does not run automatically as part of any migration
or deploy.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import User
from app.services import storage as avatar_storage


def _print_effective_storage_config() -> None:
    # SUPABASE_URL must be the bare project URL (e.g. https://xxxx.supabase.co),
    # NOT the REST API URL -- the supabase-py client builds
    # storage_url = f"{SUPABASE_URL}/storage/v1" via plain string concatenation
    # (see supabase/_sync/client.py), so if SUPABASE_URL already ends in
    # "/rest/v1" the resulting URL becomes ".../rest/v1/storage/v1", which the
    # Supabase gateway routes to PostgREST -- producing exactly the
    # PGRST125 "Invalid path specified" error seen from a Storage call.
    url = settings.SUPABASE_URL or "(unset)"
    print(f"SUPABASE_URL={url}")
    print(f"  -> derived storage_url={url}/storage/v1")
    print(f"SUPABASE_AVATARS_BUCKET={settings.SUPABASE_AVATARS_BUCKET}")
    if url.rstrip("/").endswith(("/rest/v1", "/storage/v1", "/auth/v1")):
        print(
            "  WARNING: SUPABASE_URL looks like it already includes an API "
            "sub-path -- it should be the bare project URL only.",
            file=sys.stderr,
        )


def _describe_exception(exc: BaseException) -> str:
    """Full diagnostic string: exception type/message plus every chained
    cause/context, with the underlying HTTP status/body if present.

    Needed because storage3's error path (file_api.py _request()) does
    `resp["error"]` unguarded when the Storage API returns an error body
    without an "error" key -- that raises a bare KeyError('error') which
    *replaces* the real httpx.HTTPStatusError, so a plain `str(exc)` on the
    KeyError only ever prints "'error'" and hides the actual status
    code/message. Python still keeps the original exception as
    `__context__`, so walk the chain to recover it.
    """
    parts = []
    seen = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        response = getattr(current, "response", None)
        if response is not None:
            try:
                request_url = getattr(response.request, "url", None) if getattr(response, "request", None) else None
                url_part = f" [{request_url}]" if request_url else ""
                parts.append(
                    f"{type(current).__name__}: HTTP {response.status_code}{url_part} - {response.text}"
                )
            except Exception:
                parts.append(f"{type(current).__name__}: {current!r}")
        else:
            parts.append(f"{type(current).__name__}: {current!r}")
        current = current.__cause__ or current.__context__
    return " | caused by ".join(parts)


def migrate(dry_run: bool = False) -> None:
    _print_effective_storage_config()
    db = SessionLocal()
    migrated = 0
    skipped = 0
    failed = 0
    try:
        users = (
            db.query(User)
            .filter(User.avatar_data.isnot(None))
            .filter(User.avatar_url.is_(None))
            .all()
        )
        print(f"Found {len(users)} user(s) with avatar_data and no avatar_url.")

        for user in users:
            if dry_run:
                print(f"[dry-run] would migrate avatar for user {user.id} ({user.email})")
                continue
            try:
                content_type = user.avatar_content_type or "image/jpeg"
                path = avatar_storage.upload_avatar(user.id, user.avatar_data, content_type)
                user.avatar_url = path
                db.commit()
                migrated += 1
                print(f"OK   user {user.id} ({user.email}) -> {path}")
            except Exception as exc:
                db.rollback()
                failed += 1
                print(
                    f"FAIL user {user.id} ({user.email}): {_describe_exception(exc)}",
                    file=sys.stderr,
                )

        skipped = (
            db.query(User)
            .filter(User.avatar_data.isnot(None))
            .filter(User.avatar_url.isnot(None))
            .count()
        )
    finally:
        db.close()

    if not dry_run:
        print(f"Done. migrated={migrated} failed={failed} already_had_avatar_url={skipped}")


if __name__ == "__main__":
    migrate(dry_run="--dry-run" in sys.argv)
