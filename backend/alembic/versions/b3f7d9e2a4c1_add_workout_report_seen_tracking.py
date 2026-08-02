"""add workout report seen tracking to user profiles

Revision ID: b3f7d9e2a4c1
Revises: a1c3e5f7b9d2
Create Date: 2026-08-02 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f7d9e2a4c1'
down_revision: Union[str, None] = 'a1c3e5f7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_profiles', sa.Column('last_weekly_report_seen', sa.Date(), nullable=True))
    op.add_column('user_profiles', sa.Column('last_monthly_report_seen', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_profiles', 'last_monthly_report_seen')
    op.drop_column('user_profiles', 'last_weekly_report_seen')
