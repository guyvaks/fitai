"""add preferred_language to users

Revision ID: e1a2b3c4d5f6
Revises: 9a3e6b0c2f74
Create Date: 2026-07-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, None] = '9a3e6b0c2f74'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default grandfathers every existing user in as "he" (the
    # current, only-supported UI language) -- this column is storage-only
    # for now (see the model's comment), no i18n is wired up yet.
    op.add_column(
        'users',
        sa.Column('preferred_language', sa.String(), nullable=False, server_default='he'),
    )


def downgrade() -> None:
    op.drop_column('users', 'preferred_language')
