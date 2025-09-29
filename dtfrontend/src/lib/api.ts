const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  
  const response = await fetch(url, {
    credentials: 'include', // This is required to send and receive cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

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
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) => 
    apiRequest<T>(endpoint, { method: 'GET', ...options }),
  
  post: <T>(endpoint: string, data?: any, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),
  
  put: <T>(endpoint: string, data?: any, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    }),
  
  delete: <T>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { method: 'DELETE', ...options }),
}
