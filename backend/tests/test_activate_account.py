"""Tests for the existing-user migration bridge: POST /auth/activate-account
(phase 1, email+password) + POST /auth/activate-account/set-username
(phase 2, choose a username and receive a real session). Covers the
self-closing-door property and the enumeration-safety of phase 1."""
from app.core.security import get_password_hash
from app.models.user import User


def _seed_legacy_user(db_session, email="legacy@example.com", password="SecurePass123"):
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        full_name="Legacy User",
        username=None,
        username_normalized=None,
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_activate_account_success_flow(client, db_session):
    _seed_legacy_user(db_session, email="migrate@example.com", password="SecurePass123")

    phase1 = client.post("/api/v1/auth/activate-account", json={
        "email": "migrate@example.com",
        "password": "SecurePass123",
    })
    assert phase1.status_code == 200
    activation_token = phase1.json()["activation_token"]

    phase2 = client.post("/api/v1/auth/activate-account/set-username", json={
        "activation_token": activation_token,
        "username": "migrateduser",
    })
    assert phase2.status_code == 200
    assert "access_token" in phase2.json()

    me = client.get("/api/v1/auth/me", headers={
        "Authorization": f"Bearer {phase2.json()['access_token']}"
    })
    assert me.status_code == 200
    assert me.json()["username"] == "migrateduser"

    # And the normal login screen now works with the chosen username.
    login = client.post("/api/v1/auth/login", json={
        "username": "migrateduser",
        "password": "SecurePass123",
    })
    assert login.status_code == 200


def test_activate_account_generic_error_for_unknown_email(client):
    resp = client.post("/api/v1/auth/activate-account", json={
        "email": "no-such-account@example.com",
        "password": "WhateverPassword123",
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "אימייל או סיסמה שגויים, או שהחשבון כבר הופעל"


def test_activate_account_generic_error_for_wrong_password(client, db_session):
    _seed_legacy_user(db_session, email="wrongpw@example.com", password="SecurePass123")

    resp = client.post("/api/v1/auth/activate-account", json={
        "email": "wrongpw@example.com",
        "password": "WrongPassword",
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "אימייל או סיסמה שגויים, או שהחשבון כבר הופעל"


def test_activate_account_generic_error_for_already_migrated_account(client, db_session):
    # A normal (already-migrated) account -- username IS NOT NULL -- must be
    # just as rejected, and just as indistinguishably, as an unknown email or
    # a wrong password. This is the enumeration-safety property: phase 1
    # must not reveal migration status.
    user = User(
        email="already-migrated@example.com",
        hashed_password=get_password_hash("SecurePass123"),
        full_name="Already Migrated",
        username="alreadymigrated",
        username_normalized="alreadymigrated",
        is_verified=True,
    )
    db_session.add(user)
    db_session.commit()

    resp = client.post("/api/v1/auth/activate-account", json={
        "email": "already-migrated@example.com",
        "password": "SecurePass123",
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "אימייל או סיסמה שגויים, או שהחשבון כבר הופעל"


def test_activate_account_all_three_failure_cases_return_identical_response(client, db_session):
    _seed_legacy_user(db_session, email="wrongpw2@example.com", password="SecurePass123")
    migrated = User(
        email="migrated2@example.com",
        hashed_password=get_password_hash("SecurePass123"),
        full_name="Migrated",
        username="migrated2user",
        username_normalized="migrated2user",
        is_verified=True,
    )
    db_session.add(migrated)
    db_session.commit()

    unknown_resp = client.post("/api/v1/auth/activate-account", json={
        "email": "totally-unknown@example.com", "password": "WhateverPassword123",
    })
    wrong_pw_resp = client.post("/api/v1/auth/activate-account", json={
        "email": "wrongpw2@example.com", "password": "WrongPassword",
    })
    already_migrated_resp = client.post("/api/v1/auth/activate-account", json={
        "email": "migrated2@example.com", "password": "SecurePass123",
    })

    assert unknown_resp.status_code == wrong_pw_resp.status_code == already_migrated_resp.status_code == 401
    assert unknown_resp.json() == wrong_pw_resp.json() == already_migrated_resp.json()


def test_activate_account_set_username_rejects_reused_token(client, db_session):
    _seed_legacy_user(db_session, email="reuse@example.com", password="SecurePass123")

    phase1 = client.post("/api/v1/auth/activate-account", json={
        "email": "reuse@example.com", "password": "SecurePass123",
    })
    activation_token = phase1.json()["activation_token"]

    first = client.post("/api/v1/auth/activate-account/set-username", json={
        "activation_token": activation_token, "username": "reuseduser",
    })
    assert first.status_code == 200

    second = client.post("/api/v1/auth/activate-account/set-username", json={
        "activation_token": activation_token, "username": "differentname",
    })
    assert second.status_code == 410
    assert second.json()["detail"] == "החשבון כבר הופעל"


def test_activate_account_set_username_rejects_taken_username(client, db_session):
    _seed_legacy_user(db_session, email="wantstaken@example.com", password="SecurePass123")
    client.post("/api/v1/auth/register", json={
        "email": "holder@example.com", "password": "SecurePass123", "full_name": "Holder",
        "username": "takenname", "consent_given": True,
    })

    phase1 = client.post("/api/v1/auth/activate-account", json={
        "email": "wantstaken@example.com", "password": "SecurePass123",
    })
    activation_token = phase1.json()["activation_token"]

    resp = client.post("/api/v1/auth/activate-account/set-username", json={
        "activation_token": activation_token, "username": "TakenName",
    })
    assert resp.status_code == 400


def test_activate_account_set_username_rejects_garbage_token(client):
    resp = client.post("/api/v1/auth/activate-account/set-username", json={
        "activation_token": "not-a-real-token", "username": "whatever",
    })
    assert resp.status_code == 401


def test_activate_account_rate_limit(client, db_session):
    _seed_legacy_user(db_session, email="ratelimited-activate@example.com", password="SecurePass123")

    for _ in range(5):
        resp = client.post("/api/v1/auth/activate-account", json={
            "email": "ratelimited-activate@example.com", "password": "WrongPassword",
        })
        assert resp.status_code == 401

    limited = client.post("/api/v1/auth/activate-account", json={
        "email": "ratelimited-activate@example.com", "password": "WrongPassword",
    })
    assert limited.status_code == 429
