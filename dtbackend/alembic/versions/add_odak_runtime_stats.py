"""add odak update runtime stats

Revision ID: add_odak_runtime_003
Revises: add_odak_freq_002
Create Date: 2026-09-08 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "add_odak_runtime_003"
down_revision = "add_odak_freq_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "report_odak_schedules",
        sa.Column("last_run_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "report_odak_schedules",
        sa.Column("last_run_duration_seconds", sa.Integer(), nullable=True),
    )
    op.add_column(
        "report_odak_schedules",
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "report_odak_schedules",
        sa.Column("total_run_seconds", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("report_odak_schedules", "total_run_seconds")
    op.drop_column("report_odak_schedules", "run_count")
    op.drop_column("report_odak_schedules", "last_run_duration_seconds")
    op.drop_column("report_odak_schedules", "last_run_started_at")
