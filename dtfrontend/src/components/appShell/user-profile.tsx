"use client"

import { useEffect, useState } from "react"
import { ChevronDown, LogOut, Settings } from "lucide-react"
import { type UserInfo } from "./types"

import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { HexagonAvatar } from "./hexagon-avatar"
import { PreferencesModal } from "./preferences-modal"

interface UserProfileProps {
  userInfo?: UserInfo
  onPreferencesClick?: () => void
  onLogoutClick?: () => void
}

export function UserProfile({
  userInfo,
  onPreferencesClick,
  onLogoutClick,
}: UserProfileProps) {
  const [greeting, setGreeting] = useState<string>("Günaydın")
  const [preferencesOpen, setPreferencesOpen] = useState(false)

  useEffect(() => {
    // Get current time in Turkish time (UTC+3)
    const now = new Date()
    const turkishHour = (now.getUTCHours() + 3) % 24 // Convert to Turkish time (UTC+3)

    // Set greeting based on time of day
    if (turkishHour < 12) {
      setGreeting("Günaydın")
    } else {
      setGreeting("İyi günler")
    }
  }, [])
  console.log(userInfo)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 hover:bg-white/10 rounded-lg px-3 py-2 transition-all duration-200 cursor-pointer group">
            <HexagonAvatar 
              src={userInfo?.avatarUrl || "/placeholder.svg?height=40&width=40&query=professional+man+portrait"} 
              alt={userInfo?.name || "User"} 
              size={40} 
            />
            <div className="text-left hidden md:block">
              <div className="text-xs text-white/70 group-hover:text-white/90 transition-colors">{greeting}</div>
              <div className="text-sm font-medium text-white">{userInfo?.name}</div>
            </div>
            <ChevronDown className="h-4 w-4 text-white/70 group-hover:text-white hidden md:block transition-transform group-hover:translate-y-0.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-2 shadow-xl border-gray-200">


          {onLogoutClick && (
            <>
              <DropdownMenuItem 
                onClick={onLogoutClick} 
                className="px-3 py-2.5 cursor-pointer rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:text-red-700 transition-colors"
              >
                <LogOut className="mr-3 h-4 w-4" />
                <span className="text-sm font-medium">Çıkış Yap</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {preferencesOpen && (
        <PreferencesModal 
          open={preferencesOpen} 
          onOpenChange={setPreferencesOpen}
        />
      )}
    </>
  )
}
