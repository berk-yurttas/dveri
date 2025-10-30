"use client"

import type React from "react"
import { useState, memo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { LogOutIcon, Loader2, ChevronDown, type LucideIcon, Database } from "lucide-react"

import { useMediaQuery } from "./hooks/use-media-query"
import { Button } from "./ui/button"

export interface NavigationItem {
  title: string
  icon: LucideIcon
  href: string
  isActive?: boolean
  children?: NavigationItem[]
}

export interface PlatformInfo {
  name: string
  logo?: string
  code: string
}

interface AppSidebarProps {
  navigationItems: NavigationItem[]
  currentPathname?: string
  onNavigationItemClick?: (item: NavigationItem) => void
  onLogout?: () => void
  logoutLoading?: boolean
  mobileOpen?: boolean
  isIvmePlatform?: boolean
  platformInfo?: PlatformInfo
}

export const AppSidebar = memo(function AppSidebar({ navigationItems, currentPathname, onNavigationItemClick, onLogout, logoutLoading = false, mobileOpen, isIvmePlatform, platformInfo }: AppSidebarProps) {
  const router = useRouter()
  const isDesktop = useMediaQuery("(min-width: 800px)")
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedSubmenus, setExpandedSubmenus] = useState<Set<string>>(new Set())

  const handleMouseEnter = () => {
    if (isDesktop) {
      setIsExpanded(true)
    }
  }

  const handleMouseLeave = () => {
    if (isDesktop) {
      setIsExpanded(false)
    }
  }

  const handleItemClick = (item: NavigationItem, e: React.MouseEvent) => {
    e.preventDefault()
    if (item.children && item.children.length > 0) {
      // Only allow submenu toggle when sidebar is expanded
      if ((isDesktop && isExpanded) || (!isDesktop && mobileOpen)) {
        toggleSubmenu(item.title)
      }
    } else {
      // Call the navigation handler first - it will handle the actual navigation
      if (onNavigationItemClick) {
        onNavigationItemClick(item)
      }
      // Don't call router.push here - let the parent handler decide
    }
  }

  const toggleSubmenu = (title: string) => {
    setExpandedSubmenus(prev => {
      const newSet = new Set(prev)
      if (newSet.has(title)) {
        newSet.delete(title)
      } else {
        newSet.add(title)
      }
      return newSet
    })
  }

  // Close all submenus when sidebar collapses
  useEffect(() => {
    if (isDesktop && !isExpanded) {
      setExpandedSubmenus(new Set())
    }
  }, [isDesktop, isExpanded])

  const renderNavigationItem = (item: NavigationItem, level = 0) => {
    const isSubmenuExpanded = expandedSubmenus.has(item.title)
    const hasChildren = item.children && item.children.length > 0
    const isActive = currentPathname === item.href
    
    return (
      <li key={item.title} className="relative">
        <a
          href={item.href}
          className={`flex items-center ${
            !isDesktop && mobileOpen ? "justify-start" : "justify-center md:justify-start"
          } gap-3 rounded-md p-2 text-sm transition-colors ${
            level > 0 ? "ml-4" : ""
          } ${
            isActive
              ? "bg-gray-200 font-medium"
              : "text-gray-700 hover:bg-gray-100 hover:text-gray-800"
          }`}
          onClick={(e) => handleItemClick(item, e)}
        >
          <item.icon className="h-5 w-5 flex-shrink-0 text-current" />
          <span
            className={`transition-opacity duration-200 flex-1 ${
              (isDesktop && isExpanded) || (!isDesktop && mobileOpen) ? "opacity-100" : "opacity-0"
            }`}
          >
            {item.title}
          </span>
          {hasChildren && (
            <ChevronDown
              className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                isSubmenuExpanded ? "rotate-180" : ""
              } ${
                (isDesktop && isExpanded) || (!isDesktop && mobileOpen) ? "opacity-100" : "opacity-0"
              }`}
            />
          )}
        </a>
        {hasChildren && isSubmenuExpanded && ((isDesktop && isExpanded) || (!isDesktop && mobileOpen)) && (
          <ul className="mt-1">
            {item.children!.map((child) => renderNavigationItem(child, level + 1))}
          </ul>
        )}
      </li>
    )
  }

  let sidebarWidth = "w-16"
  if (isDesktop && isExpanded) {
    sidebarWidth = "w-64"
  } else if (!isDesktop && mobileOpen) {
    sidebarWidth = "w-[80%] max-w-[300px]"
  }

  return (
    <div className="h-full relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div
        className={`fixed inset-y-0 left-0 z-40 flex h-full transition-[width] duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${sidebarWidth} ${isIvmePlatform ? 'pt-[130px]' : 'pt-16'}`}
      >
        <div className="flex h-full w-full flex-col bg-gray-50 overflow-hidden shadow-lg">
          {/* Platform Info Section */}
          {platformInfo && (
            <div className="border-b border-gray-200 bg-white">
              <div className={`flex items-center gap-3 p-4 ${
                (isDesktop && !isExpanded) ? 'justify-center' : 'justify-start'
              }`}>
                {platformInfo.logo ? (
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                    <img
                      src={platformInfo.logo}
                      alt={platformInfo.name}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = '<div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><svg class="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-2V4c0-1.11-.89-2-2-2H8c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0H10V4h4v2z"/></svg></div>';
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Database className="w-6 h-6 text-blue-600" />
                  </div>
                )}
                <div className={`flex-1 min-w-0 transition-opacity duration-200 ${
                  (isDesktop && isExpanded) || (!isDesktop && mobileOpen) ? 'opacity-100' : 'opacity-0'
                }`}>
                  <h3 className="font-semibold text-sm text-gray-900 truncate">
                    {platformInfo.name}
                  </h3>
                  <p className="text-xs text-gray-500 truncate">
                    Platform
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <div className="p-2">
              <ul className="flex flex-col gap-1">
                {navigationItems.map((item) => renderNavigationItem(item))}
              </ul>
            </div>
          </div>
          <div className="p-2 mt-auto border-t border-sidebar-border border-gray-200">
              <Button 
                variant="destructive" 
                className="w-full flex items-center justify-center gap-3 bg-red-600 text-white hover:bg-red-700"
                onClick={onLogout}
                disabled={logoutLoading}
              >
                {logoutLoading ? (
                  <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin" />
                ) : (
                  <LogOutIcon className="h-5 w-5 flex-shrink-0" />
                )}
                <span
                  className={`transition-opacity duration-200 ${
                    (isDesktop && isExpanded) || (!isDesktop && mobileOpen) ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {logoutLoading ? "Çıkış Yapılıyor..." : "Çıkış Yap"}
                </span>
              </Button>
            </div>
        </div>
      </div>
    </div>
  )
})
