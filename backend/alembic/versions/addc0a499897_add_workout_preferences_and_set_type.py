"""add workout_preferences and set_type

Revision ID: addc0a499897
Revises: 095d478e8f9c
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'addc0a499897'
down_revision: Union[str, None] = '095d478e8f9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('workout_preferences', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('exercise_logs', sa.Column('set_type', sa.String(), nullable=False, server_default='normal'))


def downgrade() -> None:
    op.drop_column('exercise_logs', 'set_type')
    op.drop_column('user_profiles', 'workout_preferences')
