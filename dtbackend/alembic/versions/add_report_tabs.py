"""add report tabs

Revision ID: add_report_tabs
Revises: add_filter_by_step_department_to_reports
Create Date: 2026-06-11 16:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_report_tabs'
down_revision = 'add_step_dept_005'
branch_labels = None
depends_on = None


def upgrade():
    # Create report_tabs table
    op.create_table(
        'report_tabs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('layout_config', postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['report_id'], ['reports.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_report_tabs_report_id', 'report_tabs', ['report_id'])

    # Add tab_id column to report_queries
    op.add_column('report_queries', sa.Column('tab_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_report_queries_tab_id', 'report_queries', 'report_tabs', ['tab_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_report_queries_tab_id', 'report_queries', ['tab_id'])


def downgrade():
    # Remove tab_id column from report_queries
    op.drop_index('ix_report_queries_tab_id', table_name='report_queries')
    op.drop_constraint('fk_report_queries_tab_id', 'report_queries', type_='foreignkey')
    op.drop_column('report_queries', 'tab_id')

    # Drop report_tabs table
    op.drop_index('ix_report_tabs_report_id', table_name='report_tabs')
    op.drop_table('report_tabs')
