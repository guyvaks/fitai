def test_register_success(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "consent_given": True,
    })
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_success(client, db_session):
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "consent_given": True,
    })
    # New signups are unverified by default; this test is about login's
    # success path with correct credentials, not the verification gate
    # itself (covered separately in test_email_verification.py).
    from app.models.user import User
    db_session.query(User).filter(User.email == "test@example.com").update({"is_verified": True})
    db_session.commit()

    response = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "SecurePass123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client):
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "consent_given": True,
    })
    response = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "WrongPassword",
    })
    assert response.status_code == 401


def test_login_unknown_email(client):
    response = client.post("/api/v1/auth/login", json={
        "email": "no-such-account@example.com",
        "password": "WhateverPassword123",
    })
    assert response.status_code == 401


def test_login_wrong_password_and_unknown_email_return_identical_response(client):
    # A registered user with the wrong password and a non-existent email must
    # be indistinguishable to the caller -- same status code and same body --
    # otherwise the login endpoint becomes an email-enumeration oracle.
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "consent_given": True,
    })
    wrong_password_resp = client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "WrongPassword",
    })
    unknown_email_resp = client.post("/api/v1/auth/login", json={
        "email": "no-such-account@example.com",
        "password": "WrongPassword",
    })

    assert wrong_password_resp.status_code == unknown_email_resp.status_code == 401
    assert wrong_password_resp.json() == unknown_email_resp.json()
    assert wrong_password_resp.json()["detail"] == "אימייל או סיסמה שגויים"


def test_login_unknown_email_path_not_faster_than_wrong_password_path(client):
    # Regression guard for the timing side-channel: if the "no such user"
    # path skipped the bcrypt comparison, it would be measurably faster than
    # the "wrong password" path (which always runs one), leaking whether an
    # email is registered. Both paths now run a real bcrypt check, so their
    # durations should be in the same ballpark.
    import statistics
    import time

    client.post("/api/v1/auth/register", json={
        "email": "timing-test@example.com",
        "password": "SecurePass123",
        "full_name": "Timing Test User",
        "consent_given": True,
    })

    def timed_login(email):
        # Reset between calls -- this test measures bcrypt cost, not rate
        # limiting, and 10 calls in a row would otherwise trip /auth/login's
        # 5/minute limit partway through and corrupt the later timings with
        # near-instant 429s.
        client.app.state.limiter.reset()
        start = time.perf_counter()
        client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword"})
        return time.perf_counter() - start

    wrong_password_times = [timed_login("timing-test@example.com") for _ in range(5)]
    unknown_email_times = [timed_login("still-no-such-account@example.com") for _ in range(5)]

    wrong_password_median = statistics.median(wrong_password_times)
    unknown_email_median = statistics.median(unknown_email_times)

    # Generous tolerance (3x either direction) to absorb test-machine noise --
    # the point is ruling out an order-of-magnitude gap from a skipped bcrypt
    # call, not asserting near-identical timing.
    assert unknown_email_median < wrong_password_median * 3
    assert wrong_password_median < unknown_email_median * 3


def test_register_duplicate_email(client):
    client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123",
        "full_name": "Test User",
        "consent_given": True,
    })
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "AnotherPass456",
        "full_name": "Another User",
        "consent_given": True,
    })
    assert response.status_code == 400
