'use client'

import React from 'react'
import { Filter, X, ChevronDown, Search, RefreshCw } from 'lucide-react'

interface FilterData {
  id: number
  fieldName: string
  displayName: string
  type: 'date' | 'dropdown' | 'multiselect' | 'number' | 'text'
  dropdownQuery: string | null
  dependsOn: string | null
  required: boolean
  query_id: number
  created_at: string
  updated_at: string | null
}

interface FilterState {
  [key: string]: any
}

interface GlobalFiltersProps {
  globalFilters: FilterData[]
  filters: FilterState
  dropdownOptions: {[key: string]: {
    options: Array<{value: any, label: string}>,
    page: number,
    hasMore: boolean,
    total: number,
    loading: boolean
  }}
  searchTerms: {[key: string]: string}
  dropdownOpen: {[key: string]: boolean}
  operatorMenuOpen: {[key: string]: boolean}
  onFilterChange: (queryId: number, fieldName: string, value: any) => void
  setSearchTerms: React.Dispatch<React.SetStateAction<{[key: string]: string}>>
  setDropdownOpen: React.Dispatch<React.SetStateAction<{[key: string]: boolean}>>
  setOperatorMenuOpen: React.Dispatch<React.SetStateAction<{[key: string]: boolean}>>
  onApplyFilters: () => void
}

const TEXT_FILTER_OPERATORS = [
  { value: 'CONTAINS', label: 'İçerir', icon: '⊃' },
  { value: 'NOT_CONTAINS', label: 'İçermez', icon: '⊅' },
  { value: 'STARTS_WITH', label: 'Ile Başlar', icon: '⊢' },
  { value: 'ENDS_WITH', label: 'Ile Biter', icon: '⊣' },
  { value: '=', label: 'Eşittir', icon: '=' },
  { value: 'NOT_EQUALS', label: 'Eşit Değildir', icon: '≠' },
]

const NUMBER_FILTER_OPERATORS = [
  { value: '=', label: 'Eşittir', icon: '=' },
  { value: 'NOT_EQUALS', label: 'Eşit Değildir', icon: '≠' },
  { value: '>', label: 'Büyüktür', icon: '>' },
  { value: '<', label: 'Küçüktür', icon: '<' },
  { value: '>=', label: 'Büyük Eşittir', icon: '≥' },
  { value: '<=', label: 'Küçük Eşittir', icon: '≤' },
]

