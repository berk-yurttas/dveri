"""add work_order_routes table + work_orders.route_violation

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-02 10:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'work_orders',
        sa.Column('route_violation', sa.Boolean(), nullable=False, server_default='false'),
    )

    op.create_table(
        'work_order_routes',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('work_order_group_id', sa.String(length=50), nullable=False, index=True),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('station_id', sa.Integer(), sa.ForeignKey('stations.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('work_order_group_id', 'position', name='uq_route_position'),
    )


def downgrade() -> None:
    op.drop_table('work_order_routes')
    op.drop_column('work_orders', 'route_violation')
