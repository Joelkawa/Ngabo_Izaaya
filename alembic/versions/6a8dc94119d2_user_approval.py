"""User approval workflow

Revision ID: 6a8dc94119d2
Revises: b7d0fa14f3b1
Create Date: 2026-05-24 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6a8dc94119d2"
down_revision: Union[str, Sequence[str], None] = "b7d0fa14f3b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()))

    op.execute("UPDATE users SET is_approved = 1")

    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("is_approved", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_approved")
