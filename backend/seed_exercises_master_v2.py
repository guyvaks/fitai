"""Seed/update script for exercises_master from the "lifelike v3 equipment"
CSV (384 exercises, Hebrew canonical names, muscle/equipment tagging, and
animation/thumbnail media references).

Usage (run from backend/ directory, with the correct DATABASE_URL for the
target environment already set):

    python seed_exercises_master_v2.py <path_to_csv> <path_to_media_root> [--dry-run]

<path_to_media_root> is the directory the CSV's media paths are relative to
(the "lifelike_v3_equipment" folder containing animations/webp/ and
thumbnails/).

Matching / upsert key: exercise_id (new, stable slug column added by
migration 6fdb93b8e6b1). Since rows seeded before this reseed never had an
exercise_id, first-run matching falls back to canonical_name_en:

  1. existing row already carries this exercise_id (idempotent re-run)
  2. existing row's canonical_name_en matches exactly (case-insensitive)
  3. existing row's canonical_name_en matches after stripping all
     punctuation/whitespace (catches pure typographic renames like
     "Farmers Walk" -> "Farmer's Walk"; every such match is printed so it
     can be reviewed -- this is deliberately not applied to substantive
     renames like "Goblet Squat" -> "Goblet Squat (Dumbbell)", which the v3
     CSV treats as a distinct new exercise alongside "Kettlebell Goblet
     Squat", so those fall through to (4) and are created fresh)
  4. no match -> create a new row

Rows in the table that have no counterpart in the CSV are left completely
untouched (not modified, not deactivated) -- the CSV only adds/updates, per
the task's explicit instructions not to delete anything outside its scope.

A row is only created/updated if both its animation_webp and thumbnail_png
files exist under <media_root>; otherwise it is skipped and reported as a
missing-media error rather than written with a dangling path.
"""
import argparse
import csv
import os
import re
import sys

from app.core.database import SessionLocal
from app.models.fitness import ExerciseMaster


def _normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def seed(csv_path: str, media_root: str, dry_run: bool) -> int:
    db = SessionLocal()
    created, updated, renamed_matches, missing_media, seen_exercise_ids = (
        0,
        0,
        [],
        [],
        set(),
    )

    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))

        # exercise_id uniqueness within the CSV itself, before touching the DB.
        csv_ids = [r["exercise_id"].strip() for r in rows]
        dupes_in_csv = {i for i in csv_ids if csv_ids.count(i) > 1}
        if dupes_in_csv:
            print(f"ABORT: duplicate exercise_id values within the CSV itself: {sorted(dupes_in_csv)}")
            return 1

        existing_by_exercise_id = {
            e.exercise_id: e
            for e in db.query(ExerciseMaster).filter(ExerciseMaster.exercise_id.isnot(None))
        }
        existing_by_name_exact = {
            (e.canonical_name_en or "").strip().lower(): e
            for e in db.query(ExerciseMaster)
            if e.canonical_name_en
        }
        existing_by_name_norm = {
            _normalize(e.canonical_name_en): e
            for e in db.query(ExerciseMaster)
            if e.canonical_name_en
        }

        for row in rows:
            exercise_id = row["exercise_id"].strip()
            seen_exercise_ids.add(exercise_id)

            webp_rel = row["animation_webp"].strip()
            png_rel = row["thumbnail_png"].strip()
            webp_abs = os.path.join(media_root, webp_rel)
            png_abs = os.path.join(media_root, png_rel)
            if not os.path.isfile(webp_abs) or not os.path.isfile(png_abs):
                missing_media.append(
                    {
                        "exercise_id": exercise_id,
                        "name_he": row["canonical_name_he"],
                        "missing_webp": not os.path.isfile(webp_abs),
                        "missing_png": not os.path.isfile(png_abs),
                    }
                )
                continue

            is_active = row["is_active"].strip().lower() == "true"
            name_en_key = row["canonical_name_en"].strip().lower()

            existing = existing_by_exercise_id.get(exercise_id)
            match_kind = "exercise_id" if existing else None
            if not existing:
                existing = existing_by_name_exact.get(name_en_key)
                match_kind = "exact_name" if existing else None
            if not existing:
                candidate = existing_by_name_norm.get(_normalize(row["canonical_name_en"]))
                if candidate:
                    existing = candidate
                    match_kind = "normalized_name"
                    renamed_matches.append(
                        f"{candidate.canonical_name_en!r} -> {row['canonical_name_en']!r} ({exercise_id})"
                    )

            if existing:
                existing.exercise_id = exercise_id
                existing.canonical_name_he = row["canonical_name_he"]
                existing.canonical_name_en = row["canonical_name_en"]
                existing.category = row["category"]
                existing.muscle_group_primary = row["muscle_group_primary"]
                existing.equipment = row["equipment"]
                existing.is_active = is_active
                existing.animation_template = row["animation_template"]
                existing.animation_webp_path = webp_rel
                existing.thumbnail_png_path = png_rel
                existing.visual_group_id = row["visual_group_id"]
                updated += 1
            else:
                db.add(
                    ExerciseMaster(
                        exercise_id=exercise_id,
                        canonical_name_en=row["canonical_name_en"],
                        canonical_name_he=row["canonical_name_he"],
                        category=row["category"],
                        muscle_group_primary=row["muscle_group_primary"],
                        equipment=row["equipment"],
                        aliases=[],
                        is_active=is_active,
                        animation_template=row["animation_template"],
                        animation_webp_path=webp_rel,
                        thumbnail_png_path=png_rel,
                        visual_group_id=row["visual_group_id"],
                    )
                )
                created += 1

        dup_check = (
            db.query(ExerciseMaster.exercise_id)
            .filter(ExerciseMaster.exercise_id.isnot(None))
            .all()
        )
        # flush pending adds so the duplicate check below sees this run's new rows too
        db.flush()
        all_ids_after = [
            row.exercise_id
            for row in db.query(ExerciseMaster.exercise_id).filter(ExerciseMaster.exercise_id.isnot(None))
        ]
        dup_after = {i for i in all_ids_after if all_ids_after.count(i) > 1}

        print(f"CSV rows: {len(rows)}")
        print(f"Created: {created}")
        print(f"Updated: {updated}")
        print(f"Skipped (missing media): {len(missing_media)}")
        print(f"Renamed-match upserts (typographic-only, review these): {len(renamed_matches)}")
        for m in renamed_matches:
            print(f"  - {m}")
        if missing_media:
            print("Missing media detail:")
            for m in missing_media:
                print(f"  - {m['exercise_id']} ({m['name_he']}): "
                      f"webp_missing={m['missing_webp']} png_missing={m['missing_png']}")
        if dup_after:
            print(f"ABORT: duplicate exercise_id after upsert: {sorted(dup_after)}")
            db.rollback()
            return 1

        if dry_run:
            print("DRY RUN — rolling back, no changes committed.")
            db.rollback()
        else:
            db.commit()
            print("Committed.")

        return 0
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path")
    parser.add_argument("media_root")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sys.exit(seed(args.csv_path, args.media_root, args.dry_run))
