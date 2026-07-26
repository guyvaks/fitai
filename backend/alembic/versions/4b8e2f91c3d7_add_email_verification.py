"""add is_verified to users + email_verification_codes table

Revision ID: 4b8e2f91c3d7
Revises: 9f3d1c6b7e2a
Create Date: 2026-07-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '4b8e2f91c3d7'
down_revision: Union[str, None] = '9f3d1c6b7e2a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default=true grandfathers in every existing user as already
    # verified -- this feature only gates *new* signups going forward, it
    # must not retroactively lock anyone out.
    op.add_column(
        'users',
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        'email_verification_codes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('code_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('email_verification_codes')
    op.drop_column('users', 'is_verified')
