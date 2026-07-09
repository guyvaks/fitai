import datetime

from tests.conftest import get_auth_headers


def test_get_nutrition_plan_not_found(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/nutrition/plan", headers=headers)
    assert response.status_code == 404


def test_log_food_success(client):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/nutrition/food-log", headers=headers, json={
        "date": str(datetime.date.today()),
        "meal_type": "lunch",
        "food_name": "עוף בגריל",
        "quantity_g": 200,
        "calories": 330,
        "protein": 40,
        "carbs": 0,
        "fat": 8,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["food_name"] == "עוף בגריל"
    assert data["meal_type"] == "lunch"
    assert data["calories"] == 330


def test_get_food_log_by_date(client):
    headers = get_auth_headers(client)
    today = str(datetime.date.today())
    client.post("/api/v1/nutrition/food-log", headers=headers, json={
        "date": today,
        "meal_type": "breakfast",
        "food_name": "ביצים",
        "quantity_g": 100,
        "calories": 150,
        "protein": 12,
        "carbs": 1,
        "fat": 10,
    })
    response = client.get(f"/api/v1/nutrition/food-log/{today}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["food_name"] == "ביצים"


def test_delete_food_log_entry(client):
    headers = get_auth_headers(client)
    today = str(datetime.date.today())
    post_response = client.post("/api/v1/nutrition/food-log", headers=headers, json={
        "date": today,
        "meal_type": "snack",
        "food_name": "תפוח",
        "quantity_g": 150,
        "calories": 78,
        "protein": 0,
        "carbs": 21,
        "fat": 0,
    })
    log_id = post_response.json()["id"]
    delete_response = client.delete(f"/api/v1/nutrition/food-log/entry/{log_id}", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json() == {"status": "deleted"}

    logs = client.get(f"/api/v1/nutrition/food-log/{today}", headers=headers).json()
    assert all(entry["id"] != log_id for entry in logs)


def test_log_food_default_date(client):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/nutrition/food-log", headers=headers, json={
        "meal_type": "breakfast",
        "food_name": "Oatmeal",
        "quantity_g": 100,
        "calories": 350,
    })
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["food_name"] == "Oatmeal"
    assert data["meal_type"] == "breakfast"


def test_food_log_unauthenticated(client):
    response = client.post("/api/v1/nutrition/food-log", json={
        "meal_type": "lunch",
        "food_name": "סלט",
        "quantity_g": 200,
        "calories": 100,
    })
    assert response.status_code == 401
