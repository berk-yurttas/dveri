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

  async getDashboards(skip = 0, limit = 100): Promise<DashboardList[]> {
    return api.get<DashboardList[]>(`/dashboards/?skip=${skip}&limit=${limit}`)
  },

  async getPublicDashboards(skip = 0, limit = 100): Promise<DashboardList[]> {
    return api.get<DashboardList[]>(`/dashboards/public?skip=${skip}&limit=${limit}`)
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

  async getFavoriteDashboards(): Promise<DashboardList[]> {
    return api.get<DashboardList[]>('/dashboards/favorite')
  }
}
