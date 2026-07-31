"""Tests for seed_food_master_v2.py's upsert/deactivate/portions logic,
run against the sqlite test DB via an injected session (see seed()'s db=
param) rather than the real SessionLocal it uses when run as a script."""
import csv

from app.models.fitness import FoodMaster, FoodPortion
from seed_food_master_v2 import PRESERVED_HE_NAMES, seed

MASTER_HEADER = [
    "מזהה_FDC", "שם_המזון_באנגלית", "שם_המזון_בעברית", "סוג_המזון",
    "קטגוריה_בעברית", "קטגוריה_באנגלית", "כמות_בסיס_גרם", "קלוריות",
    "חלבון_גרם", "שומן_גרם", "פחמימות_גרם", "סיבים_גרם", "סוכרים_גרם",
    "נתרן_מג", "אשלגן_מג", "סידן_מג", "ברזל_מג", "שומן_רווי_גרם", "כולסטרול_מג",
]
MASTER_ROWS = [
    ["1001", "Tomatoes, raw", "עגבניות, נא", "מזון יסוד",
     "ירקות ומוצרי ירקות", "Vegetables and Vegetable Products", "100", "27",
     "0.83", "0.63", "5.51", "2.1", "", "6", "260", "11", "0.33", "", ""],
    ["1002", "Beef, ground, raw", "בקר, טחון, נא", "מזון יסוד",
     "מוצרי בקר", "Beef Products", "100", "254",
     "17.2", "20", "0", "", "", "72", "270", "18", "2.1", "8.1", "78"],
]

PORTIONS_HEADER = ["מזהה_FDC", "כמות", "יחידה_בעברית", "יחידה_באנגלית", "תיאור_מנה", "משקל_בגרמים"]
PORTIONS_ROWS = [
    ["1001", "1", "כוס", "cup", "", "180"],
    ["1001", "1", "יחידה", "item", "medium", "123"],
    ["1002", "1", "", "cup", "", "225"],
]


def _write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)
    return str(path)


def _seed_legacy_food(db_session, name_he, is_active=True):
    food = FoodMaster(
        canonical_name_he=name_he,
        category="פחמימות",
        calories_per_100g=100,
        protein_per_100g=5,
        carbs_per_100g=20,
        fat_per_100g=1,
        aliases=[],
        is_active=is_active,
        fdc_id=None,
    )
    db_session.add(food)
    db_session.commit()
    db_session.refresh(food)
    return food


def test_seed_creates_food_master_rows_with_mapped_category(tmp_path, db_session):
    master_csv = _write_csv(tmp_path / "master.csv", MASTER_HEADER, MASTER_ROWS)
    portions_csv = _write_csv(tmp_path / "portions.csv", PORTIONS_HEADER, PORTIONS_ROWS)

    seed(master_csv, portions_csv, db=db_session)

    tomato = db_session.query(FoodMaster).filter(FoodMaster.fdc_id == "1001").first()
    assert tomato is not None
    assert tomato.canonical_name_he == "עגבניות, נא"
    assert tomato.category == "ירקות"
    assert tomato.category_en == "Vegetables and Vegetable Products"
    assert tomato.sodium_mg == 6.0
    assert tomato.sugar_g is None
    assert tomato.is_active is True

    beef = db_session.query(FoodMaster).filter(FoodMaster.fdc_id == "1002").first()
    assert beef.category == "חלבונים"
    assert beef.saturated_fat_g == 8.1
    assert beef.cholesterol_mg == 78.0


def test_seed_is_idempotent_on_rerun(tmp_path, db_session):
    master_csv = _write_csv(tmp_path / "master.csv", MASTER_HEADER, MASTER_ROWS)
    portions_csv = _write_csv(tmp_path / "portions.csv", PORTIONS_HEADER, PORTIONS_ROWS)

    seed(master_csv, portions_csv, db=db_session)
    first_count = db_session.query(FoodMaster).filter(FoodMaster.fdc_id.isnot(None)).count()

    seed(master_csv, portions_csv, db=db_session)
    second_count = db_session.query(FoodMaster).filter(FoodMaster.fdc_id.isnot(None)).count()

    assert first_count == 2
    assert second_count == 2


def test_seed_preserves_hardcoded_israeli_foods(tmp_path, db_session):
    preserved_name = next(iter(PRESERVED_HE_NAMES))
    preserved = _seed_legacy_food(db_session, preserved_name, is_active=True)

    master_csv = _write_csv(tmp_path / "master.csv", MASTER_HEADER, MASTER_ROWS)
    portions_csv = _write_csv(tmp_path / "portions.csv", PORTIONS_HEADER, PORTIONS_ROWS)
    seed(master_csv, portions_csv, db=db_session)

    db_session.refresh(preserved)
    assert preserved.is_active is True
    assert preserved.fdc_id is None


def test_seed_deactivates_legacy_non_preserved_rows(tmp_path, db_session):
    legacy = _seed_legacy_food(db_session, "מאכל ישן לא ב-USDA", is_active=True)

    master_csv = _write_csv(tmp_path / "master.csv", MASTER_HEADER, MASTER_ROWS)
    portions_csv = _write_csv(tmp_path / "portions.csv", PORTIONS_HEADER, PORTIONS_ROWS)
    seed(master_csv, portions_csv, db=db_session)

    db_session.refresh(legacy)
    assert legacy.is_active is False


def test_seed_dry_run_makes_no_changes(tmp_path, db_session):
    legacy = _seed_legacy_food(db_session, "מאכל ישן לבדיקת דריי-ראן", is_active=True)
    before_count = db_session.query(FoodMaster).count()

    master_csv = _write_csv(tmp_path / "master.csv", MASTER_HEADER, MASTER_ROWS)
    portions_csv = _write_csv(tmp_path / "portions.csv", PORTIONS_HEADER, PORTIONS_ROWS)
    seed(master_csv, portions_csv, dry_run=True, db=db_session)

    after_count = db_session.query(FoodMaster).count()
    db_session.refresh(legacy)
    assert after_count == before_count
    assert db_session.query(FoodMaster).filter(FoodMaster.fdc_id == "1001").first() is None
    assert legacy.is_active is True


def test_seed_food_portions_created_and_idempotent_per_fdc_id(tmp_path, db_session):
    master_csv = _write_csv(tmp_path / "master.csv", MASTER_HEADER, MASTER_ROWS)
    portions_csv = _write_csv(tmp_path / "portions.csv", PORTIONS_HEADER, PORTIONS_ROWS)

    seed(master_csv, portions_csv, db=db_session)
    tomato_portions = db_session.query(FoodPortion).filter(FoodPortion.fdc_id == "1001").all()
    assert len(tomato_portions) == 2
    assert {p.unit_en for p in tomato_portions} == {"cup", "item"}

    seed(master_csv, portions_csv, db=db_session)
    tomato_portions_after = db_session.query(FoodPortion).filter(FoodPortion.fdc_id == "1001").all()
    assert len(tomato_portions_after) == 2
