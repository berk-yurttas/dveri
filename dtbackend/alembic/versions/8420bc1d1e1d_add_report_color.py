"""add_report_color

Revision ID: 8420bc1d1e1d
Revises: 8e4d0858f8c9
Create Date: 2025-11-19 12:18:26.567184

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8420bc1d1e1d'
down_revision = '8e4d0858f8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('color', sa.String(50), default='#3B82F6'))


def downgrade() -> None:
    op.drop_column('reports', 'color')
