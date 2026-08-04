"""add media fields to exercises_master

Revision ID: 6fdb93b8e6b1
Revises: b3f7d9e2a4c1
Create Date: 2026-08-04 09:49:16.590132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6fdb93b8e6b1'
down_revision: Union[str, None] = 'b3f7d9e2a4c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exercises_master", sa.Column("exercise_id", sa.String(), nullable=True))
    op.add_column("exercises_master", sa.Column("animation_template", sa.String(), nullable=True))
    op.add_column("exercises_master", sa.Column("animation_webp_path", sa.String(), nullable=True))
    op.add_column("exercises_master", sa.Column("thumbnail_png_path", sa.String(), nullable=True))
    op.add_column("exercises_master", sa.Column("visual_group_id", sa.String(), nullable=True))
    op.create_unique_constraint(
        "uq_exercises_master_exercise_id", "exercises_master", ["exercise_id"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_exercises_master_exercise_id", "exercises_master", type_="unique"
    )
    op.drop_column("exercises_master", "visual_group_id")
    op.drop_column("exercises_master", "thumbnail_png_path")
    op.drop_column("exercises_master", "animation_webp_path")
    op.drop_column("exercises_master", "animation_template")
    op.drop_column("exercises_master", "exercise_id")