export function GlobalFilters({
  globalFilters,
  filters,
  dropdownOptions,
  searchTerms,
  dropdownOpen,
  operatorMenuOpen,
  onFilterChange,
  setSearchTerms,
  setDropdownOpen,
  setOperatorMenuOpen,
  onApplyFilters
}: GlobalFiltersProps) {
  if (!globalFilters || globalFilters.length === 0) return null

  return (
    <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 px-4 py-2 rounded-lg shadow-sm border border-orange-200">
      <div className="flex items-center gap-2 mb-2">
        <Filter className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold text-gray-800">Filtreler</h3>
        <span className="text-xs text-gray-500">({globalFilters.length})</span>
      </div>

      <div className="bg-white p-2 rounded border border-orange-200 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          {globalFilters.map((filter, filterIndex) => (
            <div key={`global_filter_${filter.fieldName}_${filterIndex}`} className={`flex-shrink-0 ${filter.type === 'date' ? 'w-72' : 'w-48'}`}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{filter.displayName}</label>
              {filter.type === 'date' ? (
                <div className="relative flex items-center gap-1 w-full">
                  <input
                    type="date"
                    value={filters[`global_${filter.fieldName}_start`] || ''}
                    onChange={(e) => {
                      const newValue = e.target.value
                      onFilterChange(0, `global_${filter.fieldName}_start`, newValue)
                    }}
                    onClick={(e) => {
                      e.currentTarget.showPicker?.()
                    }}
                    className="flex-1 px-2 py-1 pr-6 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent cursor-pointer"
                    title="Başlangıç"
                  />
                  <span className="text-gray-500 text-xs font-medium">-</span>
                  <input
                    type="date"
                    value={filters[`global_${filter.fieldName}_end`] || ''}
                    onChange={(e) => {
                      const newValue = e.target.value
                      onFilterChange(0, `global_${filter.fieldName}_end`, newValue)
                    }}
                    onClick={(e) => {
                      e.currentTarget.showPicker?.()
                    }}
                    className="flex-1 px-2 py-1 pr-6 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent cursor-pointer"
                    title="Bitiş"
                  />
                  {(filters[`global_${filter.fieldName}_start`] || filters[`global_${filter.fieldName}_end`]) && (
                    <button
                      onClick={() => {
                        onFilterChange(0, `global_${filter.fieldName}_start`, '')
                        onFilterChange(0, `global_${filter.fieldName}_end`, '')
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded z-10"
                      title="Temizle"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : filter.type === 'dropdown' ? (
                (() => {
                  const filterKey = `0_${filter.fieldName}`
                  const searchTerm = searchTerms[filterKey] || ''
                  const dropdownData = dropdownOptions[filterKey] || { options: [], page: 1, hasMore: false, total: 0, loading: false }
                  const options = dropdownData.options
                  const filteredOptions = options.filter(opt =>
                    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  const selectedValue = filters[`global_${filter.fieldName}`] || ''
                  const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || ''
                  const isOpen = dropdownOpen[filterKey] || false

                  return (
                    <div className="relative filter-dropdown-container">
                      <button
                        type="button"
                        onClick={() => {
                          setOperatorMenuOpen({})
                          setDropdownOpen(prev => {
                            const isCurrentlyOpen = prev[filterKey]
                            return { [filterKey]: !isCurrentlyOpen }
                          })
                        }}
                        className="w-full px-2 py-1 pr-12 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-xs bg-white text-left flex items-center justify-between hover:bg-gray-50"
                      >
                        <span className={`truncate ${selectedValue ? 'text-gray-900' : 'text-gray-500'}`}>
                          {selectedValue ? selectedLabel : 'Seçin'}
                        </span>
                      </button>
                      {selectedValue && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onFilterChange(0, `global_${filter.fieldName}`, '')
                          }}
                          className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      <ChevronDown className="h-3 w-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {isOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg">
                          <div className="p-1.5 border-b border-gray-200">
                            <div className="relative">
                              <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                              <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerms(prev => ({ ...prev, [filterKey]: e.target.value }))}
                                placeholder="Ara..."
                                className="w-full pl-7 pr-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredOptions.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-gray-500">Sonuç bulunamadı</div>
                            ) : (
                              filteredOptions.map((option, index) => (
                                <div
                                  key={`globalfilter_dropdown_${filterIndex}_${filter.fieldName}_${option.value}_${index}`}
                                  onClick={() => {
                                    onFilterChange(0, `global_${filter.fieldName}`, option.value)
                                    setDropdownOpen(prev => ({ ...prev, [filterKey]: false }))
                                    setSearchTerms(prev => ({ ...prev, [filterKey]: '' }))
                                  }}
                                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-orange-50 ${
                                    option.value === selectedValue ? 'bg-orange-100 font-medium' : 'text-gray-900'
                                  }`}
                                >
                                  {option.label}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : filter.type === 'multiselect' ? (
                (() => {
                  const filterKey = `0_${filter.fieldName}`
                  const searchTerm = searchTerms[filterKey] || ''
                  const dropdownData = dropdownOptions[filterKey] || { options: [], page: 1, hasMore: false, total: 0, loading: false }
                  const options = dropdownData.options
                  const filteredOptions = options.filter(opt =>
                    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  const currentValues = Array.isArray(filters[`global_${filter.fieldName}`]) ? filters[`global_${filter.fieldName}`] : []
                  const isOpen = dropdownOpen[filterKey] || false
                  const selectedCount = currentValues.length

                  return (
                    <div className="relative filter-dropdown-container">
                      <button
                        type="button"
                        onClick={() => {
                          setOperatorMenuOpen({})
                          setDropdownOpen(prev => {
                            const isCurrentlyOpen = prev[filterKey]
                            return { [filterKey]: !isCurrentlyOpen }
                          })
                        }}
                        className="w-full px-2 py-1 pr-12 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-xs bg-white text-left flex items-center justify-between hover:bg-gray-50"
                      >
                        <span className={`truncate ${selectedCount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                          {selectedCount > 0 ? `${selectedCount} seçildi` : 'Seçin'}
                        </span>
                      </button>
                      {selectedCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onFilterChange(0, `global_${filter.fieldName}`, [])
                          }}
                          className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      <ChevronDown className="h-3 w-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {isOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg">
                          <div className="p-1.5 border-b border-gray-200">
                            <div className="relative">
                              <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                              <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerms(prev => ({ ...prev, [filterKey]: e.target.value }))}
                                placeholder="Ara..."
                                className="w-full pl-7 pr-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredOptions.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-gray-500">Sonuç bulunamadı</div>
                            ) : (
                              filteredOptions.map((option, index) => {
                                const isChecked = currentValues.includes(option.value)
                                return (
                                  <div
                                    key={`globalfilter_multiselect_${filterIndex}_${filter.fieldName}_${option.value}_${index}`}
                                    onClick={() => {
                                      let newValues
                                      if (isChecked) {
                                        newValues = currentValues.filter((v: any) => v !== option.value)
                                      } else {
                                        newValues = [...currentValues, option.value]
                                      }
                                      onFilterChange(0, `global_${filter.fieldName}`, newValues)
                                    }}
                                    className="px-3 py-2 text-xs cursor-pointer hover:bg-orange-50 flex items-center space-x-1.5"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      className="h-3 w-3 text-orange-600 focus:ring-orange-500 border-gray-300 rounded pointer-events-none"
                                    />
                                    <span>{option.label}</span>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : (
                (() => {
                  const filterKey = `global_${filter.fieldName}`
                  const operatorKey = `${filterKey}_operator`
                  const isNumberType = filter.type === 'number'
                  const availableOperators = isNumberType ? NUMBER_FILTER_OPERATORS : TEXT_FILTER_OPERATORS
                  const defaultOperator = isNumberType ? '=' : 'CONTAINS'
                  const currentOperator = filters[operatorKey] || defaultOperator
                  const operatorMenuKey = `${filterKey}_opMenu`
                  const isMenuOpen = operatorMenuOpen[operatorMenuKey] || false
                  const currentOperatorObj = availableOperators.find(op => op.value === currentOperator)
                  const currentOperatorIcon = currentOperatorObj?.icon || (isNumberType ? '=' : '⊃')

                  return (
                    <div className="relative filter-dropdown-container">
                      <div className="relative">
                        <input
                          type={isNumberType ? 'number' : 'text'}
                          value={filters[filterKey] || ''}
                          onChange={(e) => {
                            onFilterChange(0, `global_${filter.fieldName}`, e.target.value)
                          }}
                          className="w-full px-7 py-1 pr-6 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-xs"
                          placeholder="Filtrele"
                        />
                        <button
                          type="button"
                          onClick={() => setOperatorMenuOpen(prev => ({ ...prev, [operatorMenuKey]: !prev[operatorMenuKey] }))}
                          className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-600 hover:text-orange-600 hover:bg-gray-50 rounded"
                          title="Filtre koşulu"
                        >
                          <span className="text-sm font-semibold">{currentOperatorIcon}</span>
                        </button>
                        {filters[filterKey] && (
                          <button
                            onClick={() => onFilterChange(0, `global_${filter.fieldName}`, '')}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {isMenuOpen && (
                        <div className="absolute z-50 mt-1 bg-white border border-gray-300 rounded shadow-lg left-0 min-w-[180px]">
                          <div className="py-1">
                            {availableOperators.map((op, opIndex) => (
                              <div
                                key={`globalfilter_op_${filterIndex}_${filter.fieldName}_${op.value}_${opIndex}`}
                                onClick={() => {
                                  onFilterChange(0, `global_${filter.fieldName}_operator`, op.value)
                                  setOperatorMenuOpen(prev => ({ ...prev, [operatorMenuKey]: false }))
                                }}
                                className={`px-3 py-2 text-xs cursor-pointer hover:bg-gray-100 flex items-center gap-2 ${
                                  op.value === currentOperator ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-900'
                                }`}
                              >
                                <span className="text-sm font-semibold w-5">{op.icon}</span>
                                <span>{op.label}</span>
                              </div>
                            ))}
                            <div className="border-t border-gray-200 mt-1 pt-1">
                              <div
                                onClick={() => {
                                  onFilterChange(0, `global_${filter.fieldName}_operator`, defaultOperator)
                                  onFilterChange(0, `global_${filter.fieldName}`, '')
                                  setOperatorMenuOpen(prev => ({ ...prev, [operatorMenuKey]: false }))
                                }}
                                className="px-3 py-2 text-xs cursor-pointer hover:bg-gray-100 text-gray-700"
                              >
                                Sıfırla
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()
              )}
            </div>
          ))}
          <div className="flex-shrink-0">
            <button
              onClick={onApplyFilters}
              className="h-[28px] px-3 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw className="h-3 w-3" />
              Uygula
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
