// Report Preview Types
export interface ReportPreviewRequest {
  sql_query: string
  limit?: number
}

export interface ReportPreviewResponse {
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

// SQL Validation Types
export interface SqlValidationRequest {
  query: string
}

export interface SqlValidationResponse {
  success: boolean
  message: string
  execution_time_ms: number
  explain_plan?: any[]
}

// Sample Queries Types
export interface SampleQuery {
  name: string
  description: string
  query: string
}

export interface SampleQueriesResponse {
  samples: SampleQuery[]
}

// Nested Query Configuration for Expandable Tables and Clickable Charts
export interface NestedQueryConfig {
  id: string
  sql: string
  expandableFields: string[]
  filters?: FilterConfig[]  // Filters for this nested query
  nestedQueries?: NestedQueryConfig[]  // Recursive for multiple levels
  // Visualization options for nested query (used in clickable charts)
  visualizationType?: 'table' | 'bar' | 'line' | 'pie' | 'area'
  xAxis?: string
  yAxis?: string
  labelField?: string
  valueField?: string
  lineYAxis?: string
  showLineOverlay?: boolean
}

// Row Coloring Configuration for Table/Expandable Table
export interface RowColorRule {
  id: string
  columnName: string
  operator: '>' | '<' | '>=' | '<=' | '=' | '!='
  value: string | number
  color: string
}

// Visualization Configuration Types
export interface VisualizationConfig {
  type: 'table' | 'expandable' | 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'pareto' | 'boxplot' | 'histogram' | 'card'
  xAxis?: string
  yAxis?: string
  labelField?: string
  valueField?: string
  groupBy?: string
  title?: string
  showLegend?: boolean
  colors?: string[]
  chartOptions?: {
    // Bar/Line/Area specific
    stacked?: boolean
    showGrid?: boolean
    showDataLabels?: boolean
    lineYAxis?: string
    showLineOverlay?: boolean

    // Pie specific
    showPercentage?: boolean
    innerRadius?: number

    // Line specific
    smooth?: boolean
    showDots?: boolean

    // Scatter specific
    sizeField?: string

    // Histogram specific
    binCount?: number

    // Expandable table specific & Clickable chart specific
    nestedQueries?: NestedQueryConfig[]
    // For expandable tables: multiple queries in the list for multi-level expansion
    // For clickable charts: first query in the list is triggered on click

    // Clickable chart specific (enables click-to-drill-down)
    clickable?: boolean
    // When clickable=true, the first query in nestedQueries is executed on click

    // Tooltip configuration
    tooltipFields?: string[]
    fieldDisplayNames?: Record<string, string>

    // Card specific
    backgroundColor?: string

    // Table/Expandable table specific - Row coloring rules
    rowColorRules?: RowColorRule[]
  }
}

// Report Configuration Types (matching the frontend component)
export interface FilterConfig {
  id: string
  fieldName: string
  displayName: string
  type: 'date' | 'dropdown' | 'multiselect' | 'number' | 'text'
  dropdownQuery?: string
  required: boolean
  sqlExpression?: string  // Custom SQL expression to use instead of fieldName (e.g., "DATE(created_at)", "LOWER(email)")
  dependsOn?: string | null  // Field name of the filter this filter depends on (for cascading dropdowns)
}

export interface QueryConfig {
  id: string
  name: string
  sql: string
  visualization: VisualizationConfig
  filters: FilterConfig[]
}

export interface ReportConfig {
  name: string
  description: string
  tags: string[]
  queries: QueryConfig[]
  globalFilters?: FilterConfig[]  // Filters that apply to all queries in the report
  color?: string  // Color for report card border/theme
}

// Future report save/load types
export interface SaveReportRequest {
  report: ReportConfig
}

export interface SavedReport extends ReportConfig {
  id: number
  owner_name: string
  created_at: string
  updated_at: string
  created_by: string
  is_public: boolean
  layoutConfig?: any[]  // Grid layout configuration
  color?: string  // Color for report card border/theme
}

// Report execution types
export interface FilterValue {
  field_name: string
  value: any
  operator?: string
}

export interface ReportExecutionRequest {
  report_id: number
  query_id?: number
  filters?: FilterValue[]
  limit?: number
}

export interface QueryExecutionResult {
  query_id: number
  query_name: string
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

export interface ReportExecutionResponse {
  report_id: number
  report_name: string
  results: QueryExecutionResult[]
  total_execution_time_ms: number
  success: boolean
  message?: string
}

// Extended report types for detail view
export interface ReportDetail {
  id: number
  name: string
  description: string
  is_public: boolean
  tags?: string[]
  owner_id?: number
  created_at: string
  updated_at: string | null
  queries: QueryDetail[]
}

export interface QueryDetail {
  id: number
  name: string
  sql: string
  visualization: VisualizationConfig
  orderIndex?: number
  report_id?: number
  created_at?: string
  updated_at?: string | null
  filters: FilterDetail[]
}

export interface FilterDetail {
  id: number
  fieldName: string
  displayName: string
  type: 'date' | 'dropdown' | 'multiselect' | 'number' | 'text'
  dropdownQuery: string | null
  required: boolean
  sqlExpression?: string  // Custom SQL expression to use instead of fieldName
  dependsOn?: string | null  // Field name of the filter this filter depends on (for cascading dropdowns)
  query_id: number
  created_at: string
  updated_at: string | null
}