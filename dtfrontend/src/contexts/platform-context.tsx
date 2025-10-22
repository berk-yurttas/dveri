"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { platformService } from '@/services/platform'
import { Platform } from '@/types/platform'

interface PlatformContextType {
  platform: Platform | null
  loading: boolean
  error: string | null
  setPlatformByCode: (code: string) => Promise<void>
  clearPlatform: () => void
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined)

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Load platform from localStorage on mount (only once)
  useEffect(() => {
    const loadPlatformFromStorage = async () => {
      const platformCode = localStorage.getItem('platform_code')
      if (platformCode) {
        console.log('[PlatformContext] Initial load from storage:', platformCode)
        await fetchPlatform(platformCode)
      }
    }

    loadPlatformFromStorage()
  }, [fetchPlatform]) // Only run on mount and when fetchPlatform changes (never)

  // Memoize to prevent infinite loops
  const setPlatformByCode = useCallback(async (code: string) => {
    // Don't refetch if already loaded
    if (platform && platform.code === code) {
      console.log('[PlatformContext] Platform already loaded:', code)
      return
    }
    
    console.log('[PlatformContext] Setting platform:', code)
    localStorage.setItem('platform_code', code)
    await fetchPlatform(code)
  }, [platform, fetchPlatform])

  const clearPlatform = useCallback(() => {
    console.log('[PlatformContext] Clearing platform')
    localStorage.removeItem('platform_code')
    setPlatform(null)
    setError(null)
  }, [])

  return (
    <PlatformContext.Provider
      value={{
        platform,
        loading,
        error,
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

