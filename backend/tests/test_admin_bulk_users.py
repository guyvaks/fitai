"""Tests for POST /api/v1/admin/users/bulk (bulk deactivate/reactivate/
revoke-ai-access/set-daily-limit/send-email/delete) and the is_active
login/session gate it depends on."""
import uuid
from unittest.mock import patch

from app.models.fitness import WorkoutPlan
from app.models.user import User, WebAuthnCredential
from tests.conftest import get_auth_headers


def _make_admin(db_session, email="test@example.com"):
    user = db_session.query(User).filter(User.email == email).first()
    user.is_admin = True
    db_session.commit()


def _target_ids(db_session, emails):
    return [
        str(u.id)
        for u in db_session.query(User).filter(User.email.in_(emails)).all()
    ]


def _uuids(ids):
    import uuid
    return [uuid.UUID(i) for i in ids]


def test_bulk_action_requires_admin(client, db_session):
    headers = get_auth_headers(client)
    get_auth_headers(client, email="other@example.com")
    ids = _target_ids(db_session, ["other@example.com"])

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "deactivate"},
    )
    assert response.status_code == 403


def test_bulk_deactivate_blocks_login_and_existing_session(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    target_headers = get_auth_headers(client, email="target@example.com")
    target = db_session.query(User).filter(User.email == "target@example.com").first()

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": [str(target.id)], "action": "deactivate"},
    )
    assert response.status_code == 200
    body = response.json()["results"]
    assert body == [{"id": str(target.id), "success": True}]

    db_session.refresh(target)
    assert target.is_active is False

    # New login attempts are rejected...
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "target", "password": "SecurePass123"},
    )
    assert login_resp.status_code == 403
    assert "הושבת" in login_resp.json()["detail"]

    # ...and the token issued *before* deactivation is rejected immediately too.
    me_resp = client.get("/api/v1/auth/me", headers=target_headers)
    assert me_resp.status_code == 403


def test_bulk_reactivate_restores_login(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    get_auth_headers(client, email="reactivate-target@example.com")
    target = db_session.query(User).filter(User.email == "reactivate-target@example.com").first()
    target.is_active = False
    db_session.commit()

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": [str(target.id)], "action": "reactivate"},
    )
    assert response.status_code == 200
    assert response.json()["results"] == [{"id": str(target.id), "success": True}]

    db_session.refresh(target)
    assert target.is_active is True

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "reactivate-target", "password": "SecurePass123"},
    )
    assert login_resp.status_code == 200


def test_bulk_deactivate_admin_cannot_deactivate_self(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    me = db_session.query(User).filter(User.email == "test@example.com").first()

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": [str(me.id)], "action": "deactivate"},
    )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["success"] is False
    assert "yourself" in result["error"].lower()

    db_session.refresh(me)
    assert me.is_active is True


def test_bulk_revoke_ai_access(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    get_auth_headers(client, email="revoke1@example.com")
    get_auth_headers(client, email="revoke2@example.com")
    ids = _target_ids(db_session, ["revoke1@example.com", "revoke2@example.com"])

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "revoke_ai_access"},
    )
    assert response.status_code == 200
    assert all(r["success"] for r in response.json()["results"])

    users = db_session.query(User).filter(User.id.in_(_uuids(ids))).all()
    assert all(u.ai_access_approved is False for u in users)


def test_bulk_set_daily_limit(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    get_auth_headers(client, email="limit1@example.com")
    get_auth_headers(client, email="limit2@example.com")
    ids = _target_ids(db_session, ["limit1@example.com", "limit2@example.com"])

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "set_daily_limit", "daily_limit": 3},
    )
    assert response.status_code == 200
    assert all(r["success"] for r in response.json()["results"])

    users = db_session.query(User).filter(User.id.in_(_uuids(ids))).all()
    assert all(u.daily_ai_generation_limit == 3 for u in users)

    # NULL (unlimited) must remain settable via bulk too.
    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "set_daily_limit", "daily_limit": None},
    )
    assert response.status_code == 200
    db_session.expire_all()
    users = db_session.query(User).filter(User.id.in_(_uuids(ids))).all()
    assert all(u.daily_ai_generation_limit is None for u in users)


