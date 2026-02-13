"""add part_number to work_orders

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2026-02-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d3e4f5g6h7'
down_revision = 'b1c2d3e4f5g6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('work_orders', sa.Column('part_number', sa.String(length=255), nullable=False, server_default=''))
    op.alter_column('work_orders', 'part_number', server_default=None)


def downgrade() -> None:
    op.drop_column('work_orders', 'part_number')
