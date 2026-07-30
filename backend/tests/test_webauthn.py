"""Tests for the WebAuthn (Face ID/fingerprint) endpoints. The actual
cryptographic registration/authentication ceremony (real attestation
objects, signed assertions) can't be produced by a test without real
authenticator hardware or a full WebAuthn client simulator, so
webauthn.verify_registration_response/verify_authentication_response are
mocked here -- these tests cover the endpoint wiring (auth requirements,
credential persistence, enumeration-safety, ownership scoping), not
cryptographic correctness. Real-device verification is a separate,
required manual step (see the project plan) before this feature ships.
"""
from unittest.mock import patch

from tests.conftest import get_auth_headers


def test_webauthn_register_options_requires_auth(client):
    resp = client.post("/api/v1/auth/webauthn/register/options")
    assert resp.status_code == 401


def test_webauthn_register_options_returns_challenge(client):
    headers = get_auth_headers(client, email="webauthn1@example.com")
    resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "options" in body
    assert "challenge_token" in body
    assert body["options"]["user"]["name"] == "webauthn1"


def test_webauthn_register_options_requires_resident_key(client):
    # This is what makes the usernameless/discoverable login flow possible
    # at all -- without a resident key, the authenticator has nothing to
    # hand the browser when no allowCredentials list is given.
    headers = get_auth_headers(client, email="webauthn1b@example.com")
    resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    selection = resp.json()["options"]["authenticatorSelection"]
    assert selection["residentKey"] == "required"
    assert selection["requireResidentKey"] is True


class _FakeVerifiedRegistration:
    def __init__(self, user_verified=True):
        self.credential_id = b"fake-credential-id-1"
        self.credential_public_key = b"fake-public-key-bytes"
        self.sign_count = 0
        self.user_verified = user_verified


@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_register_verify_persists_credential(mock_verify, client):
    mock_verify.return_value = _FakeVerifiedRegistration()
    headers = get_auth_headers(client, email="webauthn2@example.com")

    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    challenge_token = options_resp.json()["challenge_token"]

    verify_resp = client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": challenge_token,
        "credential": {"id": "fake-id", "response": {"transports": ["internal"]}},
    })
    assert verify_resp.status_code == 200

    list_resp = client.get("/api/v1/auth/webauthn/credentials", headers=headers)
    assert list_resp.status_code == 200
    creds = list_resp.json()
    assert len(creds) == 1
    assert creds[0]["transports"] == "internal"


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_register_verify_sends_new_device_email(mock_verify, mock_send, client):
    # A stolen-password-then-register-a-device attack should leave a signal
    # for the account owner -- see send_new_device_email's docstring.
    mock_verify.return_value = _FakeVerifiedRegistration()
    headers = get_auth_headers(client, email="webauthn2b@example.com")
    mock_send.reset_mock()  # clear the registration's own verification-code send

    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    challenge_token = options_resp.json()["challenge_token"]

    verify_resp = client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": challenge_token,
        "credential": {"id": "fake-id-2b", "response": {"transports": ["internal"]}},
    })
    assert verify_resp.status_code == 200

    assert mock_send.called
    sent_kwargs = mock_send.call_args[0][0]
    assert sent_kwargs["to"] == ["webauthn2b@example.com"]
    assert "מכשיר חדש" in sent_kwargs["subject"]


@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_register_verify_rejects_challenge_token_for_different_user(mock_verify, client):
    mock_verify.return_value = _FakeVerifiedRegistration()
    headers_a = get_auth_headers(client, email="webauthn3a@example.com")
    headers_b = get_auth_headers(client, email="webauthn3b@example.com")

    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers_a)
    challenge_token = options_resp.json()["challenge_token"]

    # User B tries to redeem user A's challenge token.
    verify_resp = client.post("/api/v1/auth/webauthn/register/verify", headers=headers_b, json={
        "challenge_token": challenge_token,
        "credential": {"id": "fake-id"},
    })
    assert verify_resp.status_code == 401


