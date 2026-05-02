"""add directorate and management to analytics events

Revision ID: add_directorate_management_001
Revises: add_dashboard_permissions
Create Date: 2026-04-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_directorate_management_001'
down_revision = 'add_dashboard_permissions_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('analytics_events', sa.Column('user_name', sa.String(length=255), nullable=True))
    op.add_column('analytics_events', sa.Column('sector', sa.String(length=255), nullable=True))
    op.add_column('analytics_events', sa.Column('directorate', sa.String(length=255), nullable=True))
    op.add_column('analytics_events', sa.Column('management', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_analytics_events_sector'), 'analytics_events', ['sector'], unique=False)
    op.create_index(op.f('ix_analytics_events_directorate'), 'analytics_events', ['directorate'], unique=False)
    op.create_index(op.f('ix_analytics_events_management'), 'analytics_events', ['management'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_analytics_events_management'), table_name='analytics_events')
    op.drop_index(op.f('ix_analytics_events_directorate'), table_name='analytics_events')
    op.drop_index(op.f('ix_analytics_events_sector'), table_name='analytics_events')
    op.drop_column('analytics_events', 'management')
    op.drop_column('analytics_events', 'directorate')
    op.drop_column('analytics_events', 'sector')
    op.drop_column('analytics_events', 'user_name')
