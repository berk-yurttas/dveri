import { api } from '@/lib/api'

export interface ColorGroupConfig {
  name: string
  description?: string
}

export interface ColorGroupsMapping {
  [color: string]: ColorGroupConfig
}

export interface Config {
  id: number
  platform_id?: number
  config_key: string
  config_value: any
  description?: string
  created_at: string
  updated_at?: string
}

export interface ConfigCreate {
  config_key: string
  config_value: any
  description?: string
}

export interface ConfigUpdate {
  config_value?: any
  description?: string
}

class ConfigService {
  // Get all configurations
  async getAllConfigs(): Promise<Config[]> {
    return api.get<Config[]>('/configs')
  }

  // Get a specific configuration by key
  async getConfig(configKey: string): Promise<Config> {
    return api.get<Config>(`/configs/${configKey}`)
  }

  // Create a new configuration
  async createConfig(configData: ConfigCreate): Promise<Config> {
    return api.post<Config>('/configs', configData)
  }

  // Update an existing configuration
  async updateConfig(configKey: string, configData: ConfigUpdate): Promise<Config> {
    return api.put<Config>(`/configs/${configKey}`, configData)
  }

  // Upsert (create or update) a configuration
  async upsertConfig(configKey: string, configValue: any, description?: string): Promise<Config> {
    return api.post<Config>(`/configs/${configKey}/upsert`, {
      config_value: configValue,
      description
    })
  }

  // Delete a configuration
  async deleteConfig(configKey: string): Promise<void> {
    return api.delete<void>(`/configs/${configKey}`)
  }

  // Get color groups mapping
  async getColorGroups(): Promise<ColorGroupsMapping> {
    try {
      const config = await api.get<Config>('/configs/color_groups')
      console.log("Config service received:", config)
      console.log("Extracting config_value:", config.config_value)

      // The API returns the full Config object, extract config_value
      if (config && config.config_value) {
        return config.config_value as ColorGroupsMapping
      }

      return {}
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Config doesn't exist yet, return empty mapping
        return {}
      }
      throw error
    }
  }

  // Update color groups mapping
  async updateColorGroups(colorGroups: ColorGroupsMapping): Promise<Config> {
    // The upsert endpoint expects config_value and description in the body
    // The API will handle wrapping it properly
    const payload = {
      config_value: colorGroups,
      description: 'Color to report group mapping'
    }
    console.log("Sending color groups payload:", payload)
    return api.post<Config>('/configs/color_groups/upsert', payload)
  }
}

export default new ConfigService()
