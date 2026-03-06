"use client"

import { useEffect, useState } from "react"
import { ChevronDown, LogOut, Settings } from "lucide-react"
import { type UserInfo } from "./types"
import { api } from "@/lib/api"
import { useUser } from "@/contexts/user-context"

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
  const { user } = useUser()
  const [greeting, setGreeting] = useState<string>("Günaydın")
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const canChangePassword =
    Array.isArray(user?.role) && user.role.some((role) => typeof role === "string" && role.startsWith("atolye:"))

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
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!newPassword || !newPasswordConfirm) {
      setPasswordError("Şifre alanları zorunludur.")
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("Şifreler eşleşmiyor.")
      return
    }

    setPasswordLoading(true)
    try {
      await api.put("/users/change-password", {
        password: newPassword,
        password_confirm: newPasswordConfirm,
      })
      setPasswordSuccess("Şifreniz başarıyla güncellendi.")
      setNewPassword("")
      setNewPasswordConfirm("")
    } catch (err: any) {
      let message = "Şifre güncellenirken hata oluştu."
      if (err?.message) {
        try {
          const parsed = JSON.parse(err.message)
          message = parsed?.detail || message
        } catch {
          message = err.message
        }
      }
      setPasswordError(message)
    } finally {
      setPasswordLoading(false)
    }
  }

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
          {canChangePassword && (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setChangePasswordOpen(true)
                  setPasswordError(null)
                  setPasswordSuccess(null)
                }}
                className="px-3 py-2.5 cursor-pointer rounded-md hover:bg-gray-50 transition-colors"
              >
                <Settings className="mr-3 h-4 w-4" />
                <span className="text-sm font-medium">Şifreni Değiştir</span>
              </DropdownMenuItem>
              {onLogoutClick && <DropdownMenuSeparator />}
            </>
          )}

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
      {changePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6 mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Şifreni Değiştir</h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre Tekrar</label>
                <input
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  minLength={6}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
                />
              </div>
              {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-green-600">{passwordSuccess}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setChangePasswordOpen(false)
                    setPasswordError(null)
                    setPasswordSuccess(null)
                  }}
                >
                  Kapat
                </Button>
                <Button type="submit" disabled={passwordLoading}>
                  {passwordLoading ? "Kaydediliyor..." : "Kaydet"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
