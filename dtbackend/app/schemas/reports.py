from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from enum import Enum

# Enums for type safety
class VisualizationType(str, Enum):
    TABLE = "table"
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    AREA = "area"
    SCATTER = "scatter"
    PARETO = "pareto"
    BOXPLOT = "boxplot"
    HISTOGRAM = "histogram"

class FilterType(str, Enum):
    DATE = "date"
    DROPDOWN = "dropdown"
    MULTISELECT = "multiselect"
    NUMBER = "number"
    TEXT = "text"

# Chart Options Schema
class ChartOptions(BaseModel):
    # Bar/Line/Area specific
    stacked: Optional[bool] = False
    show_grid: Optional[bool] = Field(True, alias="showGrid")
    show_data_labels: Optional[bool] = Field(False, alias="showDataLabels")
    
    # Pie specific
    show_percentage: Optional[bool] = Field(True, alias="showPercentage")
    inner_radius: Optional[int] = Field(0, alias="innerRadius")
    
    # Line specific
    smooth: Optional[bool] = False
    show_dots: Optional[bool] = Field(True, alias="showDots")
    
    # Scatter specific
    size_field: Optional[str] = Field(None, alias="sizeField")
    
    # Histogram specific
    bin_count: Optional[int] = Field(10, alias="binCount")
    
    # Tooltip configuration
    tooltip_fields: Optional[List[str]] = Field([], alias="tooltipFields")
    field_display_names: Optional[Dict[str, str]] = Field({}, alias="fieldDisplayNames")
    
    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

# Visualization Configuration Schema
class VisualizationConfig(BaseModel):
    type: VisualizationType
    x_axis: Optional[str] = Field(None, alias="xAxis")
    y_axis: Optional[str] = Field(None, alias="yAxis")
    label_field: Optional[str] = Field(None, alias="labelField")
    value_field: Optional[str] = Field(None, alias="valueField")
    group_by: Optional[str] = Field(None, alias="groupBy")
    title: Optional[str] = None
    show_legend: Optional[bool] = Field(True, alias="showLegend")
    colors: Optional[List[str]] = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"]
    chart_options: Optional[ChartOptions] = Field(ChartOptions(), alias="chartOptions")
    
    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

# Filter Configuration Schemas
class FilterConfigBase(BaseModel):
    field_name: str = Field(..., alias="fieldName", description="Database field name to filter on")
    display_name: str = Field(..., alias="displayName", description="Human-readable name for the filter")
    type: FilterType
    dropdown_query: Optional[str] = Field(None, alias="dropdownQuery", description="SQL query for dropdown/multiselect options")
    required: bool = False
    
    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class FilterConfigCreate(FilterConfigBase):
    pass

class FilterConfigUpdate(BaseModel):
    field_name: Optional[str] = Field(None, alias="fieldName")
    display_name: Optional[str] = Field(None, alias="displayName")
    type: Optional[FilterType] = None
    dropdown_query: Optional[str] = Field(None, alias="dropdownQuery")
    required: Optional[bool] = None
    
    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class FilterConfig(FilterConfigBase):
    id: int
    query_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Query Configuration Schemas
class QueryConfigBase(BaseModel):
    name: str = Field(..., description="Query name/title")
    sql: str = Field(..., description="SQL query string")
    visualization: VisualizationConfig
    order_index: Optional[int] = Field(0, alias="orderIndex")

    @validator('sql')
    def validate_sql(cls, v):
        if not v.strip():
            raise ValueError('SQL query cannot be empty')
        return v.strip()
    
    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class QueryConfigCreate(QueryConfigBase):
    filters: Optional[List[FilterConfigCreate]] = []

class QueryConfigUpdate(BaseModel):
    name: Optional[str] = None
    sql: Optional[str] = None
    visualization: Optional[VisualizationConfig] = None
    order_index: Optional[int] = Field(None, alias="orderIndex")
    
    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class QueryConfig(QueryConfigBase):
    id: int
    report_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    filters: List[FilterConfig] = []
    
    class Config:
        from_attributes = True

# Report Schemas
class ReportBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Report name")
    description: Optional[str] = Field(None, max_length=1000, description="Report description")
    is_public: bool = False
    tags: Optional[List[str]] = []

class ReportCreate(ReportBase):
    queries: List[QueryConfigCreate] = Field(..., min_items=1, description="At least one query is required")

class ReportUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None

class ReportFullUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    queries: Optional[List[QueryConfigCreate]] = None

class Report(ReportBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    queries: List[QueryConfig] = []
    
    class Config:
        from_attributes = True

class ReportList(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_public: bool
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    tags: Optional[List[str]] = []
    query_count: Optional[int] = 0
    
    class Config:
        from_attributes = True

# Report Execution Schemas
class FilterValue(BaseModel):
    field_name: str
    value: Any
    operator: Optional[str] = "="  # =, >, <, >=, <=, LIKE, IN, BETWEEN

class ReportExecutionRequest(BaseModel):
    report_id: int
    query_id: Optional[int] = None  # If None, execute all queries
    filters: Optional[List[FilterValue]] = []
    limit: Optional[int] = 1000
    page_size: Optional[int] = None  # Number of rows per page (for pagination)
    page_limit: Optional[int] = None  # Page number (1-based, for pagination)

class QueryExecutionResult(BaseModel):
    query_id: int
    query_name: str
    columns: List[str]
    data: List[List[Any]]
    total_rows: int
    execution_time_ms: float
    success: bool
    message: Optional[str] = None

class ReportExecutionResponse(BaseModel):
    report_id: int
    report_name: str
    results: List[QueryExecutionResult]
    total_execution_time_ms: float
    success: bool
    message: Optional[str] = None

# Report Preview Schemas (for single query testing)
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

# SQL Validation Schemas
class SqlValidationRequest(BaseModel):
    query: str

class SqlValidationResponse(BaseModel):
    success: bool
    message: str
    execution_time_ms: float
    explain_plan: Optional[List[Dict[str, Any]]] = None

# Sample Queries Schemas
class SampleQuery(BaseModel):
    name: str
    description: str
    query: str
    category: Optional[str] = None

class SampleQueriesResponse(BaseModel):
    samples: List[SampleQuery]
