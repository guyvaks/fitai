"""One-off uploader: pushes the lifelike-v3 animation/thumbnail media files
into the Supabase `exercise-media` bucket, preserving the CSV's relative
path structure (animations/webp/<id>.webp, thumbnails/<id>.png) as the
object key, so it matches exercises_master.animation_webp_path /
thumbnail_png_path exactly.

Usage:
    python upload_exercise_media.py <media_root>

Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment (same
credentials the app itself uses for avatar storage).
"""
import os
import sys

from supabase import create_client

BUCKET = "exercise-media"


def _content_type(path: str) -> str:
    if path.endswith(".webp"):
        return "image/webp"
    if path.endswith(".png"):
        return "image/png"
    return "application/octet-stream"


def upload(media_root: str) -> None:
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(supabase_url, supabase_key)
    bucket = client.storage.from_(BUCKET)

    targets = []
    for sub in ("animations/webp", "thumbnails"):
        d = os.path.join(media_root, sub)
        for name in sorted(os.listdir(d)):
            local_path = os.path.join(d, name)
            if os.path.isfile(local_path):
                object_key = f"{sub}/{name}"
                targets.append((local_path, object_key))

    print(f"Uploading {len(targets)} files to bucket '{BUCKET}'...")
    uploaded, failed = 0, []
    for local_path, object_key in targets:
        with open(local_path, "rb") as f:
            data = f.read()
        try:
            bucket.upload(
                object_key,
                data,
                {"content-type": _content_type(object_key), "upsert": "true"},
            )
            uploaded += 1
        except Exception as e:
            failed.append((object_key, str(e)))

    print(f"Uploaded: {uploaded}")
    print(f"Failed: {len(failed)}")
    for key, err in failed:
        print(f"  - {key}: {err}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python upload_exercise_media.py <media_root>")
        sys.exit(1)
    upload(sys.argv[1])
