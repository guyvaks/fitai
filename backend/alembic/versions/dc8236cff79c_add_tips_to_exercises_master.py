"""add tips to exercises_master

Revision ID: dc8236cff79c
Revises: 6fdb93b8e6b1
Create Date: 2026-08-04 16:14:42.828534

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dc8236cff79c'
down_revision: Union[str, None] = '6fdb93b8e6b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exercises_master", sa.Column("tips", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exercises_master", "tips")
