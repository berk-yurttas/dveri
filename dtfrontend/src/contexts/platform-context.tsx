"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { platformService } from '@/services/platform'
import { Platform } from '@/types/platform'

interface PlatformContextType {
  platform: Platform | null
  loading: boolean
  error: string | null
  initialized: boolean
  setPlatformByCode: (code: string) => Promise<void>
  clearPlatform: () => void
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined)

export function PlatformProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Memoize fetchPlatform to prevent infinite loops
  const fetchPlatform = useCallback(async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      console.log('[PlatformContext] Fetching platform:', code)
      const platformData = await platformService.getPlatformByCode(code)
      console.log('[PlatformContext] Platform loaded:', platformData.display_name)
      setPlatform(platformData)
    } catch (err) {
      console.error('[PlatformContext] Failed to fetch platform:', err)
      setError('Platform yüklenemedi')
      setPlatform(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Extract platform code from URL and load platform
  useEffect(() => {
    const loadPlatformFromUrl = async () => {
      if (!pathname) {
        setInitialized(true)
        return
      }

      // Extract platform code from URL path (e.g., /ivme/dashboard -> ivme)
      const pathSegments = pathname.split('/').filter(Boolean)
      const platformCode = pathSegments[0]

      const nonPlatformRoutes = new Set(['admin', 'analytics', 'statistics'])

      if (platformCode && nonPlatformRoutes.has(platformCode)) {
        setPlatform(null)
        setError(null)
        setLoading(false)
        setInitialized(true)
        return
      }

      if (platformCode && platformCode !== platform?.code) {
        console.log('[PlatformContext] Loading platform from URL:', platformCode)
        await fetchPlatform(platformCode)
        setInitialized(true)
      } else if (!platformCode) {
        // Root page, clear platform
        setPlatform(null)
        setLoading(false)
        setInitialized(true)
      } else {
        // Platform already loaded
        setInitialized(true)
      }
    }

    loadPlatformFromUrl()
  }, [pathname, platform?.code, fetchPlatform])

  // Memoize to prevent infinite loops
  const setPlatformByCode = useCallback(async (code: string) => {
    // Don't refetch if already loaded
    if (platform && platform.code === code) {
      console.log('[PlatformContext] Platform already loaded:', code)
      return
    }
    
    console.log('[PlatformContext] Setting platform:', code)
    await fetchPlatform(code)
  }, [platform, fetchPlatform])

  const clearPlatform = useCallback(() => {
    console.log('[PlatformContext] Clearing platform')
    setPlatform(null)
    setError(null)
  }, [])

  return (
    <PlatformContext.Provider
      value={{
        platform,
        loading,
        error,
        initialized,
        setPlatformByCode,
        clearPlatform
      }}
    >
      {children}
    </PlatformContext.Provider>
  )
}

export function usePlatform() {
  const context = useContext(PlatformContext)
  if (context === undefined) {
    throw new Error('usePlatform must be used within PlatformProvider')
  }
  return context
}

