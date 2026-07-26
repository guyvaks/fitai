"""Tests for admin-gated AI access: PATCH /api/v1/admin/users/{id}/toggle-ai-access
and the ai_access_approved gate on /api/v1/agents/* (the gate itself is
covered by test_generate_blocked_for_unapproved_ai_access in test_agents.py)."""
from app.models.user import User
from tests.conftest import get_auth_headers


def _make_admin(db_session, email="test@example.com"):
    user = db_session.query(User).filter(User.email == email).first()
    user.is_admin = True
    db_session.commit()


def test_toggle_ai_access_requires_admin(client, db_session):
    headers = get_auth_headers(client)
    other_headers = get_auth_headers(client, email="other@example.com")
    other = db_session.query(User).filter(User.email == "other@example.com").first()

    response = client.patch(f"/api/v1/admin/users/{other.id}/toggle-ai-access", headers=headers)
    assert response.status_code == 403


def test_toggle_ai_access_flips_and_persists(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    target_headers = get_auth_headers(client, email="target@example.com")
    target = db_session.query(User).filter(User.email == "target@example.com").first()
    assert target.ai_access_approved is True  # grandfathered by get_auth_headers for test convenience

    response = client.patch(f"/api/v1/admin/users/{target.id}/toggle-ai-access", headers=headers)
    assert response.status_code == 200
    assert response.json()["ai_access_approved"] is False

    db_session.refresh(target)
    assert target.ai_access_approved is False

    response = client.patch(f"/api/v1/admin/users/{target.id}/toggle-ai-access", headers=headers)
    assert response.status_code == 200
    assert response.json()["ai_access_approved"] is True


def test_toggle_ai_access_unknown_user_404(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.patch("/api/v1/admin/users/00000000-0000-0000-0000-000000000000/toggle-ai-access", headers=headers)
    assert response.status_code == 404


def test_list_users_includes_ai_access_field(client, db_session):
    headers = get_auth_headers(client)
    _make_admin(db_session)

    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 200
    assert all("ai_access_approved" in u for u in response.json())
