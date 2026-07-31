"""
Seed script for the USDA-based food_master reseed (395 items) + food_portions.

Usage (run from backend/ directory, with the correct DATABASE_URL for the
target environment already set):

    python seed_food_master_v2.py <path_to_master_csv> <path_to_portions_csv> [--dry-run]

food_master upsert key is fdc_id (NOT canonical_name_he, unlike
seed_food_master.py) -- the legacy 71-ish rows from that older seed have no
fdc_id at all, so they're never touched by the upsert itself. Idempotent:
re-running with the same CSVs updates the same fdc_id rows in place and
re-derives the same preserve/deactivate decisions every time.

food_portions has no natural single-row unique key (one food can have many
portions), so idempotency is done per fdc_id: existing portions for any
fdc_id present in the CSV are deleted and reinserted fresh on every run.

Legacy (pre-USDA, fdc_id IS NULL) rows are handled last: anything in
PRESERVED_HE_NAMES (Israeli processed/prepared foods with no USDA Foundation
Foods equivalent) is left completely untouched. Every other legacy row is
soft-deactivated (is_active=False, never hard-deleted) since it's now
superseded by an equivalent USDA item. The fuzzy-match "matched to" note in
the log is best-effort only (SequenceMatcher, same technique as
check_similar_food in app/api/v1/endpoints/food_master.py) -- it does not
affect the preserve/deactivate decision itself, which is driven solely by
the hardcoded preserve set.

--dry-run runs the full read + matching logic and prints the same report,
but rolls back instead of committing.
"""
import csv
import sys
from difflib import SequenceMatcher

from app.core.database import SessionLocal
from app.models.fitness import FoodMaster, FoodPortion

# 19 USDA-style categories (new dataset) -> the app's existing 7-value
# FoodCategory enum (schemas/food.py), so the existing category filter/
# suggest-flow taxonomy doesn't need to change. category_en preserves the
# real USDA category name as-is for reference.
CATEGORY_MAP = {
    "ירקות ומוצרי ירקות": "ירקות",
    "פירות ומיצי פירות": "פירות",
    "מוצרי חלב וביצים": "מוצרי חלב",
    "משקאות": "מוצרי חלב",
    "דגנים ופסטה": "פחמימות",
    "מוצרי מאפה": "פחמימות",
    "מזון מסעדות": "פחמימות",
    "ממתקים": "פחמימות",
    "קטניות ומוצרי קטניות": "חלבונים",
    "דגים ופירות ים": "חלבונים",
    "מוצרי בקר": "חלבונים",
    "נקניקים ובשרי מעדנייה": "חלבונים",
    "מוצרי עוף": "חלבונים",
    "מוצרי חזיר": "חלבונים",
    "כבש, עגל ובשר ציד": "חלבונים",
    "שומנים ושמנים": "שומנים",
    "אגוזים וזרעים": "שומנים",
    "תבלינים ועשבי תיבול": "שומנים",
    "מרקים, רטבים ורוטבי צלי": "ירקות",
}

# Israeli processed/prepared foods with no USDA Foundation Foods equivalent
# -- must never be deactivated by this script, regardless of dataset changes.
PRESERVED_HE_NAMES = {
    "המבורגר בקר (90% רזה)",
    "שניצל עוף (ללא פירורים)",
    "קציצות הודו",
    "פיתה לבנה",
    "זוקיני",
    "חטיף חלבון (מוצק)",
    "גרנולה (ללא סוכר)",
    "פופקורן (ללא חמאה)",
    "אבקת חלבון (וואי)",
}


def _to_float(value):
    value = (value or "").strip()
    return float(value) if value else None


def _to_required_float(value):
    """Like _to_float, but for the 4 NOT NULL macro columns
    (calories/protein/carbs/fat_per_100g) -- some legitimate USDA rows (e.g.
    plain table salt) have no value for these, and the columns don't accept
    NULL, so a missing value defaults to 0 rather than failing the insert
    (Guy's explicit call, not a data-quality assumption). Returns
    (value, was_defaulted) so callers can report which rows got the
    substitution."""
    parsed = _to_float(value)
    if parsed is None:
        return 0.0, True
    return parsed, False


