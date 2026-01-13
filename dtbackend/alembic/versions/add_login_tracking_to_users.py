"""add login tracking to users

Revision ID: add_login_tracking_001
Revises: add_direct_link_001
Create Date: 2025-01-05 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_login_tracking_001'
down_revision = 'add_direct_link_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add login tracking columns to users table
    op.add_column('users', sa.Column('login_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove login tracking columns from users table
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'login_count')



