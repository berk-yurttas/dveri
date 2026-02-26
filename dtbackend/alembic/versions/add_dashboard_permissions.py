"""add_dashboard_permissions

Revision ID: add_dashboard_permissions_001
Revises: add_analytics_events_table
Create Date: 2026-02-26 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_dashboard_permissions_001'
down_revision = 'add_analytics_events_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dashboards', sa.Column('allowed_departments', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('dashboards', sa.Column('allowed_users', sa.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column('dashboards', 'allowed_departments')
    op.drop_column('dashboards', 'allowed_users')
