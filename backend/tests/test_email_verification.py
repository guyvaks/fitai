from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.core.security import hash_secret
from app.models.user import EmailVerificationCode, User


def _register(client, email="verify-test@example.com", password="SecurePass123"):
    return client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Verify Test User",
        "consent_given": True,
    })


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_register_creates_unverified_user_and_sends_code(mock_send, client, db_session):
    _register(client)

    user = db_session.query(User).filter(User.email == "verify-test@example.com").first()
    assert user.is_verified is False

    code_row = db_session.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).first()
    assert code_row is not None
    assert code_row.used_at is None

    assert mock_send.called
    assert mock_send.call_args[0][0]["to"] == ["verify-test@example.com"]


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.settings.RESEND_SANDBOX_OVERRIDE_EMAIL", "owner@example.com")
@patch("app.services.email.resend.Emails.send")
def test_register_redirects_to_override_email_when_configured(mock_send, client, db_session):
    _register(client, email="real-user@example.com")

    assert mock_send.called
    sent = mock_send.call_args[0][0]
    assert sent["to"] == ["owner@example.com"]
    assert "real-user@example.com" in sent["subject"]
    assert "real-user@example.com" in sent["html"]


def test_login_rejected_for_unverified_user_with_correct_password(client):
    _register(client, email="unverified@example.com", password="SecurePass123")

    resp = client.post("/api/v1/auth/login", json={
        "email": "unverified@example.com",
        "password": "SecurePass123",
    })
    assert resp.status_code == 403
    body = resp.json()["detail"]
    assert body["error_type"] == "EMAIL_NOT_VERIFIED"