@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_register_verify_rejects_when_authenticator_did_not_verify_user(mock_verify, client):
    # user_verification=REQUIRED (webauthn_register_options) only *requests*
    # the authenticator's biometric/PIN gate -- this confirms the server
    # doesn't just trust that request happened, it checks the assertion's
    # own user_verified flag before persisting the credential.
    mock_verify.return_value = _FakeVerifiedRegistration(user_verified=False)
    headers = get_auth_headers(client, email="webauthn3c@example.com")

    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    verify_resp = client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": options_resp.json()["challenge_token"],
        "credential": {"id": "fake-id-3c"},
    })
    assert verify_resp.status_code == 400

    list_resp = client.get("/api/v1/auth/webauthn/credentials", headers=headers)
    assert list_resp.json() == []


def test_webauthn_login_options_unknown_username_returns_generic_empty_options(client):
    resp = client.post("/api/v1/auth/webauthn/login/options", json={"username": "no-such-user"})
    assert resp.status_code == 200
    body = resp.json()
    assert "options" in body
    assert "challenge_token" in body
    assert body["options"].get("allowCredentials") in (None, [])


@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_login_options_known_username_with_credentials_lists_them(mock_verify, client):
    mock_verify.return_value = _FakeVerifiedRegistration()
    headers = get_auth_headers(client, email="webauthn4@example.com")
    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": options_resp.json()["challenge_token"],
        "credential": {"id": "fake-id"},
    })

    login_options = client.post("/api/v1/auth/webauthn/login/options", json={"username": "webauthn4"})
    assert login_options.status_code == 200
    allow = login_options.json()["options"].get("allowCredentials") or []
    assert len(allow) == 1


class _FakeVerifiedAuthentication:
    def __init__(self, new_sign_count=1, user_verified=True):
        self.new_sign_count = new_sign_count
        self.user_verified = user_verified


@patch("app.api.v1.endpoints.auth.webauthn.verify_authentication_response")
@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_login_verify_success_issues_session_token(mock_reg_verify, mock_auth_verify, client, db_session):
    mock_reg_verify.return_value = _FakeVerifiedRegistration()
    mock_auth_verify.return_value = _FakeVerifiedAuthentication()

    headers = get_auth_headers(client, email="webauthn5@example.com")
    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": options_resp.json()["challenge_token"],
        "credential": {"id": "fake-credential-id-1"},
    })

    login_options = client.post("/api/v1/auth/webauthn/login/options", json={"username": "webauthn5"})
    challenge_token = login_options.json()["challenge_token"]

    # Must match the base64url encoding of _FakeVerifiedRegistration's
    # credential_id -- that's what register/verify actually persisted as
    # WebAuthnCredential.credential_id, not the raw request-body id string.
    from webauthn.helpers import bytes_to_base64url
    stored_credential_id = bytes_to_base64url(_FakeVerifiedRegistration().credential_id)

    login_verify = client.post("/api/v1/auth/webauthn/login/verify", json={
        "username": "webauthn5",
        "challenge_token": challenge_token,
        "credential": {"id": stored_credential_id},
    })
    assert login_verify.status_code == 200
    assert "access_token" in login_verify.json()


@patch("app.api.v1.endpoints.auth.webauthn.verify_authentication_response")
@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_login_verify_rejects_when_authenticator_did_not_verify_user(
    mock_reg_verify, mock_auth_verify, client, db_session
):
    # Mirrors the register-side rejection test: user_verification=REQUIRED
    # (webauthn_login_options) only *requests* the gate -- this confirms the
    # server checks the assertion's own user_verified flag rather than
    # trusting that the request was honored. This matters specifically
    # because a discoverable credential lets physical device access log in
    # with zero typed input -- the authenticator's biometric/PIN check is the
    # only thing standing in for a password here.
    mock_reg_verify.return_value = _FakeVerifiedRegistration()
    mock_auth_verify.return_value = _FakeVerifiedAuthentication(user_verified=False)

    headers = get_auth_headers(client, email="webauthn5b@example.com")
    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": options_resp.json()["challenge_token"],
        "credential": {"id": "fake-credential-id-1"},
    })

    login_options = client.post("/api/v1/auth/webauthn/login/options", json={"username": "webauthn5b"})
    challenge_token = login_options.json()["challenge_token"]

    from webauthn.helpers import bytes_to_base64url
    stored_credential_id = bytes_to_base64url(_FakeVerifiedRegistration().credential_id)

    login_verify = client.post("/api/v1/auth/webauthn/login/verify", json={
        "username": "webauthn5b",
        "challenge_token": challenge_token,
        "credential": {"id": stored_credential_id},
    })
    assert login_verify.status_code == 401
    assert "access_token" not in login_verify.json()


