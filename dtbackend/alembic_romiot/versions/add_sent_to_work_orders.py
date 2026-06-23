"""add work_orders.sent (Toy API delivery flag)

Revision ID: b1c2d3e4f5a6
Revises: 08be09af3bfd
Create Date: 2026-06-11 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b1c2d3e4f5a6'
down_revision = '08be09af3bfd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'work_orders',
        sa.Column('sent', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('work_orders', 'sent')
