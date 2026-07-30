import uuid

from app.core.security import decode_token


def test_register_success(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": "testuser",
        "consent_given": True,
    })
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_register_requires_username(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "consent_given": True,
    })
    assert response.status_code == 422


def test_register_rejects_invalid_username_format(client):
    for bad_username in ["ab", "a" * 31, "has space", "has@symbol", ""]:
        response = client.post("/api/v1/auth/register", json={
            "email": f"invalid-{abs(hash(bad_username))}@example.com",
            "password": "SecurePass123",
            "full_name": "Test User",
            "username": bad_username,
            "consent_given": True,
        })
        assert response.status_code == 422, f"expected 422 for username={bad_username!r}"


def test_register_rejects_duplicate_username_case_insensitive(client):
    client.post("/api/v1/auth/register", json={
        "email": "user1@example.com",
        "password": "SecurePass123",
        "full_name": "User One",
        "username": "TestUser",
        "consent_given": True,
    })
    response = client.post("/api/v1/auth/register", json={
        "email": "user2@example.com",
        "password": "SecurePass123",
        "full_name": "User Two",
        "username": "testuser",
        "consent_given": True,
    })
    assert response.status_code == 400


def test_username_available_endpoint(client):
    available = client.get("/api/v1/auth/username-available", params={"username": "freshname"})
    assert available.status_code == 200
    assert available.json() == {"available": True, "reason": None}

    client.post("/api/v1/auth/register", json={
        "email": "taken@example.com",
        "password": "SecurePass123",
        "full_name": "Taken User",
        "username": "takenname",
        "consent_given": True,
    })
    taken = client.get("/api/v1/auth/username-available", params={"username": "TakenName"})
    assert taken.status_code == 200
    assert taken.json() == {"available": False, "reason": "taken"}

    invalid = client.get("/api/v1/auth/username-available", params={"username": "a"})
    assert invalid.status_code == 200
    assert invalid.json() == {"available": False, "reason": "invalid_format"}


def test_login_success(client, db_session):
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": "testuser",
        "consent_given": True,
    })
    # New signups are unverified by default; this test is about login's
    # success path with correct credentials, not the verification gate
    # itself (covered separately in test_email_verification.py).
    from app.models.user import User
    db_session.query(User).filter(User.email == "test@example.com").update({"is_verified": True})
    db_session.commit()

    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "SecurePass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    # Login is also case-insensitive on username.
    response2 = client.post("/api/v1/auth/login", json={
        "username": "TESTUSER",
        "password": "SecurePass123",
    })
    assert response2.status_code == 200


def test_login_requires_username_not_email(client):
    response = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "SecurePass123",
    })
    assert response.status_code == 422


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": "testuser",
        "consent_given": True,
    })
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "WrongPassword",
    })
    assert response.status_code == 401


def test_login_unknown_username(client):
    response = client.post("/api/v1/auth/login", json={
        "username": "no-such-account",
        "password": "WhateverPassword123",
    })
    assert response.status_code == 401


def test_login_wrong_password_and_unknown_username_return_identical_response(client):
    # A registered user with the wrong password and a non-existent username
    # must be indistinguishable to the caller -- same status code and same
    # body -- otherwise the login endpoint becomes a username-enumeration
    # oracle.
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": "testuser",
        "consent_given": True,
    })
    wrong_password_resp = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "WrongPassword",
    })
    unknown_username_resp = client.post("/api/v1/auth/login", json={
        "username": "no-such-account",
        "password": "WrongPassword",
    })

    assert wrong_password_resp.status_code == unknown_username_resp.status_code == 401
    assert wrong_password_resp.json() == unknown_username_resp.json()
    assert wrong_password_resp.json()["detail"] == "שם משתמש או סיסמה שגויים"


def test_login_rejects_legacy_account_with_null_username(client, db_session):
    # Simulates a pre-migration account (existed before username-based login
    # shipped) -- created directly via db_session, bypassing /register, since
    # /register always sets a username now. Must get the exact same generic
    # 401 as any unknown username, not a distinct error hinting at migration
    # status (that would reopen enumeration).
    from app.core.security import get_password_hash
    from app.models.user import User

    db_session.add(User(
        email="legacy@example.com",
        hashed_password=get_password_hash("SecurePass123"),
        full_name="Legacy User",
        username=None,
        username_normalized=None,
        is_verified=True,
    ))
    db_session.commit()

    response = client.post("/api/v1/auth/login", json={
        "username": "legacy",
        "password": "SecurePass123",
    })
    assert response.status_code == 401
    assert response.json()["detail"] == "שם משתמש או סיסמה שגויים"


def test_login_unknown_username_path_not_faster_than_wrong_password_path(client):
    # Regression guard for the timing side-channel: if the "no such user"
    # path skipped the bcrypt comparison, it would be measurably faster than
    # the "wrong password" path (which always runs one), leaking whether a
    # username is registered. Both paths now run a real bcrypt check, so
    # their durations should be in the same ballpark.
    import statistics
    import time

    client.post("/api/v1/auth/register", json={
        "email": "timing-test@example.com",
        "password": "SecurePass123",
        "full_name": "Timing Test User",
        "username": "timingtest",
        "consent_given": True,
    })

    def timed_login(username):
        # Reset between calls -- this test measures bcrypt cost, not rate
        # limiting, and 10 calls in a row would otherwise trip /auth/login's
        # 5/minute limit partway through and corrupt the later timings with
        # near-instant 429s.
        client.app.state.limiter.reset()
        start = time.perf_counter()
        client.post("/api/v1/auth/login", json={"username": username, "password": "WrongPassword"})
        return time.perf_counter() - start

    wrong_password_times = [timed_login("timingtest") for _ in range(5)]
    unknown_username_times = [timed_login("still-no-such-account") for _ in range(5)]

    wrong_password_median = statistics.median(wrong_password_times)
    unknown_username_median = statistics.median(unknown_username_times)

    # Generous tolerance (3x either direction) to absorb test-machine noise --
    # the point is ruling out an order-of-magnitude gap from a skipped bcrypt
    # call, not asserting near-identical timing.
    assert unknown_username_median < wrong_password_median * 3
    assert wrong_password_median < unknown_username_median * 3


def test_register_duplicate_email(client):
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": "testuser1",
        "consent_given": True,
    })
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "AnotherPass456",
        "full_name": "Another User",
        "username": "testuser2",
        "consent_given": True,
    })
    assert response.status_code == 400


def test_jwt_sub_is_user_id_not_email(client, db_session):
    from app.models.user import User

    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": "testuser",
        "consent_given": True,
    })
    db_session.query(User).filter(User.email == "test@example.com").update({"is_verified": True})
    db_session.commit()

    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "SecurePass123",
    })
    token = response.json()["access_token"]
    payload = decode_token(token)
    user = db_session.query(User).filter(User.email == "test@example.com").first()
    assert payload["sub"] == str(user.id)
    # Must be a real UUID, not the email string.
    assert uuid.UUID(payload["sub"]) == user.id


def test_get_current_user_rejects_malformed_sub(client):
    from app.core.security import create_access_token

    bad_token = create_access_token(data={"sub": "not-a-uuid"})
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad_token}"})
    assert response.status_code == 401
