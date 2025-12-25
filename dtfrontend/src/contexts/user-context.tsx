"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from '@/lib/api'

interface User {
  id: string
  username: string
  email: string
  name: string
  company: string
  department: string
  management_dpt: string
  title: string
  avatar_url?: string
  role: string[]
  created?: string
  updated?: string
  verified: boolean
}

interface UserContextType {
  user: User | null
  loading: boolean
  error: string | null
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      setError(null)

      const userData = await api.get<User>('/users/login_jwt')

      // Only update state if data has changed (prevents unnecessary re-renders)
      setUser(prevUser => {
        if (JSON.stringify(prevUser) === JSON.stringify(userData)) {
          return prevUser // Keep same reference, no re-render
        }
        return userData
      })
    } catch (err: any) {
      console.error('Failed to fetch user:', err)
      if (err.status === 401) {
        setUser(null)
        setError('Not authenticated')
        // Don't redirect here - let the API client handle 401 redirects globally
      } else {
        setError(err.message || 'Failed to fetch user data')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  const logout = async () => {
    try {
      await api.post('/users/logout')
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      setUser(null)
      // Redirect to auth server login
      const currentUrl = window.location.origin
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
      const authServer = process.env.NEXT_PUBLIC_AUTH_SERVER_URL
      const loginRedirectUrl = `${baseUrl}/users/login_redirect?client_rdct=${encodeURIComponent(currentUrl)}`
      const authServerUrl = `${authServer}/?rdct_url=${encodeURIComponent(loginRedirectUrl)}`
      window.location.href = authServerUrl
    }
  }

  // Fetch user on mount
  useEffect(() => {
    refreshUser()
  }, [])

  // Auto-refresh user data every 5 minutes to handle token refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (user) {
        refreshUser(true) // Silent refresh - no loading state changes
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [user])

  const value: UserContextType = {
    user,
    loading,
    error,
    refreshUser,
    logout,
    isAuthenticated: !!user
  }

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
