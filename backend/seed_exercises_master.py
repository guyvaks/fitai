"""
Seed script for exercises_master.

Usage (run from backend/ directory, with the correct DATABASE_URL for the
target environment already set):

    python seed_exercises_master.py path/to/exercises_master_final.csv

This is idempotent: re-running it will not create duplicates, because it
upserts on canonical_name_en (the unique constraint added in the migration).
"""
import csv
import sys

from app.core.database import SessionLocal
from app.models.fitness import ExerciseMaster


def seed(csv_path: str) -> None:
    db = SessionLocal()
    try:
        created, updated = 0, 0
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing = (
                    db.query(ExerciseMaster)
                    .filter(ExerciseMaster.canonical_name_en == row["canonical_name_en"])
                    .first()
                )
                is_active = row["is_active"].strip().lower() == "true"

                if existing:
                    existing.canonical_name_he = row["canonical_name_he"]
                    existing.category = row["category"]
                    existing.muscle_group_primary = row["muscle_group_primary"]
                    existing.equipment = row["equipment"]
                    existing.is_active = is_active
                    updated += 1
                else:
                    db.add(
                        ExerciseMaster(
                            canonical_name_en=row["canonical_name_en"],
                            canonical_name_he=row["canonical_name_he"],
                            category=row["category"],
                            muscle_group_primary=row["muscle_group_primary"],
                            equipment=row["equipment"],
                            aliases=[],
                            is_active=is_active,
                        )
                    )
                    created += 1

        db.commit()
        print(f"Done. Created: {created}, Updated: {updated}")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python seed_exercises_master.py <path_to_csv>")
        sys.exit(1)
    seed(sys.argv[1])
