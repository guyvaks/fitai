"""add webauthn_credentials table

Revision ID: a7c4e9f1b6d2
Revises: f2b8c1d9e4a3
Create Date: 2026-07-29 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a7c4e9f1b6d2'
down_revision: Union[str, None] = 'f2b8c1d9e4a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'webauthn_credentials',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('credential_id', sa.String(), nullable=False),
        sa.Column('public_key', sa.String(), nullable=False),
        sa.Column('sign_count', sa.Integer(), nullable=False),
        sa.Column('transports', sa.String(), nullable=True),
        sa.Column('device_label', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('credential_id'),
    )
    op.create_index(
        op.f('ix_webauthn_credentials_user_id'), 'webauthn_credentials', ['user_id'], unique=False,
    )
    op.create_index(
        op.f('ix_webauthn_credentials_credential_id'), 'webauthn_credentials', ['credential_id'], unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_webauthn_credentials_credential_id'), table_name='webauthn_credentials')
    op.drop_index(op.f('ix_webauthn_credentials_user_id'), table_name='webauthn_credentials')
    op.drop_table('webauthn_credentials')
