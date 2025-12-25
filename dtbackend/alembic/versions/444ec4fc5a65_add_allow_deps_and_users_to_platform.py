"""add_allow_deps_and_users_to_platform

Revision ID: 444ec4fc5a65
Revises: fdf18f60545e
Create Date: 2025-12-01 13:20:28.676454

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '444ec4fc5a65'
down_revision = 'fdf18f60545e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('platforms', sa.Column('allowed_departments', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('platforms', sa.Column('allowed_users', sa.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column('platforms', 'allowed_departments')
    op.drop_column('platforms', 'allowed_users')
