"""Add tags to dashboards

Revision ID: a1b2c3d4e5f6
Revises: 59ca21df192c
Create Date: 2025-10-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '59ca21df192c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tags column to dashboards table
    op.add_column('dashboards', sa.Column('tags', sa.ARRAY(sa.String()), nullable=True, server_default='{}'))


def downgrade() -> None:
    # Remove tags column from dashboards table
    op.drop_column('dashboards', 'tags')