def test_login_wrong_password_for_unverified_user_still_gets_generic_401(client):
    # The 403-unverified branch must only ever be reached after a correct
    # password check -- a wrong-password guess against an unverified (but
    # otherwise real) account must look identical to any other wrong guess.
    _register(client, email="unverified2@example.com", password="SecurePass123")

    resp = client.post("/api/v1/auth/login", json={
        "email": "unverified2@example.com",
        "password": "WrongPassword",
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "אימייל או סיסמה שגויים"


def test_verify_email_with_correct_code_marks_verified_and_returns_token(client, db_session):
    _register(client, email="tobeverified@example.com", password="SecurePass123")
    user = db_session.query(User).filter(User.email == "tobeverified@example.com").first()

    # Overwrite whatever code register() generated with one we know, same
    # approach as the reset-password tests (insert a known raw value's hash).
    raw_code = "123456"
    db_session.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).update({
        "code_hash": hash_secret(raw_code),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
        "used_at": None,
    })
    db_session.commit()

    resp = client.post("/api/v1/auth/verify-email", json={
        "email": "tobeverified@example.com",
        "code": raw_code,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    db_session.refresh(user)
    assert user.is_verified is True

    # Now login succeeds too
    login_resp = client.post("/api/v1/auth/login", json={
        "email": "tobeverified@example.com",
        "password": "SecurePass123",
    })
    assert login_resp.status_code == 200


def test_verify_email_wrong_code_is_rejected(client, db_session):
    _register(client, email="wrongcode@example.com", password="SecurePass123")
    user = db_session.query(User).filter(User.email == "wrongcode@example.com").first()
    db_session.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).update({
        "code_hash": hash_secret("111111"),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
    })
    db_session.commit()

    resp = client.post("/api/v1/auth/verify-email", json={
        "email": "wrongcode@example.com",
        "code": "999999",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "הקוד שגוי או שפג תוקפו"

    db_session.refresh(user)
    assert user.is_verified is False


def test_verify_email_expired_code_is_rejected(client, db_session):
    _register(client, email="expiredcode@example.com", password="SecurePass123")
    user = db_session.query(User).filter(User.email == "expiredcode@example.com").first()
    raw_code = "222222"
    db_session.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).update({
        "code_hash": hash_secret(raw_code),
        "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),  # already expired
    })
    db_session.commit()

    resp = client.post("/api/v1/auth/verify-email", json={
        "email": "expiredcode@example.com",
        "code": raw_code,
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "הקוד שגוי או שפג תוקפו"


def test_verify_email_already_used_code_is_rejected(client, db_session):
    _register(client, email="usedcode@example.com", password="SecurePass123")
    user = db_session.query(User).filter(User.email == "usedcode@example.com").first()
    raw_code = "333333"
    db_session.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).update({
        "code_hash": hash_secret(raw_code),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=15),
    })
    db_session.commit()

    first = client.post("/api/v1/auth/verify-email", json={
        "email": "usedcode@example.com",
        "code": raw_code,
    })
    assert first.status_code == 200

    second = client.post("/api/v1/auth/verify-email", json={
        "email": "usedcode@example.com",
        "code": raw_code,
    })
    assert second.status_code == 400
    assert second.json()["detail"] == "הקוד שגוי או שפג תוקפו"


def test_verify_email_unknown_email_is_rejected(client):
    resp = client.post("/api/v1/auth/verify-email", json={
        "email": "no-such-user@example.com",
        "code": "123456",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "הקוד שגוי או שפג תוקפו"


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_resend_verification_generates_new_code_and_invalidates_old_one(mock_send, client, db_session):
    _register(client, email="resend-test@example.com", password="SecurePass123")
    user = db_session.query(User).filter(User.email == "resend-test@example.com").first()

    original_code_row = db_session.query(EmailVerificationCode).filter(
        EmailVerificationCode.user_id == user.id
    ).first()
    original_hash = original_code_row.code_hash

    resp = client.post("/api/v1/auth/resend-verification", json={"email": "resend-test@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "אם קיים חשבון לא מאומת עם כתובת זו, נשלח אליו קוד אימות חדש"
    assert mock_send.call_count == 2  # once from register, once from resend

    db_session.refresh(original_code_row)
    assert original_code_row.code_hash != original_hash  # regenerated, not just re-sent


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_resend_verification_unknown_email_returns_identical_generic_response(mock_send, client):
    resp = client.post("/api/v1/auth/resend-verification", json={"email": "nobody@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "אם קיים חשבון לא מאומת עם כתובת זו, נשלח אליו קוד אימות חדש"
    assert not mock_send.called


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_resend_verification_already_verified_user_returns_identical_response_and_sends_nothing(
    mock_send, client, db_session
):
    _register(client, email="alreadyverified@example.com", password="SecurePass123")
    db_session.query(User).filter(User.email == "alreadyverified@example.com").update({"is_verified": True})
    db_session.commit()
    mock_send.reset_mock()  # clear the register-time send

    resp = client.post("/api/v1/auth/resend-verification", json={"email": "alreadyverified@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "אם קיים חשבון לא מאומת עם כתובת זו, נשלח אליו קוד אימות חדש"
    assert not mock_send.called


def test_verify_email_rate_limit_sixth_attempt_in_an_hour_is_limited(client):
    _register(client, email="ratelimited-verify@example.com", password="SecurePass123")

    for _ in range(5):
        resp = client.post("/api/v1/auth/verify-email", json={
            "email": "ratelimited-verify@example.com",
            "code": "000000",
        })
        assert resp.status_code == 400

    limited = client.post("/api/v1/auth/verify-email", json={
        "email": "ratelimited-verify@example.com",
        "code": "000000",
    })
    assert limited.status_code == 429
    assert limited.json()["detail"] == "יותר מדי ניסיונות, נסה שוב מאוחר יותר"


def test_resend_verification_rate_limit_fourth_attempt_in_an_hour_is_limited(client):
    for _ in range(3):
        resp = client.post("/api/v1/auth/resend-verification", json={"email": "whoever@example.com"})
        assert resp.status_code == 200

    limited = client.post("/api/v1/auth/resend-verification", json={"email": "whoever@example.com"})
    assert limited.status_code == 429
    assert limited.json()["detail"] == "יותר מדי ניסיונות, נסה שוב מאוחר יותר"


def test_existing_pre_migration_users_are_not_locked_out(client, db_session):
    """Simulates a user row that predates this feature: inserted via raw SQL
    without specifying is_verified at all, so only the migration's
    server_default (true) applies -- not the ORM's Python-side default
    (False), which only kicks in for rows the ORM itself inserts.
    """
    import uuid
    from sqlalchemy import text

    user_id = uuid.uuid4()
    db_session.execute(text(
        "INSERT INTO users (id, email, hashed_password, full_name, is_active, is_admin, is_verified, ai_access_approved) "
        "VALUES (:id, :email, :hashed_password, :full_name, 1, 0, 1, 1)"
    ), {
        "id": str(user_id),
        "email": "pre-existing-user@example.com",
        "hashed_password": "$2b$12$placeholderplaceholderplaceholderplaceholderplace",
        "full_name": "Pre-Existing User",
    })
    db_session.commit()

    user = db_session.query(User).filter(User.email == "pre-existing-user@example.com").first()
    assert user.is_verified is True
