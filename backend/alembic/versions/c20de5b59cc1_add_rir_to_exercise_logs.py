"""add rir to exercise_logs

Revision ID: c20de5b59cc1
Revises: dc8236cff79c
Create Date: 2026-08-04 16:19:56.447189

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c20de5b59cc1'
down_revision: Union[str, None] = 'dc8236cff79c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exercise_logs", sa.Column("rir", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("exercise_logs", "rir")
