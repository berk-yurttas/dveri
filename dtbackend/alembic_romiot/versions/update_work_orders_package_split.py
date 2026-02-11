"""update work_orders table for package splitting

Revision ID: b1c2d3e4f5g6
Revises: a7b8c9d0e1f2
Create Date: 2026-02-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5g6'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old unique constraint
    op.drop_constraint('uq_work_order_keys', 'work_orders', type_='unique')

    # Add new columns first (with defaults for existing rows)
    op.add_column('work_orders', sa.Column('work_order_group_id', sa.String(length=50), nullable=True))
    op.add_column('work_orders', sa.Column('main_customer', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('work_orders', sa.Column('sector', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('work_orders', sa.Column('company_from', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('work_orders', sa.Column('total_quantity', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('work_orders', sa.Column('package_index', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('work_orders', sa.Column('total_packages', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('work_orders', sa.Column('target_date', sa.Date(), nullable=True))

    # Assign unique work_order_group_id to existing rows using their id
    op.execute("UPDATE work_orders SET work_order_group_id = 'LEGACY-' || id::text WHERE work_order_group_id IS NULL")
    # Set total_quantity from quantity for existing rows
    op.execute("UPDATE work_orders SET total_quantity = quantity WHERE total_quantity = 0")
    # Copy manufacturer_number into main_customer for existing rows
    op.execute("UPDATE work_orders SET main_customer = manufacturer_number WHERE main_customer = ''")
    # Copy aselsan_work_order_number into sector for existing rows (best effort)
    op.execute("UPDATE work_orders SET sector = aselsan_work_order_number WHERE sector = ''")

    # Now make work_order_group_id NOT NULL
    op.alter_column('work_orders', 'work_order_group_id', nullable=False)

    # Remove server defaults
    op.alter_column('work_orders', 'main_customer', server_default=None)
    op.alter_column('work_orders', 'sector', server_default=None)
    op.alter_column('work_orders', 'company_from', server_default=None)
    op.alter_column('work_orders', 'total_quantity', server_default=None)
    op.alter_column('work_orders', 'package_index', server_default=None)
    op.alter_column('work_orders', 'total_packages', server_default=None)

    # Drop old columns
    op.drop_column('work_orders', 'manufacturer_number')
    op.drop_column('work_orders', 'aselsan_work_order_number')

    # Create index on work_order_group_id
    op.create_index(op.f('ix_work_orders_work_order_group_id'), 'work_orders', ['work_order_group_id'], unique=False)

    # Create new unique constraint
    op.create_unique_constraint('uq_work_order_package', 'work_orders', ['station_id', 'work_order_group_id', 'package_index'])


def downgrade() -> None:
    # Drop new unique constraint and index
    op.drop_constraint('uq_work_order_package', 'work_orders', type_='unique')
    op.drop_index(op.f('ix_work_orders_work_order_group_id'), table_name='work_orders')

    # Re-add old columns
    op.add_column('work_orders', sa.Column('manufacturer_number', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('work_orders', sa.Column('aselsan_work_order_number', sa.String(length=255), nullable=False, server_default=''))

    # Copy data back
    op.execute("UPDATE work_orders SET manufacturer_number = main_customer")
    op.execute("UPDATE work_orders SET aselsan_work_order_number = sector")

    # Remove server defaults
    op.alter_column('work_orders', 'manufacturer_number', server_default=None)
    op.alter_column('work_orders', 'aselsan_work_order_number', server_default=None)

    # Drop new columns
    op.drop_column('work_orders', 'target_date')
    op.drop_column('work_orders', 'total_packages')
    op.drop_column('work_orders', 'package_index')
    op.drop_column('work_orders', 'total_quantity')
    op.drop_column('work_orders', 'company_from')
    op.drop_column('work_orders', 'sector')
    op.drop_column('work_orders', 'main_customer')
    op.drop_column('work_orders', 'work_order_group_id')

    # Re-create old unique constraint
    op.create_unique_constraint('uq_work_order_keys', 'work_orders', ['station_id', 'aselsan_order_number', 'order_item_number'])
