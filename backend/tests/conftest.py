from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app as fastapi_app
from app.core.database import Base, get_db
from app.models.user import User
import app.models.fitness  # noqa: F401

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


# SQLite ignores foreign key constraints (including ON DELETE CASCADE) by
# default unless explicitly turned on per-connection -- without this, tests
# would silently never exercise any DB-level cascade (e.g. the four
# ON DELETE CASCADE FKs in app/models/user.py), even though they work
# correctly against the real Postgres in staging/production.
@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_auth_headers(client, email="test@example.com", username=None):
    # Derived from the email's local-part by default -- every test email in
    # this suite already uses only username-legal characters
    # (letters/digits/hyphens), so this needs no per-call changes at most
    # existing call sites. Pass `username=` explicitly for a test that
    # specifically needs to control it (e.g. a collision test).
    username = username or email.split("@")[0]
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "SecurePass123",
        "full_name": "Test User",
        "username": username,
        "consent_given": True,
    })
    # New signups are unverified and AI-access-unapproved by default
    # (email-verification and admin-gated-AI-access features) and login now
    # rejects unverified accounts -- this helper is used by nearly every
    # other test file purely to get an authenticated session, not to
    # exercise the verification/approval flows themselves, so mark both
    # directly via a fresh session on the same shared (StaticPool) in-memory
    # DB rather than making every caller go through /verify-email or an
    # admin approval call.
    direct_session = TestingSessionLocal()
    try:
        direct_session.query(User).filter(User.email == email).update({
            "is_verified": True,
            "ai_access_approved": True,
        })
        direct_session.commit()
    finally:
        direct_session.close()

    response = client.post("/api/v1/auth/login", json={
        "username": username,
        "password": "SecurePass123",
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _block_real_resend_calls():
    """Local runs load a real RESEND_API_KEY from backend/.env.local (see
    Settings.Config.env_file) -- every email function's own
    `if not settings.RESEND_API_KEY: skip` guard is a no-op here, so any test
    that reaches register()/forgot-password/forgot-access/resend-verification/
    a new-device WebAuthn registration/etc. without its own explicit
    `@patch("app.services.email.resend.Emails.send")` was sending a real
    email through the shared free-tier Resend account (100/day, shared with
    staging+production) -- get_auth_headers() alone (conftest.py, used by
    nearly every other test file to log in) does this on every call. Patches
    the single call every send in app/services/email.py ultimately goes
    through, same target the handful of tests asserting on email
    content/recipient already patch explicitly -- those keep working
    unchanged, since mock.patch nests cleanly over an already-patched
    attribute and each test's own patch is what it asserts against.

    Also defaults RESEND_SANDBOX_OVERRIDE_EMAIL to None: if a developer's
    local .env.local has it set (needed for real sends to work at all, since
    Resend's sandbox sender can only deliver to the account owner), every
    test asserting on a literal recipient/subject was failing against
    whatever real address is configured there instead of the test's own
    email -- a pre-existing local-only flakiness, not a code bug (see
    Known_Bugs.md). Tests covering the override behavior itself already
    patch this setting explicitly and are unaffected -- their own patch
    wins over this default while they run."""
    with patch("app.services.email.resend.Emails.send") as mock_send, \
            patch("app.services.email.settings.RESEND_SANDBOX_OVERRIDE_EMAIL", None):
        mock_send.return_value = {"id": "test-mocked-email-id"}
        yield mock_send


@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    fastapi_app.dependency_overrides[get_db] = override_get_db
    # slowapi's limiter state is process-global and persists across tests
    # (and across requests within a test) unless cleared -- without this,
    # tests that hit /auth/login or /auth/register more than a few times
    # (get_auth_headers, retry logic, etc.) would start tripping the real
    # rate limit and failing with 429s that have nothing to do with what
    # they're testing.
    fastapi_app.state.limiter.reset()
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "e2e: real end-to-end test that calls the live Anthropic API "
        "(slow, not free) — excluded by default, run explicitly with `pytest -m e2e`",
    )


def pytest_collection_modifyitems(config, items):
    """`e2e`-marked tests (see test_e2e_workout_generation.py) never run as
    part of the normal suite — they're slow and make real, billed API calls,
    unlike every other test here. Only an explicit `-m e2e` opts in."""
    if "e2e" in (config.getoption("-m") or ""):
        return
    skip_e2e = pytest.mark.skip(reason="e2e test — calls the live Anthropic API, run explicitly with `pytest -m e2e`")
    for item in items:
        if "e2e" in item.keywords:
            item.add_marker(skip_e2e)
