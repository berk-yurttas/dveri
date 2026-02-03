"""add_direct_link_to_reports

Revision ID: add_direct_link_001
Revises: 280ebde453e9
Create Date: 2025-01-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_direct_link_001'
down_revision = 'efd95a7265c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('is_direct_link', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('reports', sa.Column('direct_link', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('reports', 'direct_link')
    op.drop_column('reports', 'is_direct_link')

