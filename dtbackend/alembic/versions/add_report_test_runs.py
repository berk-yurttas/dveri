"""add report health test run history tables

Revision ID: add_report_tests_001
Revises: add_odak_runtime_003
Create Date: 2026-09-17 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "add_report_tests_001"
down_revision = "add_odak_runtime_003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_test_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="queued"),
        sa.Column("trigger", sa.String(length=50), nullable=False, server_default="manual"),
        sa.Column("triggered_by", sa.String(length=255), nullable=True),
        sa.Column("platform_id", sa.Integer(), nullable=True),
        sa.Column("report_id", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_reports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_reports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_reports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warning_reports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_reports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warning_cases", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_report_id", sa.Integer(), nullable=True),
        sa.Column("current_report_name", sa.String(length=255), nullable=True),
        sa.Column("processed_reports", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_test_runs_id"), "report_test_runs", ["id"], unique=False)
    op.create_index(op.f("ix_report_test_runs_status"), "report_test_runs", ["status"], unique=False)
    op.create_index(op.f("ix_report_test_runs_platform_id"), "report_test_runs", ["platform_id"], unique=False)
    op.create_index(op.f("ix_report_test_runs_report_id"), "report_test_runs", ["report_id"], unique=False)

    op.create_table(
        "report_test_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("report_name", sa.String(length=255), nullable=False),
        sa.Column("platform_id", sa.Integer(), nullable=True),
        sa.Column("platform_name", sa.String(length=255), nullable=True),
        sa.Column("platform_code", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("query_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("filter_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("row_count_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("cases", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["report_test_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_test_results_id"), "report_test_results", ["id"], unique=False)
    op.create_index(op.f("ix_report_test_results_run_id"), "report_test_results", ["run_id"], unique=False)
    op.create_index(op.f("ix_report_test_results_report_id"), "report_test_results", ["report_id"], unique=False)
    op.create_index(op.f("ix_report_test_results_platform_id"), "report_test_results", ["platform_id"], unique=False)
    op.create_index(op.f("ix_report_test_results_status"), "report_test_results", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_report_test_results_status"), table_name="report_test_results")
    op.drop_index(op.f("ix_report_test_results_platform_id"), table_name="report_test_results")
    op.drop_index(op.f("ix_report_test_results_report_id"), table_name="report_test_results")
    op.drop_index(op.f("ix_report_test_results_run_id"), table_name="report_test_results")
    op.drop_index(op.f("ix_report_test_results_id"), table_name="report_test_results")
    op.drop_table("report_test_results")
    op.drop_index(op.f("ix_report_test_runs_report_id"), table_name="report_test_runs")
    op.drop_index(op.f("ix_report_test_runs_platform_id"), table_name="report_test_runs")
    op.drop_index(op.f("ix_report_test_runs_status"), table_name="report_test_runs")
    op.drop_index(op.f("ix_report_test_runs_id"), table_name="report_test_runs")
    op.drop_table("report_test_runs")
