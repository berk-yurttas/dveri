"""add revision_number, qr_code, qr_created_at to work_orders

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-03 10:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('work_orders', sa.Column('revision_number', sa.String(length=255), nullable=True))
    op.add_column('work_orders', sa.Column('qr_code', sa.String(length=20), nullable=True))
    op.add_column('work_orders', sa.Column('qr_created_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('work_orders', 'qr_created_at')
    op.drop_column('work_orders', 'qr_code')
    op.drop_column('work_orders', 'revision_number')
