"""add companies + user_companies tables and work_orders.company_from_id

Revision ID: 08be09af3bfd
Revises: f6a7b8c9d0e1
Create Date: 2026-06-03 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '08be09af3bfd'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'companies',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('name', name='uq_companies_name'),
        sa.UniqueConstraint('code', name='uq_companies_code'),
    )

    op.create_table(
        'user_companies',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('pb_user_id', sa.String(length=255), nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('pb_user_id', name='uq_user_companies_pb_user_id'),
    )

    op.add_column(
        'work_orders',
        sa.Column('company_from_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='RESTRICT'), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('work_orders', 'company_from_id')
    op.drop_table('user_companies')
    op.drop_table('companies')
