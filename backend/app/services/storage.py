"""Supabase Storage helper for the `avatars` bucket.

This is a separate, otherwise-unused Supabase project used only for file
storage -- the main app DB stays on Railway Postgres. The bucket is private,
so avatars are served via short-lived signed URLs rather than a public URL.

Each user has at most one avatar, stored at a fixed path ({user_id}/avatar.jpg)
and overwritten (upsert) on re-upload, so there is nothing to garbage-collect
on re-upload.
"""
import logging
from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache
def _client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def _bucket():
    return _client().storage.from_(settings.SUPABASE_AVATARS_BUCKET)


def path_for(user_id) -> str:
    return f"{user_id}/avatar.jpg"


def upload_avatar(user_id, data: bytes, content_type: str = "image/jpeg") -> str:
    """Uploads (overwriting any existing file) and returns the storage path."""
    path = path_for(user_id)
    _bucket().upload(
        path,
        data,
        {"content-type": content_type, "upsert": "true"},
    )
    return path


def delete_avatar(user_id) -> None:
    try:
        _bucket().remove([path_for(user_id)])
    except Exception:
        # Best-effort: a missing/already-deleted object must not block the
        # caller from clearing avatar_url on the user row.
        logger.exception("Failed to delete avatar for user %s", user_id)


def get_signed_url(path: str, expires_in: int = 3600) -> str:
    result = _bucket().create_signed_url(path, expires_in)
    return result.get("signedURL") or result.get("signedUrl") or result["signed_url"]
