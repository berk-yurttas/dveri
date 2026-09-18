export type ReportTestStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
export type ReportResultStatus = 'passed' | 'failed' | 'warning' | 'skipped' | 'error'
export type ReportTestCaseStatus = 'passed' | 'failed' | 'warning' | 'skipped'

export interface ReportTestCase {
  case_id: string
  category: string
  name: string
  status: ReportTestCaseStatus
  message: string
  duration_ms: number
  meta?: Record<string, unknown> | null
}

export interface ReportTestResult {
  id: number
  run_id: number
  report_id: number
  report_name: string
  platform_id: number | null
  platform_name: string | null
  platform_code: string | null
  status: ReportResultStatus
  duration_ms: number
  query_count: number
  filter_count: number
  row_count_total: number
  summary: string | null
  cases: ReportTestCase[]
  created_at: string | null
}

export interface ReportTestRun {
  id: number
  status: ReportTestStatus
  trigger: 'manual' | 'scheduled' | string
  triggered_by: string | null
  platform_id: number | null
  report_id: number | null
  started_at: string | null
  finished_at: string | null
  total_reports: number
  passed_reports: number
  failed_reports: number
  warning_reports: number
  skipped_reports: number
  total_cases: number
  passed_cases: number
  failed_cases: number
  warning_cases: number
  current_report_id: number | null
  current_report_name: string | null
  processed_reports: number
  error_message: string | null
  created_at: string | null
  results?: ReportTestResult[] | null
}

export interface ReportTestRunList {
  items: ReportTestRun[]
  total: number
}

export interface ReportTestPlatformSummary {
  platform_id: number | null
  platform_name: string | null
  platform_code: string | null
  last_run_id: number | null
  last_run_at: string | null
  last_run_status: string | null
  passed: number
  failed: number
  warning: number
  skipped: number
  total: number
}

export interface ReportTestSummary {
  latest_run: ReportTestRun | null
  running_run: ReportTestRun | null
  platforms: ReportTestPlatformSummary[]
}

export interface ReportTestStartRequest {
  platform_id?: number | null
  report_id?: number | null
}
