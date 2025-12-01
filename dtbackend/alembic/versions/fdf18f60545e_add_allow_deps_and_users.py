"""add_allow_deps_and_users

Revision ID: fdf18f60545e
Revises: add_config_table_001
Create Date: 2025-12-01 11:05:08.146165

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fdf18f60545e'
down_revision = 'add_config_table_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('allowed_departments', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('reports', sa.Column('allowed_users', sa.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column('reports', 'allowed_departments')
    op.drop_column('reports', 'allowed_users')
