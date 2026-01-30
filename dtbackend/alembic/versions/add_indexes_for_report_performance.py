"""add indexes for report query performance

Revision ID: add_indexes_003
Revises: add_db_config_002
Create Date: 2026-01-30 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_indexes_003'
down_revision = '342d76653680'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add indexes to optimize report query performance.
    
    These indexes improve performance for:
    - Fetching reports with their queries and filters (joinedload)
    - Filtering reports by deleted_at
    - Accessing report_query_filters by report and query
    """
    
    # Index on report_queries.report_id for faster JOIN when loading report with queries
    # This speeds up: Report -> ReportQuery JOIN
    op.create_index(
        'ix_report_queries_report_id', 
        'report_queries', 
        ['report_id'],
        unique=False
    )
    
    # Index on report_query_filters.query_id for faster JOIN when loading filters
    # This speeds up: ReportQuery -> ReportQueryFilter JOIN
    op.create_index(
        'ix_report_query_filters_query_id', 
        'report_query_filters', 
        ['query_id'],
        unique=False
    )
    
    # Composite index on reports for common query patterns
    # This speeds up queries filtering by deleted_at and ordering/filtering by other fields
    op.create_index(
        'ix_reports_deleted_at_owner_id', 
        'reports', 
        ['deleted_at', 'owner_id'],
        unique=False
    )
    
    # Composite index for public report queries
    op.create_index(
        'ix_reports_deleted_at_is_public', 
        'reports', 
        ['deleted_at', 'is_public'],
        unique=False
    )
    
    # Index on reports.deleted_at for soft delete queries
    # Many queries filter by deleted_at IS NULL
    op.create_index(
        'ix_reports_deleted_at', 
        'reports', 
        ['deleted_at'],
        unique=False
    )
    
    # Composite index for report_users to speed up favorite lookups
    op.create_index(
        'ix_report_users_user_id_report_id', 
        'report_users', 
        ['user_id', 'report_id'],
        unique=False
    )
    
    # Index for filtering report_users by favorite status
    op.create_index(
        'ix_report_users_user_id_is_favorite', 
        'report_users', 
        ['user_id', 'is_favorite'],
        unique=False
    )
    
    # Composite index for report_query_filters lookup by report_id, query_id, field_name
    # This speeds up: get_filter_options() method
    op.create_index(
        'ix_report_query_filters_report_query_field', 
        'report_query_filters', 
        ['query_id', 'field_name'],
        unique=False
    )
    
    # Add GIN index on reports.allowed_departments for array overlap operations
    # This speeds up: Report.allowed_departments.op('&&')(dept_prefixes_array)
    op.execute("""
        CREATE INDEX ix_reports_allowed_departments_gin 
        ON reports USING gin (allowed_departments)
    """)
    
    # Add GIN index on reports.allowed_users for array contains operations
    # This speeds up: Report.allowed_users.op('@>')(cast([user.username], ARRAY(String)))
    op.execute("""
        CREATE INDEX ix_reports_allowed_users_gin 
        ON reports USING gin (allowed_users)
    """)
    
    # Add GIN index on reports.tags for array operations
    # This speeds up: Report.tags.op('@>')(cast([subplatform], ARRAY(String)))
    op.execute("""
        CREATE INDEX ix_reports_tags_gin 
        ON reports USING gin (tags)
    """)


def downgrade() -> None:
    """Remove all performance indexes"""
    
    # Drop GIN indexes
    op.execute("DROP INDEX IF EXISTS ix_reports_tags_gin")
    op.execute("DROP INDEX IF EXISTS ix_reports_allowed_users_gin")
    op.execute("DROP INDEX IF EXISTS ix_reports_allowed_departments_gin")
    
    # Drop B-tree indexes
    op.drop_index('ix_report_query_filters_report_query_field', table_name='report_query_filters')
    op.drop_index('ix_report_users_user_id_is_favorite', table_name='report_users')
    op.drop_index('ix_report_users_user_id_report_id', table_name='report_users')
    op.drop_index('ix_reports_deleted_at', table_name='reports')
    op.drop_index('ix_reports_deleted_at_is_public', table_name='reports')
    op.drop_index('ix_reports_deleted_at_owner_id', table_name='reports')
    op.drop_index('ix_report_query_filters_query_id', table_name='report_query_filters')
    op.drop_index('ix_report_queries_report_id', table_name='report_queries')

