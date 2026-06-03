"""add filter_by_department to reports

Revision ID: add_filter_dept_003
Revises: add_documentations_table
Create Date: 2026-05-22 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_filter_dept_003'
down_revision = 'add_documentations_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add filter_by_department column to reports table
    op.add_column('reports', sa.Column('filter_by_department', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    # Remove filter_by_department column from reports table
    op.drop_column('reports', 'filter_by_department')
