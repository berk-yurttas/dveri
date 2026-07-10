"""add can_view_work_orders to users

Grants a per-operator, read-only permission to view the atolye "İş Emirleri"
page. Defaults to False so existing operators start without access until a
yönetici enables it.

Revision ID: add_can_view_wo_001
Revises: add_report_tabs
Create Date: 2026-07-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_can_view_wo_001'
down_revision = 'add_report_tabs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('can_view_work_orders', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('users', 'can_view_work_orders')
