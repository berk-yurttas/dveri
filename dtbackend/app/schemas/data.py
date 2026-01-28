from typing import Any

from pydantic import BaseModel


class WidgetQueryRequest(BaseModel):
    widget_type: str
    filters: dict[str, Any] | None = None

class ReportPreviewRequest(BaseModel):
    sql_query: str
    limit: int | None = 100
    db_config: dict[str, Any] | None = None  # Optional database configuration to use instead of platform's default

class ReportPreviewResponse(BaseModel):
    columns: list[str]
    data: list[list[Any]]
    total_rows: int
    execution_time_ms: float
    success: bool
    message: str | None = None