def test_bulk_set_daily_limit_rejects_negative(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    get_auth_headers(client, email="neg-target@example.com")
    ids = _target_ids(db_session, ["neg-target@example.com"])

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "set_daily_limit", "daily_limit": -5},
    )
    assert response.status_code == 422


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send")
def test_bulk_send_email(mock_send, client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    get_auth_headers(client, email="email1@example.com")
    get_auth_headers(client, email="email2@example.com")
    ids = _target_ids(db_session, ["email1@example.com", "email2@example.com"])
    mock_send.reset_mock()  # clear the verification-code emails from setup above

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={
            "user_ids": ids,
            "action": "send_email",
            "subject": "עדכון חשוב",
            "body": "שלום, זהו עדכון.",
        },
    )
    assert response.status_code == 200
    assert all(r["success"] for r in response.json()["results"])
    assert mock_send.call_count == 2
    sent_to = {call.args[0]["to"][0] for call in mock_send.call_args_list}
    assert sent_to == {"email1@example.com", "email2@example.com"}


def test_bulk_send_email_requires_subject_and_body(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    get_auth_headers(client, email="no-subject@example.com")
    ids = _target_ids(db_session, ["no-subject@example.com"])

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "send_email"},
    )
    assert response.status_code == 422


@patch("app.services.email.settings.RESEND_API_KEY", "test-key")
@patch("app.services.email.resend.Emails.send", side_effect=Exception("Resend is down"))
def test_bulk_send_email_partial_failure_is_reported_per_user(mock_send, client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    get_auth_headers(client, email="failtarget@example.com")
    ids = _target_ids(db_session, ["failtarget@example.com"])

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={
            "user_ids": ids,
            "action": "send_email",
            "subject": "Subject",
            "body": "Body",
        },
    )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["success"] is False
    assert "error" in result


def test_bulk_action_unknown_user_reported_as_failure_not_500(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={
            "user_ids": ["00000000-0000-0000-0000-000000000000", "not-a-uuid"],
            "action": "deactivate",
        },
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 2
    assert all(r["success"] is False for r in results)


def test_bulk_delete_removes_users_and_cascades_related_data(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    get_auth_headers(client, email="del1@example.com")
    get_auth_headers(client, email="del2@example.com")
    targets = db_session.query(User).filter(User.email.in_(["del1@example.com", "del2@example.com"])).all()
    ids = [str(u.id) for u in targets]

    # Seed one row per target in a table with no DB-level ON DELETE CASCADE
    # (WorkoutPlan, cleared explicitly by _delete_user_cascade) and one in a
    # table that does rely on a real DB-level cascade FK (WebAuthnCredential)
    # -- covers both code paths the bulk "delete" action exercises.
    for u in targets:
        db_session.add(WorkoutPlan(id=uuid.uuid4(), user_id=u.id, plan_data={}))
        db_session.add(WebAuthnCredential(
            id=uuid.uuid4(), user_id=u.id, credential_id=f"cred-{u.id}",
            public_key="pk", sign_count=0,
        ))
    db_session.commit()

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": ids, "action": "delete"},
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert all(r["success"] for r in results)

    target_uuids = _uuids(ids)
    assert db_session.query(User).filter(User.id.in_(target_uuids)).count() == 0
    assert db_session.query(WorkoutPlan).filter(WorkoutPlan.user_id.in_(target_uuids)).count() == 0
    assert db_session.query(WebAuthnCredential).filter(WebAuthnCredential.user_id.in_(target_uuids)).count() == 0


def test_bulk_delete_admin_cannot_delete_self(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    me = db_session.query(User).filter(User.email == "test@example.com").first()

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": [str(me.id)], "action": "delete"},
    )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["success"] is False
    assert "yourself" in result["error"].lower()

    db_session.refresh(me)
    assert db_session.query(User).filter(User.id == me.id).first() is not None


def test_bulk_delete_partial_failure_for_unknown_user_not_500(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)
    get_auth_headers(client, email="del-partial@example.com")
    target = db_session.query(User).filter(User.email == "del-partial@example.com").first()

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={
            "user_ids": [str(target.id), "00000000-0000-0000-0000-000000000000"],
            "action": "delete",
        },
    )
    assert response.status_code == 200
    results = {r["id"]: r for r in response.json()["results"]}
    assert results[str(target.id)]["success"] is True
    assert results["00000000-0000-0000-0000-000000000000"]["success"] is False
    assert db_session.query(User).filter(User.id == target.id).first() is None


def test_bulk_action_empty_user_ids_rejected(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.post(
        "/api/v1/admin/users/bulk",
        headers=headers,
        json={"user_ids": [], "action": "deactivate"},
    )
    assert response.status_code == 422
