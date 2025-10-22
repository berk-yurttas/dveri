/**
 * Simple in-memory cache for API responses
 * Helps prevent duplicate requests for the same data
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresIn: number // in milliseconds
}

class ApiCache {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private pendingRequests: Map<string, Promise<any>> = new Map()

  /**
   * Get data from cache if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.expiresIn) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Set data in cache with expiration time
   */
  set<T>(key: string, data: T, expiresIn: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn
    })
  }

  /**
   * Check if a request is currently pending for this key
   */
  getPendingRequest<T>(key: string): Promise<T> | null {
    return this.pendingRequests.get(key) || null
  }

  /**
   * Register a pending request
   */
  setPendingRequest<T>(key: string, promise: Promise<T>): void {
    this.pendingRequests.set(key, promise)
    
    // Clean up when the promise resolves or rejects
    promise.finally(() => {
      this.pendingRequests.delete(key)
    })
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries that match a pattern
   */
  clearPattern(pattern: RegExp): void {
    const keys = Array.from(this.cache.keys())
    keys.forEach(key => {
      if (pattern.test(key)) {
        this.cache.delete(key)
      }
    })
  }
}

export const apiCache = new ApiCache()

/**
 * Create a cache key from URL, params, and platform code
 * Platform code is included to ensure cache isolation per platform
 */
export function createCacheKey(url: string, params?: any, platformCode?: string | null): string {
  const baseKey = params ? `${url}:${JSON.stringify(params)}` : url
  
  // Include platform code in cache key to isolate cache per platform
  // This ensures /dashboards for 'deriniz' is cached separately from /dashboards for 'app2'
  if (platformCode) {
    return `platform:${platformCode}:${baseKey}`
  }
  
  // No platform = different cache entry
  return `platform:none:${baseKey}`
}

