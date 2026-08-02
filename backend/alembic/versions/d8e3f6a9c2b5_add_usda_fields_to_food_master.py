"""add usda fields to food_master and food_portions table

Revision ID: d8e3f6a9c2b5
Revises: c4d8e1a5f7b3
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8e3f6a9c2b5'
down_revision: Union[str, None] = 'c4d8e1a5f7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('food_master', sa.Column('fdc_id', sa.String(), nullable=True))
    op.add_column('food_master', sa.Column('category_en', sa.String(), nullable=True))
    op.add_column('food_master', sa.Column('sodium_mg', sa.Float(), nullable=True))
    op.add_column('food_master', sa.Column('potassium_mg', sa.Float(), nullable=True))
    op.add_column('food_master', sa.Column('calcium_mg', sa.Float(), nullable=True))
    op.add_column('food_master', sa.Column('iron_mg', sa.Float(), nullable=True))
    op.add_column('food_master', sa.Column('cholesterol_mg', sa.Float(), nullable=True))
    op.add_column('food_master', sa.Column('saturated_fat_g', sa.Float(), nullable=True))
    op.add_column('food_master', sa.Column('sugar_g', sa.Float(), nullable=True))
    op.create_index(op.f('ix_food_master_fdc_id'), 'food_master', ['fdc_id'], unique=True)

    op.create_table(
        'food_portions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('fdc_id', sa.String(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('unit_he', sa.String(), nullable=True),
        sa.Column('unit_en', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('weight_grams', sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_food_portions_fdc_id'), 'food_portions', ['fdc_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_food_portions_fdc_id'), table_name='food_portions')
    op.drop_table('food_portions')

    op.drop_index(op.f('ix_food_master_fdc_id'), table_name='food_master')
    op.drop_column('food_master', 'sugar_g')
    op.drop_column('food_master', 'saturated_fat_g')
    op.drop_column('food_master', 'cholesterol_mg')
    op.drop_column('food_master', 'iron_mg')
    op.drop_column('food_master', 'calcium_mg')
    op.drop_column('food_master', 'potassium_mg')
    op.drop_column('food_master', 'sodium_mg')
    op.drop_column('food_master', 'category_en')
    op.drop_column('food_master', 'fdc_id')
