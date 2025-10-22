export interface Widget {
  id?: string
  title: string
  widget_type: string
  position_x?: number
  position_y?: number
  width?: number
  height?: number
  config?: Record<string, any>
  data_source_query?: string
}

export interface DashboardBase {
  title: string
  is_public?: boolean
  layout_config?: Record<string, any>
  widgets?: Widget[]
}

export interface DashboardCreate extends DashboardBase {
  username: string
  owner_id: number
}

export interface DashboardUpdate {
  title?: string
  is_public?: boolean
  layout_config?: Record<string, any>
  widgets?: Widget[]
}

export interface Dashboard extends DashboardBase {
  id: number
  tags: string[]
  owner_id: number
  owner_name: string
  created_at: string
  updated_at?: string
  is_favorite?: boolean
}

export interface DashboardList {
  id: number
  title: string
  is_public: boolean
  owner_id: number
  owner_name: string
  tags: string[]
  layout_config?: Record<string, any>
  widgets?: Widget[]
  created_at: string
  updated_at?: string
  is_favorite?: boolean
}

// Frontend-specific interfaces for the dashboard builder
export interface PlacedWidget {
  id: string
  cellIndex: number
  name: string
  iconName: string
  color: string
  size: { width: number; height: number }
  type: string
}

export interface CreateDashboardRequest {
  title: string
  tags: string[] | undefined
  username: string
  owner_id: number
  is_public: boolean
  layout_config: {
    grid_size: { width: number; height: number }
  }
  widgets: Array<{
    id: string
    title: string
    widget_type: string
    position_x: number
    position_y: number
    width: number
    height: number
    config: {
      name: string
      iconName: string
      color: string
      cellIndex: number
    }
  }>
}
