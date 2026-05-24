"""Messages media support

Revision ID: b7d0fa14f3b1
Revises: 6f0d9f8de4e1
Create Date: 2026-05-24 08:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7d0fa14f3b1"
down_revision: Union[str, Sequence[str], None] = "6f0d9f8de4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.add_column(sa.Column("media_url", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("media_mime_type", sa.String(length=100), nullable=True))

    op.execute("UPDATE conversations SET updated_at = created_at WHERE updated_at IS NULL")
    op.execute("UPDATE messages SET updated_at = created_at WHERE updated_at IS NULL")


def downgrade() -> None:
    with op.batch_alter_table("messages") as batch_op:
        batch_op.drop_column("media_mime_type")
        batch_op.drop_column("media_url")
