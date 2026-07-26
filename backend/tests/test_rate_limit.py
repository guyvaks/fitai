def test_login_sixth_attempt_in_a_minute_is_rate_limited(client):
    client.post("/api/v1/auth/register", json={
        "email": "rate-limit-test@example.com",
        "password": "SecurePass123",
        "full_name": "Rate Limit Test User",
        "consent_given": True,
    })

    # 5 wrong-password attempts should all be answered normally (401, not 429)
    for _ in range(5):
        resp = client.post("/api/v1/auth/login", json={
            "email": "rate-limit-test@example.com",
            "password": "WrongPassword",
        })
        assert resp.status_code == 401

    # The 6th attempt within the same minute must be rejected before it even
    # touches the DB/bcrypt check
    resp = client.post("/api/v1/auth/login", json={
        "email": "rate-limit-test@example.com",
        "password": "WrongPassword",
    })
    assert resp.status_code == 429
    assert resp.json()["detail"] == "יותר מדי ניסיונות, נסה שוב מאוחר יותר"


def test_login_rate_limit_is_per_ip_not_global(client):
    # Two different callers (distinguished by X-Forwarded-For, the header
    # Railway's edge proxy sets with the real client IP) must not share one
    # bucket -- otherwise one busy IP could lock every other user out.
    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "nobody@example.com", "password": "WrongPassword"},
            headers={"X-Forwarded-For": "10.0.0.1"},
        )
        assert resp.status_code == 401

    limited = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "WrongPassword"},
        headers={"X-Forwarded-For": "10.0.0.1"},
    )
    assert limited.status_code == 429

    # A different source IP is unaffected
    other_ip = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "WrongPassword"},
        headers={"X-Forwarded-For": "10.0.0.2"},
    )
    assert other_ip.status_code == 401


def test_normal_login_usage_does_not_trip_rate_limit(client, db_session):
    # A real user registering once and logging in twice (e.g. after a typo)
    # is well under the 5/minute limit and must not be false-positived.
    client.post("/api/v1/auth/register", json={
        "email": "normal-user@example.com",
        "password": "SecurePass123",
        "full_name": "Normal User",
        "consent_given": True,
    })
    from app.models.user import User
    db_session.query(User).filter(User.email == "normal-user@example.com").update({"is_verified": True})
    db_session.commit()

    for _ in range(2):
        resp = client.post("/api/v1/auth/login", json={
            "email": "normal-user@example.com",
            "password": "SecurePass123",
        })
        assert resp.status_code == 200


def test_register_rate_limit_does_not_trip_on_a_handful_of_signups(client):
    # 10/hour is the register limit -- a handful of distinct signups (e.g.
    # from shared test/dev usage) should not be false-positived.
    for i in range(5):
        resp = client.post("/api/v1/auth/register", json={
            "email": f"signup-{i}@example.com",
            "password": "SecurePass123",
            "full_name": "Signup User",
            "consent_given": True,
        })
        assert resp.status_code == 201
