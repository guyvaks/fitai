"""add created_by_user_id to food_master

Revision ID: 2cb4d90c185d
Revises: 0a17721ce4f2
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '2cb4d90c185d'
down_revision: Union[str, None] = '0a17721ce4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "food_master",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_food_master_created_by_user_id_users",
        "food_master", "users",
        ["created_by_user_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_food_master_created_by_user_id_users", "food_master", type_="foreignkey")
    op.drop_column("food_master", "created_by_user_id")
