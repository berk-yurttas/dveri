"""add entered/exited quantity to work_orders + work_order_scans table

Revision ID: 1a2b3c4d5e6f
Revises: 08be09af3bfd
Create Date: 2026-06-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f'
down_revision = '08be09af3bfd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Piece-level counters on work_orders
    op.add_column('work_orders', sa.Column('entered_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('work_orders', sa.Column('exited_quantity', sa.Integer(), nullable=False, server_default='0'))
    # Backfill so historical rows read as whole-package
    op.execute("UPDATE work_orders SET entered_quantity = quantity")
    op.execute("UPDATE work_orders SET exited_quantity = quantity WHERE exit_date IS NOT NULL")

    # Append-only per-scan audit log
    op.create_table(
        'work_order_scans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('station_id', sa.Integer(), nullable=False),
        sa.Column('work_order_group_id', sa.String(length=50), nullable=False),
        sa.Column('package_index', sa.Integer(), nullable=False),
        sa.Column('direction', sa.String(length=3), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('qr_code', sa.String(length=20), nullable=True),
        sa.Column('scanned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['station_id'], ['stations.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_work_order_scans_id'), 'work_order_scans', ['id'], unique=False)
    op.create_index(op.f('ix_work_order_scans_work_order_group_id'), 'work_order_scans', ['work_order_group_id'], unique=False)
    op.create_index(op.f('ix_work_order_scans_user_id'), 'work_order_scans', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_work_order_scans_user_id'), table_name='work_order_scans')
    op.drop_index(op.f('ix_work_order_scans_work_order_group_id'), table_name='work_order_scans')
    op.drop_index(op.f('ix_work_order_scans_id'), table_name='work_order_scans')
    op.drop_table('work_order_scans')
    op.drop_column('work_orders', 'exited_quantity')
    op.drop_column('work_orders', 'entered_quantity')
