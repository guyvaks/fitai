"""Verifies DELETE /admin/users/{id} leaves zero orphaned rows anywhere.

Cross-referenced against every model with a users.id FK (grep across
app/models/*.py): 18 tables are covered by delete_user's explicit
delete-children-then-parent logic in admin.py (some via a direct user_id
filter, some transitively via a parent id -- e.g. Meal/WorkoutExercise/
ExerciseLog), 4 more (push_subscriptions, password_reset_tokens,
email_verification_codes, consent_records) rely on a real DB-level
ON DELETE CASCADE FK (confirmed in their migrations, not just declared on
the model) rather than an explicit statement, and users.avatar_data is an
inline column on the users row itself so it disappears with the row.
food_master.created_by_user_id is ON DELETE SET NULL by design (it's
global/shared data that must survive its creator's deletion) -- this test
confirms that row survives with a nulled creator, not that it's deleted.

Note: Meal and WorkoutExercise are legacy/normalized-schema leftovers --
no current code path ever inserts into them (nutrition/workout plans store
their content in NutritionPlan.plan_data/WorkoutPlan.plan_data JSON
instead), but the cascade delete still handles them, so this test seeds
them anyway to prove that path still works if they're ever used again.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from app.models.user import (
    User, UserProfile, PushSubscription, PasswordResetToken,
    EmailVerificationCode, ConsentRecord,
)
from app.models.fitness import (
    NutritionPlan, Meal, FoodLog, WorkoutPlan, WorkoutExercise,
    WorkoutSession, ExerciseLog, AISuggestion, SmartProgression,
    UserMemory, ExerciseMemory, FoodMemory, PersonalRecord,
    EnduranceLog, StrengthLog, HydrationLog, WeightLog, FoodMaster,
)
from tests.conftest import get_auth_headers

# Every table with a user_id FK that delete_user must clear, keyed by the
# model and the column that references the deleted user.
USER_SCOPED_MODELS = [
    UserProfile, NutritionPlan, FoodLog, WorkoutPlan, WorkoutSession,
    AISuggestion, SmartProgression, UserMemory, ExerciseMemory, FoodMemory,
    PersonalRecord, EnduranceLog, StrengthLog, WeightLog, HydrationLog,
    PushSubscription, PasswordResetToken, EmailVerificationCode, ConsentRecord,
]


def _make_admin(db_session, email):
    user = db_session.query(User).filter(User.email == email).first()
    user.is_admin = True
    db_session.commit()


def test_delete_user_leaves_no_orphaned_rows_anywhere(client, db_session):
    admin_headers = get_auth_headers(client, email="cascade-admin@example.com")
    _make_admin(db_session, "cascade-admin@example.com")

    get_auth_headers(client, email="cascade-target@example.com")
    target = db_session.query(User).filter(User.email == "cascade-target@example.com").first()
    uid = target.id

    # avatar_data lives directly on the users row.
    target.avatar_data = b"fake-jpeg-bytes"
    target.avatar_content_type = "image/jpeg"
    target.avatar_updated_at = datetime.now(timezone.utc)
    db_session.add(target)

    nutrition_plan_id = uuid.uuid4()
    workout_plan_id = uuid.uuid4()
    session_id = uuid.uuid4()
    nutrition_plan = NutritionPlan(id=nutrition_plan_id, user_id=uid, plan_data={})
    workout_plan = WorkoutPlan(id=workout_plan_id, user_id=uid, plan_data={})
    session = WorkoutSession(id=session_id, user_id=uid, workout_plan_id=workout_plan_id)
    db_session.add_all([nutrition_plan, workout_plan])
    db_session.commit()
    db_session.add(session)
    db_session.commit()

    rows = [
        UserProfile(id=uuid.uuid4(), user_id=uid),
        Meal(id=uuid.uuid4(), nutrition_plan_id=nutrition_plan_id, user_id=uid, day_of_week="sunday"),
        FoodLog(id=uuid.uuid4(), user_id=uid, date=date.today(), food_name="apple"),
        WorkoutExercise(id=uuid.uuid4(), workout_plan_id=workout_plan_id, name="squat"),
        ExerciseLog(id=uuid.uuid4(), session_id=session_id, user_id=uid, exercise_name="squat"),
        AISuggestion(id=uuid.uuid4(), user_id=uid, suggestion_type="workout", content={}),
        SmartProgression(id=uuid.uuid4(), user_id=uid),
        UserMemory(id=uuid.uuid4(), user_id=uid, memory_data={}),
        ExerciseMemory(id=uuid.uuid4(), user_id=uid, exercise_name="squat"),
        FoodMemory(id=uuid.uuid4(), user_id=uid, food_name="apple"),
        PersonalRecord(id=uuid.uuid4(), user_id=uid, exercise_name="squat"),
        EnduranceLog(id=uuid.uuid4(), user_id=uid, date=date.today()),
        StrengthLog(id=uuid.uuid4(), user_id=uid, exercise_name="squat"),
        WeightLog(id=uuid.uuid4(), user_id=uid, date=date.today(), weight_kg=80.0),
        HydrationLog(id=uuid.uuid4(), user_id=uid, date=date.today()),
        PushSubscription(id=uuid.uuid4(), user_id=uid, endpoint="https://push.example/x", p256dh="k", auth="a"),
        PasswordResetToken(
            id=uuid.uuid4(), user_id=uid, token_hash="hash123",
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        ),
        ConsentRecord(id=uuid.uuid4(), user_id=uid, policy_version="test-extra"),
        # EmailVerificationCode already exists from registration (unique
        # per user) -- don't insert a second one, just leave it as seeded
        # by get_auth_headers/register.
    ]
    db_session.add_all(rows)

    food_master = FoodMaster(
        id=uuid.uuid4(), canonical_name_he="תפוח", category="fruit",
        calories_per_100g=52, protein_per_100g=0.3, carbs_per_100g=14, fat_per_100g=0.2,
        created_by_user_id=uid,
    )
    db_session.add(food_master)
    db_session.commit()

    # Sanity check: every seeded row actually exists before deletion.
    assert db_session.query(EmailVerificationCode).filter(EmailVerificationCode.user_id == uid).count() == 1
    for model in USER_SCOPED_MODELS:
        assert db_session.query(model).filter(model.user_id == uid).count() >= 1, model.__name__
    assert db_session.query(Meal).filter(Meal.user_id == uid).count() == 1
    assert db_session.query(WorkoutExercise).filter(WorkoutExercise.workout_plan_id == workout_plan_id).count() == 1
    assert db_session.query(ExerciseLog).filter(ExerciseLog.user_id == uid).count() == 1

    response = client.delete(f"/api/v1/admin/users/{uid}", headers=admin_headers)
    assert response.status_code == 200

    # The user row itself is gone.
    assert db_session.query(User).filter(User.id == uid).first() is None

    # Zero orphaned rows in every user-scoped table.
    for model in USER_SCOPED_MODELS:
        assert db_session.query(model).filter(model.user_id == uid).count() == 0, f"{model.__name__} orphaned"
    assert db_session.query(Meal).filter(Meal.user_id == uid).count() == 0
    assert db_session.query(WorkoutExercise).filter(WorkoutExercise.workout_plan_id == workout_plan_id).count() == 0
    assert db_session.query(ExerciseLog).filter(ExerciseLog.user_id == uid).count() == 0
    assert db_session.query(NutritionPlan).filter(NutritionPlan.id == nutrition_plan_id).first() is None
    assert db_session.query(WorkoutPlan).filter(WorkoutPlan.id == workout_plan_id).first() is None
    assert db_session.query(WorkoutSession).filter(WorkoutSession.id == session_id).first() is None

    # food_master is global data -- it survives, but its creator reference
    # is nulled (ON DELETE SET NULL), not left dangling.
    db_session.refresh(food_master)
    assert food_master.created_by_user_id is None
