import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { analyticsService } from '@/services/analytics'
import { useUser } from '@/contexts/user-context'

const ANALYTICS_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

// Helper to get or create session ID
const getSessionId = () => {
    if (typeof window === 'undefined') return ''
    let sessionId = sessionStorage.getItem('analytics_session_id')
    if (!sessionId) {
        sessionId = uuidv4()
        sessionStorage.setItem('analytics_session_id', sessionId)
    }
    return sessionId
}

const getStoredUsername = () => {
    if (typeof window === 'undefined') return undefined
    return localStorage.getItem('analytics_username') || undefined
}

export const useAnalytics = () => {
    const pathname = usePathname()
    const { user } = useUser()
    const currentPathRef = useRef<string | null>(null)
    const lastLeaveSentAtRef = useRef<number | null>(null)
    const activeDurationMsRef = useRef<number>(0)
    const lastVisibleAtRef = useRef<number | null>(null)
    const isVisibleRef = useRef<boolean>(true)

    // Track page views and time on page
    useEffect(() => {
        if (!pathname) return

        const sessionId = getSessionId()
        const userId = user?.username || getStoredUsername()

        // 1. Send Page View for the NEW page
        analyticsService.trackEvent({
            event_type: 'pageview',
            path: pathname,
            session_id: sessionId,
            user_id: userId,
            meta: { referrer: document.referrer }
        }).catch(err => console.error('Failed to track pageview:', err))

        // Reset timers for the new page
        const now = Date.now()
        const isVisible = document.visibilityState === 'visible'

        // Handle "Time on Page" for the PREVIOUS page (if any)
        if (currentPathRef.current && currentPathRef.current !== pathname) {
            const activeMs = activeDurationMsRef.current + (isVisibleRef.current && lastVisibleAtRef.current ? now - lastVisibleAtRef.current : 0)
            const durationSeconds = Math.max(0, Math.round(activeMs / 1000))
            if (durationSeconds > 0) {
                analyticsService.trackEvent({
                    event_type: 'page_leave',
                    path: currentPathRef.current,
                    session_id: sessionId,
                    user_id: userId,
                    duration: durationSeconds
                }).catch(err => console.error('Failed to track page leave:', err))
            }
        }

        // Update refs for next change
        currentPathRef.current = pathname
        activeDurationMsRef.current = 0
        isVisibleRef.current = isVisible
        lastVisibleAtRef.current = isVisible ? now : null

        // Cleanup function (runs when component unmounts or pathname changes)
        return () => {
            // We don't track here because standard useEffect cleanup runs BEFORE the new effect
            // but we need to handle the case where the user closes the tab entirely.
        }
    }, [pathname, user])

    // Track visibility to avoid counting time in background tabs
    useEffect(() => {
        const handleVisibilityChange = () => {
            const now = Date.now()
            if (document.visibilityState === 'hidden') {
                if (isVisibleRef.current && lastVisibleAtRef.current) {
                    activeDurationMsRef.current += now - lastVisibleAtRef.current
                }
                isVisibleRef.current = false
                lastVisibleAtRef.current = null
            } else {
                isVisibleRef.current = true
                lastVisibleAtRef.current = now
            }
        }

        handleVisibilityChange()
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    // Handle tab close (best effort)
    useEffect(() => {
        const handleUnload = () => {
            if (currentPathRef.current) {
                const now = Date.now()
                if (lastLeaveSentAtRef.current && now - lastLeaveSentAtRef.current < 1000) {
                    return
                }
                lastLeaveSentAtRef.current = now
                const activeMs = activeDurationMsRef.current + (isVisibleRef.current && lastVisibleAtRef.current ? now - lastVisibleAtRef.current : 0)
                const durationSeconds = Math.max(0, Math.round(activeMs / 1000))
                if (durationSeconds <= 0) {
                    return
                }
                const sessionId = getSessionId()
                const userId = user?.username || getStoredUsername()

                const payload = {
                    event_type: 'page_leave',
                    path: currentPathRef.current,
                    session_id: sessionId,
                    user_id: userId,
                    duration: durationSeconds
                }

                const url = `${ANALYTICS_API_BASE_URL}/analytics/track`
                const data = JSON.stringify(payload)
                if (navigator.sendBeacon) {
                    const blob = new Blob([data], { type: 'application/json' })
                    const queued = navigator.sendBeacon(url, blob)
                    if (queued) return
                }
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: data,
                    credentials: 'include',
                    keepalive: true
                }).catch(err => console.error('Failed to track page leave on unload:', err))
            }
        }

        window.addEventListener('beforeunload', handleUnload)
        return () => window.removeEventListener('beforeunload', handleUnload)
    }, [user])
}
