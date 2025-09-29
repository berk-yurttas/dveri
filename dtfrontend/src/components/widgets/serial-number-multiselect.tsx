"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, Search, X, Check } from "lucide-react"

interface SerialNumberOption {
  teu_id: number | null
  product_id: number
  product_name: string
  serial_number: string
  additional_info?: string
}

interface SerialNumberMultiselectProps {
  options: SerialNumberOption[]
  selectedValues: string[]
  onSelect: (serialNumbers: string[]) => void
  placeholder?: string
  className?: string
  loading?: boolean
  maxSelections?: number
}

export function SerialNumberMultiselect({
  options,
  selectedValues,
  onSelect,
  placeholder = "Seri no seçin...",
  className = "",
  loading = false,
  maxSelections = 10
}: SerialNumberMultiselectProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (option.additional_info && option.additional_info.toLowerCase().includes(searchTerm.toLowerCase()))
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

  const handleToggleSelection = (serialNumber: string) => {
    const isSelected = selectedValues.includes(serialNumber)
    let newSelection: string[]

    if (isSelected) {
      // Remove from selection
      newSelection = selectedValues.filter(sn => sn !== serialNumber)
    } else {
      // Add to selection (check max limit)
      if (selectedValues.length >= maxSelections) {
        return // Don't add if max reached
      }
      newSelection = [...selectedValues, serialNumber]
    }

    onSelect(newSelection)
  }

  const handleRemoveSelection = (serialNumber: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const newSelection = selectedValues.filter(sn => sn !== serialNumber)
    onSelect(newSelection)
  }

  const handleClearAll = (event: React.MouseEvent) => {
    event.stopPropagation()
    onSelect([])
  }

  const getDisplayText = () => {
    if (loading) return "Yükleniyor..."
    if (options.length === 0) return "Seri no yok"
    if (selectedValues.length === 0) return placeholder
    if (selectedValues.length === 1) return selectedValues[0]
    return `${selectedValues.length} seri no seçili`
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          disabled={loading || options.length === 0}
          className="flex items-center space-x-2 text-sm font-bold text-gray-900 hover:text-gray-700 transition-colors disabled:opacity-50 min-w-[120px]"
        >
          <span className="truncate max-w-[100px]">
            {getDisplayText()}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isDropdownOpen && !loading && options.length > 0 && (
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[320px] max-w-[400px]">
            {/* Header with search and clear */}
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center space-x-2 mb-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Seri no ara..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                {selectedValues.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                  >
                    Temizle
                  </button>
                )}
              </div>
              
              {/* Selected items display */}
              {selectedValues.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {selectedValues.map((serialNumber) => (
                    <div
                      key={serialNumber}
                      className="flex items-center space-x-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs"
                    >
                      <span className="truncate max-w-[80px]">{serialNumber}</span>
                      <button
                        onClick={(e) => handleRemoveSelection(serialNumber, e)}
                        className="hover:bg-blue-200 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Selection counter */}
              <div className="text-xs text-gray-500 mt-1">
                {selectedValues.length}/{maxSelections} seçili
              </div>
            </div>
            
            {/* Options */}
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => {
                  const isSelected = selectedValues.includes(option.serial_number)
                  const isDisabled = !isSelected && selectedValues.length >= maxSelections
                  
                  return (
                    <button
                      key={option.teu_id || index}
                      onClick={() => !isDisabled && handleToggleSelection(option.serial_number)}
                      disabled={isDisabled}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center space-x-2 ${
                        isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{option.serial_number}</div>
                        {option.additional_info && option.additional_info !== "Product exists but no TEU records found" && (
                          <div className="text-gray-500 text-xs mt-1 truncate">{option.additional_info}</div>
                        )}
                      </div>
                    </button>
                  )
                })
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
