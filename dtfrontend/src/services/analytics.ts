import { api } from '@/lib/api'

export interface AnalyticsEvent {
    event_type: string
    path: string
    session_id: string
    user_id?: string
    duration?: number
    meta?: Record<string, any>
}

export interface AnalyticsStats {
    path: string
    views: number
    avg_time: number
    unique_visitors: number
    report_id?: number | null
    report_name?: string | null
}

export interface AnalyticsUserVisit {
    user_id: string
    path: string
    views: number
    total_duration_seconds: number
    last_seen?: string | null
    report_id?: number | null
    report_name?: string | null
}

export const analyticsService = {
    async trackEvent(data: AnalyticsEvent): Promise<void> {
        return api.post<void>('/analytics/track', data)
    },

    async getStats(period = '24h'): Promise<AnalyticsStats[]> {
        return api.get<AnalyticsStats[]>(`/analytics/stats?period=${period}`)
    },

    async getUserVisits(period = '24h'): Promise<AnalyticsUserVisit[]> {
        return api.get<AnalyticsUserVisit[]>(`/analytics/user-visits?period=${period}`)
    }
}
