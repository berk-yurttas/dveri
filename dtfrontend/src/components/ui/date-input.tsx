"use client"

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { createPortal } from "react-dom"
import { type InputHTMLAttributes, forwardRef, useEffect, useMemo, useRef, useState } from "react"

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value?: string
  onChange?: (value: string) => void
  className?: string
  placeholder?: string
  min?: string
}

function formatIsoToDisplay(isoDate: string): string {
  if (!isoDate) return ""
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ""
  const [, year, month, day] = match
  return `${day}.${month}.${year}`
}

function parseDisplayToIso(displayDate: string): string | null {
  const match = displayDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return null
  const [, dayStr, monthStr, yearStr] = match
  const day = Number(dayStr)
  const month = Number(monthStr)
  const year = Number(yearStr)
  const dt = new Date(year, month - 1, day)
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null
  }
  return `${yearStr}-${monthStr}-${dayStr}`
}

function maskToDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

function isValidPartialDisplay(displayDate: string): boolean {
  const parts = displayDate.split(".")
  const dayPart = parts[0] || ""
  const monthPart = parts[1] || ""
  if (dayPart.length === 2) {
    const day = Number(dayPart)
    if (!Number.isInteger(day) || day < 1 || day > 31) return false
  }
  if (monthPart.length === 2) {
    const month = Number(monthPart)
    if (!Number.isInteger(month) || month < 1 || month > 12) return false
  }
  return true
}

function isoToDate(isoDate: string): Date | null {
  if (!isoDate) return null
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  const dt = new Date(Number(year), Number(month) - 1, Number(day))
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== Number(year) ||
    dt.getMonth() !== Number(month) - 1 ||
    dt.getDate() !== Number(day)
  ) {
    return null
  }
  return dt
}

function dateToIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function calendarCells(viewMonth: Date): Date[] {
  const first = startOfMonth(viewMonth)
  const mondayBasedWeekday = (first.getDay() + 6) % 7 // Monday=0 ... Sunday=6
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - mondayBasedWeekday)
  const cells: Date[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push(d)
  }
  return cells
}

const WEEKDAY_LABELS_TR = ["Pzt", "Sal", "Car", "Per", "Cum", "Cmt", "Paz"]

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ value = "", onChange, min, required = false, readOnly = false, disabled = false, className, placeholder = "DD.MM.YYYY", ...props }, ref) => {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [displayValue, setDisplayValue] = useState(formatIsoToDisplay(value))
    const [open, setOpen] = useState(false)
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
    const initialDate = isoToDate(value) || new Date()
    const [viewMonth, setViewMonth] = useState(startOfMonth(initialDate))
    const minDate = useMemo(() => isoToDate(min || ""), [min])

    useEffect(() => {
      setDisplayValue(formatIsoToDisplay(value))
      if (!open) {
        const next = isoToDate(value) || new Date()
        setViewMonth(startOfMonth(next))
      }
    }, [value, open])

    useEffect(() => {
      if (!open || !buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const menuWidth = 288
      const menuHeight = 320
      const margin = 8
      const placeUp = rect.bottom + menuHeight > window.innerHeight - margin
      const top = placeUp ? Math.max(margin, rect.top - menuHeight - 4) : rect.bottom + 4
      const left = Math.max(margin, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - margin))
      setMenuPos({ top, left })
    }, [open])

    useEffect(() => {
      if (!open) return
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node
        const clickedInsideWrapper = !!wrapperRef.current?.contains(target)
        const clickedInsideMenu = !!menuRef.current?.contains(target)
        if (!clickedInsideWrapper && !clickedInsideMenu) setOpen(false)
      }
      document.addEventListener("mousedown", handleClickOutside)
      const handleViewportChange = () => setOpen(false)
      window.addEventListener("scroll", handleViewportChange, true)
      window.addEventListener("resize", handleViewportChange)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        window.removeEventListener("scroll", handleViewportChange, true)
        window.removeEventListener("resize", handleViewportChange)
      }
    }, [open])

    const baseClass = useMemo(
      () =>
        className ||
        "w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
      [className]
    )

    const commitDisplayValue = (nextDisplayValue: string) => {
      if (!onChange) return
      if (!nextDisplayValue) {
        onChange("")
        return
      }
      const parsed = parseDisplayToIso(nextDisplayValue)
      if (!parsed) {
        setDisplayValue(formatIsoToDisplay(value))
        return
      }
      if (min && parsed < min) {
        setDisplayValue(formatIsoToDisplay(value))
        return
      }
      onChange(parsed)
    }

    const cells = useMemo(() => calendarCells(viewMonth), [viewMonth])
    const selectedIso = value || ""
    const currentMonth = viewMonth.getMonth()
    const currentYear = viewMonth.getFullYear()

    const isDateDisabled = (date: Date): boolean => {
      if (!minDate) return false
      const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      const minimum = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime()
      return candidate < minimum
    }

    const handlePickDate = (date: Date) => {
      if (!onChange || isDateDisabled(date)) return
      const iso = dateToIso(date)
      onChange(iso)
      setDisplayValue(formatIsoToDisplay(iso))
      setOpen(false)
    }

    return (
      <div className="relative" ref={wrapperRef}>
        <input
          ref={ref}
          type="text"
          lang="tr-TR"
          value={displayValue}
          onChange={(e) => {
            const masked = maskToDisplay(e.target.value)
            if (!isValidPartialDisplay(masked)) return
            setDisplayValue(masked)
          }}
          onBlur={() => commitDisplayValue(displayValue)}
          placeholder={placeholder}
          inputMode="numeric"
          pattern="\d{2}\.\d{2}\.\d{4}"
          title="Tarih formatı GG.AA.YYYY olmalı"
          readOnly={readOnly}
          disabled={disabled}
          required={required}
          className={baseClass}
          {...props}
        />

        {!readOnly && !disabled && onChange && (
          <>
            <button
              type="button"
              ref={buttonRef}
              onClick={() => setOpen((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Takvim aç"
            >
              <Calendar className="h-4 w-4" />
            </button>
            {open &&
              createPortal(
                <div
                  ref={menuRef}
                  className="fixed z-[10000] w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      className="rounded p-1 text-gray-500 hover:bg-gray-100"
                      onClick={() => setViewMonth((m) => addMonths(m, -1))}
                      aria-label="Önceki ay"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="text-sm font-medium text-gray-700">
                      {viewMonth.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}
                    </div>
                    <button
                      type="button"
                      className="rounded p-1 text-gray-500 hover:bg-gray-100"
                      onClick={() => setViewMonth((m) => addMonths(m, 1))}
                      aria-label="Sonraki ay"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-1 grid grid-cols-7 gap-1">
                    {WEEKDAY_LABELS_TR.map((day) => (
                      <div key={day} className="py-1 text-center text-[11px] font-medium text-gray-500">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((date) => {
                      const iso = dateToIso(date)
                      const isSelected = selectedIso === iso
                      const inCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
                      const disabledDate = isDateDisabled(date)
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={disabledDate}
                          onClick={() => handlePickDate(date)}
                          className={`h-8 rounded text-sm transition-colors ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : inCurrentMonth
                                ? "text-gray-700 hover:bg-blue-50"
                                : "text-gray-300 hover:bg-gray-50"
                          } ${disabledDate ? "cursor-not-allowed opacity-40 hover:bg-transparent" : ""}`}
                        >
                          {date.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>,
                document.body
              )}
          </>
        )}
      </div>
    )
  }
)

DateInput.displayName = "DateInput"