def test_webauthn_login_verify_unknown_credential_returns_generic_error(client):
    login_options = client.post("/api/v1/auth/webauthn/login/options", json={"username": "no-such-user"})
    challenge_token = login_options.json()["challenge_token"]

    resp = client.post("/api/v1/auth/webauthn/login/verify", json={
        "username": "no-such-user",
        "challenge_token": challenge_token,
        "credential": {"id": "whatever"},
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "הכניסה נכשלה"


def test_webauthn_login_options_omitted_username_returns_no_allow_list(client):
    # The usernameless/discoverable path -- Login.jsx's biometric button and
    # conditional-autofill flow both call this with no username at all.
    resp = client.post("/api/v1/auth/webauthn/login/options", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["options"].get("allowCredentials") in (None, [])


@patch("app.api.v1.endpoints.auth.webauthn.verify_authentication_response")
@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_login_verify_succeeds_with_no_username_via_discoverable_credential(
    mock_reg_verify, mock_auth_verify, client
):
    # The core of this feature: a full login using only the credential ID
    # from the assertion response -- no username typed or sent anywhere in
    # either the options or verify call. This is what makes biometric login
    # skip manual identification entirely, per the whole point of the fix.
    mock_reg_verify.return_value = _FakeVerifiedRegistration()
    mock_auth_verify.return_value = _FakeVerifiedAuthentication()

    headers = get_auth_headers(client, email="webauthn7@example.com")
    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers)
    client.post("/api/v1/auth/webauthn/register/verify", headers=headers, json={
        "challenge_token": options_resp.json()["challenge_token"],
        "credential": {"id": "fake-credential-id-1"},
    })

    login_options = client.post("/api/v1/auth/webauthn/login/options", json={})
    challenge_token = login_options.json()["challenge_token"]

    from webauthn.helpers import bytes_to_base64url
    stored_credential_id = bytes_to_base64url(_FakeVerifiedRegistration().credential_id)

    login_verify = client.post("/api/v1/auth/webauthn/login/verify", json={
        "challenge_token": challenge_token,
        "credential": {"id": stored_credential_id},
    })
    assert login_verify.status_code == 200
    assert "access_token" in login_verify.json()


def test_webauthn_login_verify_omitted_username_and_unknown_credential_returns_generic_error(client):
    login_options = client.post("/api/v1/auth/webauthn/login/options", json={})
    challenge_token = login_options.json()["challenge_token"]

    resp = client.post("/api/v1/auth/webauthn/login/verify", json={
        "challenge_token": challenge_token,
        "credential": {"id": "never-registered"},
    })
    assert resp.status_code == 401
    assert resp.json()["detail"] == "הכניסה נכשלה"


@patch("app.api.v1.endpoints.auth.webauthn.verify_registration_response")
def test_webauthn_credentials_list_and_delete_scoped_to_owner(mock_verify, client):
    mock_verify.return_value = _FakeVerifiedRegistration()
    headers_a = get_auth_headers(client, email="webauthn6a@example.com")
    headers_b = get_auth_headers(client, email="webauthn6b@example.com")

    options_resp = client.post("/api/v1/auth/webauthn/register/options", headers=headers_a)
    client.post("/api/v1/auth/webauthn/register/verify", headers=headers_a, json={
        "challenge_token": options_resp.json()["challenge_token"],
        "credential": {"id": "fake-id"},
    })
    cred_id = client.get("/api/v1/auth/webauthn/credentials", headers=headers_a).json()[0]["id"]

    # User B cannot delete user A's credential -- 404, not 403 (doesn't
    # confirm the credential exists at all).
    delete_as_b = client.delete(f"/api/v1/auth/webauthn/credentials/{cred_id}", headers=headers_b)
    assert delete_as_b.status_code == 404

    # User A can.
    delete_as_a = client.delete(f"/api/v1/auth/webauthn/credentials/{cred_id}", headers=headers_a)
    assert delete_as_a.status_code == 200

    assert client.get("/api/v1/auth/webauthn/credentials", headers=headers_a).json() == []
