"""Tests for the preferred_language field: registration, defaulting, and
updating it later via PATCH /api/v1/users/preferred-language. Storage-only --
no i18n is wired up, so these only assert the stored/returned value, not any
actual UI language change."""
from app.models.user import User
from tests.conftest import get_auth_headers


def _register(client, email="lang-test@example.com", preferred_language=None):
    payload = {
        "email": email,
        "password": "SecurePass123",
        "full_name": "Lang Test",
        "consent_given": True,
    }
    if preferred_language is not None:
        payload["preferred_language"] = preferred_language
    return client.post("/api/v1/auth/register", json=payload)


def test_register_with_hebrew_preference(client, db_session):
    response = _register(client, email="he-user@example.com", preferred_language="he")
    assert response.status_code == 201

    user = db_session.query(User).filter(User.email == "he-user@example.com").first()
    assert user.preferred_language == "he"


def test_register_with_english_preference(client, db_session):
    response = _register(client, email="en-user@example.com", preferred_language="en")
    assert response.status_code == 201

    user = db_session.query(User).filter(User.email == "en-user@example.com").first()
    assert user.preferred_language == "en"


def test_register_omitting_preference_defaults_to_hebrew(client, db_session):
    response = _register(client, email="default-user@example.com")
    assert response.status_code == 201

    user = db_session.query(User).filter(User.email == "default-user@example.com").first()
    assert user.preferred_language == "he"


def test_register_rejects_unsupported_language(client):
    response = _register(client, email="bad-lang@example.com", preferred_language="fr")
    assert response.status_code == 422


def test_me_includes_preferred_language(client, db_session):
    headers = get_auth_headers(client, email="me-lang@example.com")
    db_session.query(User).filter(User.email == "me-lang@example.com").update({"preferred_language": "en"})
    db_session.commit()

    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "en"


def test_update_preferred_language_requires_auth(client):
    response = client.patch("/api/v1/users/preferred-language", json={"preferred_language": "en"})
    assert response.status_code == 401


def test_update_preferred_language_via_settings(client, db_session):
    headers = get_auth_headers(client, email="settings-lang@example.com")

    response = client.patch(
        "/api/v1/users/preferred-language", headers=headers, json={"preferred_language": "en"}
    )
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "en"

    user = db_session.query(User).filter(User.email == "settings-lang@example.com").first()
    assert user.preferred_language == "en"

    # And back to Hebrew -- confirms it's freely reversible, not one-way.
    response = client.patch(
        "/api/v1/users/preferred-language", headers=headers, json={"preferred_language": "he"}
    )
    assert response.status_code == 200
    assert response.json()["preferred_language"] == "he"

    db_session.refresh(user)
    assert user.preferred_language == "he"


def test_update_preferred_language_rejects_unsupported_value(client, db_session):
    headers = get_auth_headers(client, email="bad-update-lang@example.com")

    response = client.patch(
        "/api/v1/users/preferred-language", headers=headers, json={"preferred_language": "fr"}
    )
    assert response.status_code == 422

    user = db_session.query(User).filter(User.email == "bad-update-lang@example.com").first()
    assert user.preferred_language == "he"
