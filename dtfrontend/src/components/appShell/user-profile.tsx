"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
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
    <div className="flex items-center gap-3">
            
            <HexagonAvatar 
              src={userInfo?.avatarUrl || "/placeholder.svg?height=40&width=40&query=professional+man+portrait"} 
              alt={userInfo?.name || "User"} 
              size={40} 
            />
            <div className="text-left hidden md:block">
              <div className="text-xs text-white/50">{greeting}</div>
              <div className="text-sm font-medium text-white">{userInfo?.name}</div>
            </div>
          </div>
    </>
  )
}
