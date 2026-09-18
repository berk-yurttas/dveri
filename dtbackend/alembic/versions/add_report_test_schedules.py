"""per-platform report test schedules and mail recipients

Revision ID: add_report_test_sched_001
Revises: add_report_tests_001
Create Date: 2026-09-18 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_report_test_sched_001"
down_revision = "add_report_tests_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_test_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("platform_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("hour", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recipients", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("last_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["platform_id"], ["platforms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("platform_id"),
    )
    op.create_index(op.f("ix_report_test_schedules_id"), "report_test_schedules", ["id"], unique=False)
    op.create_index(
        op.f("ix_report_test_schedules_platform_id"),
        "report_test_schedules",
        ["platform_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_report_test_schedules_platform_id"), table_name="report_test_schedules")
    op.drop_index(op.f("ix_report_test_schedules_id"), table_name="report_test_schedules")
    op.drop_table("report_test_schedules")
