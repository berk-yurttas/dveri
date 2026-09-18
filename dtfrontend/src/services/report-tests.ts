import { api } from '@/lib/api'
import type {
  ReportTestRun,
  ReportTestRunList,
  ReportTestSchedule,
  ReportTestStartRequest,
  ReportTestSummary,
} from '@/types/report-tests'

const noCache = { useCache: false, useQueue: false }

export const reportTestService = {
  async getSummary(): Promise<ReportTestSummary> {
    return api.get<ReportTestSummary>('/report-tests/summary', undefined, noCache)
  },

  async listRuns(platformId?: number | null, limit = 50, offset = 0): Promise<ReportTestRunList> {
    const params = new URLSearchParams()
    if (platformId != null) params.set('platform_id', String(platformId))
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    return api.get<ReportTestRunList>(`/report-tests/runs?${params.toString()}`, undefined, noCache)
  },

  async getRun(runId: number, includeResults = true): Promise<ReportTestRun> {
    return api.get<ReportTestRun>(
      `/report-tests/runs/${runId}?include_results=${includeResults}`,
      undefined,
      noCache
    )
  },

  async startRun(payload: ReportTestStartRequest = {}): Promise<ReportTestRun> {
    return api.post<ReportTestRun>('/report-tests/runs', payload, undefined, noCache)
  },

  async cancelRun(runId: number): Promise<ReportTestRun> {
    return api.post<ReportTestRun>(`/report-tests/runs/${runId}/cancel`, {}, undefined, noCache)
  },

  async listSchedules(): Promise<{ items: ReportTestSchedule[] }> {
    return api.get('/report-tests/schedules', undefined, noCache)
  },

  async saveSchedule(
    platformId: number,
    payload: {
      enabled: boolean
      hour: number
      minute: number
      recipients: string[]
    }
  ): Promise<ReportTestSchedule> {
    return api.put(`/report-tests/schedules/${platformId}`, payload, undefined, noCache)
  },
}
