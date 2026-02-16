"""add priority tokens, exit station flag, and delivered field

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-02-13 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3e4f5g6h7i8'
down_revision = 'c2d3e4f5g6h7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_exit_station to stations
    op.add_column('stations', sa.Column('is_exit_station', sa.Boolean(), nullable=False, server_default='false'))

    # Add priority, prioritized_by, delivered to work_orders
    op.add_column('work_orders', sa.Column('priority', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('work_orders', sa.Column('prioritized_by', sa.Integer(), nullable=True))
    op.add_column('work_orders', sa.Column('delivered', sa.Boolean(), nullable=False, server_default='false'))

    # Create priority_tokens table
    op.create_table(
        'priority_tokens',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False, index=True),
        sa.Column('company', sa.String(length=255), nullable=False, index=True),
        sa.Column('total_tokens', sa.Integer(), nullable=False),
        sa.Column('used_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('priority_tokens')
    op.drop_column('work_orders', 'delivered')
    op.drop_column('work_orders', 'prioritized_by')
    op.drop_column('work_orders', 'priority')
    op.drop_column('stations', 'is_exit_station')
