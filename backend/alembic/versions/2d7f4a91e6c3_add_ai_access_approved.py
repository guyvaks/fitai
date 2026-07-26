"""add ai_access_approved to users

Revision ID: 2d7f4a91e6c3
Revises: 6c9a2e5f8b14
Create Date: 2026-07-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2d7f4a91e6c3'
down_revision: Union[str, None] = '6c9a2e5f8b14'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default=true grandfathers in every existing user as already
    # approved -- this is a new gate on an existing core feature (AI plan
    # generation), so it must not retroactively lock anyone out. Only new
    # signups going forward start unapproved (see the model's Python-side
    # default=False).
    op.add_column(
        'users',
        sa.Column('ai_access_approved', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column('users', 'ai_access_approved')
