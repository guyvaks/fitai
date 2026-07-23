"""Tests for the Web Push subscription endpoints (app/api/v1/endpoints/push.py)."""
from app.models.user import PushSubscription
from tests.conftest import get_auth_headers

SUBSCRIPTION_PAYLOAD = {
    "endpoint": "https://push.example.com/v1/abcd1234",
    "keys": {
        "p256dh": "test-p256dh-key",
        "auth": "test-auth-secret",
    },
}


def test_subscribe_creates_row(client, db_session):
    headers = get_auth_headers(client)
    response = client.post("/api/v1/push/subscribe", headers=headers, json=SUBSCRIPTION_PAYLOAD)
    assert response.status_code == 201
    assert response.json()["status"] == "created"

    row = db_session.query(PushSubscription).filter(
        PushSubscription.endpoint == SUBSCRIPTION_PAYLOAD["endpoint"]
    ).first()
    assert row is not None
    assert row.p256dh == SUBSCRIPTION_PAYLOAD["keys"]["p256dh"]
    assert row.auth == SUBSCRIPTION_PAYLOAD["keys"]["auth"]


def test_resubscribe_same_endpoint_updates_not_duplicates(client, db_session):
    headers = get_auth_headers(client)
    client.post("/api/v1/push/subscribe", headers=headers, json=SUBSCRIPTION_PAYLOAD)

    updated_payload = {
        **SUBSCRIPTION_PAYLOAD,
        "keys": {"p256dh": "new-p256dh-key", "auth": "new-auth-secret"},
    }
    response = client.post("/api/v1/push/subscribe", headers=headers, json=updated_payload)
    assert response.status_code == 201
    assert response.json()["status"] == "updated"

    rows = db_session.query(PushSubscription).filter(
        PushSubscription.endpoint == SUBSCRIPTION_PAYLOAD["endpoint"]
    ).all()
    assert len(rows) == 1
    assert rows[0].p256dh == "new-p256dh-key"


def test_subscribe_requires_auth_401(client):
    response = client.post("/api/v1/push/subscribe", json=SUBSCRIPTION_PAYLOAD)
    assert response.status_code == 401


def test_unsubscribe_deletes_matching_row(client, db_session):
    headers = get_auth_headers(client)
    client.post("/api/v1/push/subscribe", headers=headers, json=SUBSCRIPTION_PAYLOAD)

    response = client.request(
        "DELETE", "/api/v1/push/subscribe", headers=headers,
        json={"endpoint": SUBSCRIPTION_PAYLOAD["endpoint"]},
    )
    assert response.status_code == 200

    row = db_session.query(PushSubscription).filter(
        PushSubscription.endpoint == SUBSCRIPTION_PAYLOAD["endpoint"]
    ).first()
    assert row is None


def test_unsubscribe_does_not_delete_another_users_row(client, db_session):
    other_headers = get_auth_headers(client, email="other@example.com")
    client.post("/api/v1/push/subscribe", headers=other_headers, json=SUBSCRIPTION_PAYLOAD)

    my_headers = get_auth_headers(client, email="me@example.com")
    response = client.request(
        "DELETE", "/api/v1/push/subscribe", headers=my_headers,
        json={"endpoint": SUBSCRIPTION_PAYLOAD["endpoint"]},
    )
    assert response.status_code == 404

    row = db_session.query(PushSubscription).filter(
        PushSubscription.endpoint == SUBSCRIPTION_PAYLOAD["endpoint"]
    ).first()
    assert row is not None


def test_unsubscribe_requires_auth_401(client):
    response = client.request(
        "DELETE", "/api/v1/push/subscribe", json={"endpoint": SUBSCRIPTION_PAYLOAD["endpoint"]}
    )
    assert response.status_code == 401


def test_vapid_public_key_requires_auth_401(client):
    response = client.get("/api/v1/push/vapid-public-key")
    assert response.status_code == 401


def test_vapid_public_key_returns_configured_value(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "test-public-key")
    headers = get_auth_headers(client)
    response = client.get("/api/v1/push/vapid-public-key", headers=headers)
    assert response.status_code == 200
    assert response.json()["public_key"] == "test-public-key"
