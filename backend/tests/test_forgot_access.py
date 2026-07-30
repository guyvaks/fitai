from unittest.mock import patch

from app.core.security import hash_secret
from app.models.user import PasswordResetToken, User

GENERIC_MESSAGE = "אם קיים חשבון עם כתובת זו, נשלח אליו אימייל עם שם המשתמש וקישור לאיפוס הסיסמה"


def _username_for(email):
    return email.split("@")[0]


def _register(client, email="reset-test@example.com", password="SecurePass123"):
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Reset Test User",
        "username": _username_for(email),
        "consent_given": True,
    })


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_forgot_access_known_email_sends_email_and_creates_token(mock_send, client, db_session):
    _register(client)

    resp = client.post("/api/v1/auth/forgot-access", json={"email": "reset-test@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == GENERIC_MESSAGE

    # BackgroundTasks run synchronously under TestClient before the response
    # is returned to the caller, so the mocked send is already recorded here.
    assert mock_send.called
    call_kwargs = mock_send.call_args[0][0]
    assert call_kwargs["to"] == ["reset-test@example.com"]
    # The migrated account's username reminder must be in the email body.
    assert "reset-test" in call_kwargs["html"]

    token_row = db_session.query(PasswordResetToken).join(
        User, PasswordResetToken.user_id == User.id
    ).filter(User.email == "reset-test@example.com").first()
    assert token_row is not None
    assert token_row.used_at is None


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_forgot_access_legacy_account_points_at_activate_account(mock_send, client, db_session):
    from app.core.security import get_password_hash

    db_session.add(User(
        email="legacy-recovery@example.com",
        hashed_password=get_password_hash("SecurePass123"),
        full_name="Legacy User",
        username=None,
        username_normalized=None,
        is_verified=True,
    ))
    db_session.commit()

    resp = client.post("/api/v1/auth/forgot-access", json={"email": "legacy-recovery@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == GENERIC_MESSAGE

    assert mock_send.called
    call_kwargs = mock_send.call_args[0][0]
    assert "activate-account" in call_kwargs["html"]


@patch("app.services.email.resend.Emails.send")
def test_forgot_access_unknown_email_returns_identical_generic_response(mock_send, client):
    resp = client.post("/api/v1/auth/forgot-access", json={"email": "nobody-at-all@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == GENERIC_MESSAGE
    # No account -> no email attempted at all
    assert not mock_send.called


@patch("app.services.email.resend.Emails.send")
def test_forgot_access_known_and_unknown_email_return_identical_response(mock_send, client):
    _register(client, email="known@example.com")

    known_resp = client.post("/api/v1/auth/forgot-access", json={"email": "known@example.com"})
    unknown_resp = client.post("/api/v1/auth/forgot-access", json={"email": "unknown@example.com"})

    assert known_resp.status_code == unknown_resp.status_code == 200
    assert known_resp.json() == unknown_resp.json()


def test_reset_password_with_valid_token_updates_password_and_allows_login(client, db_session):
    _register(client, email="resetflow@example.com", password="OldPassword123")

    raw_token = "test-raw-token-abc123"
    user = db_session.query(User).filter(User.email == "resetflow@example.com").first()
    user.is_verified = True  # unrelated to this test -- just so the later login check succeeds
    from datetime import datetime, timedelta, timezone
    db_session.add(PasswordResetToken(
        user_id=user.id,
        token_hash=hash_secret(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    ))
    db_session.commit()

    resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPassword456",
    })
    assert resp.status_code == 200
    assert resp.json()["message"] == "הסיסמה עודכנה בהצלחה"

    # Old password no longer works, new one does
    old_login = client.post("/api/v1/auth/login", json={
        "username": "resetflow",
        "password": "OldPassword123",
    })
    assert old_login.status_code == 401

    new_login = client.post("/api/v1/auth/login", json={
        "username": "resetflow",
        "password": "NewPassword456",
    })
    assert new_login.status_code == 200


def test_reset_password_rejects_same_password_as_current(client, db_session):
    _register(client, email="samepass@example.com", password="CurrentPassword123")
    user = db_session.query(User).filter(User.email == "samepass@example.com").first()
    user.is_verified = True  # unrelated to this test -- just so the later login check succeeds

    from datetime import datetime, timedelta, timezone
    raw_token = "same-password-token-1"
    db_session.add(PasswordResetToken(
        user_id=user.id,
        token_hash=hash_secret(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    ))
    db_session.commit()

    resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "CurrentPassword123",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית"

    # The token must not be consumed by a rejected same-password attempt --
    # the user should be able to retry the same link with a different password.
    token_row = db_session.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == hash_secret(raw_token)
    ).first()
    assert token_row.used_at is None

    retry = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "GenuinelyDifferentPassword456",
    })
    assert retry.status_code == 200

    # Old (unchanged) password no longer works, the genuinely new one does
    old_login = client.post("/api/v1/auth/login", json={
        "username": "samepass",
        "password": "CurrentPassword123",
    })
    assert old_login.status_code == 401

    new_login = client.post("/api/v1/auth/login", json={
        "username": "samepass",
        "password": "GenuinelyDifferentPassword456",
    })
    assert new_login.status_code == 200


def test_reset_password_token_is_single_use(client, db_session):
    _register(client, email="singleuse@example.com", password="OldPassword123")
    user = db_session.query(User).filter(User.email == "singleuse@example.com").first()

    raw_token = "single-use-token-xyz"
    from datetime import datetime, timedelta, timezone
    db_session.add(PasswordResetToken(
        user_id=user.id,
        token_hash=hash_secret(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    ))
    db_session.commit()

    first = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "FirstNewPassword1",
    })
    assert first.status_code == 200

    second = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "SecondNewPassword2",
    })
    assert second.status_code == 400
    assert second.json()["detail"] == "קישור האיפוס אינו תקין או שפג תוקפו"


