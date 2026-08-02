"""Tests for GET /api/v1/foods/search alias matching -- a food should be
findable by an entry in its aliases list, not just canonical_name_he."""
import uuid

from app.models.fitness import FoodMaster


def _seed_food(db_session, name_he, aliases=None, is_active=True):
    food = FoodMaster(
        id=uuid.uuid4(),
        canonical_name_he=name_he,
        category="חלבונים",
        calories_per_100g=120,
        protein_per_100g=22.5,
        carbs_per_100g=0,
        fat_per_100g=2.6,
        aliases=aliases or [],
        is_active=is_active,
    )
    db_session.add(food)
    db_session.commit()
    db_session.refresh(food)
    return food


def test_search_by_alias_finds_food_with_different_canonical_name(client, db_session):
    chicken = _seed_food(
        db_session, "עוף, חזה, ללא עצם, ללא עור, נא", aliases=["חזה עוף"]
    )
    _seed_food(db_session, "עגבנייה, נא")

    response = client.get("/api/v1/foods/search", params={"q": "חזה עוף"})
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert str(chicken.id) in ids


def test_search_without_alias_match_behaves_unchanged(client, db_session):
    tomato = _seed_food(db_session, "עגבנייה, נא")
    _seed_food(db_session, "עוף, חזה, ללא עצם, ללא עור, נא", aliases=["חזה עוף"])

    response = client.get("/api/v1/foods/search", params={"q": "עגבני"})
    assert response.status_code == 200
    names = [row["name"] for row in response.json()]
    assert tomato.canonical_name_he in names
    assert "עוף, חזה, ללא עצם, ללא עור, נא" not in names
