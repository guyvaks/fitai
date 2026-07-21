"""
Seed script for food_master, sourced from app.data.foods.FOODS.

Usage (run from backend/ directory, with the correct DATABASE_URL for the
target environment already set):

    python seed_food_master.py

This is idempotent: re-running it will not create duplicates, because it
upserts on canonical_name_he — none of the FOODS entries have an English
name, so canonical_name_en (unique but nullable) can't be the upsert key
here the way it is for exercises_master.
"""
from app.core.database import SessionLocal
from app.data.foods import FOODS
from app.models.fitness import FoodMaster


def seed() -> None:
    db = SessionLocal()
    try:
        created, updated = 0, 0
        for item in FOODS:
            existing = (
                db.query(FoodMaster)
                .filter(FoodMaster.canonical_name_he == item["name"])
                .first()
            )

            if existing:
                existing.category = item["category"]
                existing.calories_per_100g = item["calories"]
                existing.protein_per_100g = item["protein"]
                existing.carbs_per_100g = item["carbs"]
                existing.fat_per_100g = item["fat"]
                existing.is_active = True
                updated += 1
            else:
                db.add(
                    FoodMaster(
                        canonical_name_he=item["name"],
                        canonical_name_en=None,
                        category=item["category"],
                        calories_per_100g=item["calories"],
                        protein_per_100g=item["protein"],
                        carbs_per_100g=item["carbs"],
                        fat_per_100g=item["fat"],
                        fiber_per_100g=None,
                        aliases=[],
                        is_active=True,
                    )
                )
                created += 1

        db.commit()
        print(f"Done. Created: {created}, Updated: {updated}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
