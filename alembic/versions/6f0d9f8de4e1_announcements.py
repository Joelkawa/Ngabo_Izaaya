"""Announcements

Revision ID: 6f0d9f8de4e1
Revises: 1091ff5027b2
Create Date: 2026-05-23 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f0d9f8de4e1'
down_revision: Union[str, Sequence[str], None] = '1091ff5027b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'announcements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('announcement_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_published', sa.Boolean(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_announcements_id'), 'announcements', ['id'], unique=False)
    op.create_index(op.f('ix_announcements_title'), 'announcements', ['title'], unique=False)
    op.create_index(op.f('ix_announcements_announcement_date'), 'announcements', ['announcement_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_announcements_announcement_date'), table_name='announcements')
    op.drop_index(op.f('ix_announcements_title'), table_name='announcements')
    op.drop_index(op.f('ix_announcements_id'), table_name='announcements')
    op.drop_table('announcements')
