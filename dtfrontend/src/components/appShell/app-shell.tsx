"use client"

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { type UserInfo } from "./types"

import { AppHeader } from "./app-header"
import { AppSidebar, type NavigationItem } from "./app-sidebar"
import { useMediaQuery } from "./hooks/use-media-query"

export interface AppShellProps {
  children: ReactNode
  title?: string
  subtitle?: string
  navigationItems: NavigationItem[]
  currentPathname?: string
  customHeaderActions?: ReactNode[]
  onNavigationItemClick?: (item: NavigationItem) => void
  onPreferencesClick?: () => void
  onLogoutClick?: () => void
  logoutLoading?: boolean
  onClickBildirim?: () => void
  notificationCount?: number
  userInfo?: UserInfo
}

export function AppShell({
  children,
  title,
  subtitle,
  navigationItems,
  currentPathname,
  customHeaderActions = [],
  onNavigationItemClick,
  onPreferencesClick,
  onLogoutClick,
  logoutLoading = false,
  onClickBildirim,
  notificationCount,
  userInfo,
}: AppShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 800px)")

  useEffect(() => {
    if (isDesktop) {
      setMobileSidebarOpen(false)
    }
  }, [isDesktop])

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen(!mobileSidebarOpen)
  }

  const handleNavigationClick = (item: NavigationItem) => {
    if (!isDesktop) {
      setMobileSidebarOpen(false)
    }
    if (onNavigationItemClick) {
      onNavigationItemClick(item)
    }
  }

  return (
    <div className="flex min-h-screen relative overflow-hidden">


      {/* Arc Background Overlay */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Large Quarter Circle Arc - Left Bottom */}
        <div
          className="absolute bottom-0 left-0"
          style={{
            width: '70rem',
            height: '70rem',
            borderRadius: '0 100% 0 0',
            background: 'linear-gradient(to top right, rgba(24, 0, 241, 0.3) 0%, rgba(45, 212, 191, 0.25) 50%, transparent 100%)',
          }}
        ></div>

        {/* Large Quarter Circle Arc - Right Bottom */}
        <div
          className="absolute bottom-0 right-0"
          style={{
            width: '70rem',
            height: '70rem',
            borderRadius: '100% 0 0 0',
            background: 'linear-gradient(to top left, rgba(117, 11, 82, 0.3) 0%, rgba(45, 212, 191, 0.25) 50%, transparent 100%)',
          }}
        ></div>
      </div>

      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <AppHeader title={title} subtitle={subtitle} customActions={customHeaderActions} onMobileMenuClick={toggleMobileSidebar} onPreferencesClick={onPreferencesClick} onLogoutClick={onLogoutClick} onClickBildirim={onClickBildirim} notificationCount={notificationCount} userInfo={userInfo} />

      <AppSidebar
        navigationItems={navigationItems}
        currentPathname={currentPathname}
        onNavigationItemClick={handleNavigationClick}
        onLogout={onLogoutClick}
        logoutLoading={logoutLoading}
        mobileOpen={mobileSidebarOpen}
      />

      <div className="relative z-10 flex flex-1 flex-col pt-16 md:ml-16 bg-gray-50/80 backdrop-blur-sm">
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
