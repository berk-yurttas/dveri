"""add_report_users_table

Revision ID: 8e4d0858f8c9
Revises: 596a42d100a9
Create Date: 2025-11-17 17:15:48.270418

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8e4d0858f8c9'
down_revision = '596a42d100a9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create report_users table
    op.create_table(
        'report_users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('is_favorite', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['report_id'], ['reports.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_report_users_id'), 'report_users', ['id'], unique=False)


def downgrade() -> None:
    # Drop report_users table
    op.drop_index(op.f('ix_report_users_id'), table_name='report_users')
    op.drop_table('report_users')
