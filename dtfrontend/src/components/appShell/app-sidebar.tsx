"use client"

import type React from "react"
import { useState, memo, useEffect } from "react"
import { LogOutIcon, Loader2, ChevronDown, type LucideIcon } from "lucide-react"

import { useMediaQuery } from "./hooks/use-media-query"
import { Button } from "./ui/button"

export interface NavigationItem {
  title: string
  icon: LucideIcon
  href: string
  isActive?: boolean
  children?: NavigationItem[]
}

interface AppSidebarProps {
  navigationItems: NavigationItem[]
  currentPathname?: string
  onNavigationItemClick?: (item: NavigationItem) => void
  onLogout?: () => void
  logoutLoading?: boolean
  mobileOpen?: boolean
}

export const AppSidebar = memo(function AppSidebar({ navigationItems, currentPathname, onNavigationItemClick, onLogout, logoutLoading = false, mobileOpen }: AppSidebarProps) {
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
    if (item.children && item.children.length > 0) {
      e.preventDefault()
      // Only allow submenu toggle when sidebar is expanded
      if ((isDesktop && isExpanded) || (!isDesktop && mobileOpen)) {
        toggleSubmenu(item.title)
      }
    } else if (onNavigationItemClick) {
      onNavigationItemClick(item)
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
        } ${sidebarWidth} pt-16`}
      >
        <div className="flex h-full w-full flex-col bg-gray-50 overflow-hidden shadow-lg">
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
