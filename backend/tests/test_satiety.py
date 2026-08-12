import datetime

from app.models.fitness import FoodLog
from app.models.user import User
from app.services.satiety import get_avg_satiety_last_7_meals, is_low_satiety
from tests.conftest import get_auth_headers


def _log_food(client, headers, food_name="עוף בגריל", calories=300):
    response = client.post("/api/v1/nutrition/food-log", headers=headers, json={
        "date": str(datetime.date.today()),
        "meal_type": "lunch",
        "food_name": food_name,
        "quantity_g": 200,
        "calories": calories,
        "protein": 30,
        "carbs": 10,
        "fat": 8,
    })
    assert response.status_code == 200
    return response.json()


def test_patch_food_log_satiety_success(client):
    headers = get_auth_headers(client)
    log = _log_food(client, headers)

    response = client.patch(
        f"/api/v1/nutrition/food-log/entry/{log['id']}/satiety",
        headers=headers,
        json={"satiety_level": 4},
    )
    assert response.status_code == 200
    assert response.json()["satiety_level"] == 4


def test_patch_food_log_satiety_out_of_range(client):
    headers = get_auth_headers(client)
    log = _log_food(client, headers)

    for bad_value in (0, 6):
        response = client.patch(
            f"/api/v1/nutrition/food-log/entry/{log['id']}/satiety",
            headers=headers,
            json={"satiety_level": bad_value},
        )
        assert response.status_code == 422


def test_patch_food_log_satiety_not_owned(client):
    headers_a = get_auth_headers(client, email="owner@example.com")
    headers_b = get_auth_headers(client, email="other@example.com")
    log = _log_food(client, headers_a)

    response = client.patch(
        f"/api/v1/nutrition/food-log/entry/{log['id']}/satiety",
        headers=headers_b,
        json={"satiety_level": 3},
    )
    assert response.status_code == 404


def test_patch_food_log_satiety_nonexistent_id(client):
    headers = get_auth_headers(client)
    response = client.patch(
        "/api/v1/nutrition/food-log/entry/00000000-0000-0000-0000-000000000000/satiety",
        headers=headers,
        json={"satiety_level": 3},
    )
    assert response.status_code == 404


def test_satiety_summary_insufficient_data(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/nutrition/satiety-summary", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"avg_satiety": None, "low_satiety_flag": False}


def test_satiety_summary_avg_and_flag(client):
    headers = get_auth_headers(client)

    # 7 meals, satiety values (oldest -> newest): 5, 5, None, 5, 2, 1, 2.
    # Skip-nulls average over the 6 rated ones: (5+5+5+2+1+2)/6 = 3.33 -> 3.3.
    # Last 3 non-null (by created_at desc) are 2, 1, 2 -- all <= 2 -> flag True.
    values = [5, 5, None, 5, 2, 1, 2]
    for i, v in enumerate(values):
        log = _log_food(client, headers, food_name=f"meal-{i}")
        if v is not None:
            r = client.patch(
                f"/api/v1/nutrition/food-log/entry/{log['id']}/satiety",
                headers=headers,
                json={"satiety_level": v},
            )
            assert r.status_code == 200

    response = client.get("/api/v1/nutrition/satiety-summary", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["avg_satiety"] == 3.3
    assert data["low_satiety_flag"] is True


def test_satiety_summary_flag_false_when_last_3_not_all_low(client):
    headers = get_auth_headers(client)
    # Last 3 non-null (by created_at desc): 5, 1, 2 -- not all <= 2 -> False.
    for i, v in enumerate([1, 2, 5]):
        log = _log_food(client, headers, food_name=f"meal-{i}")
        r = client.patch(
            f"/api/v1/nutrition/food-log/entry/{log['id']}/satiety",
            headers=headers,
            json={"satiety_level": v},
        )
        assert r.status_code == 200

    response = client.get("/api/v1/nutrition/satiety-summary", headers=headers)
    assert response.json()["low_satiety_flag"] is False


# ─── Direct unit tests against app/services/satiety.py ─────────────────────

def _make_user(db_session, email="unit@example.com"):
    user = User(
        email=email,
        hashed_password="x",
        full_name="Unit Test",
        username=email.split("@")[0],
        username_normalized=email.split("@")[0],
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _add_log(db_session, user, satiety_level=None):
    log = FoodLog(
        user_id=user.id,
        date=datetime.date.today(),
        meal_type="lunch",
        food_name="test",
        quantity_g=100,
        calories=200,
        protein=10,
        carbs=10,
        fat=5,
        satiety_level=satiety_level,
    )
    db_session.add(log)
    db_session.commit()
    return log


def test_get_avg_satiety_returns_none_below_3_non_null_values(db_session):
    user = _make_user(db_session)
    _add_log(db_session, user, satiety_level=5)
    _add_log(db_session, user, satiety_level=4)
    _add_log(db_session, user, satiety_level=None)

    assert get_avg_satiety_last_7_meals(db_session, user.id) is None


def test_get_avg_satiety_skips_nulls_once_enough_data(db_session):
    user = _make_user(db_session)
    for v in (5, None, 5, 5):
        _add_log(db_session, user, satiety_level=v)

    assert get_avg_satiety_last_7_meals(db_session, user.id) == 5.0


def test_is_low_satiety_false_below_3_non_null_values(db_session):
    user = _make_user(db_session)
    _add_log(db_session, user, satiety_level=1)
    _add_log(db_session, user, satiety_level=2)

    assert is_low_satiety(db_session, user.id) is False


def test_is_low_satiety_true_when_last_3_non_null_all_low(db_session):
    user = _make_user(db_session)
    _add_log(db_session, user, satiety_level=5)  # older, ignored (only last 3 non-null count)
    _add_log(db_session, user, satiety_level=1)
    _add_log(db_session, user, satiety_level=2)
    _add_log(db_session, user, satiety_level=2)

    assert is_low_satiety(db_session, user.id) is True
