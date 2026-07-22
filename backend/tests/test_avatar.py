import base64
import io

from PIL import Image

from tests.conftest import get_auth_headers


def _fake_image_base64(size=(400, 300), color=(255, 0, 0), fmt="PNG"):
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_upload_avatar_success(client):
    headers = get_auth_headers(client)
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    assert response.status_code == 200
    assert response.json()["avatar_updated_at"] is not None


def test_upload_avatar_accepts_data_url_prefix(client):
    headers = get_auth_headers(client)
    data_url = f"data:image/png;base64,{_fake_image_base64()}"
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": data_url},
    )
    assert response.status_code == 200


def test_upload_avatar_unauthenticated(client):
    response = client.post(
        "/api/v1/users/avatar",
        json={"image_base64": _fake_image_base64()},
    )
    assert response.status_code == 401


def test_upload_avatar_rejects_non_image_bytes(client):
    headers = get_auth_headers(client)
    not_an_image = base64.b64encode(b"this is definitely not an image").decode("ascii")
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": not_an_image},
    )
    assert response.status_code == 400


def test_upload_avatar_rejects_invalid_base64(client):
    headers = get_auth_headers(client)
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": "not-valid-base64!!!"},
    )
    assert response.status_code == 400


def test_get_avatar_after_upload_returns_jpeg(client):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()
    response = client.get(f"/api/v1/users/avatar/{me['id']}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert len(response.content) > 0
    assert "immutable" in response.headers["cache-control"]


def test_get_avatar_center_crops_to_square(client):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64(size=(800, 200))},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()
    response = client.get(f"/api/v1/users/avatar/{me['id']}")
    image = Image.open(io.BytesIO(response.content))
    assert image.size == (256, 256)


def test_get_avatar_not_found_for_user_without_avatar(client):
    headers = get_auth_headers(client)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    response = client.get(f"/api/v1/users/avatar/{me['id']}")
    assert response.status_code == 404


def test_get_avatar_not_found_for_garbage_id(client):
    response = client.get("/api/v1/users/avatar/not-a-uuid")
    assert response.status_code == 404


def test_delete_avatar_removes_it(client):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()

    delete_response = client.delete("/api/v1/users/avatar", headers=headers)
    assert delete_response.status_code == 200

    get_response = client.get(f"/api/v1/users/avatar/{me['id']}")
    assert get_response.status_code == 404

    me_after = client.get("/api/v1/auth/me", headers=headers).json()
    assert me_after["avatar_updated_at"] is None


def test_delete_avatar_unauthenticated(client):
    response = client.delete("/api/v1/users/avatar")
    assert response.status_code == 401


def test_auth_me_does_not_include_avatar_bytes(client):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert "avatar_data" not in me
    assert me["avatar_updated_at"] is not None
