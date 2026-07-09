from tests.conftest import get_auth_headers

PROFILE_PAYLOAD = {
    "age": 30,
    "gender": "male",
    "height_cm": 180,
    "weight_kg": 80,
    "activity_level": "moderately_active",
    "goal": "muscle_gain",
    "meals_per_day": 4,
}


def test_get_profile_not_found(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/users/profile", headers=headers)
    assert response.status_code == 404


def test_get_profile_unauthenticated(client):
    response = client.get("/api/v1/users/profile")
    assert response.status_code == 401


def test_create_profile_success(client):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/users/profile", headers=headers, json=PROFILE_PAYLOAD)
    assert response.status_code == 200
    data = response.json()
    assert data["age"] == 30
    assert data["gender"] == "male"
    assert data["goal"] == "muscle_gain"
    # metrics should be computed server-side
    assert data["bmi"] is not None
    assert data["bmr"] is not None
    assert data["tdee"] is not None


def test_create_profile_unauthenticated(client):
    response = client.post("/api/v1/users/profile", json=PROFILE_PAYLOAD)
    assert response.status_code == 401


def test_create_profile_invalid_enum(client):
    headers = get_auth_headers(client)
    bad_payload = dict(PROFILE_PAYLOAD, gender="alien")
    response = client.post("/api/v1/users/profile", headers=headers, json=bad_payload)
    assert response.status_code == 422


def test_create_profile_missing_required_field(client):
    headers = get_auth_headers(client)
    incomplete = {"age": 30, "gender": "male"}
    response = client.post("/api/v1/users/profile", headers=headers, json=incomplete)
    assert response.status_code == 422


def test_get_profile_after_create(client):
    headers = get_auth_headers(client)
    client.post("/api/v1/users/profile", headers=headers, json=PROFILE_PAYLOAD)
    response = client.get("/api/v1/users/profile", headers=headers)
    assert response.status_code == 200
    assert response.json()["weight_kg"] == 80


def test_update_profile_partial(client):
    headers = get_auth_headers(client)
    client.post("/api/v1/users/profile", headers=headers, json=PROFILE_PAYLOAD)
    response = client.put("/api/v1/users/profile", headers=headers, json={"weight_kg": 82})
    assert response.status_code == 200
    data = response.json()
    assert data["weight_kg"] == 82
    # untouched fields survive the partial update
    assert data["age"] == 30


def test_update_profile_unauthenticated(client):
    response = client.put("/api/v1/users/profile", json={"weight_kg": 82})
    assert response.status_code == 401


def test_get_metrics_not_found(client):
    headers = get_auth_headers(client)
    response = client.get("/api/v1/users/metrics", headers=headers)
    assert response.status_code == 404


def test_get_metrics_after_profile_created(client):
    headers = get_auth_headers(client)
    client.post("/api/v1/users/profile", headers=headers, json=PROFILE_PAYLOAD)
    response = client.get("/api/v1/users/metrics", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["bmi"] is not None
    assert data["target_calories"] is not None


def test_profile_equipment_roundtrip(client):
    headers = get_auth_headers(client)
    payload = dict(PROFILE_PAYLOAD, equipment=["dumbbells", "bench"])
    create_resp = client.post("/api/v1/users/profile", headers=headers, json=payload)
    assert create_resp.status_code == 200
    assert create_resp.json()["equipment"] == ["dumbbells", "bench"]

    get_resp = client.get("/api/v1/users/profile", headers=headers)
    assert get_resp.json()["equipment"] == ["dumbbells", "bench"]
