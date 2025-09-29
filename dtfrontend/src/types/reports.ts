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

// Visualization Configuration Types
export interface VisualizationConfig {
  type: 'table' | 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'pareto' | 'boxplot' | 'histogram'
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

    // Tooltip configuration
    tooltipFields?: string[]
    fieldDisplayNames?: Record<string, string>
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
  queries: QueryConfig[]
}

// Future report save/load types
export interface SaveReportRequest {
  report: ReportConfig
}

export interface SavedReport extends ReportConfig {
  id: number
  created_at: string
  updated_at: string
  created_by: string
  is_public: boolean
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
  query_id: number
  created_at: string
  updated_at: string | null
}