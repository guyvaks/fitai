"""Reconciles exercises_master against a corrected base-catalog CSV (the
228-row set Guy prepared on 2026-08-04 in 3 corrected Numbers files, one
row per intended-active exercise: canonical_name_en, canonical_name_he,
category, muscle_group_primary, equipment, is_active).

This is a *base-field* correction pass only -- it never touches
exercise_id/animation_webp_path/thumbnail_png_path/animation_template/
visual_group_id (the lifelike-v3 media reseed's columns, see
seed_exercises_master_v2.py) on any row, matched or not.

Usage (run from backend/ directory, with the correct DATABASE_URL for the
target environment already set):

    python reconcile_exercises_master.py <path_to_corrected_csv> [--dry-run]

For each row in the CSV:
  1. Match against exercises_master by canonical_name_en, exact first,
     then a normalized (punctuation/case-insensitive) fallback -- same
     matching strategy as seed_exercises_master_v2.py.
  2. If matched: update category/muscle_group_primary/equipment/
     canonical_name_he if they differ. Media columns are never touched.
  3. If not matched: this script does NOT create new rows -- the CSV is
     expected to be a subset of exercise *names* already present (a
     correction/pruning pass, not a reseed). A row with no match at all
     is treated as an error, since that means the corrected CSV
     introduced a name this script doesn't know how to reconcile.

Every current exercises_master row NOT matched by any CSV row is
deactivated (is_active=false) -- never hard-deleted, and media fields on
deactivated rows are left exactly as they were (not nulled).
"""
import argparse
import csv
import re
import sys

from app.core.database import SessionLocal
from app.models.fitness import ExerciseMaster


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def reconcile(csv_path: str, dry_run: bool) -> int:
    db = SessionLocal()
    try:
        with open(csv_path, encoding="utf-8") as f:
            corrected = list(csv.DictReader(f))

        db_rows = db.query(ExerciseMaster).all()
        db_by_exact = {
            (r.canonical_name_en or "").strip().lower(): r for r in db_rows if r.canonical_name_en
        }
        db_by_norm = {}
        for r in db_rows:
            if r.canonical_name_en:
                db_by_norm.setdefault(normalize(r.canonical_name_en), []).append(r)

        matched_ids = set()
        updated, unchanged, unmatched = 0, 0, []
        fields = ["category", "muscle_group_primary", "equipment"]

        for c in corrected:
            name_en = c["canonical_name_en"].strip()
            row = db_by_exact.get(name_en.lower())
            if not row:
                candidates = db_by_norm.get(normalize(name_en))
                if candidates and len(candidates) == 1:
                    row = candidates[0]
                elif candidates and len(candidates) > 1:
                    unmatched.append(f"{name_en} (ambiguous normalized match)")
                    continue
            if not row:
                unmatched.append(name_en)
                continue

            matched_ids.add(row.id)
            diffs = {f: c[f] for f in fields if (getattr(row, f) or "") != (c[f] or "")}
            if (row.canonical_name_he or "") != (c["canonical_name_he"] or ""):
                diffs["canonical_name_he"] = c["canonical_name_he"]

            if diffs:
                for k, v in diffs.items():
                    setattr(row, k, v)
                updated += 1
            else:
                unchanged += 1

        if unmatched:
            print(f"ABORT: {len(unmatched)} corrected-CSV row(s) have no match in exercises_master:")
            for n in unmatched:
                print(f"  - {n}")
            db.rollback()
            return 1

        to_deactivate = [r for r in db_rows if r.id not in matched_ids]
        for r in to_deactivate:
            r.is_active = False

        print(f"Matched: {len(matched_ids)}")
        print(f"Updated (field diffs applied): {updated}")
        print(f"Unchanged: {unchanged}")
        print(f"Deactivated: {len(to_deactivate)}")

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
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sys.exit(reconcile(args.csv_path, args.dry_run))
