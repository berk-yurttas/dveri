/**
 * API Client with Automatic Performance Optimizations
 * 
 * AUTOMATIC FEATURES:
 * - All GET requests are cached for 5 minutes (configurable)
 * - All /data/widget POST requests use request queue (max 6 concurrent)
 * - Duplicate simultaneous requests are deduplicated
 * - All requests have 30-second timeout
 * 
 * USAGE:
 * - Normal usage: api.get('/endpoint') - automatically cached
 * - Disable cache: api.get('/endpoint', undefined, { useCache: false })
 * - Custom duration: api.get('/endpoint', undefined, { cacheDuration: 10 * 60 * 1000 })
 * - Widget requests: api.post('/data/widget', data) - automatically queued
 * 
 * See AUTOMATIC_OPTIMIZATIONS_GUIDE.md for details
 */

import { apiCache, createCacheKey } from './cache'
import { withQueue } from './request-queue'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

interface CacheOptions {
  useCache?: boolean
  cacheDuration?: number // in milliseconds
  useQueue?: boolean // Whether to use request queue (default: true for widget data)
}

/**
 * Get platform code from URL or localStorage
 * Priority: URL > localStorage
 * Automatically syncs URL platform to localStorage
 */
function getPlatformCode(): string | null {
  if (typeof window === 'undefined') return null
  
  // Try to extract platform code from URL path (e.g., /romiot/atolye -> romiot)
  const pathMatch = window.location.pathname.match(/^\/([^\/]+)/)
  const urlPlatformCode = pathMatch ? pathMatch[1] : null
  
  // Ignore root paths that aren't platform codes
  const ignoredPaths = ['', '_next', 'api', 'static', 'login', 'logout']
  const isValidPlatformCode = urlPlatformCode && !ignoredPaths.includes(urlPlatformCode)
  
  if (isValidPlatformCode) {
    // Sync URL platform to localStorage
    const storedPlatform = localStorage.getItem('platform_code')
    if (storedPlatform !== urlPlatformCode) {
      console.log(`[Platform] Syncing platform from URL: ${urlPlatformCode}`)
      localStorage.setItem('platform_code', urlPlatformCode)
    }
    return urlPlatformCode
  }
  
  // Fall back to localStorage
  return localStorage.getItem('platform_code')
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}, cacheOptions?: CacheOptions): Promise<T> {
  // Default: cache all GET requests, queue widget data requests
  const isGetRequest = options.method === 'GET' || !options.method
  const isWidgetRequest = endpoint.includes('/data/widget')
  
  const { 
    useCache = isGetRequest, // Default TRUE for GET requests
    cacheDuration = 2 * 60 * 1000, 
    useQueue = isWidgetRequest // Default TRUE for widget data requests
  } = cacheOptions || {}
  
  // Get platform code (from URL or localStorage)
  const platformCode = getPlatformCode()
  
  // Create cache key for GET requests (includes platform code for isolation)
  const cacheKey = createCacheKey(endpoint, undefined, platformCode)
  
  // Check cache for GET requests
  if (isGetRequest) {
    if (useCache) {
      const cached = apiCache.get<T>(cacheKey)
      if (cached !== null) {
        console.log(`[API Cache] Hit: ${endpoint} (platform: ${platformCode || 'none'})`)
        return cached
      }
      
      // Check if there's a pending request for the same data
      const pending = apiCache.getPendingRequest<T>(cacheKey)
      if (pending) {
        console.log(`[API Cache] Using pending request: ${endpoint} (platform: ${platformCode || 'none'})`)
        return pending
      }
    }
  }
  
  // Determine if this request should be queued
  // Queue: widget data requests, report execution, filter options
  const shouldQueue = useQueue || 
    endpoint.includes('/reports/execute') || 
    endpoint.includes('/filter-options')
  
  // Main request function
  const makeRequest = async () => {
    const url = `${API_BASE_URL}${endpoint}`
    
    console.log(`[API] ${endpoint} - Platform code from localStorage:`, platformCode)
    
    // Support for AbortController passed in options
    // SAP endpoints get 30 minute timeout, others get 30 second timeout
    const controller = new AbortController()
    const isSapRequest = endpoint.includes('/sap_seyir/')
    const timeoutId = setTimeout(() => controller.abort(), isSapRequest ? 1800000 : 30000)
    
    const signal = options.signal || controller.signal
    
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    }
    
    // Only add platform header if platform code is set
    if (platformCode) {
      headers['X-Platform-Code'] = platformCode
      console.log(`[API] ${endpoint} - Adding X-Platform-Code header:`, platformCode)
    } else {
      console.log(`[API] ${endpoint} - No platform code, header not added`)
    }
    
    // Create the fetch promise
    return (async () => {
    try {
      const response = await fetch(url, {
        credentials: 'include', // This is required to send and receive cookies
        headers,
        ...options,
        signal,
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        // Handle 401 Unauthorized - redirect to login
        if (response.status === 401) {
          const currentUrl = window.location.href
          const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
          const authServer = process.env.NEXT_PUBLIC_AUTH_SERVER_URL
          const loginRedirectUrl = `${baseUrl}/users/login_redirect?client_rdct=${encodeURIComponent(currentUrl)}`
          const authServerUrl = `${authServer}/?rdct_url=${encodeURIComponent(loginRedirectUrl)}`
          
          // Redirect to auth server
          window.location.href = authServerUrl
          return Promise.reject(new ApiError(401, 'Redirecting to login...'))
        }
        
        const errorText = await response.text()
        throw new ApiError(response.status, errorText || `HTTP error! status: ${response.status}`)
      }

      // Handle empty responses (204 No Content, etc.)
      const contentLength = response.headers.get('content-length')
      if (response.status === 204 || contentLength === '0') {
        return null as T
      }

      // Check if response has content to parse
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        return (text || null) as T
      }

      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)
      
      // Handle abort errors gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[API] Request aborted: ${endpoint}`)
        throw new ApiError(0, 'Request was cancelled')
      }
      
      throw error
    }
    })()
  }
  
  // Execute the request, optionally through queue
  const executeRequest = shouldQueue ? withQueue(makeRequest) : makeRequest()
  
  // Register pending request for deduplication (GET requests only)
  if (isGetRequest && useCache) {
    apiCache.setPendingRequest(cacheKey, executeRequest)
  }
  
  // Wait for response
  const data = await executeRequest
  
  // Cache the result for GET requests
  if (isGetRequest && useCache && data !== null) {
    apiCache.set(cacheKey, data, cacheDuration)
    console.log(`[API Cache] Set: ${endpoint} (platform: ${platformCode || 'none'}, expires in ${cacheDuration}ms)`)
  }
  
  return data
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit, cacheOptions?: CacheOptions) => 
    apiRequest<T>(endpoint, { method: 'GET', ...options }, cacheOptions),
  
  post: <T>(endpoint: string, data?: any, options?: RequestInit, cacheOptions?: CacheOptions) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }, cacheOptions),
  
  put: <T>(endpoint: string, data?: any, options?: RequestInit, cacheOptions?: CacheOptions) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }, cacheOptions),
  
  patch: <T>(endpoint: string, data?: any, options?: RequestInit, cacheOptions?: CacheOptions) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }, cacheOptions),
  
  delete: <T>(endpoint: string, options?: RequestInit, cacheOptions?: CacheOptions) =>
    apiRequest<T>(endpoint, { method: 'DELETE', ...options }, cacheOptions),
  
  // Expose cache for manual clearing if needed
  clearCache: () => apiCache.clear(),
  clearCachePattern: (pattern: RegExp) => apiCache.clearPattern(pattern),
}
