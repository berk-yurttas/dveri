from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReportTestStartRequest(BaseModel):
    platform_id: int | None = None
    report_id: int | None = None


class ReportTestCase(BaseModel):
    case_id: str
    category: str
    name: str
    status: str
    message: str
    duration_ms: float = 0
    meta: dict[str, Any] | None = None


class ReportTestResultOut(BaseModel):
    id: int
    run_id: int
    report_id: int
    report_name: str
    platform_id: int | None = None
    platform_name: str | None = None
    platform_code: str | None = None
    status: str
    duration_ms: int = 0
    query_count: int = 0
    filter_count: int = 0
    row_count_total: int = 0
    summary: str | None = None
    cases: list[ReportTestCase] = Field(default_factory=list)
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ReportTestRunOut(BaseModel):
    id: int
    status: str
    trigger: str
    triggered_by: str | None = None
    platform_id: int | None = None
    report_id: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    total_reports: int = 0
    passed_reports: int = 0
    failed_reports: int = 0
    warning_reports: int = 0
    skipped_reports: int = 0
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    warning_cases: int = 0
    current_report_id: int | None = None
    current_report_name: str | None = None
    processed_reports: int = 0
    error_message: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ReportTestRunDetail(ReportTestRunOut):
    results: list[ReportTestResultOut] = Field(default_factory=list)


class ReportTestRunList(BaseModel):
    items: list[ReportTestRunOut]
    total: int


class ReportTestPlatformSummary(BaseModel):
    platform_id: int | None = None
    platform_name: str | None = None
    platform_code: str | None = None
    last_run_id: int | None = None
    last_run_at: datetime | None = None
    last_run_status: str | None = None
    passed: int = 0
    failed: int = 0
    warning: int = 0
    skipped: int = 0
    total: int = 0


class ReportTestSummary(BaseModel):
    latest_run: ReportTestRunOut | None = None
    running_run: ReportTestRunOut | None = None
    platforms: list[ReportTestPlatformSummary] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
