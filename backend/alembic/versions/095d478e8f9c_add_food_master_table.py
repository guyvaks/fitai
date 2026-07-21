"""add food_master table

Revision ID: 095d478e8f9c
Revises: 03988473c62a
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '095d478e8f9c'
down_revision: Union[str, None] = '03988473c62a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('food_master',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('canonical_name_en', sa.String(), nullable=True),
    sa.Column('canonical_name_he', sa.String(), nullable=False),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('calories_per_100g', sa.Float(), nullable=False),
    sa.Column('protein_per_100g', sa.Float(), nullable=False),
    sa.Column('carbs_per_100g', sa.Float(), nullable=False),
    sa.Column('fat_per_100g', sa.Float(), nullable=False),
    sa.Column('fiber_per_100g', sa.Float(), nullable=True),
    sa.Column('aliases', postgresql.JSON(astext_type=sa.Text()), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('canonical_name_en')
    )


def downgrade() -> None:
    op.drop_table('food_master')
