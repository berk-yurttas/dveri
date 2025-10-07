'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import {
  Play,
  Calendar,
  Clock,
  Database,
  BarChart3,
  Table,
  LineChart,
  PieChart,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit,
  X,
  FileSpreadsheet,
  User,
  Trash2,
  Settings,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import { reportsService } from '@/services/reports'
import { DeleteModal } from '@/components/ui/delete-modal'

// Visualization components
import {
  BarChart,
  Bar,
  LineChart as RechartsLineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  ComposedChart
} from 'recharts'

const VISUALIZATION_ICONS = {
  table: Table,
  bar: BarChart3,
  line: LineChart,
  pie: PieChart,
  area: BarChart3,
  scatter: BarChart3,
  pareto: BarChart3,
  boxplot: BarChart3,
  histogram: BarChart3,
}

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

interface ReportData {
  id: number
  name: string
  description: string
  is_public: boolean
  tags: string[]
  owner_id: number
  owner_name: string
  created_at: string
  updated_at: string | null
  queries: QueryData[]
}

interface QueryData {
  id: number
  name: string
  sql: string
  visualization: {
    type: 'table' | 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'pareto' | 'boxplot' | 'histogram'
    xAxis?: string
    yAxis?: string
    labelField?: string
    valueField?: string
    groupBy?: string
    title?: string
    showLegend?: boolean
    colors?: string[]
    chartOptions?: any
  }
  orderIndex: number
  report_id: number
  created_at: string
  updated_at: string | null
  filters: FilterData[]
}

interface FilterData {
  id: number
  fieldName: string
  displayName: string
  type: 'date' | 'dropdown' | 'multiselect' | 'number' | 'text'
  dropdownQuery: string | null
  required: boolean
  query_id: number
  created_at: string
  updated_at: string | null
}

