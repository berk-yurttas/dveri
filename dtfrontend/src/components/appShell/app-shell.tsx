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
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 800px)")
  const { platform } = usePlatform()

  // Check if platform is 'ivme' for custom spacing
  const isIvmePlatform = platform?.code === 'ivme'
  const isDerinizPlatform = platform?.code === 'deriniz'

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

  const handleFeedbackSubmit = () => {
    setShowSuccessMessage(true)
    setTimeout(() => {
      setShowSuccessMessage(false)
      setFeedbackModalOpen(false)
      setFeedbackText('')
    }, 2000)
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
      {mobileSidebarOpen && (
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
              onClick={() => setFeedbackModalOpen(true)}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <Bell color="red" className="h-4 w-4" /> Geri Bildirim
            </button>
            <button
              onClick={() => setContactModalOpen(true)}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <Mail color="red" className="h-4 w-4" /> Bize Ulaşın
            </button>
            <button
              onClick={() => 
                {localStorage.removeItem('platform_code');
                window.location.href = '/';
                }}
              className="flex items-center gap-2 hover:opacity-70 transition-opacity"
            >
              <Home color="red" className="h-4 w-4" /> Anasayfa
            </button>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setFeedbackModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Geri Bildirim</h2>

            {showSuccessMessage ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-green-800 text-center font-medium">Geri bildiriminiz başarıyla gönderildi!</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
                    Açıklama
                  </label>
                  <textarea
                    id="feedback"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Geri bildiriminizi buraya yazın..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={6}
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setFeedbackModalOpen(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={!feedbackText.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Gönder
                  </button>
                </div>
              </>
            )}
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

      <AppHeader title={title} subtitle={subtitle} customActions={customHeaderActions} onMobileMenuClick={toggleMobileSidebar} onPreferencesClick={onPreferencesClick} onLogoutClick={onLogoutClick}  userInfo={userInfo} headerColor={headerColor} />

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

      <div className={`relative z-10 flex flex-1 flex-col md:ml-16 bg-gray-50/80 backdrop-blur-sm ${
        isIvmePlatform ? 'pt-[100px]' : 'pt-16'
      }`}>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