def _upsert_food_master(db, master_csv_path):
    created, updated = 0, 0
    names_he = []
    zero_defaulted = []  # (fdc_id, name_he, field) for rows missing a required macro
    with open(master_csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fdc_id = row["מזהה_FDC"].strip()
            name_he = row["שם_המזון_בעברית"].strip()
            category_he_raw = row["קטגוריה_בעברית"].strip()
            category_en_raw = row["קטגוריה_באנגלית"].strip()
            mapped_category = CATEGORY_MAP.get(category_he_raw)
            if mapped_category is None:
                raise ValueError(f"No CATEGORY_MAP entry for {category_he_raw!r} (fdc_id={fdc_id})")

            calories, calories_defaulted = _to_required_float(row["קלוריות"])
            protein, protein_defaulted = _to_required_float(row["חלבון_גרם"])
            fat, fat_defaulted = _to_required_float(row["שומן_גרם"])
            carbs, carbs_defaulted = _to_required_float(row["פחמימות_גרם"])
            for field_name, was_defaulted in (
                ("calories_per_100g", calories_defaulted),
                ("protein_per_100g", protein_defaulted),
                ("fat_per_100g", fat_defaulted),
                ("carbs_per_100g", carbs_defaulted),
            ):
                if was_defaulted:
                    zero_defaulted.append((fdc_id, name_he, field_name))

            fields = dict(
                canonical_name_he=name_he,
                canonical_name_en=row["שם_המזון_באנגלית"].strip(),
                category=mapped_category,
                category_en=category_en_raw,
                calories_per_100g=calories,
                protein_per_100g=protein,
                fat_per_100g=fat,
                carbs_per_100g=carbs,
                fiber_per_100g=_to_float(row["סיבים_גרם"]),
                sugar_g=_to_float(row["סוכרים_גרם"]),
                sodium_mg=_to_float(row["נתרן_מג"]),
                potassium_mg=_to_float(row["אשלגן_מג"]),
                calcium_mg=_to_float(row["סידן_מג"]),
                iron_mg=_to_float(row["ברזל_מג"]),
                saturated_fat_g=_to_float(row["שומן_רווי_גרם"]),
                cholesterol_mg=_to_float(row["כולסטרול_מג"]),
                is_active=True,
            )

            names_he.append(name_he)
            existing = db.query(FoodMaster).filter(FoodMaster.fdc_id == fdc_id).first()
            if existing:
                for key, value in fields.items():
                    setattr(existing, key, value)
                updated += 1
            else:
                db.add(FoodMaster(fdc_id=fdc_id, aliases=[], created_by_user_id=None, **fields))
                created += 1

    return created, updated, names_he, zero_defaulted


def _reload_food_portions(db, portions_csv_path):
    rows_by_fdc_id = {}
    with open(portions_csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            fdc_id = row["מזהה_FDC"].strip()
            rows_by_fdc_id.setdefault(fdc_id, []).append(row)

    portions_created = 0
    for fdc_id, rows in rows_by_fdc_id.items():
        db.query(FoodPortion).filter(FoodPortion.fdc_id == fdc_id).delete()
        for row in rows:
            db.add(
                FoodPortion(
                    fdc_id=fdc_id,
                    quantity=_to_float(row["כמות"]),
                    unit_he=row["יחידה_בעברית"].strip() or None,
                    unit_en=row["יחידה_באנגלית"].strip(),
                    description=row["תיאור_מנה"].strip() or None,
                    weight_grams=_to_float(row["משקל_בגרמים"]),
                )
            )
            portions_created += 1

    return portions_created, len(rows_by_fdc_id)


def _best_fuzzy_match(name_he, candidates):
    best_ratio, best_name = 0.0, None
    for candidate in candidates:
        ratio = SequenceMatcher(None, name_he, candidate).ratio()
        if ratio > best_ratio:
            best_ratio, best_name = ratio, candidate
    return best_name, best_ratio


def _resolve_legacy_rows(db, new_names_he):
    """Preserve/deactivate the fdc_id-less (pre-USDA) rows. Only rows with
    fdc_id IS NULL are considered, which is itself what makes this safe to
    re-run -- rows this script creates always have fdc_id set."""
    preserved, deactivated = 0, 0
    log_lines = []
    legacy_rows = db.query(FoodMaster).filter(FoodMaster.fdc_id.is_(None)).all()

    for food in legacy_rows:
        if food.canonical_name_he in PRESERVED_HE_NAMES:
            preserved += 1
            log_lines.append(f"PRESERVE     {food.canonical_name_he}")
            continue

        if food.is_active:
            match_name, ratio = _best_fuzzy_match(food.canonical_name_he, new_names_he)
            food.is_active = False
            deactivated += 1
            log_lines.append(
                f"DEACTIVATE   {food.canonical_name_he}  "
                f"(likely superseded by: {match_name!r}, similarity={ratio:.2f})"
            )

    return preserved, deactivated, log_lines


def seed(master_csv_path: str, portions_csv_path: str, dry_run: bool = False, db=None) -> None:
    """db is injectable for tests (against the sqlite test engine); the CLI
    entrypoint always uses the real SessionLocal and owns its lifecycle."""
    owns_session = db is None
    if db is None:
        db = SessionLocal()
    try:
        created, updated, new_names_he, zero_defaulted = _upsert_food_master(db, master_csv_path)
        portions_created, portion_fdc_ids = _reload_food_portions(db, portions_csv_path)

        preserved, deactivated, log_lines = _resolve_legacy_rows(db, new_names_he)

        if dry_run:
            db.rollback()
        else:
            db.commit()

        print(f"food_master: created={created} updated={updated}")
        print(f"food_portions: created={portions_created} rows across {portion_fdc_ids} fdc_id(s)")
        print(f"legacy rows: preserved={preserved} deactivated={deactivated}")
        distinct_foods = len({fdc_id for fdc_id, _, _ in zero_defaulted})
        print(f"zero-defaulted required macros: {len(zero_defaulted)} field(s) across {distinct_foods} food(s)")
        preview_limit = 20
        for fdc_id, name_he, field_name in zero_defaulted[:preview_limit]:
            print(f"  ZERO-DEFAULT  fdc_id={fdc_id}  {name_he}  {field_name}")
        if len(zero_defaulted) > preview_limit:
            print(f"  ... and {len(zero_defaulted) - preview_limit} more (showing first {preview_limit})")
        print()
        for line in log_lines:
            print(line)
        if dry_run:
            print("\n[dry-run] no changes were committed.")
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if len(args) != 2:
        print("Usage: python seed_food_master_v2.py <master_csv_path> <portions_csv_path> [--dry-run]")
        sys.exit(1)
    seed(args[0], args[1], dry_run=dry_run)