interface QueryResult {
  query_id: number
  query_name: string
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

interface FilterState {
  [key: string]: any
}

interface QueryResultState {
  [queryId: number]: {
    result: QueryResult | null
    loading: boolean
    error: string | null
    currentPage: number
    pageSize: number
    totalPages: number
  }
}


export default function ReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const reportId = params.id as string

  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({})
  const [queryResults, setQueryResults] = useState<QueryResultState>({})
  const [openPopovers, setOpenPopovers] = useState<{[key: string]: boolean}>({})
  const [dropdownOptions, setDropdownOptions] = useState<{[key: string]: Array<{value: any, label: string}>}>({})
  const [filterModalOpen, setFilterModalOpen] = useState<{[key: string]: boolean}>({})
  const [isMounted, setIsMounted] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false)
  const [sorting, setSorting] = useState<{[queryId: number]: {column: string, direction: 'asc' | 'desc'} | null}>({})

  // Debounce timeout refs for each filter
  const debounceTimeouts = useRef<{[key: string]: NodeJS.Timeout}>({})

  // Ref to track current reportId to prevent multiple loads
  const currentReportIdRef = useRef<string | null>(null)
  const isLoadingRef = useRef(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch report details using the reports service
  const fetchReportDetails = async () => {
    try {
      const reportData = await reportsService.getReportById(reportId)
      return reportData as unknown as ReportData
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch report')
    }
  }

  // Load dropdown options for dropdown/multiselect filters
  const loadDropdownOptions = async (query: QueryData, filter: FilterData) => {
    if (filter.type !== 'dropdown' && filter.type !== 'multiselect') return
    
    const key = `${query.id}_${filter.fieldName}`
    try {
      const response = await reportsService.getFilterOptions(reportId, query.id, filter.fieldName)
      setDropdownOptions(prev => ({
        ...prev,
        [key]: response.options
      }))
    } catch (err) {
      console.error(`Failed to load dropdown options for ${filter.fieldName}:`, err)
      setDropdownOptions(prev => ({
        ...prev,
        [key]: []
      }))
    }
  }

  // Execute a single query with custom filters and sorting
  const executeQueryWithSorting = async (query: QueryData, reportId: number, customFilters: FilterState, page: number = 1, pageSize: number = 10, sortConfig?: {column: string, direction: 'asc' | 'desc'}) => {
    try {
      // Update loading state
      setQueryResults(prev => ({
        ...prev,
        [query.id]: {
          ...prev[query.id],
          loading: true,
          error: null,
          currentPage: page,
          pageSize: pageSize
        }
      }))

      // Prepare filters for this query using custom filters
      const queryFilters = query.filters
        .map(filter => {
          if (filter.type === 'date') {
            const startKey = `${query.id}_${filter.fieldName}_start`
            const endKey = `${query.id}_${filter.fieldName}_end`
            const startValue = customFilters[startKey]
            const endValue = customFilters[endKey]
            
            console.log(`Date filter debug: ${filter.fieldName}`)
            console.log(`  Start key: ${startKey} = ${startValue}`)
            console.log(`  End key: ${endKey} = ${endValue}`)
            
            if (startValue && endValue) {
              // Both start and end dates provided - use BETWEEN
              console.log(`Creating BETWEEN filter: [${startValue}, ${endValue}]`)
              return {
                field_name: filter.fieldName,
                value: [startValue, endValue],
                operator: 'BETWEEN'
              }
            } else if (startValue) {
              // Only start date provided - use >=
              return {
                field_name: filter.fieldName,
                value: startValue,
                operator: '>='
              }
            } else if (endValue) {
              // Only end date provided - use <=
              return {
                field_name: filter.fieldName,
                value: endValue,
                operator: '<='
              }
            }
            return null
          } else {
            const key = `${query.id}_${filter.fieldName}`
            const value = customFilters[key]
            
            if (filter.type === 'multiselect') {
              // For multiselect, value should be an array
              if (Array.isArray(value) && value.length > 0) {
                return {
                  field_name: filter.fieldName,
                  value: value,
                  operator: 'IN'
                }
              }
            } else if (value && value !== '') {
              return {
                field_name: filter.fieldName,
                value: value,
                operator: '='
              }
            }
            return null
          }
        })
        .filter(Boolean)

      const request = {
        report_id: reportId,
        query_id: query.id,
        filters: queryFilters,
        limit: query.visualization.type === 'table' ? pageSize : 1000,
        ...(query.visualization.type === 'table' && {
          page_size: pageSize,
          page_limit: page
        }),
        // Add sorting if provided
        ...(sortConfig && {
          sort_by: sortConfig.column,
          sort_direction: sortConfig.direction
        })
      }

      const response = await reportsService.executeReport(request)
      
      if (response.success && response.results.length > 0) {
        const result = response.results[0]
        const totalPages = query.visualization.type === 'table' 
          ? Math.ceil(result.total_rows / pageSize)
          : 1
          
        setQueryResults(prev => ({
          ...prev,
          [query.id]: {
            result: result,
            loading: false,
            error: null,
            currentPage: page,
            pageSize: pageSize,
            totalPages: totalPages
          }
        }))
      } else {
        throw new Error(response.message || 'Query execution failed')
      }
    } catch (err) {
      setQueryResults(prev => ({
        ...prev,
        [query.id]: {
          result: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Query execution failed',
          currentPage: page,
          pageSize: pageSize,
          totalPages: 0
        }
      }))
    }
  }

  // Execute a single query with custom filters
  const executeQueryWithFilters = async (query: QueryData, reportId: number, customFilters: FilterState, page: number = 1, pageSize: number = 10) => {
    try {
      // Update loading state
      setQueryResults(prev => ({
        ...prev,
        [query.id]: {
          ...prev[query.id],
          loading: true,
          error: null,
          currentPage: page,
          pageSize: pageSize
        }
      }))

      // Prepare filters for this query using custom filters
      const queryFilters = query.filters
        .map(filter => {
          if (filter.type === 'date') {
            const startKey = `${query.id}_${filter.fieldName}_start`
            const endKey = `${query.id}_${filter.fieldName}_end`
            const startValue = customFilters[startKey]
            const endValue = customFilters[endKey]
            
            console.log(`Date filter debug: ${filter.fieldName}`)
            console.log(`  Start key: ${startKey} = ${startValue}`)
            console.log(`  End key: ${endKey} = ${endValue}`)
            
            if (startValue && endValue) {
              // Both start and end dates provided - use BETWEEN
              console.log(`Creating BETWEEN filter: [${startValue}, ${endValue}]`)
              return {
                field_name: filter.fieldName,
                value: [startValue, endValue],
                operator: 'BETWEEN'
              }
            } else if (startValue) {
              // Only start date provided - use >=
              return {
                field_name: filter.fieldName,
                value: startValue,
                operator: '>='
              }
            } else if (endValue) {
              // Only end date provided - use <=
              return {
                field_name: filter.fieldName,
                value: endValue,
                operator: '<='
              }
            }
            return null
          } else {
            const key = `${query.id}_${filter.fieldName}`
            const value = customFilters[key]
            
            if (filter.type === 'multiselect') {
              // For multiselect, value should be an array
              if (Array.isArray(value) && value.length > 0) {
                return {
                  field_name: filter.fieldName,
                  value: value,
                  operator: 'IN'
                }
              }
            } else if (value && value !== '') {
              return {
                field_name: filter.fieldName,
                value: value,
                operator: '='
              }
            }
            return null
          }
        })
        .filter(Boolean)

      const request = {
        report_id: reportId,
        query_id: query.id,
        filters: queryFilters,
        limit: query.visualization.type === 'table' ? pageSize : 1000,
        ...(query.visualization.type === 'table' && {
          page_size: pageSize,
          page_limit: page
        })
      }

      const response = await reportsService.executeReport(request)
      
      if (response.success && response.results.length > 0) {
        const result = response.results[0]
        const totalPages = query.visualization.type === 'table' 
          ? Math.ceil(result.total_rows / pageSize)
          : 1
          
        setQueryResults(prev => ({
          ...prev,
          [query.id]: {
            result: result,
            loading: false,
            error: null,
            currentPage: page,
            pageSize: pageSize,
            totalPages: totalPages
          }
        }))
      } else {
        throw new Error(response.message || 'Query execution failed')
      }
    } catch (err) {
      setQueryResults(prev => ({
        ...prev,
        [query.id]: {
          result: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Query execution failed',
          currentPage: page,
          pageSize: pageSize,
          totalPages: 0
        }
      }))
    }
  }

  // Execute a single query with current filters
  const executeQuery = async (query: QueryData, reportId: number, currentFilters: FilterState) => {
    return executeQueryWithFilters(query, reportId, currentFilters)
  }

  // Execute all queries with initial empty filters
  const executeAllQueries = async (reportData: ReportData, initialFilters: FilterState) => {
    for (const query of reportData.queries) {
      await executeQueryWithFilters(query, reportData.id, initialFilters)
    }
  }

  // Set locale for date inputs
  useEffect(() => {
    // Set the document locale to Turkish for proper date formatting
    document.documentElement.lang = 'tr-TR'
    // Set mounted state for SSR compatibility
    setIsMounted(true)
  }, [])

  // Close all popovers when scrolling or clicking outside
  useEffect(() => {
    const handleScroll = () => {
      setOpenPopovers({})
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      
      // Close table filter popovers when clicking outside any filter area
      const isInsideAnyTableFilter = target.closest('th.relative') || target.closest('.absolute.top-full')
      const isInsideTable = target.closest('table')
      
      // Only close if not inside any table filter AND not inside the table at all
      if (!isInsideAnyTableFilter && !isInsideTable) {
        setOpenPopovers({})
      }
      
      // Close settings dropdown when clicking outside
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSettingsDropdownOpen(false);
      }
    }

    window.addEventListener('scroll', handleScroll, true) // Use capture phase
    document.addEventListener('click', handleClickOutside)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [])

  // Cleanup debounce timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts when component unmounts
      Object.values(debounceTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
      debounceTimeouts.current = {}
    }
  }, [])

  // Load report and execute queries automatically
  useEffect(() => {
    const loadReport = async () => {
      // Prevent multiple loads for the same reportId
      if (isLoadingRef.current || currentReportIdRef.current === reportId) {
        return
      }

      console.log('Loading report:', reportId)
      isLoadingRef.current = true
      currentReportIdRef.current = reportId

      try {
        setLoading(true)
        setError(null)

        const reportData = await fetchReportDetails()

        // Check if reportId changed while we were loading
        if (currentReportIdRef.current !== reportId) {
          return
        }

        setReport(reportData)

        // Initialize filter state and load dropdown options
        const initialFilters: FilterState = {}
        const dropdownPromises: Promise<void>[] = []

        for (const query of reportData.queries) {
          for (const filter of query.filters) {
            if (filter.type === 'date') {
              // For date filters, initialize both start and end
              initialFilters[`${query.id}_${filter.fieldName}_start`] = ''
              initialFilters[`${query.id}_${filter.fieldName}_end`] = ''
            } else if (filter.type === 'multiselect') {
              // For multiselect, initialize as empty array
              initialFilters[`${query.id}_${filter.fieldName}`] = []
            } else {
              // For other filters, use the base field name
              initialFilters[`${query.id}_${filter.fieldName}`] = ''
            }

            // Queue dropdown options loading for dropdown/multiselect filters
            if (filter.type === 'dropdown' || filter.type === 'multiselect') {
              dropdownPromises.push(loadDropdownOptions(query, filter))
            }
          }
        }

        // Set filters first
        setFilters(initialFilters)

        // Initialize query results state with loading true
        const initialResults: QueryResultState = {}
        reportData.queries.forEach(query => {
          initialResults[query.id] = {
            result: null,
            loading: true,
            error: null,
            currentPage: 1,
            pageSize: 10,
            totalPages: 0
          }
        })
        setQueryResults(initialResults)

        // Load dropdown options in parallel
        await Promise.all(dropdownPromises)

        // Check again if reportId changed
        if (currentReportIdRef.current !== reportId) {
          return
        }

        // Execute all queries with initial filters
        await executeAllQueries(reportData, initialFilters)

      } catch (err) {
        if (currentReportIdRef.current === reportId) {
          setError(err instanceof Error ? err.message : 'Failed to load report')
        }
      } finally {
        if (currentReportIdRef.current === reportId) {
          setLoading(false)
        }
        isLoadingRef.current = false
      }
    }

    if (reportId) {
      loadReport()
    }

    // Cleanup function to reset refs when reportId changes
    return () => {
      if (currentReportIdRef.current !== reportId) {
        currentReportIdRef.current = null
        isLoadingRef.current = false
      }
    }
  }, [reportId])

  const handleFilterChange = (queryId: number, fieldName: string, value: any) => {
    const key = `${queryId}_${fieldName}`
    console.log(`Setting filter ${key} = ${value}`)
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  // Debounced filter change that triggers query execution
  const handleDebouncedFilterChange = (queryId: number, fieldName: string, value: any, query: QueryData) => {
    const key = `${queryId}_${fieldName}`
    
    // Clear existing timeout for this filter
    if (debounceTimeouts.current[key]) {
      clearTimeout(debounceTimeouts.current[key])
    }
    
    // Update filter value immediately for UI responsiveness
    handleFilterChange(queryId, fieldName, value)
    
    // Set new timeout to execute query after 1 second of no typing
    debounceTimeouts.current[key] = setTimeout(() => {
      // Execute query with updated filters after debounce
      setFilters(currentFilters => {
        const updatedFilters = {
          ...currentFilters,
          [key]: value
        }

        // Execute query with updated filters
        const queryState = queryResults[queryId]
        const pageSize = queryState?.pageSize || 50
        executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)

        return updatedFilters // Return the updated filters
      })
      
      // Clean up the timeout reference
      delete debounceTimeouts.current[key]
    }, 1000) // 1 second debounce
  }

  // Pagination handlers
  const handlePageChange = async (query: QueryData, newPage: number) => {
    if (!report) return
    
    const queryState = queryResults[query.id]
    if (!queryState) return
    
    // Get current sorting state for this query
    const currentSort = sorting[query.id]
    
    if (currentSort) {
      // Use sorting function to preserve sort order
      await executeQueryWithSorting(query, report.id, filters, newPage, queryState.pageSize, currentSort)
    } else {
      // No sorting, use regular function
      await executeQueryWithFilters(query, report.id, filters, newPage, queryState.pageSize)
    }
  }

  const handlePageSizeChange = async (query: QueryData, newPageSize: number) => {
    if (!report) return
    
    // Get current sorting state for this query
    const currentSort = sorting[query.id]
    
    if (currentSort) {
      // Use sorting function to preserve sort order
      await executeQueryWithSorting(query, report.id, filters, 1, newPageSize, currentSort)
    } else {
      // No sorting, use regular function
      await executeQueryWithFilters(query, report.id, filters, 1, newPageSize)
    }
  }

  // Capture chart as base64 image
  const captureChartAsImage = async (queryId: number): Promise<string | null> => {
    try {
      // Find the chart container for this query
      const chartContainer = document.querySelector(`[data-query-id="${queryId}"] .recharts-wrapper`)
      if (!chartContainer) {
        console.warn(`Chart container not found for query ${queryId}`)
        return null
      }

      // Capture the chart as canvas
      const canvas = await html2canvas(chartContainer as HTMLElement, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true
      })

      // Convert to base64
      return canvas.toDataURL('image/png').split(',')[1] // Remove data:image/png;base64, prefix
    } catch (error) {
      console.error(`Error capturing chart for query ${queryId}:`, error)
      return null
    }
  }

  // Handle column sorting
  const handleColumnSort = (query: QueryData, column: string) => {
    const currentSort = sorting[query.id]
    let newDirection: 'asc' | 'desc' = 'asc'
    
    if (currentSort && currentSort.column === column) {
      // Toggle direction if same column
      newDirection = currentSort.direction === 'asc' ? 'desc' : 'asc'
    }
    
    // Update sorting state
    setSorting(prev => ({
      ...prev,
      [query.id]: { column, direction: newDirection }
    }))
    
    // Execute query with new sorting, preserving current page
    const queryState = queryResults[query.id]
    const pageSize = queryState?.pageSize || 50
    const currentPage = queryState?.currentPage || 1
    
    // Only reset to page 1 if changing to a different column
    const targetPage = (currentSort && currentSort.column === column) ? currentPage : 1
    
    executeQueryWithSorting(query, report!.id, filters, targetPage, pageSize, { column, direction: newDirection })
  }

  // Delete report handler
  const handleDelete = async () => {
    if (!report) return;
    
    setIsDeleting(true);
    try {
      await reportsService.deleteReport(report.id.toString());
      setIsDeleteDialogOpen(false);
      router.push("/reports"); // Redirect to reports list after deletion
    } catch (error) {
      console.error("Failed to delete report:", error);
      setError("Report silinemedi");
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Excel export functionality with chart images
  const exportToExcel = async () => {
    if (!report) return
    
    try {
      setIsExporting(true)
      
      // Create a new workbook
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'DT Report System'
      workbook.created = new Date()
      
      // Process each query
      for (const query of report.queries) {
        const queryState = queryResults[query.id]
        if (!queryState?.result) continue
        
        const { result } = queryState
        const { columns, data } = result
        
        // Create worksheet
        const worksheet = workbook.addWorksheet(query.name.substring(0, 31))
        
        if (query.visualization.type === 'table') {
          // For table visualizations, export raw data
          worksheet.addRow(columns)
          data.forEach(row => {
            worksheet.addRow(row)
          })
          
          // Style the header row
          const headerRow = worksheet.getRow(1)
          headerRow.font = { bold: true }
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          }
          
          // Auto-size columns
          columns.forEach((col, index) => {
            const column = worksheet.getColumn(index + 1)
            const maxLength = Math.max(
              col.length,
              ...data.map(row => String(row[index] || '').length)
            )
            column.width = Math.min(maxLength + 2, 50)
          })
          
        } else {
          // For chart visualizations, add data and chart image
          
          // Add title
          worksheet.addRow([query.visualization.title || query.name])
          worksheet.getRow(1).font = { bold: true, size: 16 }
          worksheet.addRow([]) // Empty row
          
          // Add data
          worksheet.addRow(columns)
          data.forEach(row => {
            worksheet.addRow(row)
          })
          
          // Style the header row
          const headerRow = worksheet.getRow(3)
          headerRow.font = { bold: true }
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          }
          
          // Auto-size columns
          columns.forEach((col, index) => {
            const column = worksheet.getColumn(index + 1)
            const maxLength = Math.max(
              col.length,
              ...data.map(row => String(row[index] || '').length)
            )
            column.width = Math.min(maxLength + 2, 30)
          })
          
          // Capture and add chart image
          const chartImageBase64 = await captureChartAsImage(query.id)
          if (chartImageBase64) {
            try {
              const imageId = workbook.addImage({
                base64: chartImageBase64,
                extension: 'png',
              })
              
              // Position the image to the right of the data or below it
              const dataEndRow = data.length + 3
              const imageStartCol = Math.max(columns.length + 2, 5) // Start after data columns
              
              worksheet.addImage(imageId, {
                tl: { col: imageStartCol, row: 3 }, // Top-left position
                ext: { width: 1200, height: 400 }, // Size
              })
            } catch (imageError) {
              console.error('Error adding image to worksheet:', imageError)
            }
          }
        }
      }
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
      const filename = `${report.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`
      
      // Export to file
      const buffer = await workbook.xlsx.writeBuffer()
      saveAs(new Blob([buffer]), filename)
      
    } catch (error) {
      console.error('Excel export error:', error)
      alert('Excel dosyası oluşturulurken hata oluştu.')
    } finally {
      setIsExporting(false)
    }
  }

  // Render filter button and modal for a query (for non-table visualizations)
  const renderQueryFilterButton = (query: QueryData) => {
    if (query.filters.length === 0) return null

    const hasActiveFilters = query.filters.some(filter => {
      if (filter.type === 'date') {
        return filters[`${query.id}_${filter.fieldName}_start`] || filters[`${query.id}_${filter.fieldName}_end`]
      } else if (filter.type === 'multiselect') {
        return Array.isArray(filters[`${query.id}_${filter.fieldName}`]) && filters[`${query.id}_${filter.fieldName}`].length > 0
      } else {
        return filters[`${query.id}_${filter.fieldName}`]
      }
    })

    const activeFilterCount = query.filters.filter(filter => {
      if (filter.type === 'date') {
        return filters[`${query.id}_${filter.fieldName}_start`] || filters[`${query.id}_${filter.fieldName}_end`]
      } else if (filter.type === 'multiselect') {
        return Array.isArray(filters[`${query.id}_${filter.fieldName}`]) && filters[`${query.id}_${filter.fieldName}`].length > 0
      } else {
        return filters[`${query.id}_${filter.fieldName}`]
      }
    }).length

    return (
      <div className="mb-4">
        {/* Filter Button */}
        <button
          onClick={() => setFilterModalOpen(prev => ({ ...prev, [query.id]: true }))}
          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            hasActiveFilters 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filtreler
          {hasActiveFilters && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Modal Overlay */}
        {filterModalOpen[query.id] && isMounted && createPortal(
          <>
            {/* Modal Backdrop */}
            <div 
              className="fixed inset-0 bg-opacity-50 z-[9998]"
              onClick={() => setFilterModalOpen(prev => ({ ...prev, [query.id]: false }))}
            />
            
            {/* Centered Modal Card */}
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl bg-white pointer-events-auto border-0 rounded-lg">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Filter className="h-5 w-5 text-gray-600" />
                      <h2 className="text-xl font-semibold text-gray-900">{query.name} - Filtreler</h2>
                    </div>
                    <button
                      onClick={() => setFilterModalOpen(prev => ({ ...prev, [query.id]: false }))}
                      className="h-8 w-8 hover:bg-gray-100 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">Filtreleri ayarlayın ve raporu güncelleyin</p>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {query.filters.map((filter) => (
                      <div key={filter.id} className="space-y-3 bg-white p-4 rounded-lg border border-gray-200">
                      <label className="block text-sm font-medium text-gray-700">{filter.displayName}</label>
                      {filter.type === 'date' ? (
                        <div className="space-y-2">
                          <input
                            type="date"
                            value={filters[`${query.id}_${filter.fieldName}_start`] || ''}
                            onChange={(e) => {
                              const newValue = e.target.value
                              handleFilterChange(query.id, `${filter.fieldName}_start`, newValue)
                              setTimeout(() => {
                                const updatedFilters = {
                                  ...filters,
                                  [`${query.id}_${filter.fieldName}_start`]: newValue
                                }
                                const queryState = queryResults[query.id]
                                const pageSize = queryState?.pageSize || 50
                                executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                              }, 500)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Başlangıç tarihi..."
                          />
                          <input
                            type="date"
                            value={filters[`${query.id}_${filter.fieldName}_end`] || ''}
                            onChange={(e) => {
                              const newValue = e.target.value
                              handleFilterChange(query.id, `${filter.fieldName}_end`, newValue)
                              setTimeout(() => {
                                const updatedFilters = {
                                  ...filters,
                                  [`${query.id}_${filter.fieldName}_end`]: newValue
                                }
                                const queryState = queryResults[query.id]
                                const pageSize = queryState?.pageSize || 50
                                executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                              }, 500)
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Bitiş tarihi..."
                          />
                        </div>
                      ) : filter.type === 'dropdown' ? (
                        <select
                          value={filters[`${query.id}_${filter.fieldName}`] || ''}
                          onChange={(e) => {
                            const newValue = e.target.value
                            handleFilterChange(query.id, filter.fieldName, newValue)
                            setTimeout(() => {
                              const updatedFilters = {
                                ...filters,
                                [`${query.id}_${filter.fieldName}`]: newValue
                              }
                              const queryState = queryResults[query.id]
                              const pageSize = queryState?.pageSize || 50
                              executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                            }, 100)
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">{filter.displayName} seçin...</option>
                          {(dropdownOptions[`${query.id}_${filter.fieldName}`] || []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : filter.type === 'multiselect' ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3">
                          {(dropdownOptions[`${query.id}_${filter.fieldName}`] || []).map((option) => {
                            const currentValues = filters[`${query.id}_${filter.fieldName}`] || []
                            const isChecked = Array.isArray(currentValues) && currentValues.includes(option.value)
                            
                            return (
                              <div key={option.value} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`filter_${query.id}_${filter.fieldName}_${option.value}`}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    const currentValues = Array.isArray(filters[`${query.id}_${filter.fieldName}`]) 
                                      ? filters[`${query.id}_${filter.fieldName}`] 
                                      : []
                                    
                                    let newValues
                                    if (checked) {
                                      newValues = [...currentValues, option.value]
                                    } else {
                                      newValues = currentValues.filter((v: any) => v !== option.value)
                                    }
                                    
                                    handleFilterChange(query.id, filter.fieldName, newValues)
                                    
                                    setTimeout(() => {
                                      const updatedFilters = {
                                        ...filters,
                                        [`${query.id}_${filter.fieldName}`]: newValues
                                      }
                                      const queryState = queryResults[query.id]
                                      const pageSize = queryState?.pageSize || 50
                                      executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                                    }, 100)
                                  }}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <label 
                                  htmlFor={`filter_${query.id}_${filter.fieldName}_${option.value}`}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {option.label}
                                </label>
                              </div>
                            )
                          })}
                          {(dropdownOptions[`${query.id}_${filter.fieldName}`] || []).length === 0 && (
                            <div className="text-sm text-gray-500 italic">Seçenekler yükleniyor...</div>
                          )}
                        </div>
                      ) : (
                        <input
                          type={filter.type === 'number' ? 'number' : 'text'}
                          value={filters[`${query.id}_${filter.fieldName}`] || ''}
                          onChange={(e) => {
                            const newValue = e.target.value
                            handleDebouncedFilterChange(query.id, filter.fieldName, newValue, query)
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder={`${filter.displayName} filtrele...`}
                        />
                      )}
                      
                      {/* Clear button */}
                      {(filter.type === 'date' ? 
                        (filters[`${query.id}_${filter.fieldName}_start`] || filters[`${query.id}_${filter.fieldName}_end`]) :
                        filter.type === 'multiselect' ?
                          (Array.isArray(filters[`${query.id}_${filter.fieldName}`]) && filters[`${query.id}_${filter.fieldName}`].length > 0) :
                          filters[`${query.id}_${filter.fieldName}`]
                      ) && (
                        <button
                          onClick={() => {
                            if (filter.type === 'date') {
                              handleFilterChange(query.id, `${filter.fieldName}_start`, '')
                              handleFilterChange(query.id, `${filter.fieldName}_end`, '')
                            } else if (filter.type === 'multiselect') {
                              handleFilterChange(query.id, filter.fieldName, [])
                            } else {
                              handleFilterChange(query.id, filter.fieldName, '')
                            }
                            setTimeout(() => {
                              let clearedFilters = { ...filters }
                              if (filter.type === 'date') {
                                clearedFilters[`${query.id}_${filter.fieldName}_start`] = ''
                                clearedFilters[`${query.id}_${filter.fieldName}_end`] = ''
                              } else if (filter.type === 'multiselect') {
                                clearedFilters[`${query.id}_${filter.fieldName}`] = []
                              } else {
                                clearedFilters[`${query.id}_${filter.fieldName}`] = ''
                              }
                              
                              const queryState = queryResults[query.id]
                              const pageSize = queryState?.pageSize || 10
                              executeQueryWithFilters(query, report!.id, clearedFilters, 1, pageSize)
                            }, 100)
                          }}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Temizle
                        </button>
                      )}
                    </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    )
  }


  const renderVisualization = (query: QueryData, result: QueryResult) => {
    const { visualization } = query
    const { data, columns } = result

    // Convert data to format suitable for charts
    const chartData = data.map(row => {
      const item: any = {}
      columns.forEach((col, index) => {
        item[col] = row[index]
      })
      return item
    })

    const colors = visualization.colors || DEFAULT_COLORS

    switch (visualization.type) {
      case 'table':
        return (
          <div className="overflow-x-auto shadow-xl max-h-[800px] overflow-y-auto relative
          " >
            <table className="w-full border-collapse relative">
              <thead className="relative">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {columns.map((col, index) => {
                    // Find if there's a filter for this column
                    const filter = query.filters.find(f => f.fieldName === col)
                    
                    return (
                      <th key={index} className="px-3 py-1.5 text-left font-semibold text-gray-800 text-xs relative">
                        <div className="flex items-center justify-between">
                          {/* Sortable column header */}
                          <div 
                            className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded flex-1"
                            onClick={() => handleColumnSort(query, col)}
                          >
                            <span>{col}</span>
                            <div className="flex flex-col">
                              {sorting[query.id]?.column === col ? (
                                sorting[query.id]?.direction === 'asc' ? (
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
                            <div className="relative">
                              <div 
                                className="cursor-pointer hover:bg-gray-100 p-1 rounded"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenPopovers(prev => {
                                    const currentKey = `${query.id}_${col}`
                                    const isCurrentlyOpen = prev[currentKey]
                                    
                                    // Close all other popovers and toggle current one
                                    const newPopovers: {[key: string]: boolean} = {}
                                    if (!isCurrentlyOpen) {
                                      newPopovers[currentKey] = true
                                    }
                                    
                                    return newPopovers
                                  })
                                }}
                              >
                                <Filter className="h-3 w-3 text-gray-400" />
                              </div>
                            
                            {openPopovers[`${query.id}_${col}`] && (
                              <div className={`absolute top-full mt-1 w-64 p-4 bg-white border border-gray-200 rounded-md shadow-lg z-[9999] ${
                                index >= columns.length - 2 ? 'right-0' : 'left-0'
                              }`}>
                                <div className="space-y-3">
                                  {filter.type === 'date' ? (
                                    <div className="space-y-2">
                                      <div>
                                        <label className="block text-xs text-gray-600 mb-1">Başlangıç</label>
                                        <input
                                          type="date"
                                          value={filters[`${query.id}_${filter.fieldName}_start`] || ''}
                                          onChange={(e) => {
                                            const newValue = e.target.value
                                            handleFilterChange(query.id, `${filter.fieldName}_start`, newValue)
                                            setTimeout(() => {
                                              const updatedFilters = {
                                                ...filters,
                                                [`${query.id}_${filter.fieldName}_start`]: newValue
                                              }
                                              const queryState = queryResults[query.id]
                                              const pageSize = queryState?.pageSize || 50
                                              executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                                            }, 500)
                                          }}
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          placeholder="Başlangıç tarihi..."
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs text-gray-600 mb-1">Bitiş</label>
                                        <input
                                          type="date"
                                          value={filters[`${query.id}_${filter.fieldName}_end`] || ''}
                                          onChange={(e) => {
                                            const newValue = e.target.value
                                            handleFilterChange(query.id, `${filter.fieldName}_end`, newValue)
                                            setTimeout(() => {
                                              const updatedFilters = {
                                                ...filters,
                                                [`${query.id}_${filter.fieldName}_end`]: newValue
                                              }
                                              const queryState = queryResults[query.id]
                                              const pageSize = queryState?.pageSize || 50
                                              executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                                            }, 500)
                                          }}
                                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          placeholder="Bitiş tarihi..."
                                        />
                                      </div>
                                    </div>
                                  ) : filter.type === 'dropdown' ? (
                                    <select
                                      value={filters[`${query.id}_${filter.fieldName}`] || ''}
                                      onChange={(e) => {
                                        const newValue = e.target.value
                                        handleFilterChange(query.id, filter.fieldName, newValue)
                                        setTimeout(() => {
                                          const updatedFilters = {
                                            ...filters,
                                            [`${query.id}_${filter.fieldName}`]: newValue
                                          }
                                          const queryState = queryResults[query.id]
                                          const pageSize = queryState?.pageSize || 50
                                          executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                                        }, 100)
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                      <option value="">{filter.displayName} seçin...</option>
                                      {(dropdownOptions[`${query.id}_${filter.fieldName}`] || []).map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : filter.type === 'multiselect' ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded p-2">
                                      {(dropdownOptions[`${query.id}_${filter.fieldName}`] || []).map((option) => {
                                        const currentValues = filters[`${query.id}_${filter.fieldName}`] || []
                                        const isChecked = Array.isArray(currentValues) && currentValues.includes(option.value)
                                        
                                        return (
                                          <div key={option.value} className="flex items-center space-x-2">
                                            <input
                                              type="checkbox"
                                              id={`${query.id}_${filter.fieldName}_${option.value}`}
                                              checked={isChecked}
                                              onChange={(e) => {
                                                const checked = e.target.checked
                                                const currentValues = Array.isArray(filters[`${query.id}_${filter.fieldName}`]) 
                                                  ? filters[`${query.id}_${filter.fieldName}`] 
                                                  : []
                                                
                                                let newValues
                                                if (checked) {
                                                  newValues = [...currentValues, option.value]
                                                } else {
                                                  newValues = currentValues.filter((v: any) => v !== option.value)
                                                }
                                                
                                                handleFilterChange(query.id, filter.fieldName, newValues)
                                                
                                                setTimeout(() => {
                                                  const updatedFilters = {
                                                    ...filters,
                                                    [`${query.id}_${filter.fieldName}`]: newValues
                                                  }
                                                  const queryState = queryResults[query.id]
                                                  const pageSize = queryState?.pageSize || 50
                                                  executeQueryWithFilters(query, report!.id, updatedFilters, 1, pageSize)
                                                }, 100)
                                              }}
                                              className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                            />
                                            <label 
                                              htmlFor={`${query.id}_${filter.fieldName}_${option.value}`}
                                              className="text-xs font-normal cursor-pointer"
                                            >
                                              {option.label}
                                            </label>
                                          </div>
                                        )
                                      })}
                                      {(dropdownOptions[`${query.id}_${filter.fieldName}`] || []).length === 0 && (
                                        <div className="text-xs text-gray-500 italic">Seçenekler yükleniyor...</div>
                                      )}
                                    </div>
                                  ) : (
                                    <input
                                      type={filter.type === 'number' ? 'number' : 'text'}
                                      value={filters[`${query.id}_${filter.fieldName}`] || ''}
                                      onChange={(e) => {
                                        const newValue = e.target.value
                                        handleDebouncedFilterChange(query.id, filter.fieldName, newValue, query)
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      placeholder={`${col} Filtrele`}
                                    />
                                  )}
                                  
                                  {/* Clear button */}
                                  {(filter.type === 'date' ? 
                                    (filters[`${query.id}_${filter.fieldName}_start`] || filters[`${query.id}_${filter.fieldName}_end`]) :
                                    filter.type === 'multiselect' ?
                                      (Array.isArray(filters[`${query.id}_${filter.fieldName}`]) && filters[`${query.id}_${filter.fieldName}`].length > 0) :
                                      filters[`${query.id}_${filter.fieldName}`]
                                  ) && (
                                    <button
                                      onClick={() => {
                                        if (filter.type === 'date') {
                                          handleFilterChange(query.id, `${filter.fieldName}_start`, '')
                                          handleFilterChange(query.id, `${filter.fieldName}_end`, '')
                                        } else if (filter.type === 'multiselect') {
                                          handleFilterChange(query.id, filter.fieldName, [])
                                        } else {
                                          handleFilterChange(query.id, filter.fieldName, '')
                                        }
                                        setTimeout(() => {
                                          let clearedFilters = { ...filters }
                                          if (filter.type === 'date') {
                                            clearedFilters[`${query.id}_${filter.fieldName}_start`] = ''
                                            clearedFilters[`${query.id}_${filter.fieldName}_end`] = ''
                                          } else if (filter.type === 'multiselect') {
                                            clearedFilters[`${query.id}_${filter.fieldName}`] = []
                                          } else {
                                            clearedFilters[`${query.id}_${filter.fieldName}`] = ''
                                          }
                                          
                                          const queryState = queryResults[query.id]
                                          const pageSize = queryState?.pageSize || 10
                                          executeQueryWithFilters(query, report!.id, clearedFilters, 1, pageSize)
                                        }, 100)
                                      }}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                      Temizle
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            </div>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((row, rowIndex) => (
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
                        <td key={cellIndex} className="px-3 py-2 text-xs text-gray-800 whitespace-nowrap">
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
                ))}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {(() => {
              const queryState = queryResults[query.id]
              if (!queryState) return null
              
              // Debug: Always show pagination for table visualizations
              console.log('Pagination Debug:', {
                queryId: query.id,
                totalRows: result.total_rows,
                totalPages: queryState.totalPages,
                currentPage: queryState.currentPage,
                pageSize: queryState.pageSize
              })
              
              const { currentPage, totalPages, pageSize } = queryState
              const startRecord = (currentPage - 1) * pageSize + 1
              const endRecord = Math.min(currentPage * pageSize, result.total_rows)
              
              // Ensure we have valid pagination values
              const safeTotalPages = totalPages || Math.ceil(result.total_rows / pageSize) || 1
              const safeCurrentPage = currentPage || 1
              
              return (
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-600">
                      {startRecord}-{endRecord} / {result.total_rows}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-600">Sayfa:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(query, parseInt(e.target.value))}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                      </select>
                    </div>
                  </div>
                  
                  {safeTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePageChange(query, currentPage - 1)}
                        disabled={safeCurrentPage <= 1}
                        className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                    
                    <div className="flex items-center gap-1">
                      {(() => {
                        const pages = []
                        const maxVisiblePages = 5
                        let startPage = Math.max(1, safeCurrentPage - Math.floor(maxVisiblePages / 2))
                        let endPage = Math.min(safeTotalPages, startPage + maxVisiblePages - 1)
                        
                        if (endPage - startPage + 1 < maxVisiblePages) {
                          startPage = Math.max(1, endPage - maxVisiblePages + 1)
                        }
                        
                        if (startPage > 1) {
                          pages.push(
                            <button
                              key={1}
                              onClick={() => handlePageChange(query, 1)}
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
                              onClick={() => handlePageChange(query, i)}
                              className={`px-2 py-1 rounded text-xs border transition-colors ${
                                i === safeCurrentPage
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              {i}
                            </button>
                          )
                        }
                        
                        if (endPage < safeTotalPages) {
                          if (endPage < safeTotalPages - 1) {
                            pages.push(<span key="ellipsis2" className="px-1 text-xs text-gray-500">...</span>)
                          }
                          pages.push(
                            <button
                              key={safeTotalPages}
                              onClick={() => handlePageChange(query, safeTotalPages)}
                              className="px-2 py-1 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              {safeTotalPages}
                            </button>
                          )
                        }
                        
                        return pages
                      })()}
                    </div>
                    
                      <button
                        onClick={() => handlePageChange(query, currentPage + 1)}
                        disabled={safeCurrentPage >= safeTotalPages}
                        className="p-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={visualization.xAxis || columns[0]} />
              <YAxis />
              <Tooltip />
              {visualization.showLegend && <Legend />}
              <Bar 
                dataKey={visualization.yAxis || columns[1]} 
                fill={colors[0]}
                name={visualization.yAxis || columns[1]}
              />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsLineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={visualization.xAxis || columns[0]} />
              <YAxis />
              <Tooltip />
              {visualization.showLegend && <Legend />}
              <Line 
                type="monotone" 
                dataKey={visualization.yAxis || columns[1]} 
                stroke={colors[0]}
                strokeWidth={2}
                dot={visualization.chartOptions?.showDots}
                name={visualization.yAxis || columns[1]}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        )

      case 'pie':
        const pieData = chartData.slice(0, 10).map((item, index) => ({
          name: item[visualization.labelField || columns[0]],
          value: parseFloat(item[visualization.valueField || columns[1]]) || 0,
          fill: colors[index % colors.length]
        }))

        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsPieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={visualization.chartOptions?.innerRadius || 0}
                outerRadius={150}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              {visualization.showLegend && <Legend />}
            </RechartsPieChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={visualization.xAxis || columns[0]} />
              <YAxis />
              <Tooltip />
              {visualization.showLegend && <Legend />}
              <Area 
                type="monotone" 
                dataKey={visualization.yAxis || columns[1]} 
                stroke={colors[0]}
                fill={colors[0]}
                fillOpacity={0.6}
                name={visualization.yAxis || columns[1]}
              />
            </AreaChart>
          </ResponsiveContainer>
        )

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={visualization.xAxis || columns[0]} />
              <YAxis dataKey={visualization.yAxis || columns[1]} />
              <Tooltip />
              {visualization.showLegend && <Legend />}
              <Scatter
                name={query.name}
                data={chartData}
                fill={colors[0]}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )

      case 'boxplot':
        // Box plot implementation using custom components
        const boxPlotData = chartData.map(item => ({
          category: item[visualization.xAxis || columns[0]],
          value: parseFloat(item[visualization.yAxis || columns[1]]) || 0
        }))

        // Group data by category and calculate quartiles
        const groupedData = boxPlotData.reduce((acc, item) => {
          if (!acc[item.category]) {
            acc[item.category] = []
          }
          acc[item.category].push(item.value)
          return acc
        }, {} as Record<string, number[]>)

        const boxPlotChartData = Object.entries(groupedData).map(([category, values]) => {
          const sorted = values.sort((a, b) => a - b)
          const q1 = sorted[Math.floor(sorted.length * 0.25)]
          const median = sorted[Math.floor(sorted.length * 0.5)]
          const q3 = sorted[Math.floor(sorted.length * 0.75)]
          const min = Math.min(...sorted)
          const max = Math.max(...sorted)

          return {
            category,
            min,
            q1,
            median,
            q3,
            max,
            values: sorted
          }
        })

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={boxPlotChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                        <p className="font-medium">{`${label}`}</p>
                        <p className="text-blue-600">{`Min: ${data.min}`}</p>
                        <p className="text-blue-600">{`Q1: ${data.q1}`}</p>
                        <p className="text-blue-600">{`Median: ${data.median}`}</p>
                        <p className="text-blue-600">{`Q3: ${data.q3}`}</p>
                        <p className="text-blue-600">{`Max: ${data.max}`}</p>
                        <p className="text-gray-600">{`Count: ${data.values.length}`}</p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              {visualization.showLegend && <Legend />}
              <Bar dataKey="median" fill={colors[0]} name="Box Plot" />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'pareto':
        // Pareto chart implementation (bar + line combination)
        const paretoData = chartData
          .map(item => ({
            category: item[visualization.xAxis || columns[0]],
            value: parseFloat(item[visualization.yAxis || columns[1]]) || 0
          }))
          .sort((a, b) => b.value - a.value) // Sort descending

        // Calculate cumulative percentages
        const totalValue = paretoData.reduce((sum, item) => sum + item.value, 0)
        let cumulative = 0
        const paretoChartData = paretoData.map(item => {
          cumulative += item.value
          return {
            ...item,
            cumulative: (cumulative / totalValue) * 100
          }
        })

        return (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={paretoChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'cumulative') {
                    return [`${Number(value).toFixed(1)}%`, 'Cumulative %']
                  }
                  return [value, name]
                }}
              />
              {visualization.showLegend && <Legend />}
              <Bar yAxisId="left" dataKey="value" fill={colors[0]} name="Value" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                stroke={colors[1] || '#ff7300'}
                strokeWidth={2}
                dot={{ fill: colors[1] || '#ff7300' }}
                name="Cumulative %"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )

      case 'histogram':
        // Histogram implementation
        const histogramValues = chartData.map(item =>
          parseFloat(item[visualization.yAxis || columns[1]]) || 0
        ).filter(val => !isNaN(val))

        if (histogramValues.length === 0) {
          return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex">
                <AlertCircle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <p className="text-sm text-yellow-800">
                    No numeric data available for histogram.
                  </p>
                </div>
              </div>
            </div>
          )
        }

        // Calculate histogram bins
        const minVal = Math.min(...histogramValues)
        const maxVal = Math.max(...histogramValues)
        const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(histogramValues.length))))
        const binWidth = (maxVal - minVal) / binCount

        const bins = Array.from({ length: binCount }, (_, i) => ({
          binStart: minVal + i * binWidth,
          binEnd: minVal + (i + 1) * binWidth,
          count: 0,
          binLabel: `${(minVal + i * binWidth).toFixed(1)}-${(minVal + (i + 1) * binWidth).toFixed(1)}`
        }))

        // Count values in each bin
        histogramValues.forEach(value => {
          const binIndex = Math.min(binCount - 1, Math.floor((value - minVal) / binWidth))
          if (binIndex >= 0 && binIndex < bins.length) {
            bins[binIndex].count++
          }
        })

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={bins}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="binLabel"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip
                formatter={(value, name) => [value, 'Frequency']}
                labelFormatter={(label) => `Range: ${label}`}
              />
              {visualization.showLegend && <Legend />}
              <Bar dataKey="count" fill={colors[0]} name="Frequency" />
            </BarChart>
          </ResponsiveContainer>
        )

      default:
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  Visualization type "{visualization.type}" is not yet implemented.
                </p>
              </div>
            </div>
          </div>
        )
    }
  }


  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="container mx-auto py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">
                {error || 'Report not found'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container min-w-full py-8 space-y-6">
      {/* Report Header */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-8 py-6 space-y-4 rounded-lg shadow-lg shadow-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">{report.name}</h1>
                <div className="relative" ref={dropdownRef}>
                  <button 
                    className="h-8 w-8 p-0 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700"
                    onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  
                  {/* Settings Dropdown */}
                  {isSettingsDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setIsSettingsDropdownOpen(false);
                            router.push(`/reports/${reportId}/edit`);
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Düzenle
                        </button>
                        <button
                          onClick={() => {
                            setIsSettingsDropdownOpen(false);
                            setIsDeleteDialogOpen(true);
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Sil
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-gray-600 mt-2">{report.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => report && executeAllQueries(report, filters)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Raporu Yenile
            </button>
            <button 
              onClick={exportToExcel}
              disabled={isExporting || Object.keys(queryResults).length === 0 || Object.values(queryResults).every(q => !q.result)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Dışa Aktarılıyor...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel'e Aktar
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-500" style={{ marginTop: '10px' }}>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(report.created_at).toLocaleDateString()}
          </div>
          {report.owner_name && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {report.owner_name}
            </div>
          )}
          {report.is_public && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Public
            </span>
          )}
        </div>

        {report.tags && report.tags.length > 0 && (
          <div className="flex items-center gap-2">
            {report.tags.map((tag, index) => (
              <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-700">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200" />

      {/* Queries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {report.queries.map((query) => {
          const Icon = VISUALIZATION_ICONS[query.visualization.type] || Table
          const queryState = queryResults[query.id]
          
          return (
            <div key={query.id} className="bg-white rounded-lg shadow-md border border-gray-200" data-query-id={query.id}>
              <div className="pb-4 px-6 pt-6">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-semibold">{query.name}</span>
                </div>
              </div>

              <div className="space-y-4 px-6 pb-6 relative">
                {/* Loading Overlay */}
                {queryState?.loading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
                    <div className="flex flex-col items-center gap-3 bg-white px-6 py-4 rounded-lg shadow-lg border border-gray-200">
                      <div className="h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-sm font-medium text-gray-700">Rapor çalıştırılıyor...</span>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {queryState?.error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <p className="text-sm text-red-800">{queryState.error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results */}
                {queryState?.result && (
                  <div>
                    {/* Show filter button above charts (but not for tables) */}
                    {query.visualization.type !== 'table' && renderQueryFilterButton(query)}
                    {renderVisualization(query, queryState.result)}
                  </div>
                )}

                {/* No Data State */}
                {!queryState?.result && !queryState?.loading && !queryState?.error && (
                  <div className="text-center py-8 text-gray-500">
                    No data available. Try running the query with different filters.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteModal
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Raporu Sil"
        description="Bu işlem geri alınamaz. Raporu kalıcı olarak silinecek."
        itemName={report?.name}
        isDeleting={isDeleting}
      />
    </div>
  )
}