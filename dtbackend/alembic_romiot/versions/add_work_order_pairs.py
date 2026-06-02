"""add work_order_pairs table + backfill + relax scalar pair columns

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-02 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'work_order_pairs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('work_order_group_id', sa.String(length=50), nullable=False, index=True),
        sa.Column('idx', sa.Integer(), nullable=False),
        sa.Column('aselsan_order_number', sa.String(length=255), nullable=False),
        sa.Column('order_item_number', sa.String(length=255), nullable=False),
        sa.UniqueConstraint('work_order_group_id', 'idx', name='uq_work_order_pair'),
    )

    op.execute("""
        INSERT INTO work_order_pairs (work_order_group_id, idx, aselsan_order_number, order_item_number)
        SELECT wo.work_order_group_id,
               0,
               wo.aselsan_order_number,
               wo.order_item_number
        FROM work_orders wo
        INNER JOIN (
            SELECT work_order_group_id, MIN(id) AS first_id
            FROM work_orders
            GROUP BY work_order_group_id
        ) firsts ON firsts.first_id = wo.id
        WHERE wo.aselsan_order_number IS NOT NULL
          AND wo.order_item_number IS NOT NULL
    """)

    op.alter_column('work_orders', 'aselsan_order_number', nullable=True)
    op.alter_column('work_orders', 'order_item_number', nullable=True)


def downgrade() -> None:
    # Reapply NOT NULL only after re-copying pair[0] back from work_order_pairs,
    # else downgrade fails on the rows whose scalar columns were nulled by a
    # later writer.
    op.execute("""
        UPDATE work_orders wo
        SET aselsan_order_number = wop.aselsan_order_number,
            order_item_number    = wop.order_item_number
        FROM work_order_pairs wop
        WHERE wop.work_order_group_id = wo.work_order_group_id
          AND wop.idx = 0
          AND wo.aselsan_order_number IS NULL
    """)
    op.alter_column('work_orders', 'aselsan_order_number', nullable=False)
    op.alter_column('work_orders', 'order_item_number', nullable=False)
    op.drop_table('work_order_pairs')
