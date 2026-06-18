"""add filter_by_step_department to reports

Revision ID: add_step_dept_005
Revises: add_dept_level_004
Create Date: 2026-05-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_step_dept_005'
down_revision = 'add_dept_level_004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add filter_by_step_department column to reports table
    op.add_column('reports', sa.Column('filter_by_step_department', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    # Remove filter_by_step_department column from reports table
    op.drop_column('reports', 'filter_by_step_department')
