"""add work_order_link_directories table

Revision ID: f5a6b7c8d9e0
Revises: e4f5g6h7i8j9
Create Date: 2026-02-26 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f5a6b7c8d9e0"
down_revision = "e4f5g6h7i8j9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "work_order_link_directories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("root_directory", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company"),
    )
    op.create_index(
        op.f("ix_work_order_link_directories_id"),
        "work_order_link_directories",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_work_order_link_directories_company"),
        "work_order_link_directories",
        ["company"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_work_order_link_directories_company"), table_name="work_order_link_directories")
    op.drop_index(op.f("ix_work_order_link_directories_id"), table_name="work_order_link_directories")
    op.drop_table("work_order_link_directories")
