"""add urunum_nerede_mes_sources table

Revision ID: d5e6f7a8b9c0
Revises: b1c2d3e4f5a6
Create Date: 2026-06-25 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd5e6f7a8b9c0'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'urunum_nerede_mes_sources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company', sa.String(length=255), nullable=False),
        sa.Column('table_name', sa.String(length=255), nullable=False),
        sa.Column('filter_column', sa.String(length=128), nullable=True),
        sa.Column('filter_value', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('company'),
    )
    op.create_index(op.f('ix_urunum_nerede_mes_sources_id'), 'urunum_nerede_mes_sources', ['id'], unique=False)
    op.create_index(op.f('ix_urunum_nerede_mes_sources_company'), 'urunum_nerede_mes_sources', ['company'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_urunum_nerede_mes_sources_company'), table_name='urunum_nerede_mes_sources')
    op.drop_index(op.f('ix_urunum_nerede_mes_sources_id'), table_name='urunum_nerede_mes_sources')
    op.drop_table('urunum_nerede_mes_sources')
