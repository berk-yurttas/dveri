"use client"

import type { ReactNode } from "react"
import { Menu } from "lucide-react"
import Image from "next/image"
import { type UserInfo } from "./types"

import { Button } from "./ui/button"
import { useMediaQuery } from "./hooks/use-media-query"
import { AselsanLogo } from "./aselsan-logo"
import { UserProfile } from "./user-profile"
import { usePlatform } from "@/contexts/platform-context"
// import { ModeToggle } from "@/components/theme-provider/theme-toggle"

interface AppHeaderProps {
  title?: string
  subtitle?: string
  customActions?: ReactNode[]
  onMobileMenuClick?: () => void
  onPreferencesClick?: () => void
  onLogoutClick?: () => void
  userInfo?: UserInfo
  headerColor?: string
}

export function AppHeader({ title, subtitle, customActions = [], onMobileMenuClick, onPreferencesClick, onLogoutClick, userInfo, headerColor = "#1e3a8a" }: AppHeaderProps) {
  const isMobile = useMediaQuery("(max-width: 799px)")
  const { platform } = usePlatform()

  // Default header actions
  const defaultActions = [
    // <ModeToggle key="theme-toggle" />,
    <UserProfile key="user-profile" userInfo={userInfo} onPreferencesClick={onPreferencesClick} onLogoutClick={onLogoutClick} />,
  ].filter(Boolean)

  // Combine custom actions with default actions
  const actions = customActions.length > 0 ? customActions : defaultActions

  // Check if platform is 'ivme' for custom styling
  const isIvmePlatform = platform?.code === 'ivme'

  return (
    <header
      className={`fixed top-0 left-0 right-0 flex shrink-0 items-center justify-between px-6 overflow-hidden ${
        isIvmePlatform ? 'h-[100px] mt-[30px] z-[999]' : 'z-40 h-16'
      }`}
      style={{
        backgroundColor: isIvmePlatform ? '#fff' : headerColor,
        boxShadow: isIvmePlatform ? '0px 3px 3px #ededed' : undefined,
      }}
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
      {!isIvmePlatform && (
      <div className="relative z-10 flex items-center gap-6">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onMobileMenuClick} className="text-white hover:bg-white/20">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Menüyü aç/kapat</span>
          </Button>
        )}
        <AselsanLogo />
      </div>
      )} {isIvmePlatform && (
        <div className="relative z-10 flex items-center left-20 pt-2">
          <img src="/ssb-aselsan.png" alt="Aselsan Logo" className="h-25 w-25" />
        </div>
      )}
      {/* Center title between logo and actions */}
      <div className="flex-1 flex left-[43%] relative z-10">
        <div className="flex flex-col items-center">
          {title && !isIvmePlatform && <h1 className="text-xl font-semibold text-white text-center whitespace-nowrap">{title}</h1>}
          {subtitle && !isIvmePlatform && <h2 className="text-sm font-semibold text-white text-center whitespace-nowrap">{subtitle}</h2>}
          {isIvmePlatform && (
            <img src="/ivme-aselsan.png" alt="İvme Aselsan" className="h-15 w-auto" />
          )}
        </div>
      </div>
      
      {!isIvmePlatform && (
      <div className="relative z-10 flex items-center gap-3">
        {actions.map((action, index) => (
          <div key={index}>{action}</div>
        ))}
      </div>
      )}
      {isIvmePlatform && (
        <div className="relative z-10 flex items-center gap-3 right-20">
          <div className="flex items-center gap-3">
            <img src="/ssb-logo.png" alt="Aselsan Logo" className="h-15 w-auto" />
          </div>
        </div>
      )}
    </header>
  )
}
