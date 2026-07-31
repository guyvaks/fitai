import base64
import io

import pytest
from PIL import Image

from tests.conftest import get_auth_headers


def _fake_image_base64(size=(400, 300), color=(255, 0, 0), fmt="PNG"):
    image = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


@pytest.fixture
def fake_storage(monkeypatch):
    """In-memory stand-in for Supabase Storage -- avatar tests must never hit
    real Supabase. Keyed the same way as the real storage.path_for()."""
    store = {}

    def upload_avatar(user_id, data, content_type="image/jpeg"):
        path = f"{user_id}/avatar.jpg"
        store[path] = (data, content_type)
        return path

    def get_signed_url(path, expires_in=3600):
        if path not in store:
            raise Exception("object not found")
        return f"https://fake-supabase.test/signed/{path}?exp={expires_in}"

    def delete_avatar(user_id):
        store.pop(f"{user_id}/avatar.jpg", None)

    monkeypatch.setattr("app.services.storage.upload_avatar", upload_avatar)
    monkeypatch.setattr("app.services.storage.get_signed_url", get_signed_url)
    monkeypatch.setattr("app.services.storage.delete_avatar", delete_avatar)
    return store


def test_upload_avatar_success(client, fake_storage):
    headers = get_auth_headers(client)
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    assert response.status_code == 200
    assert response.json()["avatar_updated_at"] is not None


def test_upload_avatar_stores_cropped_jpeg_in_bucket(client, fake_storage):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64(size=(800, 200))},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()

    data, content_type = fake_storage[f"{me['id']}/avatar.jpg"]
    assert content_type == "image/jpeg"
    image = Image.open(io.BytesIO(data))
    assert image.format == "JPEG"
    assert image.size == (256, 256)


def test_upload_avatar_accepts_data_url_prefix(client, fake_storage):
    headers = get_auth_headers(client)
    data_url = f"data:image/png;base64,{_fake_image_base64()}"
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": data_url},
    )
    assert response.status_code == 200


def test_upload_avatar_unauthenticated(client, fake_storage):
    response = client.post(
        "/api/v1/users/avatar",
        json={"image_base64": _fake_image_base64()},
    )
    assert response.status_code == 401


def test_upload_avatar_rejects_non_image_bytes(client, fake_storage):
    headers = get_auth_headers(client)
    not_an_image = base64.b64encode(b"this is definitely not an image").decode("ascii")
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": not_an_image},
    )
    assert response.status_code == 400


def test_upload_avatar_rejects_invalid_base64(client, fake_storage):
    headers = get_auth_headers(client)
    response = client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": "not-valid-base64!!!"},
    )
    assert response.status_code == 400


def test_get_avatar_after_upload_redirects_to_signed_url(client, fake_storage):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()
    response = client.get(f"/api/v1/users/avatar/{me['id']}", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == f"https://fake-supabase.test/signed/{me['id']}/avatar.jpg?exp=3600"
    assert "no-store" not in response.headers.get("cache-control", "")


def test_get_avatar_not_found_for_user_without_avatar(client, fake_storage):
    headers = get_auth_headers(client)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    response = client.get(f"/api/v1/users/avatar/{me['id']}", follow_redirects=False)
    assert response.status_code == 404


def test_get_avatar_not_found_for_garbage_id(client, fake_storage):
    response = client.get("/api/v1/users/avatar/not-a-uuid", follow_redirects=False)
    assert response.status_code == 404


def test_delete_avatar_removes_it(client, fake_storage):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert f"{me['id']}/avatar.jpg" in fake_storage

    delete_response = client.delete("/api/v1/users/avatar", headers=headers)
    assert delete_response.status_code == 200
    assert f"{me['id']}/avatar.jpg" not in fake_storage

    get_response = client.get(f"/api/v1/users/avatar/{me['id']}", follow_redirects=False)
    assert get_response.status_code == 404

    me_after = client.get("/api/v1/auth/me", headers=headers).json()
    assert me_after["avatar_updated_at"] is None


def test_delete_avatar_unauthenticated(client, fake_storage):
    response = client.delete("/api/v1/users/avatar")
    assert response.status_code == 401


def test_auth_me_does_not_include_avatar_bytes(client, fake_storage):
    headers = get_auth_headers(client)
    client.post(
        "/api/v1/users/avatar",
        headers=headers,
        json={"image_base64": _fake_image_base64()},
    )
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert "avatar_data" not in me
    assert "avatar_url" not in me
    assert me["avatar_updated_at"] is not None
