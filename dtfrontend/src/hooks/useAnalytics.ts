import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { analyticsService } from '@/services/analytics'
import { useUser } from '@/contexts/user-context'

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
    const startTimeRef = useRef<number>(Date.now())
    const currentPathRef = useRef<string | null>(null)

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

        // Reset start time for the new page
        const now = Date.now()

        // Handle "Time on Page" for the PREVIOUS page (if any)
        if (currentPathRef.current && currentPathRef.current !== pathname) {
            const duration = Math.round((now - startTimeRef.current) / 1000)
            if (duration > 0) {
                analyticsService.trackEvent({
                    event_type: 'page_leave',
                    path: currentPathRef.current,
                    session_id: sessionId,
                    user_id: userId,
                    duration: duration
                }).catch(err => console.error('Failed to track page leave:', err))
            }
        }

        // Update refs for next change
        startTimeRef.current = now
        currentPathRef.current = pathname

        // Cleanup function (runs when component unmounts or pathname changes)
        return () => {
            // We don't track here because standard useEffect cleanup runs BEFORE the new effect
            // but we need to handle the case where the user closes the tab entirely.
        }
    }, [pathname, user])

    // Handle tab close / visibility change (optional but good for accuracy)
    useEffect(() => {
        const handleUnload = () => {
            if (currentPathRef.current) {
                const duration = Math.round((Date.now() - startTimeRef.current) / 1000)
                const sessionId = getSessionId()
                const userId = user?.username || getStoredUsername()

                // Use navigator.sendBeacon if possible for reliability on unload
                const data = JSON.stringify({
                    event_type: 'page_leave',
                    path: currentPathRef.current,
                    session_id: sessionId,
                    user_id: userId,
                    duration: duration
                })

                // Note: sendBeacon requires Blob or FormData for headers usually, 
                // but checking if our API supports simple POST. 
                // Since we rely on service, we might just try best effort fetch 
                // or just skip strict unload tracking for now to keep it simple as per plan.
            }
        }

        window.addEventListener('beforeunload', handleUnload)
        return () => window.removeEventListener('beforeunload', handleUnload)
    }, [user])
}
