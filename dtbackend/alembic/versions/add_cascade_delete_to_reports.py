"""Add cascade delete to report foreign keys

Revision ID: add_cascade_delete
Revises: 7f54f344d281
Create Date: 2025-10-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_cascade_delete'
down_revision = '7f54f344d281'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop existing foreign key constraints
    op.drop_constraint('report_queries_report_id_fkey', 'report_queries', type_='foreignkey')
    op.drop_constraint('report_query_filters_query_id_fkey', 'report_query_filters', type_='foreignkey')

    # Re-create foreign key constraints with CASCADE DELETE
    op.create_foreign_key(
        'report_queries_report_id_fkey',
        'report_queries', 'reports',
        ['report_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'report_query_filters_query_id_fkey',
        'report_query_filters', 'report_queries',
        ['query_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # Drop CASCADE foreign key constraints
    op.drop_constraint('report_queries_report_id_fkey', 'report_queries', type_='foreignkey')
    op.drop_constraint('report_query_filters_query_id_fkey', 'report_query_filters', type_='foreignkey')

    # Re-create foreign key constraints without CASCADE
    op.create_foreign_key(
        'report_queries_report_id_fkey',
        'report_queries', 'reports',
        ['report_id'], ['id']
    )
    op.create_foreign_key(
        'report_query_filters_query_id_fkey',
        'report_query_filters', 'report_queries',
        ['query_id'], ['id']
    )
