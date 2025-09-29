from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date

class WidgetQueryRequest(BaseModel):
    widget_type: str
    filters: Optional[Dict[str, Any]] = None

class ReportPreviewRequest(BaseModel):
    sql_query: str
    limit: Optional[int] = 100

class ReportPreviewResponse(BaseModel):
    columns: List[str]
    data: List[List[Any]]
    total_rows: int
    execution_time_ms: float
    success: bool
    message: Optional[str] = None