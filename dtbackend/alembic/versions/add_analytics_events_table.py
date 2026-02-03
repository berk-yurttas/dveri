"""add analytics events table

Revision ID: add_analytics_events_001
Revises: add_login_tracking_001
Create Date: 2026-02-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'add_analytics_events_001'
down_revision = 'add_indexes_003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'analytics_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('path', sa.Text(), nullable=False),
        sa.Column('session_id', sa.String(length=255), nullable=False),
        sa.Column('user_id', sa.String(length=255), nullable=True),
        sa.Column('ip', sa.String(length=50), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('duration', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_analytics_events_id'), 'analytics_events', ['id'], unique=False)
    op.create_index(op.f('ix_analytics_events_timestamp'), 'analytics_events', ['timestamp'], unique=False)
    op.create_index(op.f('ix_analytics_events_path'), 'analytics_events', ['path'], unique=False)
    op.create_index(op.f('ix_analytics_events_user_id'), 'analytics_events', ['user_id'], unique=False)
    op.create_index(op.f('ix_analytics_events_event_type'), 'analytics_events', ['event_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_analytics_events_event_type'), table_name='analytics_events')
    op.drop_index(op.f('ix_analytics_events_user_id'), table_name='analytics_events')
    op.drop_index(op.f('ix_analytics_events_path'), table_name='analytics_events')
    op.drop_index(op.f('ix_analytics_events_timestamp'), table_name='analytics_events')
    op.drop_index(op.f('ix_analytics_events_id'), table_name='analytics_events')
    op.drop_table('analytics_events')

