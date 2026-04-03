"""add company_integrations table

Revision ID: a1b2c3d4e5f6
Revises: f5a6b7c8d9e0
Create Date: 2026-04-03 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'f5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'company_integrations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company', sa.String(length=255), nullable=False),
        sa.Column('api_url', sa.String(length=1024), nullable=True),
        sa.Column('api_key', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('company'),
    )
    op.create_index(op.f('ix_company_integrations_id'), 'company_integrations', ['id'], unique=False)
    op.create_index(op.f('ix_company_integrations_company'), 'company_integrations', ['company'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_company_integrations_company'), table_name='company_integrations')
    op.drop_index(op.f('ix_company_integrations_id'), table_name='company_integrations')
    op.drop_table('company_integrations')
