"""add username to users

Revision ID: f2b8c1d9e4a3
Revises: e1a2b3c4d5f6
Create Date: 2026-07-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f2b8c1d9e4a3'
down_revision: Union[str, None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No server_default and no backfill, unlike every other "add a NOT NULL
    # column" migration in this project (e.g. preferred_language). This is
    # deliberate: username IS NULL is the permanent, DB-level marker for a
    # pre-migration account (existed before username-based login shipped).
    # Every *new* row gets a username at registration -- an application-level
    # invariant enforced in the /register endpoint, not a DB constraint --
    # while existing rows stay NULL until each user self-serves through
    # POST /auth/activate-account. Do NOT add a NOT NULL constraint here or
    # in any follow-up migration; that would permanently break the migration
    # bridge for every account that hasn't gone through it yet.
    op.add_column('users', sa.Column('username', sa.String(length=30), nullable=True))
    op.add_column('users', sa.Column('username_normalized', sa.String(length=30), nullable=True))
    # Postgres unique indexes allow multiple NULLs, so this is compatible
    # with every existing row starting out NULL in both new columns.
    op.create_index(
        'ix_users_username_normalized', 'users', ['username_normalized'], unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_users_username_normalized', table_name='users')
    op.drop_column('users', 'username_normalized')
    op.drop_column('users', 'username')
