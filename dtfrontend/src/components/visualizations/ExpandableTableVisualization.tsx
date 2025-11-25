import React from 'react'
import { createPortal } from 'react-dom'
import { Filter, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { QueryData, QueryResult } from './types'
import { buildDropdownQuery } from '@/utils/sqlPlaceholders'
import { reportsService } from '@/services/reports'
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

interface ExpandableTableVisualizationProps {
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
  // Expandable-specific props
  expandedRows: { [key: string]: boolean }
  nestedData: { [key: string]: { columns: string[]; data: any[]; loading: boolean; nestedQueries?: any[]; filters?: any[] } }
  nestedFilters: { [key: string]: any }
  nestedFilterPopovers: { [key: string]: boolean }
  nestedFilterPositions: { [key: string]: { top: number; left: number } }
  nestedSorting: { [rowKey: string]: { column: string; direction: 'asc' | 'desc' } | null }
  nestedPagination: { [rowKey: string]: { currentPage: number; pageSize: number } }
  setNestedFilters: React.Dispatch<React.SetStateAction<{ [key: string]: any }>>
  setNestedFilterPopovers: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  setNestedFilterPositions: React.Dispatch<React.SetStateAction<{ [key: string]: { top: number; left: number } }>>
  setNestedSorting: React.Dispatch<React.SetStateAction<{ [rowKey: string]: { column: string; direction: 'asc' | 'desc' } | null }>>
  setNestedPagination: React.Dispatch<React.SetStateAction<{ [rowKey: string]: { currentPage: number; pageSize: number } }>>
  onRowExpand: (query: QueryData, rowIndex: number, rowData: any[], nestedQueries: any[], level: number, parentRowKey: string) => void
  scale?: number
}

// Main table filter input component with local state and Apply/Clear buttons
const MainTableFilterInput = React.memo<{
  filter: any
  queryId: string
  filters: any
  dropdownOptions: any
  onFilterChange: (fieldName: string, value: any) => void
  setOpenPopovers: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>
  allFilters: any[]
  onLoadMore?: (filterKey: string) => void
  onSearch?: (filterKey: string, search: string) => void
}>(function MainTableFilterInput({ filter, queryId, filters, dropdownOptions, onFilterChange, setOpenPopovers, allFilters, onLoadMore, onSearch }) {
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

  // Check if filter depends on another filter
  const parentFilter = filter.dependsOn ? allFilters.find((f: any) => f.fieldName === filter.dependsOn) : null
  const parentValue = parentFilter ? filters[`${queryId}_${parentFilter.fieldName}`] : null
  const isParentMissing = filter.dependsOn && (!parentValue || (Array.isArray(parentValue) && parentValue.length === 0))

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

// Memoized filter input component
const NestedFilterInput = React.memo<{
  filter: any
  filterKey: string
  nestedFilters: any
  setNestedFilters: React.Dispatch<React.SetStateAction<any>>
  setNestedFilterPopovers: React.Dispatch<React.SetStateAction<any>>
  nestedData: any
  rowKey: string
  allFilters: any[]
}>(function NestedFilterInput({ filter, filterKey, nestedFilters, setNestedFilters, setNestedFilterPopovers, nestedData, rowKey, allFilters }) {
  // Initialize localValue - convert array to comma-separated string for multiselect
  const initializeLocalValue = () => {
    const storedValue = nestedFilters[filterKey]
    if (filter.type === 'multiselect' && Array.isArray(storedValue)) {
      return storedValue.join(', ')
    }
    return storedValue || ''
  }
  
  const [localValue, setLocalValue] = React.useState<any>(initializeLocalValue())
  const [localOperator, setLocalOperator] = React.useState<string>(nestedFilters[`${filterKey}_operator`] || (filter.type === 'text' ? 'CONTAINS' : '='))
  const [localStartDate, setLocalStartDate] = React.useState<string>(nestedFilters[`${filterKey}_start`] || '')
  const [localEndDate, setLocalEndDate] = React.useState<string>(nestedFilters[`${filterKey}_end`] || '')
  const [distinctValues, setDistinctValues] = React.useState<string[]>([])
  const [searchTerm, setSearchTerm] = React.useState('')
  const [loadingOptions, setLoadingOptions] = React.useState(false)

  // Check if filter depends on another filter
  const parentFilter = filter.dependsOn ? allFilters.find((f: any) => f.fieldName === filter.dependsOn) : null
  const parentFilterKey = parentFilter ? `${rowKey}_${filter.dependsOn}` : null
  const parentValue = parentFilterKey ? nestedFilters[parentFilterKey] : null
  const isParentMissing = filter.dependsOn && (!parentValue || (Array.isArray(parentValue) && parentValue.length === 0))

  // Load dropdown options from server if filter has dropdownQuery and dependsOn
  const loadDropdownOptions = React.useCallback(async () => {
    if (!filter.dropdownQuery || !filter.dependsOn) return

    setLoadingOptions(true)
    try {
      const modifiedSql = buildDropdownQuery(filter.dropdownQuery, filter.dependsOn, parentValue)

      console.log(`Loading dependent filter options for "${filter.displayName}":`, modifiedSql)
      const response = await reportsService.previewQuery({
        sql_query: modifiedSql,
        limit: 1000
      })

      if (response.success && response.data.length > 0) {
        const options = response.data.map((row: any[]) => ({
          value: row[0],
          label: row[1] || row[0]
        }))
        setDistinctValues(options.map((opt: { value: any; label: any }) => String(opt.value)))
        console.log(`Loaded ${options.length} options for "${filter.displayName}"`)
      } else {
        setDistinctValues([])
        console.log(`No options found for "${filter.displayName}"`)
      }
    } catch (error) {
      console.error(`Error loading dropdown options for "${filter.displayName}":`, error)
      setDistinctValues([])
    } finally {
      setLoadingOptions(false)
    }
  }, [filter.dropdownQuery, filter.dependsOn, parentValue])

  // Serialize parent value for dependency tracking (to handle arrays properly)
  const parentValueKey = React.useMemo(() => {
    if (!parentValue) return null
    if (Array.isArray(parentValue)) return parentValue.join('|')
    return String(parentValue)
  }, [parentValue])

  // Get distinct values for dropdown/multiselect
  React.useEffect(() => {
    if ((filter.type === 'dropdown' || filter.type === 'multiselect')) {
      // If filter has dropdownQuery and dependsOn, load from server
      if (filter.dropdownQuery && filter.dependsOn) {
        loadDropdownOptions()
      } 
      // Otherwise, extract from client-side nested data
      else if (nestedData) {
        const nested = nestedData[rowKey]
        if (nested?.data && nested?.columns) {
          // Find the column index for this filter
          const columnIndex = nested.columns.indexOf(filter.fieldName)
          if (columnIndex !== -1) {
            // Extract unique values from this column
            const values = new Set<string>()
            nested.data.forEach((row: any[]) => {
              const value = row[columnIndex]
              if (value !== null && value !== undefined && value !== '') {
                values.add(String(value))
              }
            })
            setDistinctValues(Array.from(values).sort())
          }
        }
      }
    }
  }, [filter.type, filter.fieldName, filter.dropdownQuery, filter.dependsOn, nestedData, rowKey, loadDropdownOptions, parentValueKey])

  // Clear local value when parent filter changes
  React.useEffect(() => {
    if (filter.dependsOn && !parentValue) {
      setLocalValue('')
    }
  }, [parentValue, filter.dependsOn])
  
  // Sync local value when filter value changes externally (e.g., from Clear button or Apply)
  React.useEffect(() => {
    const storedValue = nestedFilters[filterKey]
    if (filter.type === 'multiselect' && Array.isArray(storedValue)) {
      setLocalValue(storedValue.join(', '))
    } else if (storedValue !== undefined) {
      setLocalValue(storedValue || '')
    }
  }, [nestedFilters[filterKey], filter.type, filterKey])
  
  // Sync local operator when it changes externally
  React.useEffect(() => {
    const storedOperator = nestedFilters[`${filterKey}_operator`]
    if (storedOperator) {
      setLocalOperator(storedOperator)
    }
  }, [nestedFilters[`${filterKey}_operator`], filterKey])

  const handleApply = () => {
    if (filter.type === 'date') {
      setNestedFilters((prev: Record<string, any>) => ({
        ...prev,
        [`${filterKey}_start`]: localStartDate,
        [`${filterKey}_end`]: localEndDate
      }))
    } else {
      setNestedFilters((prev: Record<string, any>) => {
        // For multiselect, convert comma-separated string to array
        let valueToStore = localValue
        if (filter.type === 'multiselect' && localValue) {
          valueToStore = localValue.split(',').map((v: string) => v.trim()).filter((v: string) => v !== '')
        }
        
        const newFilters = {
        ...prev,
        [filterKey]: valueToStore
        }
        
        // Store operator for text/number filters
        if (filter.type === 'text' || filter.type === 'number') {
          newFilters[`${filterKey}_operator`] = localOperator
        }
        
        // Clear dependent filters when this filter changes
        if (filter.type === 'dropdown' || filter.type === 'multiselect') {
          allFilters.forEach((f: any) => {
            if (f.dependsOn === filter.fieldName) {
              const dependentKey = `${rowKey}_${f.fieldName}`
              delete newFilters[dependentKey]
            }
          })
        }
        
        return newFilters
      })
    }
    setNestedFilterPopovers((prev: Record<string, any>) => ({ ...prev, [filterKey]: false }))
  }

  const handleClear = () => {
    setLocalValue('')
    setLocalOperator(filter.type === 'text' ? 'CONTAINS' : '=')
    setLocalStartDate('')
    setLocalEndDate('')
    setNestedFilters((prev: Record<string, any>) => {
      const newFilters = { ...prev }
      if (filter.type === 'date') {
        delete newFilters[`${filterKey}_start`]
        delete newFilters[`${filterKey}_end`]
      } else {
        delete newFilters[filterKey]
        // Also clear operator for text/number filters
        if (filter.type === 'text' || filter.type === 'number') {
          delete newFilters[`${filterKey}_operator`]
        }
      }
      
      // Clear dependent filters when this filter is cleared
      if (filter.type === 'dropdown' || filter.type === 'multiselect') {
        allFilters.forEach((f: any) => {
          if (f.dependsOn === filter.fieldName) {
            const dependentKey = `${rowKey}_${f.fieldName}`
            delete newFilters[dependentKey]
          }
        })
      }
      
      return newFilters
    })
    setNestedFilterPopovers((prev: Record<string, any>) => ({ ...prev, [filterKey]: false }))
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
          {loadingOptions ? (
            <div className="text-xs text-gray-500 py-2">Seçenekler yükleniyor...</div>
          ) : distinctValues.length > 0 ? (
            <div className="space-y-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Ara..."
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto border border-gray-300 rounded">
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    setLocalValue('')
                    setSearchTerm('')
                  }}
                  className={`px-3 py-2 text-xs hover:bg-orange-50 cursor-pointer ${localValue === '' ? 'bg-orange-100 font-medium' : ''}`}
                >
                  Tümü
                </div>
                {distinctValues
                  .filter(value => value.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((value, index) => (
                    <div
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation()
                        setLocalValue(value)
                        setSearchTerm('')
                      }}
                      className={`px-3 py-2 text-xs hover:bg-orange-50 cursor-pointer ${localValue === value ? 'bg-orange-100 font-medium' : ''}`}
                    >
                      {value}
                    </div>
                  ))}
                {distinctValues.filter(value => value.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs py-2 text-gray-500">
              Veri yükleniyor veya değer bulunamadı
            </div>
          )}
        </div>
      )}

      {filter.type === 'multiselect' && (
        <div>
          <label className="block text-xs text-gray-600 mb-1">{filter.displayName}</label>
          {loadingOptions ? (
            <div className="text-xs text-gray-500 py-2">Seçenekler yükleniyor...</div>
          ) : distinctValues.length > 0 ? (
            <div className="space-y-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Ara..."
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto border border-gray-300 rounded p-2 space-y-1">
                {distinctValues
                  .filter(value => value.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((value, index) => {
                    const selectedValues = localValue ? localValue.split(',').map((v: string) => v.trim()) : []
                    const isChecked = selectedValues.includes(value)
                    
                    return (
                      <label 
                        key={index} 
                        className="flex items-center gap-2 hover:bg-orange-50 p-1 rounded cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (e.target.checked) {
                              const newValues = [...selectedValues, value]
                              setLocalValue(newValues.join(', '))
                            } else {
                              const newValues = selectedValues.filter((v: string) => v !== value)
                              setLocalValue(newValues.join(', '))
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3 h-3 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        <span className="text-xs">{value}</span>
                      </label>
                    )
                  })}
                {distinctValues.filter(value => value.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                  <div className="px-2 py-1 text-xs text-gray-500">Sonuç bulunamadı</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs py-2 text-gray-500">
              Veri yükleniyor veya değer bulunamadı
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
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
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders during selection
  // Only re-render if these specific values actually change
  
  // Always re-render if filter or filterKey changed
  if (prevProps.filter !== nextProps.filter || 
      prevProps.filterKey !== nextProps.filterKey || 
      prevProps.rowKey !== nextProps.rowKey) {
    return false
  }
  
  // Check if this filter's value changed (after Apply was clicked)
  const prevFilterValue = prevProps.nestedFilters[prevProps.filterKey]
  const nextFilterValue = nextProps.nestedFilters[nextProps.filterKey]
  // Handle array comparison for multiselect
  if (Array.isArray(prevFilterValue) && Array.isArray(nextFilterValue)) {
    if (prevFilterValue.length !== nextFilterValue.length ||
        !prevFilterValue.every((val, idx) => val === nextFilterValue[idx])) {
      return false
    }
  } else if (prevFilterValue !== nextFilterValue) {
    return false
  }
  
  // Check date filter values
  if (prevProps.nestedFilters[`${prevProps.filterKey}_start`] !== nextProps.nestedFilters[`${nextProps.filterKey}_start`] ||
      prevProps.nestedFilters[`${prevProps.filterKey}_end`] !== nextProps.nestedFilters[`${nextProps.filterKey}_end`]) {
    return false
  }
  
  // For dependent filters, check if parent value changed
  if (prevProps.filter.dependsOn) {
    const prevParentValue = prevProps.nestedFilters[`${prevProps.rowKey}_${prevProps.filter.dependsOn}`]
    const nextParentValue = nextProps.nestedFilters[`${nextProps.rowKey}_${nextProps.filter.dependsOn}`]
    // Handle array comparison for multiselect parents
    if (Array.isArray(prevParentValue) && Array.isArray(nextParentValue)) {
      if (prevParentValue.length !== nextParentValue.length ||
          !prevParentValue.every((val, idx) => val === nextParentValue[idx])) {
        return false
      }
    } else if (prevParentValue !== nextParentValue) {
      return false
    }
  }
  
  // For dropdown/multiselect with dropdownQuery, check if nested data changed (for client-side distinct values)
  if ((prevProps.filter.type === 'dropdown' || prevProps.filter.type === 'multiselect') && 
      !prevProps.filter.dropdownQuery) {
    const prevNested = prevProps.nestedData[prevProps.rowKey]
    const nextNested = nextProps.nestedData[nextProps.rowKey]
    if (prevNested?.data !== nextNested?.data) {
      return false
    }
  }
  
  // Otherwise, don't re-render
  return true
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

export const ExpandableTableVisualization: React.FC<ExpandableTableVisualizationProps> = ({
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
  pageSize,
  totalPages,
  totalRows,
  onPageChange,
  onPageSizeChange,
  expandedRows,
  nestedData,
  nestedFilters,
  nestedFilterPopovers,
  nestedFilterPositions,
  nestedSorting,
  nestedPagination,
  setNestedFilters,
  setNestedFilterPopovers,
  setNestedFilterPositions,
  setNestedSorting,
  setNestedPagination,
  onRowExpand,
  scale = 1,
}) => {
  const { columns, data } = result

  const [mainFilterPositions, setMainFilterPositions] = React.useState<Record<string, { top: number; left: number }>>({})

  React.useEffect(() => {
    setMainFilterPositions(prev => {
      const updated = { ...prev }
      Object.keys(prev).forEach(key => {
        if (!openPopovers[key]) {
          delete updated[key]
        }
      })
      return updated
    })
  }, [openPopovers])

  // Helper function to filter and sort nested rows
  const getFilteredNestedRowsWithIndex = (rowKey: string, nested: { columns: string[], data: any[], filters?: any[] }) => {
    const columns = nested.columns
    const filtersForRow = nested.filters || []

    // Filter rows
    let filteredRows = (nested.data || []).map((row: any[], index: number) => ({ row, index })).filter(({ row }) => {
      return filtersForRow.every((f: any) => {
        const colIndex = columns.indexOf(f.fieldName)
        if (colIndex === -1) return true
        const cellValue = row[colIndex]
        const filterKey = `${rowKey}_${f.fieldName}`
        if (f.type === 'text') {
          const val = (nestedFilters[filterKey] || '').toString()
          if (!val) return true
          const operator = nestedFilters[`${filterKey}_operator`] || 'CONTAINS'
          const cellStr = (cellValue ?? '').toString().toLowerCase()
          const valLower = val.toLowerCase()
          
          switch (operator) {
            case 'CONTAINS':
              return cellStr.includes(valLower)
            case 'NOT_CONTAINS':
              return !cellStr.includes(valLower)
            case 'STARTS_WITH':
              return cellStr.startsWith(valLower)
            case 'ENDS_WITH':
              return cellStr.endsWith(valLower)
            case '=':
              return cellStr === valLower
            case 'NOT_EQUALS':
              return cellStr !== valLower
            default:
              return cellStr.includes(valLower)
          }
        }
        if (f.type === 'number') {
          const val = nestedFilters[filterKey]
          if (val === undefined || val === '' || val === null) return true
          const operator = nestedFilters[`${filterKey}_operator`] || '='
          const cellNum = Number(cellValue)
          const valNum = Number(val)
          
          switch (operator) {
            case '=':
              return cellNum === valNum
            case 'NOT_EQUALS':
              return cellNum !== valNum
            case '>':
              return cellNum > valNum
            case '<':
              return cellNum < valNum
            case '>=':
              return cellNum >= valNum
            case '<=':
              return cellNum <= valNum
            default:
              return cellNum === valNum
          }
        }
        if (f.type === 'date') {
          const start = nestedFilters[`${filterKey}_start`]
          const end = nestedFilters[`${filterKey}_end`]
          if (!start && !end) return true
          const dateOnly = (d: any) => new Date(d).setHours(0,0,0,0)
          const cellTime = dateOnly(cellValue)
          if (start && end) return cellTime >= dateOnly(start) && cellTime <= dateOnly(end)
          if (start) return cellTime >= dateOnly(start)
          if (end) return cellTime <= dateOnly(end)
          return true
        }
        if (f.type === 'dropdown' || f.type === 'multiselect') {
          const val = nestedFilters[filterKey]
          if (!val || (Array.isArray(val) && val.length === 0)) return true
          if (Array.isArray(val)) return val.includes(cellValue)
          return cellValue === val
        }
        return true
      })
    })

    // Apply sorting if exists
    const sortConfig = nestedSorting[rowKey]
    if (sortConfig) {
      const sortColIndex = columns.indexOf(sortConfig.column)
      if (sortColIndex !== -1) {
        filteredRows.sort((a, b) => {
          const aVal = a.row[sortColIndex]
          const bVal = b.row[sortColIndex]

          // Handle null/undefined values
          if (aVal == null && bVal == null) return 0
          if (aVal == null) return 1
          if (bVal == null) return -1

          // Try numeric comparison first
          const aNum = Number(aVal)
          const bNum = Number(bVal)
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum
          }

          // String comparison
          const aStr = String(aVal).toLowerCase()
          const bStr = String(bVal).toLowerCase()
          if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1
          if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1
          return 0
        })
      }
    }

    return filteredRows
  }

  // Nested Table Renderer Component (Recursive)
  const NestedTableRenderer = ({
    rowKey,
    nested,
    level,
  }: {
    rowKey: string
    nested: any
    level: number
  }) => {
    const bgColors = ['bg-blue-50/50', 'bg-indigo-50/50', 'bg-purple-50/50', 'bg-pink-50/50']
    const borderColors = ['border-blue-500', 'border-indigo-500', 'border-purple-500', 'border-pink-500']
    const textColors = ['text-blue-900', 'text-indigo-900', 'text-purple-900', 'text-pink-900']
    const headerBgColors = ['bg-blue-100/80', 'bg-indigo-100/80', 'bg-purple-100/80', 'bg-pink-100/80']
    const headerBorderColors = ['border-blue-200', 'border-indigo-200', 'border-purple-200', 'border-pink-200']

    const colorIndex = (level - 1) % bgColors.length

    // Get pagination state for this nested table (default to 8 rows per page)
    const paginationState = nestedPagination[rowKey] || { currentPage: 1, pageSize: 8 }
    const { currentPage: nestedCurrentPage, pageSize: nestedPageSize } = paginationState

    // Get filtered rows
    const filteredRows = getFilteredNestedRowsWithIndex(rowKey, nested)
    const nestedTotalRows = filteredRows.length
    const nestedTotalPages = Math.ceil(nestedTotalRows / nestedPageSize)

    // Calculate pagination
    const startIndex = (nestedCurrentPage - 1) * nestedPageSize
    const endIndex = Math.min(startIndex + nestedPageSize, nestedTotalRows)
    const paginatedRows = filteredRows.slice(startIndex, endIndex)

    // Pagination handlers
    const handleNestedPageChange = (newPage: number) => {
      setNestedPagination(prev => ({
        ...prev,
        [rowKey]: { ...paginationState, currentPage: newPage }
      }))
    }

    const handleNestedPageSizeChange = (newPageSize: number) => {
      setNestedPagination(prev => ({
        ...prev,
        [rowKey]: { currentPage: 1, pageSize: newPageSize }
      }))
    }

    // Memoize allFilters to prevent unnecessary re-renders
    const allFilters = React.useMemo(() => nested.filters || [], [nested.filters])

    return (
      <div className={`${bgColors[colorIndex]} border-l-4 ${borderColors[colorIndex]} p-4`}>
        {nested?.loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-blue-600 animate-spin mr-2" />
            <span className="text-sm text-gray-600">Alt tablo yükleniyor...</span>
          </div>
        ) : nested?.data && nested.data.length > 0 ? (
          <div className="space-y-3">
            <div className="border border-gray-200 rounded">
              <table className="w-full border-collapse bg-white rounded shadow-sm">
                <thead className="sticky top-0 z-10">
                  <tr className={`${headerBgColors[colorIndex]} border-b ${headerBorderColors[colorIndex]}`}>
                    {/* Add expand column if there are more nested queries */}
                    {nested.nestedQueries && nested.nestedQueries.length > 0 && (
                      <th className="px-3 py-2 text-left font-semibold text-xs w-10"></th>
                    )}
                    {nested.columns.map((col: string, colIndex: number) => {
                      // Find if there's a filter for this column in nested filters
                      const filter = (nested.filters || []).find((f: any) => f.fieldName === col)
                      const filterKey = `${rowKey}_${col}`
                      const currentSort = nestedSorting[rowKey]
                      const isSorted = currentSort?.column === col

                      return (
                        <th key={colIndex} className={`px-3 py-2 text-left font-semibold ${textColors[colorIndex]} text-xs relative`}>
                          <div className="flex items-center justify-between gap-1">
                            <div
                              className="flex items-center gap-1 cursor-pointer hover:text-orange-600"
                              onClick={() => {
                                setNestedSorting(prev => {
                                  const current = prev[rowKey]
                                  if (current?.column === col) {
                                    // Toggle direction or remove sort
                                    if (current.direction === 'asc') {
                                      return { ...prev, [rowKey]: { column: col, direction: 'desc' } }
                                    } else {
                                      // Remove sorting
                                      const newSort = { ...prev }
                                      delete newSort[rowKey]
                                      return newSort
                                    }
                                  } else {
                                    // Set new sort column (ascending)
                                    return { ...prev, [rowKey]: { column: col, direction: 'asc' } }
                                  }
                                })
                              }}
                            >
                              <span>{col}</span>
                              {isSorted && (
                                currentSort.direction === 'asc'
                                  ? <ArrowUp className="h-3 w-3" />
                                  : <ArrowDown className="h-3 w-3" />
                              )}
                            </div>

                            {/* Filter button */}
                            {filter && (
                              <div className="relative">
                                <div
                                  className="cursor-pointer hover:bg-white/50 p-1 rounded"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setNestedFilterPopovers(prev => {
                                      const isCurrentlyOpen = prev[filterKey]
                                      const newPopovers: { [key: string]: boolean } = {}
                                      if (!isCurrentlyOpen) {
                                        newPopovers[filterKey] = true
                                      }
                                      return newPopovers
                                    })
                                    // compute viewport position for fixed popover
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    setNestedFilterPositions(prev => ({
                                      ...prev,
                                      [filterKey]: {
                                        top: rect.bottom + 4,
                                        left: rect.left
                                      }
                                    }))
                                  }}
                                >
                                  <Filter className={`h-3 w-3 ${(() => {
                                    // Check if nested filter is active
                                    if (filter.type === 'date') {
                                      return nestedFilters[`${filterKey}_start`] || nestedFilters[`${filterKey}_end`] 
                                        ? 'text-orange-600' : 'text-gray-400'
                                    } else if (filter.type === 'multiselect') {
                                      const value = nestedFilters[filterKey]
                                      return (Array.isArray(value) && value.length > 0) ? 'text-orange-600' : 'text-gray-400'
                                    } else {
                                      return nestedFilters[filterKey] ? 'text-orange-600' : 'text-gray-400'
                                    }
                                  })()}`} />
                                </div>

                                {nestedFilterPopovers[filterKey] && typeof document !== 'undefined' && (() => {
                                  const position = nestedFilterPositions[filterKey]
                                  const left = position?.left || 0
                                  const popoverWidth = 256
                                  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
                                  const adjustedLeft = left + popoverWidth > viewportWidth - 16
                                    ? Math.max(16, viewportWidth - popoverWidth - 16)
                                    : left

                                  return createPortal(
                                    <div
                                      key={filterKey}
                                      className={`nested-filter-popover fixed w-64 p-4 bg-white border border-orange-300 rounded-md shadow-lg z-[10000]`}
                                      style={{
                                        top: position?.top || 0,
                                        left: adjustedLeft
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <NestedFilterInput
                                        filter={filter}
                                        filterKey={filterKey}
                                        nestedFilters={nestedFilters}
                                        setNestedFilters={setNestedFilters}
                                        setNestedFilterPopovers={setNestedFilterPopovers}
                                        nestedData={nestedData}
                                        rowKey={rowKey}
                                        allFilters={allFilters}
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
                <tbody className="divide-y divide-gray-200">
                  {paginatedRows.map(({ row: nestedRow, index: originalIndex }: any, nestedRowIndex: number) => {
                    const nestedRowKey = `${rowKey}_${originalIndex}`
                    const isNestedExpanded = expandedRows[nestedRowKey]
                    const nestedNested = nestedData[nestedRowKey]
                    // Calculate row text color for nested row based on rules
                    const nestedRowTextColor = getRowTextColor(nestedRow, nested.columns, query.visualization.chartOptions?.rowColorRules)

                    return (
                      <React.Fragment key={nestedRowIndex}>
                        <tr
                          className={`hover:bg-${bgColors[colorIndex].split('-')[1]}-50/30 transition-colors ${nested.nestedQueries && nested.nestedQueries.length > 0 ? 'cursor-pointer' : ''
                            } ${isNestedExpanded ? `${bgColors[colorIndex]} font-semibold` : ''}`}
                          onClick={() => {
                            if (nested.nestedQueries && nested.nestedQueries.length > 0) {
                              onRowExpand(query, originalIndex, nestedRow, nested.nestedQueries, level, rowKey)
                            }
                          }}
                        >
                          {/* Expand column */}
                          {nested.nestedQueries && nested.nestedQueries.length > 0 && (
                            <td className="px-3 py-2 text-xs text-gray-800">
                              {isNestedExpanded ? (
                                <ChevronDown className="h-4 w-4 text-blue-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                            </td>
                          )}
                          {nestedRow.map((cell: any, cellIndex: number) => {
                            const cellValue = cell?.toString() || ''
                            const displayValue = cellValue.length > 100 ? cellValue.substring(0, 100) + '...' : cellValue

                            return (
                              <td key={cellIndex} className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: nestedRowTextColor || '#374151' }}>
                                {displayValue}
                              </td>
                            )
                          })}
                        </tr>

                        {/* Recursive Nested Row */}
                        {isNestedExpanded && nestedNested && (
                          <tr>
                            <td colSpan={(nested.nestedQueries && nested.nestedQueries.length > 0 ? 1 : 0) + nested.columns.length} className="p-0">
                              <NestedTableRenderer
                                rowKey={nestedRowKey}
                                nested={nestedNested}
                                level={level + 1}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {nestedTotalPages > 1 && (
              <div className="px-3 py-2 bg-white border border-gray-200 rounded flex items-center flex-wrap gap-3">
                <div className="text-xs text-gray-600">
                  {startIndex + 1}-{endIndex} / {nestedTotalRows}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-600">Sayfa:</span>
                  <select
                    value={nestedPageSize}
                    onChange={(e) => handleNestedPageSizeChange(parseInt(e.target.value))}
                    className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value={8}>8</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleNestedPageChange(nestedCurrentPage - 1)}
                    disabled={nestedCurrentPage <= 1}
                    className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>

                  <div className="flex items-center gap-1">
                    {(() => {
                      const pages = []
                      const maxVisiblePages = 5
                      let startPage = Math.max(1, nestedCurrentPage - Math.floor(maxVisiblePages / 2))
                      let endPage = Math.min(nestedTotalPages, startPage + maxVisiblePages - 1)

                      if (endPage - startPage + 1 < maxVisiblePages) {
                        startPage = Math.max(1, endPage - maxVisiblePages + 1)
                      }

                      if (startPage > 1) {
                        pages.push(
                          <button
                            key={1}
                            onClick={() => handleNestedPageChange(1)}
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
                            onClick={() => handleNestedPageChange(i)}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${i === nestedCurrentPage
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                              }`}
                          >
                            {i}
                          </button>
                        )
                      }

                      if (endPage < nestedTotalPages) {
                        if (endPage < nestedTotalPages - 1) {
                          pages.push(<span key="ellipsis2" className="px-1 text-xs text-gray-500">...</span>)
                        }
                        pages.push(
                          <button
                            key={nestedTotalPages}
                            onClick={() => handleNestedPageChange(nestedTotalPages)}
                            className="px-2 py-1 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            {nestedTotalPages}
                          </button>
                        )
                      }

                      return pages
                    })()}
                  </div>

                  <button
                    onClick={() => handleNestedPageChange(nestedCurrentPage + 1)}
                    disabled={nestedCurrentPage >= nestedTotalPages}
                    className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : nested && !nested.loading ? (
          <div className="text-center py-4 text-sm text-gray-500">
            Alt tablo için veri bulunamadı
          </div>
        ) : null}
      </div>
    )
  }

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
            <th className="px-3 py-1.5 text-left font-semibold text-gray-800 text-xs w-10">
              {/* Expand/Collapse column */}
            </th>
            {columns.map((col, index) => {
              // Find if there's a filter for this column
              const filter = query.filters.find(f => f.fieldName === col)

              return (
                <th key={index} className="px-3 py-1.5 text-left font-semibold text-gray-800 text-xs relative">
                  <div className="flex items-center justify-between">
                    {/* Sortable column header */}
                    <div
                      className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded flex-1"
                      onClick={() => onColumnSort(col)}
                    >
                      <span>{col}</span>
                      <div className="flex flex-col">
                        {sorting?.column === col ? (
                          sorting.direction === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-blue-600" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-blue-600" />
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
                              setMainFilterPositions(prev => {
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

                              setMainFilterPositions(prev => ({
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
                          const position = mainFilterPositions[filterKey]
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
                              <MainTableFilterInput
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
              )})}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => {
            const rowKey = `${query.id}_${rowIndex}`
            const isExpanded = expandedRows[rowKey]
            const nested = nestedData[rowKey]
            // Calculate row text color based on rules
            const rowTextColor = getRowTextColor(row, columns, query.visualization.chartOptions?.rowColorRules)

            return (
              <React.Fragment key={rowIndex}>
                {/* Parent Row */}
                <tr
                  className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50 font-bold' : ''}`}
                  onClick={() => onRowExpand(query, rowIndex, row, query.visualization.chartOptions?.nestedQueries || [], 0, '')}
                >
                  <td className="px-3 py-2 text-xs text-gray-800">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-blue-600" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </td>
                  {row.map((cell, cellIndex) => {
                    const cellValue = cell?.toString() || ''
                    const displayValue = cellValue.length > 50 ? cellValue.substring(0, 50) + '...' : cellValue

                    return (
                      <td key={cellIndex} className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: rowTextColor || '#1f2937' }}>
                        <span>{displayValue}</span>
                      </td>
                    )
                  })}
                </tr>

                {/* Nested Row */}
                {isExpanded && (
                  <tr>
                    <td colSpan={columns.length + 1} className="p-0">
                      <NestedTableRenderer
                        rowKey={rowKey}
                        nested={nested}
                        level={1}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      </div>

      {/* Pagination Controls for Expandable Table */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center flex-wrap gap-3 flex-shrink-0">
        <div className="text-xs text-gray-600">
          {((currentPage - 1) * pageSize + 1)}-{Math.min(currentPage * pageSize, totalRows)} / {totalRows}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600">Sayfa:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(parseInt(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
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
                        ? 'bg-blue-600 text-white border-blue-600'
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

