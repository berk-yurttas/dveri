"use client"

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { type UserInfo } from "./types"

import { AppHeader } from "./app-header"
import { AppSidebar, type NavigationItem } from "./app-sidebar"
import { useMediaQuery } from "./hooks/use-media-query"
import { usePlatform } from "@/contexts/platform-context"
import { Bell, Mail, Phone, Home } from "lucide-react"

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
  headerColor?: string
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
  headerColor,
}: AppShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 800px)")
  const { platform } = usePlatform()

  // Check if platform is 'ivme' for custom spacing
  const isIvmePlatform = platform?.code === 'ivme'
  const isDerinizPlatform = platform?.code === 'deriniz'
  const isSeyirPlatform = platform?.code === 'seyir' || platform?.code === 'amom'
  // Check if we're on the Seyir/AMOM platform home page
  const isSeyirHomePage = isSeyirPlatform && currentPathname === `/${platform?.code}`

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

      {isDerinizPlatform && (
        // Arc Background Overlay
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
      )}
      {mobileSidebarOpen && currentPathname !== '/' && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      {isIvmePlatform && (
        <div className="fixed top-0 left-0 right-0 z-40 flex h-[30px] items-center justify-between px-6 overflow-hidden" style={{ backgroundColor: '#efefef' }}>
          <div className="absolute right-40 flex items-center gap-2 text-sm">
            <button
              onClick={() => setContactModalOpen(true)}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <Mail color="red" className="h-4 w-4" /> Bize Ulaşın
            </button>
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <Home color="red" className="h-4 w-4" /> Anasayfa
            </button>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setContactModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-6 text-gray-900">Bize Ulaşın</h2>

            <div className="space-y-4">
              {/* Contact 1 */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Yunus Emre Işıkdemir</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span>73563</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <a href="mailto:yeisikdemir@aselsan.com.tr" className="hover:text-blue-600 transition-colors">
                      yeisikdemir@aselsan.com.tr
                    </a>
                  </div>
                </div>
              </div>

              {/* Contact 2 */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Berk Yurttaş</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span>72472</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <a href="mailto:berkyurttas@aselsan.com.tr" className="hover:text-blue-600 transition-colors">
                      berkyurttas@aselsan.com.tr
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setContactModalOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      <AppHeader title={title} subtitle={subtitle} customActions={customHeaderActions} onMobileMenuClick={currentPathname !== '/' ? toggleMobileSidebar : undefined} onPreferencesClick={onPreferencesClick} onLogoutClick={onLogoutClick} userInfo={userInfo} headerColor={headerColor} />

      {/* Only show sidebar when not on homepage and not on Seyir platform home page */}
      {currentPathname !== '/' && !isSeyirHomePage && (
        <AppSidebar
          navigationItems={navigationItems}
          currentPathname={currentPathname}
          onNavigationItemClick={handleNavigationClick}
          onLogout={onLogoutClick}
          logoutLoading={logoutLoading}
          mobileOpen={mobileSidebarOpen}
          isIvmePlatform={isIvmePlatform}
          platformInfo={platform ? {
            name: platform.display_name,
            logo: platform.logo_url || '',
            code: platform.code
          } : undefined}
        />
      )}

      <div className={`relative z-10 flex flex-1 flex-col ${currentPathname === '/' || isSeyirHomePage ? 'md:ml-0' : 'md:ml-16'
        } bg-gray-50/80 backdrop-blur-sm ${isIvmePlatform ? 'pt-[100px]' : 'pt-16'
        }`}>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
