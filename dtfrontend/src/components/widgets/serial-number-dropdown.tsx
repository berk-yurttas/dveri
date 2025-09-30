"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, Search } from "lucide-react"

interface SerialNumberOption {
  teu_id: number | null
  product_id: number
  product_name: string
  serial_number: string
  additional_info?: string
  firma?: string
}

interface SerialNumberDropdownProps {
  options: SerialNumberOption[]
  selectedValue: string | null
  onSelect: (serialNumber: string) => void
  placeholder?: string
  className?: string
  loading?: boolean
  firmaFilter?: string | null
  showFirma?: boolean
}

export function SerialNumberDropdown({
  options,
  selectedValue,
  onSelect,
  placeholder = "Seri no ara...",
  className = "",
  loading = false,
  firmaFilter = null,
  showFirma = false
}: SerialNumberDropdownProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentOption = options.find(option => option.serial_number === selectedValue)
  
  // Filter options based on search term and firma filter
  const filteredOptions = options.filter(option => {
    const matchesSearch = option.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (option.additional_info && option.additional_info.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (option.firma && option.firma.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesFirma = !firmaFilter || !option.firma || option.firma === firmaFilter

    return matchesSearch && matchesFirma
  })

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

  const handleSelect = (serialNumber: string) => {
    onSelect(serialNumber)
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
             options.length === 0 ? "Seri no yok" :
             (currentOption?.serial_number || "Seri no seçin")}
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
                filteredOptions.map((option, index) => (
                  <button
                    key={option.teu_id || index}
                    onClick={() => handleSelect(option.serial_number)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                      selectedValue === option.serial_number ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <div className="font-medium">{option.serial_number}</div>
                    {showFirma && option.firma && (
                      <div className="text-blue-600 text-xs mt-1 font-medium">{option.firma}</div>
                    )}
                    {option.additional_info && option.additional_info !== "Product exists but no TEU records found" && (
                      <div className="text-gray-500 text-xs mt-1">{option.additional_info}</div>
                    )}
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
