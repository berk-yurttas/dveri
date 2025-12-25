"""add config table

Revision ID: add_config_table_001
Revises: add_color_reports_001
Create Date: 2025-11-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = 'add_config_table_001'
down_revision = '8420bc1d1e1d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create configs table
    op.create_table(
        'configs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('platform_id', sa.Integer(), nullable=True),
        sa.Column('config_key', sa.String(255), nullable=False),
        sa.Column('config_value', JSONB, nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['platform_id'], ['platforms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_configs_id'), 'configs', ['id'], unique=False)
    op.create_index(op.f('ix_configs_platform_id'), 'configs', ['platform_id'], unique=False)
    op.create_index(op.f('ix_configs_config_key'), 'configs', ['config_key'], unique=False)


def downgrade() -> None:
    # Remove configs table
    op.drop_index(op.f('ix_configs_config_key'), table_name='configs')
    op.drop_index(op.f('ix_configs_platform_id'), table_name='configs')
    op.drop_index(op.f('ix_configs_id'), table_name='configs')
    op.drop_table('configs')
