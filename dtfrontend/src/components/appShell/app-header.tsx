"use client"

import type { ReactNode } from "react"
import { Menu } from "lucide-react"
import Image from "next/image"
import { type UserInfo } from "./types"

import { Button } from "./ui/button"
import { useMediaQuery } from "./hooks/use-media-query"
import { AselsanLogo } from "./aselsan-logo"
import { UserProfile } from "./user-profile"
// import { ModeToggle } from "@/components/theme-provider/theme-toggle"

interface AppHeaderProps {
  title?: string
  subtitle?: string
  customActions?: ReactNode[]
  onMobileMenuClick?: () => void
  onPreferencesClick?: () => void
  onLogoutClick?: () => void
  userInfo?: UserInfo
}

export function AppHeader({ title, subtitle, customActions = [], onMobileMenuClick, onPreferencesClick, onLogoutClick, userInfo }: AppHeaderProps) {
  const isMobile = useMediaQuery("(max-width: 799px)")

  // Default header actions
  const defaultActions = [
    // <ModeToggle key="theme-toggle" />,
    <UserProfile key="user-profile" userInfo={userInfo} onPreferencesClick={onPreferencesClick} onLogoutClick={onLogoutClick} />,
  ].filter(Boolean)

  // Combine custom actions with default actions
  const actions = customActions.length > 0 ? customActions : defaultActions

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex h-16 shrink-0 items-center justify-between px-6 overflow-hidden"
      style={{ backgroundColor: "#1e3a8a" }}
    >
      {/* Background curved lines that span full height */}
      {process.env.NEXT_PUBLIC_BACKGROUND_IMAGE && (
        <div className="absolute inset-0 pointer-events-none">
          <Image
            src={process.env.NEXT_PUBLIC_BACKGROUND_IMAGE}
            alt=""
            width={200}
            height={100}
            className="object-cover object-left"
            style={{
              transform: "scale(1.6)",
            }}
            priority
          />
        </div>
      )}

      {/* Header content */}
      <div className="relative z-10 flex items-center gap-6">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onMobileMenuClick} className="text-white hover:bg-white/20">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Menüyü aç/kapat</span>
          </Button>
        )}
        <AselsanLogo />
      </div>

      {/* Center title between logo and actions */}
      <div className="flex-1 flex justify-center items-center relative z-10">
        <div className="flex flex-col items-center">
          {title && <h1 className="text-xl font-semibold text-white text-center whitespace-nowrap">{title}</h1>}
          {subtitle && <h2 className="text-sm font-semibold text-white text-center whitespace-nowrap">{subtitle}</h2>}
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-3">
        {actions.map((action, index) => (
          <div key={index}>{action}</div>
        ))}
      </div>
    </header>
  )
}
