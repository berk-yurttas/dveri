import { api } from '@/lib/api'
import {
  ReportPreviewRequest,
  ReportPreviewResponse,
  SqlValidationRequest,
  SqlValidationResponse,
  SampleQueriesResponse,
  SaveReportRequest,
  SavedReport
} from '@/types/reports'

export const reportsService = {
  /**
   * Preview the results of a SQL query
   */
  async previewQuery(request: ReportPreviewRequest): Promise<ReportPreviewResponse> {
    try {
      const response = await api.post<ReportPreviewResponse>('/reports/preview', request)
      return response
    } catch (error) {
      // Return a failed response structure instead of throwing
      return {
        columns: [],
        data: [],
        total_rows: 0,
        execution_time_ms: 0,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  },

  /**
   * Validate SQL syntax without executing the query
   */
  async validateSqlSyntax(query: string): Promise<SqlValidationResponse> {
    try {
      return await api.get<SqlValidationResponse>(`/reports/validate-syntax?query=${encodeURIComponent(query)}`)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Validation failed',
        execution_time_ms: 0
      }
    }
  },

  /**
   * Get sample SQL queries to help users get started
   */
  async getSampleQueries(): Promise<SampleQueriesResponse> {
    try {
      return await api.get<SampleQueriesResponse>('/reports/sample-queries')
    } catch (error) {
      return {
        samples: []
      }
    }
  },

  /**
   * Save a report configuration
   */
  async saveReport(reportData: any): Promise<SavedReport> {
    return api.post<SavedReport>('/reports/', reportData)
  },

  /**
   * Get all saved reports (future implementation)
   */
  async getReports(skip = 0, limit = 100, subplatform?: string): Promise<SavedReport[]> {
    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    })
    if (subplatform) {
      params.append('subplatform', subplatform)
    }
    return api.get<SavedReport[]>(`/reports/?${params.toString()}`)
  },

  /**
   * Get a specific report by ID (future implementation)
   */
  async getReportById(id: string): Promise<SavedReport> {
    return api.get<SavedReport>(`/reports/${id}`)
  },

  /**
   * Update an existing report (metadata only)
   */
  async updateReport(id: string, request: Partial<SavedReport>): Promise<SavedReport> {
    return api.put<SavedReport>(`/reports/${id}`, request)
  },

  /**
   * Update an existing report with full data including queries
   */
  async updateReportFull(id: string, reportData: any): Promise<SavedReport> {
    return api.put<SavedReport>(`/reports/${id}/full`, reportData)
  },

  /**
   * Delete a report (future implementation)
   */
  async deleteReport(id: string): Promise<void> {
    return api.delete<void>(`/reports/${id}`)
  },

  /**
   * Execute a report with filters
   */
  async executeReport(request: any): Promise<any> {
    return api.post<any>('/reports/execute', request)
  },

  /**
   * Get dropdown options for a specific filter
   */
  async getFilterOptions(
    reportId: string,
    queryId: number,
    filterField: string,
    page: number = 1,
    pageSize: number = 50,
    search: string = ""
  ): Promise<{
    options: Array<{value: any, label: string}>,
    total: number,
    page: number,
    page_size: number,
    has_more: boolean
  }> {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
      search: search
    })
    return api.get<{
      options: Array<{value: any, label: string}>,
      total: number,
      page: number,
      page_size: number,
      has_more: boolean
    }>(`/reports/${reportId}/queries/${queryId}/filters/${filterField}/options?${params}`)
  },

  /**
   * Toggle favorite status for a report
   */
  async toggleFavorite(reportId: string): Promise<{ is_favorite: boolean }> {
    return api.post<{ is_favorite: boolean }>(`/reports/${reportId}/favorite`, {})
  }
}