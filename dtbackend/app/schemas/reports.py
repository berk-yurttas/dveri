from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from enum import Enum

# Enums for type safety
class VisualizationType(str, Enum):
    TABLE = "table"
    EXPANDABLE = "expandable"
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    AREA = "area"
    SCATTER = "scatter"
    PARETO = "pareto"
    BOXPLOT = "boxplot"
    HISTOGRAM = "histogram"
    CARD = "card"

class FilterType(str, Enum):
    DATE = "date"
    DROPDOWN = "dropdown"
    MULTISELECT = "multiselect"
    NUMBER = "number"
    TEXT = "text"

# Row Color Rule Schema (for table visualizations)
class RowColorRule(BaseModel):
    id: str
    column_name: str = Field(..., alias="columnName")
    operator: Literal['>', '<', '>=', '<=', '=', '!=']
    value: Any  # Can be string or number
    color: str

    class Config:
        populate_by_name = True
        from_attributes = True

# Chart Options Schema
class ChartOptions(BaseModel):
    # Bar/Line/Area specific
    stacked: Optional[bool] = False
    show_grid: Optional[bool] = Field(True, alias="showGrid")
    show_data_labels: Optional[bool] = Field(False, alias="showDataLabels")
    legend_fields: Optional[List[str]] = Field([], alias="legendFields")  # Fields to show as separate series in bar charts

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
    
    # Expandable table specific & Clickable chart specific
    nested_queries: Optional[List[Dict[str, Any]]] = Field([], alias="nestedQueries")
    # nested_queries structure (used by both expandable tables and clickable charts):
    # For expandable tables: multiple queries in the list for multi-level expansion
    # For clickable charts: first query in the list is triggered on click
    # [
    #   {
    #     "id": "unique_id",
    #     "sql": "SELECT * FROM child WHERE parent_id = {{parent_id}}",
    #     "expandableFields": ["parent_id"],
    #     "filters": [],  // Optional filters for nested query
    #     "nestedQueries": [],  // Can have more nested levels (for expandable tables)
    #     "visualizationType": "bar",  // Optional: table, bar, line, pie, area (for clickable charts)
    #     "xAxis": "field_name",  // Optional: for chart visualizations
    #     "yAxis": "value_field",  // Optional: for chart visualizations
    #     "labelField": "label",  // Optional: for pie charts
    #     "valueField": "value"  // Optional: for pie charts
    #   }
    # ]
    
    # Clickable chart specific (enables click-to-drill-down)
    clickable: Optional[bool] = Field(False, alias="clickable")
    # When clickable=true, the first query in nested_queries is executed on click
    
    # Tooltip configuration
    tooltip_fields: Optional[List[str]] = Field([], alias="tooltipFields")
    field_display_names: Optional[Dict[str, str]] = Field({}, alias="fieldDisplayNames")


    # line visual for bar chart
    line_y_axis: Optional[str] = Field(None, alias="lineYAxis")
    show_line_overlay: Optional[bool] = Field(False, alias="showLineOverlay")

    # Reference line for bar and line charts
    reference_line_field: Optional[str] = Field(None, alias="referenceLineField")
    reference_line_label: Optional[str] = Field(None, alias="referenceLineLabel")
    reference_line_color: Optional[str] = Field("#EF4444", alias="referenceLineColor")

    # Row coloring for table visualizations
    row_color_rules: Optional[List[RowColorRule]] = Field([], alias="rowColorRules")

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
    sql_expression: Optional[str] = Field(None, alias="sqlExpression", description="Custom SQL expression to use instead of field_name (e.g., DATE(field_name), LOWER(field_name))")
    depends_on: Optional[str] = Field(None, alias="dependsOn", description="Field name of the filter this filter depends on (for cascading dropdowns)")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class FilterConfigCreate(FilterConfigBase):
    id: Optional[int] = None  # Optional ID for updating existing filters

class FilterConfigUpdate(BaseModel):
    field_name: Optional[str] = Field(None, alias="fieldName")
    display_name: Optional[str] = Field(None, alias="displayName")
    type: Optional[FilterType] = None
    dropdown_query: Optional[str] = Field(None, alias="dropdownQuery")
    required: Optional[bool] = None
    sql_expression: Optional[str] = Field(None, alias="sqlExpression")
    depends_on: Optional[str] = Field(None, alias="dependsOn")

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
    id: Optional[int] = None  # Optional ID for updating existing queries
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
    global_filters: Optional[List[FilterConfigCreate]] = Field([], alias="globalFilters", description="Global filters that apply to all queries in the report")
    layout_config: Optional[List[Dict[str, Any]]] = Field([], alias="layoutConfig", description="Grid layout configuration for queries")
    color: Optional[str] = Field("#3B82F6", description="Report card border/theme color")
    allowed_departments: Optional[List[str]] = Field([], alias="allowedDepartments", description="List of department IDs allowed to view this report")
    allowed_users: Optional[List[str]] = Field([], alias="allowedUsers", description="List of usernames allowed to view this report")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class ReportCreate(ReportBase):
    queries: List[QueryConfigCreate] = Field(..., min_items=1, description="At least one query is required")

class ReportUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    global_filters: Optional[List[FilterConfigCreate]] = Field(None, alias="globalFilters")
    layout_config: Optional[List[Dict[str, Any]]] = Field(None, alias="layoutConfig")
    color: Optional[str] = None
    allowed_departments: Optional[List[str]] = Field(None, alias="allowedDepartments")
    allowed_users: Optional[List[str]] = Field(None, alias="allowedUsers")

    class Config:
        populate_by_name = True
        from_attributes = True

class ReportFullUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_public: Optional[bool] = None
    tags: Optional[List[str]] = None
    queries: Optional[List[QueryConfigCreate]] = None
    global_filters: Optional[List[FilterConfigCreate]] = Field(None, alias="globalFilters")
    layout_config: Optional[List[Dict[str, Any]]] = Field(None, alias="layoutConfig")
    color: Optional[str] = None
    allowed_departments: Optional[List[str]] = Field(None, alias="allowedDepartments")
    allowed_users: Optional[List[str]] = Field(None, alias="allowedUsers")

    class Config:
        populate_by_name = True
        from_attributes = True

class Report(ReportBase):
    id: int
    owner_id: int
    owner_name: Optional[str] = None
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
    owner_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    tags: Optional[List[str]] = []
    query_count: Optional[int] = 0
    is_favorite: Optional[bool] = False
    color: Optional[str] = "#3B82F6"

    class Config:
        from_attributes = True

# Report Execution Schemas
class FilterValue(BaseModel):
    field_name: str
    value: Any
    operator: Optional[str] = "="  # =, >, <, >=, <=, LIKE, IN, BETWEEN, CONTAINS, NOT_CONTAINS, STARTS_WITH, ENDS_WITH, NOT_EQUALS

class ReportExecutionRequest(BaseModel):
    report_id: int
    query_id: Optional[int] = None  # If None, execute all queries
    filters: Optional[List[FilterValue]] = []
    limit: Optional[int] = 1000
    page_size: Optional[int] = None  # Number of rows per page (for pagination)
    page_limit: Optional[int] = None  # Page number (1-based, for pagination)
    sort_by: Optional[str] = None  # Column name to sort by
    sort_direction: Optional[str] = None  # Sort direction: 'asc' or 'desc'

class QueryExecutionResult(BaseModel):
    query_id: int
    query_name: str
    columns: List[str]
    data: List[List[Any]]
    total_rows: int
    execution_time_ms: float
    success: bool
    message: Optional[str] = None
    has_more: Optional[bool] = False  # Indicates if there are more pages available

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