def test_reset_password_expired_token_is_rejected(client, db_session):
    _register(client, email="expired@example.com", password="OldPassword123")
    user = db_session.query(User).filter(User.email == "expired@example.com").first()

    raw_token = "expired-token-123"
    from datetime import datetime, timedelta, timezone
    db_session.add(PasswordResetToken(
        user_id=user.id,
        token_hash=hash_secret(raw_token),
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),  # already expired
    ))
    db_session.commit()

    resp = client.post("/api/v1/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPassword456",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "קישור האיפוס אינו תקין או שפג תוקפו"


def test_reset_password_unknown_token_is_rejected(client):
    resp = client.post("/api/v1/auth/reset-password", json={
        "token": "this-token-was-never-issued",
        "new_password": "NewPassword456",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "קישור האיפוס אינו תקין או שפג תוקפו"


def test_forgot_access_rate_limit_fourth_attempt_in_an_hour_is_limited(client):
    for _ in range(3):
        resp = client.post("/api/v1/auth/forgot-access", json={"email": "someone@example.com"})
        assert resp.status_code == 200

    limited = client.post("/api/v1/auth/forgot-access", json={"email": "someone@example.com"})
    assert limited.status_code == 429
    assert limited.json()["detail"] == "יותר מדי ניסיונות, נסה שוב מאוחר יותר"


def test_reset_password_rate_limit_sixth_attempt_in_an_hour_is_limited(client):
    for _ in range(5):
        resp = client.post("/api/v1/auth/reset-password", json={
            "token": "whatever-invalid-token",
            "new_password": "NewPassword456",
        })
        assert resp.status_code == 400

    limited = client.post("/api/v1/auth/reset-password", json={
        "token": "whatever-invalid-token",
        "new_password": "NewPassword456",
    })
    assert limited.status_code == 429
    assert limited.json()["detail"] == "יותר מדי ניסיונות, נסה שוב מאוחר יותר"
