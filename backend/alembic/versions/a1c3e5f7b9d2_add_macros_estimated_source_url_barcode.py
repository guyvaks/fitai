"""add macros_estimated, source_url, barcode to food_master

Revision ID: a1c3e5f7b9d2
Revises: d8e3f6a9c2b5
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1c3e5f7b9d2'
down_revision: Union[str, None] = 'd8e3f6a9c2b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'food_master',
        sa.Column('macros_estimated', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('food_master', sa.Column('source_url', sa.String(), nullable=True))
    op.add_column('food_master', sa.Column('barcode', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('food_master', 'barcode')
    op.drop_column('food_master', 'source_url')
    op.drop_column('food_master', 'macros_estimated')
