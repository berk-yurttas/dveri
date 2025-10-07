"use client"

import { forwardRef, useRef, useState } from "react"

interface DateInputProps {
  value?: string
  onChange?: (value: string) => void
  className?: string
  placeholder?: string
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className = "", placeholder = "dd/mm/yyyy", ...props }, ref) => {
    const hiddenInputRef = useRef<HTMLInputElement>(null)
    const [showPicker, setShowPicker] = useState(false)

    const formatDisplayValue = (dateValue: string) => {
      if (!dateValue) return ""

      try {
        const date = new Date(dateValue + "T00:00:00")
        if (isNaN(date.getTime())) return dateValue

        const day = date.getDate().toString().padStart(2, "0")
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear()

        return `${day}/${month}/${year}`
      } catch {
        return dateValue
      }
    }

    const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value)
      setShowPicker(false)
    }

    const handleDisplayClick = () => {
      if (hiddenInputRef.current) {
        hiddenInputRef.current.showPicker?.()
        setShowPicker(true)
      }
    }

    const handleDisplayKeyDown = (e: React.KeyboardEvent) => {
      // Allow manual typing
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleDisplayClick()
      }
    }

    return (
      <div className="relative">
        {/* Hidden date input for picker functionality */}
        <input
          ref={hiddenInputRef}
          type="date"
          value={value || ""}
          onChange={handleHiddenInputChange}
          className="absolute opacity-0 pointer-events-none"
          tabIndex={-1}
        />

        {/* Visible display input */}
        <input
          ref={ref}
          type="text"
          value={formatDisplayValue(value || "")}
          onClick={handleDisplayClick}
          onKeyDown={handleDisplayKeyDown}
          placeholder={placeholder}
          className={`px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer ${className}`}
          readOnly
          {...props}
        />

        {/* Calendar icon */}
        <div
          className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
        >
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      </div>
    )
  }
)

DateInput.displayName = "DateInput"