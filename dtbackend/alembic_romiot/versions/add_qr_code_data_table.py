"""add qr_code_data table

Revision ID: a7b8c9d0e1f2
Revises: f966efcac081
Create Date: 2025-01-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7b8c9d0e1f2'
down_revision = 'f966efcac081'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create qr_code_data table for compressed QR codes
    op.create_table('qr_code_data',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('data', sa.Text(), nullable=False),
        sa.Column('company', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_qr_code_data_id'), 'qr_code_data', ['id'], unique=False)
    op.create_index(op.f('ix_qr_code_data_code'), 'qr_code_data', ['code'], unique=True)
    op.create_index(op.f('ix_qr_code_data_company'), 'qr_code_data', ['company'], unique=False)


def downgrade() -> None:
    # Drop qr_code_data table and its indexes
    op.drop_index(op.f('ix_qr_code_data_company'), table_name='qr_code_data')
    op.drop_index(op.f('ix_qr_code_data_code'), table_name='qr_code_data')
    op.drop_index(op.f('ix_qr_code_data_id'), table_name='qr_code_data')
    op.drop_table('qr_code_data')

