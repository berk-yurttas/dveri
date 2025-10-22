import { api } from '@/lib/api'
import { 
  Dashboard, 
  DashboardCreate, 
  DashboardList, 
  DashboardUpdate,
  CreateDashboardRequest
} from '@/types/dashboard'

export const dashboardService = {
  async createDashboard(data: CreateDashboardRequest): Promise<Dashboard> {
    return api.post<Dashboard>('/dashboards/', data)
  },

  async getDashboards(skip = 0, limit = 100, subplatform?: string): Promise<DashboardList[]> {
    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    })
    if (subplatform) {
      params.append('subplatform', subplatform)
    }
    return api.get<DashboardList[]>(`/dashboards/?${params.toString()}`)
  },

  async getDashboardById(id: number): Promise<Dashboard> {
    return api.get<Dashboard>(`/dashboards/${id}`)
  },

  async updateDashboard(id: number, data: DashboardUpdate): Promise<Dashboard> {
    return api.put<Dashboard>(`/dashboards/${id}`, data)
  },

  async deleteDashboard(id: number): Promise<void> {
    return api.delete<void>(`/dashboards/${id}`)
  },

  async addToFavorites(dashboardId: number): Promise<DashboardList> {
    return api.post<DashboardList>(`/dashboards/favorite?dashboard_id=${dashboardId}`)
  },

  async removeFromFavorites(dashboardId: number): Promise<DashboardList> {
    return api.delete<DashboardList>(`/dashboards/favorite?dashboard_id=${dashboardId}`)
  },
}
