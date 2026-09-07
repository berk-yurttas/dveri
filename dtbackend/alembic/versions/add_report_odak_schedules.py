"""add report_odak_schedules table

Revision ID: add_odak_schedules_001
Revises: add_can_view_wo_001
Create Date: 2026-09-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "add_odak_schedules_001"
down_revision = "add_can_view_wo_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_odak_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("hour", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="Europe/Istanbul"),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_status", sa.String(length=50), nullable=True),
        sa.Column("last_run_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_odak_schedules_id"), "report_odak_schedules", ["id"], unique=False)
    op.create_index(op.f("ix_report_odak_schedules_report_id"), "report_odak_schedules", ["report_id"], unique=True)
    op.create_index(op.f("ix_report_odak_schedules_next_run_at"), "report_odak_schedules", ["next_run_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_report_odak_schedules_next_run_at"), table_name="report_odak_schedules")
    op.drop_index(op.f("ix_report_odak_schedules_report_id"), table_name="report_odak_schedules")
    op.drop_index(op.f("ix_report_odak_schedules_id"), table_name="report_odak_schedules")
    op.drop_table("report_odak_schedules")
