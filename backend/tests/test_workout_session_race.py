"""Deterministic reproduction of the start_session active-session race condition.

The `client`/`db_session` fixtures in conftest.py share a single in-memory
SQLite connection (StaticPool) across the whole test, so calling the endpoint
twice through the TestClient never actually interleaves two transactions —
the second call simply sees the first call's already-committed row. To
reproduce the real race (two requests both passing the "no active session"
check before either commits) we need two genuinely independent DB
connections, so this test uses its own temporary file-based SQLite database
instead of the shared in-memory one.
"""
import os
import tempfile
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.security import get_password_hash
from app.models.user import User
from app.models.fitness import WorkoutPlan, WorkoutSession
from app.api.v1.endpoints.workouts import start_session


@pytest.fixture()
def race_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    try:
        yield SessionLocal
    finally:
        engine.dispose()
        os.remove(path)


def test_start_session_race_condition_resolves_to_single_session(race_db):
    setup = race_db()
    user = User(
        email="race@example.com",
        hashed_password=get_password_hash("SecurePass123"),
        full_name="Race Tester",
    )
    setup.add(user)
    setup.commit()
    user_id = user.id
    setup.add(WorkoutPlan(user_id=user_id, plan_data={"sunday": {"exercises": []}}, is_active=True))
    setup.commit()
    setup.close()

    session_a = race_db()
    session_b = race_db()
    try:
        user_a = session_a.query(User).filter(User.id == user_id).first()
        user_b = session_b.query(User).filter(User.id == user_id).first()

        # Both requests observe "no active session" before either commits —
        # this is the exact window the bug lived in.
        assert session_a.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id, WorkoutSession.status == "active"
        ).first() is None
        assert session_b.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id, WorkoutSession.status == "active"
        ).first() is None

        # session_a wins the race and commits first.
        result_a = start_session(day_of_week="sunday", db=session_a, current_user=user_a)

        # session_b was already past its own "no active session" check above,
        # so it still attempts to insert a second row — the constraint (and
        # the endpoint's catch/return-existing fallback) must resolve this.
        new_session = WorkoutSession(
            user_id=user_id,
            workout_plan_id=None,
            current_exercise_index=0,
            current_set_index=0,
            completed_sets={},
            status="active",
        )
        session_b.add(new_session)
        from sqlalchemy.exc import IntegrityError
        try:
            session_b.commit()
            raise AssertionError("expected IntegrityError from the partial unique index")
        except IntegrityError:
            session_b.rollback()

        result_b = session_b.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id, WorkoutSession.status == "active"
        ).first()

        assert result_a.id == result_b.id

        verify = race_db()
        active_sessions = verify.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id, WorkoutSession.status == "active"
        ).all()
        assert len(active_sessions) == 1
        verify.close()
    finally:
        session_a.close()
        session_b.close()


def test_start_session_endpoint_catches_integrity_error_and_returns_existing(race_db):
    """Exercises the real endpoint function's except-IntegrityError branch.

    SQLite gives plain SELECTs no snapshot isolation, so calling
    start_session() twice in sequence never actually reaches that branch —
    the second call's own internal check would just see the first call's
    committed row and take the early-return path instead, never touching
    the except block at all. To deterministically hit the race window (both
    requests already past the "no active session" check before either
    commits) we mock exactly that one check for session_b's call to report
    "none found" regardless of real DB state, then let everything else
    (plan lookup, insert, commit, the real except/rollback/re-query) run
    for real against the real DB, which already has session_a's committed
    row — so the insert genuinely violates the constraint.
    """
    setup = race_db()
    user = User(
        email="race2@example.com",
        hashed_password=get_password_hash("SecurePass123"),
        full_name="Race Tester 2",
    )
    setup.add(user)
    setup.commit()
    user_id = user.id
    setup.add(WorkoutPlan(user_id=user_id, plan_data={"sunday": {"exercises": []}}, is_active=True))
    setup.commit()
    setup.close()

    session_a = race_db()
    session_b = race_db()
    try:
        user_a = session_a.query(User).filter(User.id == user_id).first()
        user_b = session_b.query(User).filter(User.id == user_id).first()

        result_a = start_session(day_of_week="sunday", db=session_a, current_user=user_a)

        class _NoneFirst:
            def filter(self, *a, **k):
                return self

            def first(self):
                return None

        real_query = session_b.query
        calls = {"n": 0}

        def query_forcing_first_check_to_miss(model, *a, **k):
            if model is WorkoutSession and calls["n"] == 0:
                calls["n"] += 1
                return _NoneFirst()
            return real_query(model, *a, **k)

        session_b.query = query_forcing_first_check_to_miss
        try:
            result_b = start_session(day_of_week="sunday", db=session_b, current_user=user_b)
        finally:
            session_b.query = real_query

        assert result_a.id == result_b.id

        verify = race_db()
        active_sessions = verify.query(WorkoutSession).filter(
            WorkoutSession.user_id == user_id, WorkoutSession.status == "active"
        ).all()
        assert len(active_sessions) == 1
        verify.close()
    finally:
        session_a.close()
        session_b.close()
