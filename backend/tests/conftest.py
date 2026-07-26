import pytest
from sqlalchemy import create_engine
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
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_auth_headers(client, email="test@example.com"):
    client.post("/api/v1/auth/register", json={
        "email": email,
        "password": "SecurePass123",
        "full_name": "Test User",
    })
    # New signups are unverified by default (email-verification feature) and
    # login now rejects unverified accounts -- this helper is used by nearly
    # every other test file purely to get an authenticated session, not to
    # exercise the verification flow itself, so mark verified directly via a
    # fresh session on the same shared (StaticPool) in-memory DB rather than
    # making every caller go through /verify-email.
    direct_session = TestingSessionLocal()
    try:
        direct_session.query(User).filter(User.email == email).update({"is_verified": True})
        direct_session.commit()
    finally:
        direct_session.close()

    response = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "SecurePass123",
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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
