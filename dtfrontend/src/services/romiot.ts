import { api } from '@/lib/api'

export interface RomiotDashboardStats {
    operationCount: number;
    nonConformanceCount: number;
    workingHours: string;
    requestCount: number;
    sensorCount: number;
}

export const romiotService = {
    async getDashboardKpi(startDate: string, endDate: string): Promise<RomiotDashboardStats> {
        const params = new URLSearchParams({
            start_date: startDate,
            end_date: endDate,
        })
        return api.get<RomiotDashboardStats>(`/romiot/stats/dashboard-kpi?${params.toString()}`)
    }
}
