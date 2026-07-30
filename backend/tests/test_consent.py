from app.models.user import ConsentRecord, User


def test_registration_blocked_without_consent(client):
    resp = client.post("/api/v1/auth/register", json={
        "email": "no-consent@example.com",
        "password": "SecurePass123",
        "full_name": "No Consent User",
        "username": "noconsentuser",
        "consent_given": False,
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "יש לאשר את מדיניות הפרטיות כדי להירשם"

    # No account (and no consent record) should exist at all
    assert client.post("/api/v1/auth/login", json={
        "username": "noconsentuser",
        "password": "SecurePass123",
    }).status_code == 401


def test_registration_missing_consent_field_is_rejected(client):
    # A caller that omits the field entirely (not just sets it False) must
    # also be blocked -- consent_given has no default, so this is a 422 from
    # FastAPI's own validation rather than the custom 400, but either way
    # registration must not succeed.
    resp = client.post("/api/v1/auth/register", json={
        "email": "missing-consent@example.com",
        "password": "SecurePass123",
        "full_name": "Missing Consent User",
    })
    assert resp.status_code == 422


def test_registration_with_consent_creates_consent_record(client, db_session):
    resp = client.post("/api/v1/auth/register", json={
        "email": "consented@example.com",
        "password": "SecurePass123",
        "full_name": "Consented User",
        "username": "consenteduser",
        "consent_given": True,
    })
    assert resp.status_code == 201

    user = db_session.query(User).filter(User.email == "consented@example.com").first()
    assert user is not None

    record = db_session.query(ConsentRecord).filter(ConsentRecord.user_id == user.id).first()
    assert record is not None
    assert record.policy_version  # non-empty version string
    assert record.consented_at is not None
