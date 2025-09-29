"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, Search } from "lucide-react"

interface MeasurementLocationOption {
  id: number
  name: string
  value: string
}

interface MeasurementLocationDropdownProps {
  options: MeasurementLocationOption[]
  selectedValue: string | null
  onSelect: (value: string) => void
  placeholder?: string
  className?: string
  loading?: boolean
}

export function MeasurementLocationDropdown({
  options,
  selectedValue,
  onSelect,
  placeholder = "Ölçüm yeri ara...",
  className = "",
  loading = false
}: MeasurementLocationDropdownProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentOption = options.find(option => option.value === selectedValue)

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
        setSearchTerm("")
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelect = (value: string) => {
    onSelect(value)
    setIsDropdownOpen(false)
    setSearchTerm("")
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={loading || options.length === 0}
          className="flex items-center space-x-2 text-sm font-bold text-gray-900 hover:text-gray-700 transition-colors disabled:opacity-50"
        >
          <span>
            {loading ? "Yükleniyor..." :
             options.length === 0 ? "Ölçüm yeri yok" :
             (currentOption?.name || "Ölçüm yeri seçin")}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isDropdownOpen && !loading && options.length > 0 && (
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[280px] max-w-[320px]">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input
                  type="text"
                  placeholder={placeholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-32 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleSelect(option.value)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                      selectedValue === option.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <div className="font-medium">{option.name}</div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-gray-500 text-center">
                  Sonuç bulunamadı
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}