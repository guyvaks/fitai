"""make exercises_master canonical_name_en nullable

Revision ID: 03988473c62a
Revises: a9d1035b387a
Create Date: 2026-07-19 18:41:48.938463

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '03988473c62a'
down_revision: Union[str, None] = 'a9d1035b387a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # canonical_name_en was NOT NULL + UNIQUE, but user-submitted exercise
    # suggestions (POST /api/v1/exercises/suggest) only require the Hebrew
    # name -- English is optional. Postgres permits multiple NULLs under a
    # unique constraint, so uniqueness among *provided* English names still
    # holds after this relaxation.
    op.alter_column(
        "exercises_master",
        "canonical_name_en",
        existing_type=sa.String(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "exercises_master",
        "canonical_name_en",
        existing_type=sa.String(),
        nullable=False,
    )
