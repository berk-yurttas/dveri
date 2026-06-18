"""add department_filter_level to reports

Revision ID: add_dept_level_004
Revises: add_filter_dept_003
Create Date: 2026-05-22 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_dept_level_004'
down_revision = 'add_filter_dept_003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add department_filter_level column to reports table
    # Values: 'sektor', 'direktorluk', 'mudurluk', 'birim', or NULL (for full hierarchy)
    op.add_column('reports', sa.Column('department_filter_level', sa.String(50), nullable=True))


def downgrade() -> None:
    # Remove department_filter_level column from reports table
    op.drop_column('reports', 'department_filter_level')
