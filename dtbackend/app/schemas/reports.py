from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


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
    stacked: bool | None = False
    show_grid: bool | None = Field(True, alias="showGrid")
    show_data_labels: bool | None = Field(False, alias="showDataLabels")
    legend_fields: list[str] | None = Field([], alias="legendFields")  # Fields to show as separate series in bar charts
    use_legend_field_values: bool | None = Field(False, alias="useLegendFieldValues")  # If true, show field values in legend instead of field names

    # Pie specific
    show_percentage: bool | None = Field(True, alias="showPercentage")
    inner_radius: int | None = Field(0, alias="innerRadius")

    # Line specific
    smooth: bool | None = False
    show_dots: bool | None = Field(True, alias="showDots")

    # Scatter specific
    size_field: str | None = Field(None, alias="sizeField")

    # Histogram specific
    bin_count: int | None = Field(10, alias="binCount")

    # Expandable table specific & Clickable chart specific
    nested_queries: list[dict[str, Any]] | None = Field([], alias="nestedQueries")
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
    clickable: bool | None = Field(False, alias="clickable")
    # When clickable=true, the first query in nested_queries is executed on click

    # Tooltip configuration
    tooltip_fields: list[str] | None = Field([], alias="tooltipFields")
    field_display_names: dict[str, str] | None = Field({}, alias="fieldDisplayNames")


    # line visual for bar chart
    line_y_axis: str | None = Field(None, alias="lineYAxis")
    show_line_overlay: bool | None = Field(False, alias="showLineOverlay")

    # Reference line for bar and line charts
    reference_line_field: str | None = Field(None, alias="referenceLineField")
    reference_line_label: str | None = Field(None, alias="referenceLineLabel")
    reference_line_color: str | None = Field("#EF4444", alias="referenceLineColor")

    # Row coloring for table visualizations
    row_color_rules: list[RowColorRule] | None = Field([], alias="rowColorRules")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

# Visualization Configuration Schema
class VisualizationConfig(BaseModel):
    type: VisualizationType
    x_axis: str | None = Field(None, alias="xAxis")
    y_axis: str | None = Field(None, alias="yAxis")
    label_field: str | None = Field(None, alias="labelField")
    value_field: str | None = Field(None, alias="valueField")
    group_by: str | None = Field(None, alias="groupBy")
    title: str | None = None
    show_legend: bool | None = Field(True, alias="showLegend")
    colors: list[str] | None = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"]
    chart_options: ChartOptions | None = Field(ChartOptions(), alias="chartOptions")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

# Filter Configuration Schemas
class FilterConfigBase(BaseModel):
    field_name: str = Field(..., alias="fieldName", description="Database field name to filter on")
    display_name: str = Field(..., alias="displayName", description="Human-readable name for the filter")
    type: FilterType
    dropdown_query: str | None = Field(None, alias="dropdownQuery", description="SQL query for dropdown/multiselect options")
    required: bool = False
    sql_expression: str | None = Field(None, alias="sqlExpression", description="Custom SQL expression to use instead of field_name (e.g., DATE(field_name), LOWER(field_name))")
    depends_on: str | None = Field(None, alias="dependsOn", description="Field name of the filter this filter depends on (for cascading dropdowns)")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class FilterConfigCreate(FilterConfigBase):
    id: int | None = None  # Optional ID for updating existing filters

class FilterConfigUpdate(BaseModel):
    field_name: str | None = Field(None, alias="fieldName")
    display_name: str | None = Field(None, alias="displayName")
    type: FilterType | None = None
    dropdown_query: str | None = Field(None, alias="dropdownQuery")
    required: bool | None = None
    sql_expression: str | None = Field(None, alias="sqlExpression")
    depends_on: str | None = Field(None, alias="dependsOn")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class FilterConfig(FilterConfigBase):
    id: int
    query_id: int
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True

