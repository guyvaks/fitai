"""add video_mp4_path to exercises_master

Revision ID: a1f4c9e7d3b6
Revises: c20de5b59cc1
Create Date: 2026-08-08 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1f4c9e7d3b6'
down_revision: Union[str, None] = 'c20de5b59cc1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exercises_master", sa.Column("video_mp4_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("exercises_master", "video_mp4_path")
