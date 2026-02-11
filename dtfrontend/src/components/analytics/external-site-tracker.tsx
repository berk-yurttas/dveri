"use client"

import { useEffect, useRef } from "react"
import { analyticsService } from "@/services/analytics"
import { useUser } from "@/contexts/user-context"

const TRACKED_EXTERNAL_HOSTS = new Set([
  "stok.dev.ahtapot.aselsan.com.tr",
  "dms.dev.ahtapot.aselsan.com.tr"
])

const DEDUPE_WINDOW_MS = 700

const getAnalyticsSessionId = () => {
  if (typeof window === "undefined") return ""
  let sessionId = sessionStorage.getItem("analytics_session_id")
  if (!sessionId) {
    sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem("analytics_session_id", sessionId)
  }
  return sessionId
}

const getStoredUsername = () => {
  if (typeof window === "undefined") return undefined
  return localStorage.getItem("analytics_username") || undefined
}

export function ExternalSiteTracker() {
  const { user } = useUser()
  const lastTrackedRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const trackExternalVisit = (urlLike: string, source: string) => {
      try {
        const parsed = new URL(urlLike, window.location.origin)
        const host = parsed.hostname.toLowerCase()
        if (!TRACKED_EXTERNAL_HOSTS.has(host)) return

        const now = Date.now()
        const dedupeKey = `${host}:${user?.username || getStoredUsername() || "unknown"}`
        const lastAt = lastTrackedRef.current[dedupeKey] || 0
        if (now - lastAt < DEDUPE_WINDOW_MS) return
        lastTrackedRef.current[dedupeKey] = now

        analyticsService.trackEvent({
          event_type: "pageview",
          path: parsed.origin,
          session_id: getAnalyticsSessionId(),
          user_id: user?.username || getStoredUsername(),
          meta: {
            source,
            source_path: window.location.pathname
          }
        }).catch((err) => console.error("Failed to track external site visit:", err))
      } catch {
        // Ignore malformed URLs
      }
    }

    const originalOpen = window.open.bind(window)
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      if (typeof url === "string") {
        trackExternalVisit(url, "window.open")
      } else if (url instanceof URL) {
        trackExternalVisit(url.toString(), "window.open")
      }
      return originalOpen(url as any, target, features)
    }) as typeof window.open

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link) return

      const href = link.getAttribute("href")
      if (!href || href.startsWith("#")) return
      if (href.startsWith("/") && link.target !== "_blank") return

      trackExternalVisit(href, "anchor-click")
    }

    document.addEventListener("click", handleDocumentClick, true)

    return () => {
      window.open = originalOpen
      document.removeEventListener("click", handleDocumentClick, true)
    }
  }, [user?.username])

  return null
}


