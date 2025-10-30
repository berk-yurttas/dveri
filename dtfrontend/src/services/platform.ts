import { api } from '@/lib/api';
import type {
  Platform,
  PlatformStats,
  PlatformWithStats,
  PlatformCreate,
  PlatformUpdate,
  PlatformConnectionTest
} from '@/types/platform';

export type { Platform, PlatformStats, PlatformWithStats, PlatformCreate, PlatformUpdate, PlatformConnectionTest };

export const platformService = {
  /**
   * Get list of platforms
   */
  async getPlatforms(
    skip: number = 0,
    limit: number = 100,
    includeInactive: boolean = false,
    search?: string
  ): Promise<Platform[]> {
    const params = new URLSearchParams();
    params.append('skip', skip.toString());
    params.append('limit', limit.toString());
    params.append('include_inactive', includeInactive.toString());
    if (search) {
      params.append('search', search);
    }

    return api.get<Platform[]>(`/platforms/?${params.toString()}`);
  },

  /**
   * Get platform count
   */
  async getPlatformCount(includeInactive: boolean = false): Promise<{ total: number; active_only: boolean }> {
    const params = new URLSearchParams();
    params.append('include_inactive', includeInactive.toString());
    
    return api.get(`/platforms/count/?${params.toString()}`);
  },

  /**
   * Get platform by ID
   */
  async getPlatformById(platformId: number): Promise<Platform> {
    return api.get<Platform>(`/platforms/${platformId}`);
  },

  /**
   * Get platform by code
   */
  async getPlatformByCode(platformCode: string): Promise<Platform> {
    return api.get<Platform>(`/platforms/code/${platformCode}`);
  },

  /**
   * Get platform statistics
   */
  async getPlatformStats(platformId: number): Promise<PlatformStats> {
    return api.get<PlatformStats>(`/platforms/${platformId}/stats`);
  },

  /**
   * Get platform with statistics
   */
  async getPlatformWithStats(platformId: number): Promise<PlatformWithStats> {
    return api.get<PlatformWithStats>(`/platforms/${platformId}/with-stats`);
  },

  /**
   * Create new platform
   */
  async createPlatform(platformData: PlatformCreate): Promise<Platform> {
    return api.post<Platform>('/platforms', platformData);
  },

  /**
   * Update platform
   */
  async updatePlatform(platformId: number, platformData: PlatformUpdate): Promise<Platform> {
    return api.put<Platform>(`/platforms/${platformId}`, platformData);
  },

  /**
   * Activate platform
   */
  async activatePlatform(platformId: number): Promise<Platform> {
    return api.patch<Platform>(`/platforms/${platformId}/activate`, {});
  },

  /**
   * Deactivate platform
   */
  async deactivatePlatform(platformId: number): Promise<Platform> {
    return api.patch<Platform>(`/platforms/${platformId}/deactivate`, {});
  },

  /**
   * Delete platform
   */
  async deletePlatform(platformId: number, hardDelete: boolean = false): Promise<{ success: boolean; message: string }> {
    const params = new URLSearchParams();
    params.append('hard_delete', hardDelete.toString());
    
    return api.delete(`/platforms/${platformId}?${params.toString()}`);
  },

  /**
   * Test platform database connection
   */
  async testConnection(platformId: number): Promise<PlatformConnectionTest> {
    return api.post<PlatformConnectionTest>(`/platforms/${platformId}/test-connection`, {});
  },
};

