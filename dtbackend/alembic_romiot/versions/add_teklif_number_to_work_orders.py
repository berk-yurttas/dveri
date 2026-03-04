"""add teklif_number to work_orders

Revision ID: e4f5g6h7i8j9
Revises: d3e4f5g6h7i8
Create Date: 2026-02-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4f5g6h7i8j9'
down_revision = 'd3e4f5g6h7i8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'work_orders',
        sa.Column('teklif_number', sa.String(length=20), nullable=False, server_default='MKS-000000')
    )
    op.alter_column('work_orders', 'teklif_number', server_default=None)


def downgrade() -> None:
    op.drop_column('work_orders', 'teklif_number')

