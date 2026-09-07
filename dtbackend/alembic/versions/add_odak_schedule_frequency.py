"""add frequency to report_odak_schedules

Revision ID: add_odak_freq_002
Revises: add_odak_schedules_001
Create Date: 2026-09-07 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "add_odak_freq_002"
down_revision = "add_odak_schedules_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "report_odak_schedules",
        sa.Column("frequency", sa.String(length=50), nullable=False, server_default="every_night"),
    )


def downgrade() -> None:
    op.drop_column("report_odak_schedules", "frequency")
