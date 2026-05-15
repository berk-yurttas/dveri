"""add documentations table

Revision ID: add_documentations_table
Revises: 
Create Date: 2026-05-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'add_documentations_table'
down_revision: str = 'add_directorate_management_001'


def upgrade() -> None:
    # Create documentations table
    op.create_table(
        'documentations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('platform_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('file_url', sa.Text(), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String()), server_default='{}', nullable=False),
        sa.Column('uploaded_by', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('order_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['platform_id'], ['platforms.id'], ondelete='CASCADE'),
    )
    
    # Create indexes
    op.create_index(op.f('ix_documentations_id'), 'documentations', ['id'], unique=False)
    op.create_index(op.f('ix_documentations_platform_id'), 'documentations', ['platform_id'], unique=False)
    op.create_index(op.f('ix_documentations_title'), 'documentations', ['title'], unique=False)
    op.create_index(op.f('ix_documentations_category'), 'documentations', ['category'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_documentations_category'), table_name='documentations')
    op.drop_index(op.f('ix_documentations_title'), table_name='documentations')
    op.drop_index(op.f('ix_documentations_platform_id'), table_name='documentations')
    op.drop_index(op.f('ix_documentations_id'), table_name='documentations')
    
    # Drop table
    op.drop_table('documentations')
