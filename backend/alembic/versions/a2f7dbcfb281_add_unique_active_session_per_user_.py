"""add unique active session per user constraint

Revision ID: a2f7dbcfb281
Revises: addc0a499897
Create Date: 2026-07-22 08:50:50.978013

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2f7dbcfb281'
down_revision: Union[str, None] = 'addc0a499897'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_workout_sessions_one_active_per_user",
        "workout_sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_workout_sessions_one_active_per_user",
        table_name="workout_sessions",
    )
