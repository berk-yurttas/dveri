import React from 'react'
import { createPortal } from 'react-dom'
import { Filter, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { QueryData, QueryResult, FilterData } from './types'
import { RowColorRule } from '@/types/reports'

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

// Table filter input component with local state and Apply/Clear buttons
const TableFilterInput = React.memo<{
  filter: any
  queryId: string
  filters: any
  dropdownOptions: any
  onFilterChange: (fieldName: string, value: any) => void
  setOpenPopovers: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  allFilters: any[]
  onLoadMore?: (filterKey: string) => void
  onSearch?: (filterKey: string, search: string) => void
}>(function TableFilterInput({ filter, queryId, filters, dropdownOptions, onFilterChange, setOpenPopovers, allFilters, onLoadMore, onSearch }) {
  const filterKey = `${queryId}_${filter.fieldName}`

  // Initialize local values from current filter state
  const initializeLocalValue = () => {
    const storedValue = filters[filterKey]
    if (filter.type === 'multiselect' && Array.isArray(storedValue)) {
      return storedValue.join(', ')
    }
    return storedValue || ''
  }

  const [localValue, setLocalValue] = React.useState<any>(initializeLocalValue())
  const [localOperator, setLocalOperator] = React.useState<string>(filters[`${filterKey}_operator`] || (filter.type === 'text' ? 'CONTAINS' : '='))
  const [localStartDate, setLocalStartDate] = React.useState<string>(filters[`${filterKey}_start`] || '')
  const [localEndDate, setLocalEndDate] = React.useState<string>(filters[`${filterKey}_end`] || '')
  const [searchTerm, setSearchTerm] = React.useState('')

  // Dependent filters always show options; parent values are handled upstream when fetching options

  // Get dropdown options
  const dropdownData = dropdownOptions[filterKey] || { options: [], page: 1, hasMore: false, total: 0, loading: false }
  const options = dropdownData.options
  const filteredOptions = filter.type === 'multiselect' ? options : []

  // Debounced search
  const searchTimeoutRef = React.useRef<NodeJS.Timeout>(null)
  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    if (onSearch && filter.type === 'multiselect') {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = setTimeout(() => {
        onSearch(filterKey, value)
      }, 300)
    }
  }

  // Sync local state when filter values change externally
  React.useEffect(() => {
    const storedValue = filters[filterKey]
    if (filter.type === 'multiselect' && Array.isArray(storedValue)) {
      setLocalValue(storedValue.join(', '))
    } else if (storedValue !== undefined) {
      setLocalValue(storedValue || '')
    }

    const storedOperator = filters[`${filterKey}_operator`]
    if (storedOperator) {
      setLocalOperator(storedOperator)
    }

    const storedStartDate = filters[`${filterKey}_start`]
    if (storedStartDate !== undefined) {
      setLocalStartDate(storedStartDate || '')
    }

    const storedEndDate = filters[`${filterKey}_end`]
    if (storedEndDate !== undefined) {
      setLocalEndDate(storedEndDate || '')
    }
  }, [filters[filterKey], filters[`${filterKey}_operator`], filters[`${filterKey}_start`], filters[`${filterKey}_end`], filter.type, filterKey])

  const handleApply = () => {
    if (filter.type === 'date') {
      onFilterChange(`${filter.fieldName}_start`, localStartDate)
      onFilterChange(`${filter.fieldName}_end`, localEndDate)
    } else {
      // For multiselect, convert comma-separated string to array
      let valueToStore = localValue
      if (filter.type === 'multiselect' && localValue) {
        valueToStore = localValue.split(',').map((v: string) => v.trim()).filter((v: string) => v !== '')
      }

      // Store operator first for text/number filters (before value to ensure it's available)
      if (filter.type === 'text' || filter.type === 'number') {
        onFilterChange(`${filter.fieldName}_operator`, localOperator)
      }

      // Then store the value (this will trigger query execution)
      onFilterChange(filter.fieldName, valueToStore)
    }

    // Close popover after a small delay to ensure all state updates complete
    setTimeout(() => setOpenPopovers({}), 50)
  }

  const handleClear = () => {
    setLocalValue('')
    setLocalOperator(filter.type === 'text' ? 'CONTAINS' : '=')
    setLocalStartDate('')
    setLocalEndDate('')
    setSearchTerm('')

    if (filter.type === 'date') {
      onFilterChange(`${filter.fieldName}_start`, '')
      onFilterChange(`${filter.fieldName}_end`, '')
    } else {
      // Clear operator first for text/number filters
      if (filter.type === 'text' || filter.type === 'number') {
        onFilterChange(`${filter.fieldName}_operator`, '')
      }
      // Then clear the value (this will trigger query execution)
      onFilterChange(filter.fieldName, filter.type === 'multiselect' ? [] : '')
    }

    // Close popover after a small delay to ensure all state updates complete
    setTimeout(() => setOpenPopovers({}), 50)
  }

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      {filter.type === 'text' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Operatör</label>
            <select
              value={localOperator}
              onChange={(e) => setLocalOperator(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {TEXT_FILTER_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>
                  {op.icon} {op.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">{filter.displayName}</label>
            <input
              type="text"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              placeholder={`${filter.displayName} ara...`}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
          </div>
        </div>
      )}

      {filter.type === 'number' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Operatör</label>
            <select
              value={localOperator}
              onChange={(e) => setLocalOperator(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {NUMBER_FILTER_OPERATORS.map(op => (
                <option key={op.value} value={op.value}>
                  {op.icon} {op.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">{filter.displayName}</label>
            <input
              type="number"
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              placeholder="Değer..."
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
          </div>
        </div>
      )}

      {filter.type === 'date' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Başlangıç</label>
            <input
              type="date"
              value={localStartDate}
              onChange={(e) => setLocalStartDate(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Bitiş</label>
            <input
              type="date"
              value={localEndDate}
              onChange={(e) => setLocalEndDate(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      {filter.type === 'dropdown' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">{filter.displayName}</label>

          <div className="max-h-48 overflow-y-auto border border-gray-300 rounded">
            <div
              onClick={(e) => {
                e.stopPropagation()
                setLocalValue('')
              }}
              className={`px-3 py-2 text-xs hover:bg-orange-50 cursor-pointer ${localValue === '' ? 'bg-orange-100 font-medium' : ''}`}
            >
              Tümü
            </div>
            {options.map((option: any, idx: number) => (
              <div
                key={idx}
                onClick={(e) => {
                  e.stopPropagation()
                  setLocalValue(option.value)
                }}
                className={`px-3 py-2 text-xs hover:bg-orange-50 cursor-pointer ${localValue === option.value ? 'bg-orange-100 font-medium' : ''}`}
              >
                {option.label}
              </div>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">Seçenekler yükleniyor...</div>
            )}
          </div>
        </div>
      )}

      {filter.type === 'multiselect' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">{filter.displayName}</label>

          <div className="space-y-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Ara..."
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
              autoFocus
            />
            <div
              className="max-h-48 overflow-y-auto border border-gray-300 rounded p-2 space-y-1"
              onScroll={(e) => {
                const target = e.target as HTMLDivElement
                const bottom = target.scrollHeight - target.scrollTop === target.clientHeight
                if (bottom && dropdownData.hasMore && !dropdownData.loading && onLoadMore) {
                  onLoadMore(filterKey)
                }
              }}
            >
              {filteredOptions.length === 0 && !dropdownData.loading ? (
                <div className="px-2 py-1 text-xs text-gray-500">
                  {options.length === 0 ? 'Seçenek yok' : 'Sonuç bulunamadı'}
                </div>
              ) : (
                <>
                  {filteredOptions.map((option: any, idx: number) => {
                    const selectedValues = localValue ? localValue.split(',').map((v: string) => v.trim()) : []
                    const isChecked = selectedValues.includes(option.value)

                    return (
                      <label
                        key={idx}
                        className="flex items-center gap-2 hover:bg-orange-50 p-1 rounded cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (e.target.checked) {
                              const newValues = [...selectedValues, option.value]
                              setLocalValue(newValues.join(', '))
                            } else {
                              const newValues = selectedValues.filter((v: string) => v !== option.value)
                              setLocalValue(newValues.join(', '))
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3 h-3 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="text-xs">{option.label}</span>
                      </label>
                    )
                  })}
                  {dropdownData.loading && (
                    <div className="px-2 py-1 text-xs text-gray-500 text-center">Yükleniyor...</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleClear()
          }}
          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          Temizle
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleApply()
          }}
          className="flex-1 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
        >
          Uygula
        </button>
      </div>
    </div>
  )
})

// Helper function to evaluate row color rules and return text color
const getRowTextColor = (
  row: any[],
  columns: string[],
  rules?: RowColorRule[]
): string | undefined => {
  if (!rules || rules.length === 0) return undefined

  for (const rule of rules) {
    const columnIndex = columns.indexOf(rule.columnName)
    if (columnIndex === -1) continue

    const cellValue = row[columnIndex]
    const ruleValue = typeof rule.value === 'string' ? parseFloat(rule.value) : rule.value
    const numericCellValue = typeof cellValue === 'string' ? parseFloat(cellValue) : cellValue

    // Evaluate condition based on operator
    let matches = false
    switch (rule.operator) {
      case '>':
        matches = numericCellValue > ruleValue
        break
      case '<':
        matches = numericCellValue < ruleValue
        break
      case '>=':
        matches = numericCellValue >= ruleValue
        break
      case '<=':
        matches = numericCellValue <= ruleValue
        break
      case '=':
        matches = numericCellValue === ruleValue
        break
      case '!=':
        matches = numericCellValue !== ruleValue
        break
    }

    if (matches) return rule.color
  }

  return undefined
}

interface TableVisualizationProps {
  query: QueryData
  result: QueryResult
  // Sorting props
  sorting: { column: string; direction: 'asc' | 'desc' } | null
  onColumnSort: (column: string) => void
  // Filter props
  filters: { [key: string]: any }
  openPopovers: { [key: string]: boolean }
  dropdownOptions: { [key: string]: { options: Array<{ value: any; label: string }>, page: number, hasMore: boolean, total: number, loading: boolean } }
  onFilterChange: (fieldName: string, value: any) => void
  onDebouncedFilterChange: (fieldName: string, value: any) => void
  setOpenPopovers: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  onLoadMoreOptions?: (filterKey: string) => void
  onSearchOptions?: (filterKey: string, search: string) => void
  // Pagination props
  currentPage: number
  pageSize: number
  totalPages: number
  totalRows: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  // Size prop for font sizes
  size?: 'sm' | 'md' | 'lg'
}

export const TableVisualization: React.FC<TableVisualizationProps> = ({
  query,
  result,
  sorting,
  onColumnSort,
  filters,
  openPopovers,
  dropdownOptions,
  onFilterChange,
  onDebouncedFilterChange,
  setOpenPopovers,
  onLoadMoreOptions,
  onSearchOptions,
  currentPage,
  pageSize = 200,
  totalPages,
  totalRows,
  onPageChange,
  onPageSizeChange,
  size = 'sm',
}) => {
  const { columns, data } = result

  // Size-based classes
  const sizeClasses = {
    sm: { text: 'text-xs', padding: 'px-3 py-1.5', cellPadding: 'px-3 py-2' },
    md: { text: 'text-sm', padding: 'px-4 py-2', cellPadding: 'px-4 py-2.5' },
    lg: { text: 'text-base', padding: 'px-4 py-2.5', cellPadding: 'px-4 py-3' },
  }
  const currentSize = sizeClasses[size]

  const [filterPositions, setFilterPositions] = React.useState<Record<string, { top: number; left: number }>>({})

  React.useEffect(() => {
    setFilterPositions(prev => {
      const updated = { ...prev }
      Object.keys(prev).forEach(key => {
        if (!openPopovers[key]) {
          delete updated[key]
        }
      })
      return updated
    })
  }, [openPopovers])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '200px'
    }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="w-full border-collapse relative">
          <thead className="sticky top-0 z-10 relative">
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col, index) => {
                // Find if there's a filter for this column
                const filter = query.filters.find(f => f.fieldName === col)
                const isSorted = sorting?.column === col

              return (
                <th key={index} className={`${currentSize.padding} text-left font-semibold text-gray-800 ${currentSize.text} relative`}>
                  <div className="flex items-center justify-between">
                    {/* Sortable column header */}
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded flex-1"
                      onClick={() => onColumnSort(col)}
                    >
                      <span>{col}</span>
                      <div className="flex flex-col">
                        {isSorted ? (
                          sorting.direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-orange-600" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-orange-600" />
                          )
                        ) : (
                          <div className="flex flex-col">
                            <ArrowUp className="h-2 w-2 text-gray-300" />
                            <ArrowDown className="h-2 w-2 text-gray-300 -mt-1" />
                          </div>
                        )}
                      </div>
                    </div>

                      {/* Filter button */}
                      {filter && (
                        <div>
                          <div
                            className="cursor-pointer hover:bg-gray-100 p-1 rounded"
                            onClick={async (e) => {
                              e.stopPropagation()
                              const currentKey = `${query.id}_${col}`
                              const isCurrentlyOpen = !!openPopovers[currentKey]

                              if (isCurrentlyOpen) {
                                // Closing
                                setFilterPositions(prev => {
                                  const updated = { ...prev }
                                  delete updated[currentKey]
                                  return updated
                                })
                                setOpenPopovers({})
                              } else {
                                // Opening - get rect BEFORE async operations
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()

                                // Reload options for dropdown/multiselect
                                if ((filter.type === 'dropdown' || filter.type === 'multiselect') && onSearchOptions) {
                                  const filterKey = `${query.id}_${filter.fieldName}`
                                  await onSearchOptions(filterKey, '')
                                }

                                setFilterPositions(prev => ({
                                  ...prev,
                                  [currentKey]: {
                                    top: rect.bottom + 4,
                                    left: rect.left
                                  }
                                }))
                                setOpenPopovers({ [currentKey]: true })
                              }
                            }}
                          >
                            <Filter className={`h-3 w-3 ${(() => {
                              // Check if filter is active
                              if (filter.type === 'date') {
                                return filters[`${query.id}_${filter.fieldName}_start`] || filters[`${query.id}_${filter.fieldName}_end`]
                                  ? 'text-orange-600' : 'text-gray-400'
                              } else if (filter.type === 'multiselect') {
                                const value = filters[`${query.id}_${filter.fieldName}`]
                                return (Array.isArray(value) && value.length > 0) ? 'text-orange-600' : 'text-gray-400'
                              } else {
                                return filters[`${query.id}_${filter.fieldName}`] ? 'text-orange-600' : 'text-gray-400'
                              }
                            })()}`} />
                          </div>

                          {openPopovers[`${query.id}_${col}`] && typeof document !== 'undefined' && (() => {
                            const filterKey = `${query.id}_${col}`
                            const position = filterPositions[filterKey]
                            if (!position) return null

                            const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
                            const popoverWidth = 256
                            const adjustedLeft = position.left + popoverWidth > viewportWidth - 16
                              ? Math.max(16, viewportWidth - popoverWidth - 16)
                              : position.left

                            return createPortal(
                              <div
                                className="fixed w-64 p-4 bg-white border border-gray-200 rounded-md shadow-lg z-[10000]"
                                style={{ top: position.top, left: adjustedLeft }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <TableFilterInput
                                  filter={filter}
                                  queryId={query.id.toString()}
                                  filters={filters}
                                  dropdownOptions={dropdownOptions}
                                  onFilterChange={onFilterChange}
                                  setOpenPopovers={setOpenPopovers}
                                  allFilters={query.filters}
                                  onLoadMore={onLoadMoreOptions}
                                  onSearch={onSearchOptions}
                                />
                              </div>,
                              document.body
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row, rowIndex) => {
              // Calculate row text color based on rules
              const rowTextColor = getRowTextColor(row, columns, query.visualization.chartOptions?.rowColorRules)

              return (
                <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                  {row.map((cell, cellIndex) => {
                    const cellValue = cell?.toString() || ''
                    const displayValue = cellValue.length > 50 ? cellValue.substring(0, 50) + '...' : cellValue
                    const showTooltip = cellValue.length > 50

                    // Insert line break every 50 characters
                    const formatTooltipText = (text: string) => {
                      const chunks = []
                      for (let i = 0; i < text.length; i += 50) {
                        chunks.push(text.substring(i, i + 50))
                      }
                      return chunks.join('\n')
                    }

                  return (
                    <td key={cellIndex} className={`${currentSize.cellPadding} ${currentSize.text} whitespace-nowrap`} style={{ color: rowTextColor || '#1f2937' }}>
                      {showTooltip ? (
                        <div className="relative group">
                          <span className="cursor-help">{displayValue}</span>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 max-w-xs whitespace-pre-wrap">
                            {formatTooltipText(cellValue)}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ) : (
                        <span>{displayValue}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      {/* Pagination Controls */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center flex-wrap gap-3 flex-shrink-0">
        <div className="text-xs text-gray-600">
          {((currentPage - 1) * pageSize + 1)}-{Math.min(currentPage * pageSize, totalRows)} / {totalRows}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600">Sayfa:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>

            <div className="flex items-center gap-1">
              {(() => {
                const pages = []
                const maxVisiblePages = 5
                let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
                let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

                if (endPage - startPage + 1 < maxVisiblePages) {
                  startPage = Math.max(1, endPage - maxVisiblePages + 1)
                }

                if (startPage > 1) {
                  pages.push(
                    <button
                      key={1}
                      onClick={() => onPageChange(1)}
                      className="px-2 py-1 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      1
                    </button>
                  )
                  if (startPage > 2) {
                    pages.push(<span key="ellipsis1" className="px-1 text-xs text-gray-500">...</span>)
                  }
                }

                for (let i = startPage; i <= endPage; i++) {
                  pages.push(
                    <button
                      key={i}
                      onClick={() => onPageChange(i)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${i === currentPage
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                      {i}
                    </button>
                  )
                }

                if (endPage < totalPages) {
                  if (endPage < totalPages - 1) {
                    pages.push(<span key="ellipsis2" className="px-1 text-xs text-gray-500">...</span>)
                  }
                  pages.push(
                    <button
                      key={totalPages}
                      onClick={() => onPageChange(totalPages)}
                      className="px-2 py-1 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {totalPages}
                    </button>
                  )
                }

                return pages
              })()}
            </div>

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