# Query Configuration Schemas
class QueryConfigBase(BaseModel):
    name: str = Field(..., description="Query name/title")
    sql: str = Field(..., description="SQL query string")
    visualization: VisualizationConfig
    order_index: int | None = Field(0, alias="orderIndex")

    @field_validator('sql')
    @classmethod
    def validate_sql(cls, v):
        if not v.strip():
            raise ValueError('SQL query cannot be empty')
        return v.strip()

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class QueryConfigCreate(QueryConfigBase):
    id: int | None = None  # Optional ID for updating existing queries
    filters: list[FilterConfigCreate] | None = []

class QueryConfigUpdate(BaseModel):
    name: str | None = None
    sql: str | None = None
    visualization: VisualizationConfig | None = None
    order_index: int | None = Field(None, alias="orderIndex")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class QueryConfig(QueryConfigBase):
    id: int
    report_id: int
    created_at: datetime
    updated_at: datetime | None = None
    filters: list[FilterConfig] = []

    class Config:
        from_attributes = True

# Report Schemas
class ReportBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Report name")
    description: str | None = Field(None, max_length=1000, description="Report description")
    is_public: bool = False
    tags: list[str] | None = []
    global_filters: list[FilterConfigCreate] | None = Field([], alias="globalFilters", description="Global filters that apply to all queries in the report")
    layout_config: list[dict[str, Any]] | None = Field([], alias="layoutConfig", description="Grid layout configuration for queries")
    color: str | None = Field("#3B82F6", description="Report card border/theme color")
    allowed_departments: list[str] | None = Field([], alias="allowedDepartments", description="List of department IDs allowed to view this report")
    allowed_users: list[str] | None = Field([], alias="allowedUsers", description="List of usernames allowed to view this report")
    is_direct_link: bool | None = Field(False, alias="isDirectLink", description="If true, report uses direct link instead of queries")
    direct_link: str | None = Field(None, alias="directLink", description="Direct link URL to external report page")
    db_config: dict[str, Any] | None = Field(None, alias="dbConfig", description="Database configuration for this report (selected from platform's db_configs)")

    class Config:
        populate_by_name = True  # Allow both field names and aliases
        from_attributes = True

class ReportCreate(ReportBase):
    queries: list[QueryConfigCreate] = Field(default=[], description="List of queries (required if not isDirectLink)")

    @model_validator(mode='after')
    def validate_queries_and_direct_link(self):
        is_direct_link = self.is_direct_link or False
        if not is_direct_link:
            if not self.queries or len(self.queries) == 0:
                raise ValueError('At least one query is required when isDirectLink is false')
        else:
            if not self.direct_link or not self.direct_link.strip():
                raise ValueError('directLink is required when isDirectLink is true')
            # Basic URL validation
            try:
                from urllib.parse import urlparse
                result = urlparse(self.direct_link.strip())
                if not result.scheme or not result.netloc:
                    raise ValueError('directLink must be a valid URL')
            except Exception as e:
                raise ValueError(f'directLink must be a valid URL: {str(e)}')
        return self

class ReportUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    is_public: bool | None = None
    tags: list[str] | None = None
    global_filters: list[FilterConfigCreate] | None = Field(None, alias="globalFilters")
    layout_config: list[dict[str, Any]] | None = Field(None, alias="layoutConfig")
    color: str | None = None
    allowed_departments: list[str] | None = Field(None, alias="allowedDepartments")
    allowed_users: list[str] | None = Field(None, alias="allowedUsers")
    is_direct_link: bool | None = Field(None, alias="isDirectLink")
    direct_link: str | None = Field(None, alias="directLink")
    db_config: dict[str, Any] | None = Field(None, alias="dbConfig")

    class Config:
        populate_by_name = True
        from_attributes = True

class ReportFullUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    is_public: bool | None = None
    tags: list[str] | None = None
    queries: list[QueryConfigCreate] | None = None
    global_filters: list[FilterConfigCreate] | None = Field(None, alias="globalFilters")
    layout_config: list[dict[str, Any]] | None = Field(None, alias="layoutConfig")
    color: str | None = None
    allowed_departments: list[str] | None = Field(None, alias="allowedDepartments")
    allowed_users: list[str] | None = Field(None, alias="allowedUsers")
    is_direct_link: bool | None = Field(None, alias="isDirectLink")
    direct_link: str | None = Field(None, alias="directLink")
    db_config: dict[str, Any] | None = Field(None, alias="dbConfig")

    @model_validator(mode='after')
    def validate_queries_and_direct_link(self):
        is_direct_link = self.is_direct_link
        # Only validate if is_direct_link is explicitly set
        if is_direct_link is not None:
            if not is_direct_link:
                if not self.queries or len(self.queries) == 0:
                    raise ValueError('At least one query is required when isDirectLink is false')
            else:
                if not self.direct_link or not self.direct_link.strip():
                    raise ValueError('directLink is required when isDirectLink is true')
                # Basic URL validation
                try:
                    from urllib.parse import urlparse
                    result = urlparse(self.direct_link.strip())
                    if not result.scheme or not result.netloc:
                        raise ValueError('directLink must be a valid URL')
                except Exception as e:
                    raise ValueError(f'directLink must be a valid URL: {str(e)}')
        return self

    class Config:
        populate_by_name = True
        from_attributes = True

class Report(ReportBase):
    id: int
    owner_id: int
    owner_name: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    queries: list[QueryConfig] = []

    class Config:
        from_attributes = True

class ReportList(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_public: bool
    owner_id: int
    owner_name: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    tags: list[str] | None = []
    query_count: int | None = 0
    is_favorite: bool | None = False
    color: str | None = "#3B82F6"
    is_direct_link: bool | None = Field(False, alias="isDirectLink")
    direct_link: str | None = Field(None, alias="directLink")
    db_config: dict[str, Any] | None = Field(None, alias="dbConfig")

    class Config:
        populate_by_name = True
        from_attributes = True

# Report Execution Schemas
class FilterValue(BaseModel):
    field_name: str
    value: Any
    operator: str | None = "="  # =, >, <, >=, <=, LIKE, IN, BETWEEN, CONTAINS, NOT_CONTAINS, STARTS_WITH, ENDS_WITH, NOT_EQUALS

class ReportExecutionRequest(BaseModel):
    report_id: int
    query_id: int | None = None  # If None, execute all queries
    filters: list[FilterValue] | None = []
    limit: int | None = 1000
    page_size: int | None = None  # Number of rows per page (for pagination)
    page_limit: int | None = None  # Page number (1-based, for pagination)
    sort_by: str | None = None  # Column name to sort by
    sort_direction: str | None = None  # Sort direction: 'asc' or 'desc'

class QueryExecutionResult(BaseModel):
    query_id: int
    query_name: str
    columns: list[str]
    data: list[list[Any]]
    total_rows: int
    execution_time_ms: float
    success: bool
    message: str | None = None
    has_more: bool | None = False  # Indicates if there are more pages available

class ReportExecutionResponse(BaseModel):
    report_id: int
    report_name: str
    results: list[QueryExecutionResult]
    total_execution_time_ms: float
    success: bool
    message: str | None = None

# Report Preview Schemas (for single query testing)
class ReportPreviewRequest(BaseModel):
    sql_query: str
    limit: int | None = 100

class ReportPreviewResponse(BaseModel):
    columns: list[str]
    data: list[list[Any]]
    total_rows: int
    execution_time_ms: float
    success: bool
    message: str | None = None

# SQL Validation Schemas
class SqlValidationRequest(BaseModel):
    query: str

class SqlValidationResponse(BaseModel):
    success: bool
    message: str
    execution_time_ms: float
    explain_plan: list[dict[str, Any]] | None = None

# Sample Queries Schemas
class SampleQuery(BaseModel):
    name: str
    description: str
    query: str
    category: str | None = None

class SampleQueriesResponse(BaseModel):
    samples: list[SampleQuery]
