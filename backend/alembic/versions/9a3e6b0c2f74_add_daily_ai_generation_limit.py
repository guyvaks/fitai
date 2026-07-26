"""add daily_ai_generation_limit to users

Revision ID: 9a3e6b0c2f74
Revises: 2d7f4a91e6c3
Create Date: 2026-07-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9a3e6b0c2f74'
down_revision: Union[str, None] = '2d7f4a91e6c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable, no server_default needed -- NULL (unlimited) is the correct
    # value for every existing row and is also this column's ordinary
    # "not set" state, unlike the boolean grandfathering columns before it.
    op.add_column(
        'users',
        sa.Column('daily_ai_generation_limit', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'daily_ai_generation_limit')
