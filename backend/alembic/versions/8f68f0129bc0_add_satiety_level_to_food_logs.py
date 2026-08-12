"""add satiety_level to food_logs

Revision ID: 8f68f0129bc0
Revises: 5b3a80e7fd1e
Create Date: 2026-08-12 10:42:24.509719

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f68f0129bc0'
down_revision: Union[str, None] = '5b3a80e7fd1e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("food_logs", sa.Column("satiety_level", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("food_logs", "satiety_level")
