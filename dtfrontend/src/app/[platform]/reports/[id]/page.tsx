'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  ArrowDown,
  Search,
  Layout,
  Save,
  XCircle
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import { reportsService } from '@/services/reports'
import { DeleteModal } from '@/components/ui/delete-modal'
import { api } from '@/lib/api'
import { Responsive, WidthProvider, Layout as GridLayout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

// Note: Recharts imports kept for potential direct use in table/expandable visualizations if needed
import { MirasAssistant } from '@/components/chatbot/miras-assistant'
import { Feedback } from '@/components/feedback/feedback'
import {
  BarVisualization,
  LineVisualization,
  PieVisualization,
  AreaVisualization,
  ScatterVisualization,
  ParetoVisualization,
  BoxPlotVisualization,
  HistogramVisualization,
  TableVisualization,
  ExpandableTableVisualization,
  CardVisualization
} from '@/components/visualizations'
import { GlobalFilters } from '@/components/reports/GlobalFilters'
import { buildDropdownQuery } from '@/utils/sqlPlaceholders'

const VISUALIZATION_ICONS = {
  table: Table,
  expandable: Table,
  bar: BarChart3,
  line: LineChart,
  pie: PieChart,
  area: BarChart3,
  scatter: BarChart3,
  pareto: BarChart3,
  boxplot: BarChart3,
  histogram: BarChart3,
  card: Database,
}

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

const ResponsiveGridLayout = WidthProvider(Responsive)

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
  globalFilters?: FilterData[]
  layoutConfig?: any[]
}

interface QueryData {
  id: number
  name: string
  sql: string
  visualization: {
    type: 'table' | 'expandable' | 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'pareto' | 'boxplot' | 'histogram' | 'card'
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
  dependsOn: string | null
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
  const platformCode = params.platform as string
  const reportId = params.id as string
  const searchParams = useSearchParams()
  const subplatform = searchParams.get('subplatform')
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({})
  const [queryResults, setQueryResults] = useState<QueryResultState>({})
  const [openPopovers, setOpenPopovers] = useState<{[key: string]: boolean}>({})
  const [dropdownOptions, setDropdownOptions] = useState<{[key: string]: {
    options: Array<{value: any, label: string}>,
    page: number,
    hasMore: boolean,
    total: number,
    loading: boolean
  }}>({})
  const [searchTerms, setSearchTerms] = useState<{[key: string]: string}>({})
  const [dropdownOpen, setDropdownOpen] = useState<{[key: string]: boolean}>({})
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false)
  const [sorting, setSorting] = useState<{[queryId: number]: {column: string, direction: 'asc' | 'desc'} | null}>({})
  const [expandedRows, setExpandedRows] = useState<{[key: string]: boolean}>({})
  const [nestedData, setNestedData] = useState<{[key: string]: {columns: string[], data: any[], loading: boolean, nestedQueries?: any[], filters?: any[]}}>({})
  const [nestedFilters, setNestedFilters] = useState<{[key: string]: any}>({})
  const [nestedFilterPopovers, setNestedFilterPopovers] = useState<{[key: string]: boolean}>({})
  const [nestedFilterPositions, setNestedFilterPositions] = useState<{[key: string]: { top: number, left: number } }>({})
  const [nestedSorting, setNestedSorting] = useState<{[rowKey: string]: {column: string, direction: 'asc' | 'desc'} | null}>({})
  const [nestedPagination, setNestedPagination] = useState<{[rowKey: string]: {currentPage: number, pageSize: number}}>({})
  const [filterOperators, setFilterOperators] = useState<{[key: string]: string}>({})
  const [operatorMenuOpen, setOperatorMenuOpen] = useState<{[key: string]: boolean}>({})
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false)
  const [gridLayout, setGridLayout] = useState<GridLayout[]>([])
  const [isSavingLayout, setIsSavingLayout] = useState(false)

  // Debounce timeout refs for each filter
  const debounceTimeouts = useRef<{[key: string]: NodeJS.Timeout}>({})

  // Ref to track current reportId to prevent multiple loads
  const currentReportIdRef = useRef<string | null>(null)
  const isLoadingRef = useRef(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Generate default layout for queries
  const generateDefaultLayout = (queries: QueryData[]): GridLayout[] => {
    return queries.map((query, index) => {
      return {
        i: query.id.toString(),
        x: (index % 2) * 2, // Always 2 columns, alternating left/right
        y: Math.floor(index / 2) * 4, // 4 rows per item (500px / 120px rowHeight ≈ 4.16)
        w: 2, // Always 2 column width
        h: 4, // 4 rows height (≈480px)
        minW: 1,
        minH: 2, // Minimum 2 rows (≈240px)
      }
    })
  }

  // Handle layout change
  const handleLayoutChange = (newLayout: GridLayout[]) => {
    setGridLayout(newLayout)
  }

  // Save layout
  const handleSaveLayout = async () => {
    if (!report) return

    setIsSavingLayout(true)
    try {
      // Save layout to backend
      await reportsService.updateReport(report.id.toString(), {
        layoutConfig: gridLayout
      })
      // Also keep in localStorage as backup
      localStorage.setItem(`report_layout_${report.id}`, JSON.stringify(gridLayout))
      setIsLayoutEditMode(false)
    } catch (error) {
      console.error('Error saving layout:', error)
    } finally {
      setIsSavingLayout(false)
    }
  }

  // Cancel layout editing
  const handleCancelLayoutEdit = () => {
    // Restore original layout
    // Priority: 1. Report data from DB, 2. localStorage, 3. Default layout
    if (report) {
      if (report.layoutConfig && report.layoutConfig.length > 0) {
        setGridLayout(report.layoutConfig)
      } else {
        const savedLayout = localStorage.getItem(`report_layout_${report.id}`)
        if (savedLayout) {
          setGridLayout(JSON.parse(savedLayout))
        } else {
          setGridLayout(generateDefaultLayout(report.queries))
        }
      }
    }
    setIsLayoutEditMode(false)
  }

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
  const loadDropdownOptions = async (
    query: QueryData,
    filter: FilterData,
    currentFilterValues?: FilterState,
    page: number = 1,
    search: string = "",
    append: boolean = false
  ) => {
    if (filter.type !== 'dropdown' && filter.type !== 'multiselect') return
    if (!filter.dropdownQuery) return

    const key = `${query.id}_${filter.fieldName}`

    // Set loading state
    if (!append) {
      setDropdownOptions(prev => ({
        ...prev,
        [key]: {
          options: [],
          page: 1,
          hasMore: false,
          total: 0,
          loading: true
        }
      }))
    } else {
      setDropdownOptions(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          loading: true
        }
      }))
    }

    try {
      if (filter.dependsOn) {
        const parentKey = query.id === 0 ? `global_${filter.dependsOn}` : `${query.id}_${filter.dependsOn}`
        const parentValue = currentFilterValues ? currentFilterValues[parentKey] : filters[parentKey]

        let modifiedSql = buildDropdownQuery(filter.dropdownQuery, filter.dependsOn, parentValue)

        // Add search filter if provided
        if (search) {
          // Wrap the query in a subquery and add WHERE clause for search
          // Remove trailing semicolon
          modifiedSql = modifiedSql.replace(/;\s*$/, '').trim()

          // Add search condition - search in both value and label columns
          modifiedSql = `SELECT * FROM (${modifiedSql}) AS search_subquery WHERE CAST(search_subquery.value AS TEXT) ILIKE '%${search}%' OR CAST(search_subquery.label AS TEXT) ILIKE '%${search}%'`
        }

        const result = await reportsService.previewQuery({
          sql_query: modifiedSql,
          limit: 1000
        })

        if (result.success && result.data.length > 0) {
          const options = result.data.map(row => ({
            value: row[0],
            label: row[1] || String(row[0])
          }))

          const uniqueOptions = options.filter((option, index, self) =>
            index === self.findIndex((o) => o.value === option.value)
          )

          setDropdownOptions(prev => ({
            ...prev,
            [key]: {
              options: uniqueOptions,
              page: 1,
              hasMore: false,
              total: uniqueOptions.length,
              loading: false
            }
          }))
        } else {
          setDropdownOptions(prev => ({
            ...prev,
            [key]: {
              options: [],
              page: 1,
              hasMore: false,
              total: 0,
              loading: false
            }
          }))
        }
      } else {
        // No dependency, load options normally from the API
        // For global filters (query.id === 0), use preview query instead
        if (query.id === 0 && filter.dropdownQuery) {
          // Global filter - execute the dropdown query directly
          let sqlQuery = filter.dropdownQuery

          // Add search filter if provided
          if (search) {
            // Wrap the query in a subquery and add WHERE clause for search
            // Remove trailing semicolon
            sqlQuery = sqlQuery.replace(/;\s*$/, '').trim()

            // Add search condition - search in both value and label columns
            sqlQuery = `SELECT * FROM (${sqlQuery}) AS search_subquery WHERE CAST(search_subquery.value AS TEXT) ILIKE '%${search}%' OR CAST(search_subquery.label AS TEXT) ILIKE '%${search}%'`
          }

          const result = await reportsService.previewQuery({
            sql_query: sqlQuery,
            limit: 1000
          })

          if (result.success && result.data.length > 0) {
            const options = result.data.map(row => ({
              value: row[0],
              label: row[1] || String(row[0])
            }))

            // Deduplicate options based on value
            const uniqueOptions = Array.from(
              new Map(options.map(item => [item.value, item])).values()
            )

            setDropdownOptions(prev => ({
              ...prev,
              [key]: {
                options: uniqueOptions,
                page: 1,
                hasMore: false,
                total: uniqueOptions.length,
                loading: false
              }
            }))
          } else {
            setDropdownOptions(prev => ({
              ...prev,
              [key]: {
                options: [],
                page: 1,
                hasMore: false,
                total: 0,
                loading: false
              }
            }))
          }
        } else {
          // Query-specific filter - use the API endpoint with pagination
          const response = await reportsService.getFilterOptions(reportId, query.id, filter.fieldName, page, 50, search)

          setDropdownOptions(prev => {
            const existingOptions = append && prev[key] ? prev[key].options : []
            return {
              ...prev,
              [key]: {
                options: append ? [...existingOptions, ...response.options] : response.options,
                page: response.page,
                hasMore: response.has_more,
                total: response.total,
                loading: false
              }
            }
          })
        }
      }
    } catch (err) {
      console.error(`Failed to load dropdown options for ${filter.fieldName}:`, err)
      setDropdownOptions(prev => ({
        ...prev,
        [key]: {
          options: [],
          page: 1,
          hasMore: false,
          total: 0,
          loading: false
        }
      }))
    }
  }

  // Handle loading more options for a dropdown filter
  const handleLoadMoreOptions = async (filterKey: string) => {
    const dropdownData = dropdownOptions[filterKey]
    if (!dropdownData || dropdownData.loading || !dropdownData.hasMore) return

    // Parse filterKey to get query and filter info
    const parts = filterKey.split('_')
    const queryId = parseInt(parts[0])
    const fieldName = parts.slice(1).join('_')

    // Find the query and filter
    const query = report?.queries.find(q => q.id === queryId)
    if (!query) return

    const filter = query.filters.find(f => f.fieldName === fieldName)
    if (!filter) return

    const currentSearch = searchTerms[filterKey] || ''
    await loadDropdownOptions(query, filter, filters, dropdownData.page + 1, currentSearch, true)
  }

  // Handle searching options for a dropdown filter
  const handleSearchOptions = async (filterKey: string, search: string) => {
    const parts = filterKey.split('_')
    const queryId = parseInt(parts[0])
    const fieldName = parts.slice(1).join('_')

    const query = report?.queries.find(q => q.id === queryId)
    if (!query) return

    const filter = query.filters.find(f => f.fieldName === fieldName)
    if (!filter) return

    await loadDropdownOptions(query, filter, filters, 1, search, false)
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

      // Prepare global filters first
      const globalFilters = (report?.globalFilters || [])
        .map(filter => {
          if (filter.type === 'date') {
            const startKey = `global_${filter.fieldName}_start`
            const endKey = `global_${filter.fieldName}_end`
            const startValue = customFilters[startKey]
            const endValue = customFilters[endKey]

            if (startValue && endValue) {
              return {
                field_name: filter.fieldName,
                value: [startValue, endValue],
                operator: 'BETWEEN'
              }
            } else if (startValue) {
              return {
                field_name: filter.fieldName,
                value: startValue,
                operator: '>='
              }
            } else if (endValue) {
              return {
                field_name: filter.fieldName,
                value: endValue,
                operator: '<='
              }
            }
            return null
          } else {
            const key = `global_${filter.fieldName}`
            const value = customFilters[key]

            if (filter.type === 'multiselect') {
              if (Array.isArray(value) && value.length > 0) {
                return {
                  field_name: filter.fieldName,
                  value: value,
                  operator: 'IN'
                }
              }
            } else if (value && value !== '') {
              const operatorKey = `global_${filter.fieldName}_operator`
              const operator = customFilters[operatorKey] || (filter.type === 'text' ? 'CONTAINS' : '=')

              return {
                field_name: filter.fieldName,
                value: value,
                operator: operator
              }
            }
            return null
          }
        })
        .filter(Boolean)

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
              // Get the operator for this filter (default to CONTAINS for text, = for others)
              const operatorKey = `${query.id}_${filter.fieldName}_operator`
              const operator = customFilters[operatorKey] || (filter.type === 'text' ? 'CONTAINS' : '=')

              return {
                field_name: filter.fieldName,
                value: value,
                operator: operator
              }
            }
            return null
          }
        })
        .filter(Boolean)

      // Merge global filters with query filters
      const allFilters = [...globalFilters, ...queryFilters]

      const request = {
        report_id: reportId,
        query_id: query.id,
        filters: allFilters,
        limit: (query.visualization.type === 'table' || query.visualization.type === 'expandable') ? pageSize : 1000,
        ...((query.visualization.type === 'table' || query.visualization.type === 'expandable') && {
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
        // For pagination, we don't know exact total pages anymore (no COUNT query)
        // We only know if there are more pages via has_more flag
        const totalPages = (query.visualization.type === 'table' || query.visualization.type === 'expandable')
          ? (result.has_more ? page + 1 : page)  // If has_more, show at least one more page
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

      // Prepare global filters first
      const globalFilters = (report?.globalFilters || [])
        .map(filter => {
          if (filter.type === 'date') {
            const startKey = `global_${filter.fieldName}_start`
            const endKey = `global_${filter.fieldName}_end`
            const startValue = customFilters[startKey]
            const endValue = customFilters[endKey]

            if (startValue && endValue) {
              return {
                field_name: filter.fieldName,
                value: [startValue, endValue],
                operator: 'BETWEEN'
              }
            } else if (startValue) {
              return {
                field_name: filter.fieldName,
                value: startValue,
                operator: '>='
              }
            } else if (endValue) {
              return {
                field_name: filter.fieldName,
                value: endValue,
                operator: '<='
              }
            }
            return null
          } else {
            const key = `global_${filter.fieldName}`
            const value = customFilters[key]

            if (filter.type === 'multiselect') {
              if (Array.isArray(value) && value.length > 0) {
                return {
                  field_name: filter.fieldName,
                  value: value,
                  operator: 'IN'
                }
              }
            } else if (value && value !== '') {
              const operatorKey = `global_${filter.fieldName}_operator`
              const operator = customFilters[operatorKey] || (filter.type === 'text' ? 'CONTAINS' : '=')

              return {
                field_name: filter.fieldName,
                value: value,
                operator: operator
              }
            }
            return null
          }
        })
        .filter(Boolean)

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
              // Get the operator for this filter (default to CONTAINS for text, = for others)
              const operatorKey = `${query.id}_${filter.fieldName}_operator`
              const operator = customFilters[operatorKey] || (filter.type === 'text' ? 'CONTAINS' : '=')

              return {
                field_name: filter.fieldName,
                value: value,
                operator: operator
              }
            }
            return null
          }
        })
        .filter(Boolean)

      // Merge global filters with query filters
      const allFilters = [...globalFilters, ...queryFilters]

      const request = {
        report_id: reportId,
        query_id: query.id,
        filters: allFilters,
        limit: (query.visualization.type === 'table' || query.visualization.type === 'expandable') ? pageSize : 1000,
        ...((query.visualization.type === 'table' || query.visualization.type === 'expandable') && {
          page_size: pageSize,
          page_limit: page
        })
      }

      const response = await reportsService.executeReport(request)

      if (response.success && response.results.length > 0) {
        const result = response.results[0]
        // For pagination, we don't know exact total pages anymore (no COUNT query)
        // We only know if there are more pages via has_more flag
        const totalPages = (query.visualization.type === 'table' || query.visualization.type === 'expandable')
          ? (result.has_more ? page + 1 : page)  // If has_more, show at least one more page
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
    await Promise.all(
      reportData.queries.map(query =>
        executeQueryWithFilters(query, reportData.id, initialFilters)
      )
    )
  }

  // Set locale for date inputs
  useEffect(() => {
    // Set the document locale to Turkish for proper date formatting
    document.documentElement.lang = 'tr-TR'
  }, [])

  // Close all popovers when scrolling or clicking outside
  useEffect(() => {
    const handleScroll = (event: Event) => {
      const target = event.target

      // Check if target is a valid Element and has the closest method
      if (target && typeof (target as any).closest === 'function') {
        const element = target as Element
        // Don't close dropdowns if scrolling inside a dropdown menu
        if (element.closest('.max-h-48') || element.closest('.max-h-40')) {
          return
        }
      }

      setOpenPopovers({})
      setNestedFilterPopovers({})
      setDropdownOpen({})
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element

      // Close dropdown filters and operator menus when clicking outside
      const isInsideDropdown = target.closest('.filter-dropdown-container')
      const isInsideDropdownMenu = target.closest('.dropdown-menu')

      // If click is inside dropdown container or menu, don't close anything
      if (isInsideDropdown || isInsideDropdownMenu) {
        return
      }

      // Only close if clicking completely outside
      setDropdownOpen({})
      setOperatorMenuOpen({})

      // Close table filter popovers when clicking outside any filter area
      const isInsideAnyTableFilter = target.closest('th.relative') || target.closest('.absolute.top-full') || target.closest('.nested-filter-popover')
      const isInsideTable = target.closest('table')

      // Only close if not inside any table filter AND not inside the table at all
      if (!isInsideAnyTableFilter && !isInsideTable) {
        setOpenPopovers({})
        setNestedFilterPopovers({})
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

        // Initialize global filters first (with report.id as the key prefix)
        if (reportData.globalFilters) {
          for (const filter of reportData.globalFilters) {
            if (filter.type === 'date') {
              initialFilters[`global_${filter.fieldName}_start`] = ''
              initialFilters[`global_${filter.fieldName}_end`] = ''
            } else if (filter.type === 'multiselect') {
              initialFilters[`global_${filter.fieldName}`] = []
            } else {
              initialFilters[`global_${filter.fieldName}`] = ''
            }

            // For global filters, we need to load dropdown options differently
            // Create a pseudo-query object to reuse the existing loadDropdownOptions function
            if (filter.type === 'dropdown' || filter.type === 'multiselect') {
              const pseudoQuery = {
                id: 0, // Use 0 for global filters
                filters: reportData.globalFilters
              } as any
              dropdownPromises.push(loadDropdownOptions(pseudoQuery, filter))
            }
          }
        }

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

        // Load dropdown options and execute queries in parallel
        await Promise.all([
          ...dropdownPromises,
          executeAllQueries(reportData, initialFilters)
        ])

        // Check again if reportId changed
        if (currentReportIdRef.current !== reportId) {
          return
        }

        // Initialize grid layout
        // Priority: 1. Report data from DB, 2. localStorage, 3. Default layout
        if (reportData.layoutConfig && reportData.layoutConfig.length > 0) {
          // Validate and fix layout config - ensure all entries have valid query IDs
          const validQueryIds = new Set(reportData.queries.map(q => q.id.toString()))
          const validatedLayout = reportData.layoutConfig
            .filter((layout: any) => validQueryIds.has(layout.i.toString()))
            .map((layout: any) => ({
              ...layout,
              // Ensure minimum dimensions to prevent invisible widgets
              w: Math.max(layout.w || 2, 1),
              h: Math.max(layout.h || 4, 2),
              minW: 1,
              minH: 2
            }))

          // If we have valid layout for all queries, use it, otherwise regenerate
          if (validatedLayout.length === reportData.queries.length) {
            setGridLayout(validatedLayout)
          } else {
            setGridLayout(generateDefaultLayout(reportData.queries))
          }
        } else {
          const savedLayout = localStorage.getItem(`report_layout_${reportData.id}`)
          if (savedLayout) {
            setGridLayout(JSON.parse(savedLayout))
          } else {
            setGridLayout(generateDefaultLayout(reportData.queries))
          }
        }

      } catch (err) {
        if (currentReportIdRef.current === reportId) {
          setError(err instanceof Error ? err.message : 'Failed to load report')
        }
      } finally {
        if (currentReportIdRef.current === reportId) {
          setLoading(false)
          isLoadingRef.current = false
        }
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



  // Helper function to clear nested table states for a specific query
  const clearNestedStatesForQuery = (queryId: number) => {
    // Clear expanded rows for this query
    setExpandedRows(prev => {
      const newExpanded = { ...prev }
      Object.keys(newExpanded).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newExpanded[key]
        }
      })
      return newExpanded
    })

    // Clear nested data
    setNestedData(prev => {
      const newData = { ...prev }
      Object.keys(newData).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newData[key]
        }
      })
      return newData
    })

    // Clear nested filters
    setNestedFilters(prev => {
      const newFilters = { ...prev }
      Object.keys(newFilters).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newFilters[key]
        }
      })
      return newFilters
    })

    // Clear nested filter popovers
    setNestedFilterPopovers(prev => {
      const newPopovers = { ...prev }
      Object.keys(newPopovers).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newPopovers[key]
        }
      })
      return newPopovers
    })

    // Clear nested filter positions
    setNestedFilterPositions(prev => {
      const newPositions = { ...prev }
      Object.keys(newPositions).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newPositions[key]
        }
      })
      return newPositions
    })

    // Clear nested sorting
    setNestedSorting(prev => {
      const newSorting = { ...prev }
      Object.keys(newSorting).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newSorting[key]
        }
      })
      return newSorting
    })

    // Clear nested pagination
    setNestedPagination(prev => {
      const newPagination = { ...prev }
      Object.keys(newPagination).forEach(key => {
        if (key.startsWith(`${queryId}_`)) {
          delete newPagination[key]
        }
      })
      return newPagination
    })
  }

  const handleFilterChange = (queryId: number, fieldName: string, value: any) => {
    // For global filters, fieldName already includes 'global_' prefix, so use it directly
    // For query filters, construct the key as usual
    const key = fieldName.startsWith('global_') ? fieldName : `${queryId}_${fieldName}`
    console.log(`Setting filter ${key} = ${value}`)
    setFilters(prev => {
      const newFilters = {
        ...prev,
        [key]: value
      }

      // After updating the filter, check if any other filters depend on this one
      // and reload their options
      if (report) {
        // Handle global filters
        if (queryId === 0 && report.globalFilters) {
          // Extract the actual field name from the key (remove 'global_' prefix)
          const actualFieldName = fieldName.replace('global_', '').replace('_start', '').replace('_end', '').replace('_operator', '')
          const dependentFilters = report.globalFilters.filter(f => f.dependsOn === actualFieldName)

          // Clear dependent filter values and reload their options
          dependentFilters.forEach(depFilter => {
            const depKey = `global_${depFilter.fieldName}`
            // Clear the dependent filter value
            if (depFilter.type === 'multiselect') {
              newFilters[depKey] = []
            } else {
              newFilters[depKey] = ''
            }
            // Reload options for dependent filter
            const pseudoQuery = { id: 0, filters: report.globalFilters } as any
            loadDropdownOptions(pseudoQuery, depFilter, newFilters)
          })
        }

        // Handle query filters
        const query = report.queries.find(q => q.id === queryId)
        if (query) {
          // Extract the actual field name (remove suffixes and prefixes)
          const actualFieldName = fieldName.replace('_start', '').replace('_end', '').replace('_operator', '')
          // Find all filters that depend on this field
          const dependentFilters = query.filters.filter(f => f.dependsOn === actualFieldName)

          // Clear dependent filter values and reload their options
          dependentFilters.forEach(depFilter => {
            const depKey = `${queryId}_${depFilter.fieldName}`
            // Clear the dependent filter value
            if (depFilter.type === 'multiselect') {
              newFilters[depKey] = []
            } else {
              newFilters[depKey] = ''
            }
            // Reload options for dependent filter
            loadDropdownOptions(query, depFilter, newFilters)
          })
        }
      }

      return newFilters
    })
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
      // Clear nested states when parent table filter changes
      clearNestedStatesForQuery(queryId)

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

    // Clear nested states when parent table sort changes
    clearNestedStatesForQuery(query.id)

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

      // Clear the cache for this report and reports list
      api.clearCachePattern(new RegExp(`/reports`))

      setIsDeleteDialogOpen(false);
      if (subplatform) {
        router.push(`/${platformCode}/reports?subplatform=${subplatform}`);
      } else {
        router.push(`/${platformCode}/reports`);
      }
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
        
        if (query.visualization.type === 'table' || query.visualization.type === 'expandable') {
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

  // Render filters inline above query results (for non-table visualizations)
  const renderQueryFilters = (query: QueryData) => {
    if (query.filters.length === 0) return null

    return (
      <div className="mb-1 mt-0.5">
        <div className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
          <div className="flex flex-wrap items-end gap-1">
            {query.filters.map((filter) => (
              <div key={filter.id} className={`flex-shrink-0 ${filter.type === 'date' ? 'w-64' : 'w-36'}`}>
                <label className="block text-[9px] font-medium text-gray-600 mb-0.5">{filter.displayName}</label>
              {filter.type === 'date' ? (
                <div className="relative flex items-center gap-0.5 w-full">
                  <input
                    type="date"
                    value={filters[`${query.id}_${filter.fieldName}_start`] || ''}
                    onChange={(e) => {
                      const newValue = e.target.value
                      handleFilterChange(query.id, `${filter.fieldName}_start`, newValue)
                    }}
                    onClick={(e) => {
                      e.currentTarget.showPicker?.()
                    }}
                    className="flex-1 px-1.5 py-0.5 pr-5 border border-gray-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                    title="Başlangıç"
                  />
                  <span className="text-gray-500 text-[10px]">-</span>
                  <input
                    type="date"
                    value={filters[`${query.id}_${filter.fieldName}_end`] || ''}
                    onChange={(e) => {
                      const newValue = e.target.value
                      handleFilterChange(query.id, `${filter.fieldName}_end`, newValue)
                    }}
                    onClick={(e) => {
                      e.currentTarget.showPicker?.()
                    }}
                    className="flex-1 px-1.5 py-0.5 pr-4 border border-gray-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                    title="Bitiş"
                  />
                  {(filters[`${query.id}_${filter.fieldName}_start`] || filters[`${query.id}_${filter.fieldName}_end`]) && (
                    <button
                      onClick={() => {
                        handleFilterChange(query.id, `${filter.fieldName}_start`, '')
                        handleFilterChange(query.id, `${filter.fieldName}_end`, '')
                      }}
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded z-10"
                      title="Temizle"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ) : filter.type === 'dropdown' ? (
                (() => {
                  const filterKey = `${query.id}_${filter.fieldName}`
                  const searchTerm = searchTerms[filterKey] || ''
                  const dropdownData = dropdownOptions[filterKey] || { options: [], page: 1, hasMore: false, total: 0, loading: false }
                  const options = dropdownData.options
                  const selectedValue = filters[filterKey] || ''
                  const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || ''
                  const isOpen = dropdownOpen[filterKey] || false

                  // Check if this filter is disabled due to missing parent value
                  const isParentMissing = filter.dependsOn && !filters[`${query.id}_${filter.dependsOn}`]

                  return (
                    <div className="relative filter-dropdown-container">
                      {isParentMissing && (
                        <div className="absolute -top-4 left-0 text-[9px] text-amber-600">
                          Üst filtre seçilmedi
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setOperatorMenuOpen({})

                          // Check if opening or closing
                          const willBeOpen = !dropdownOpen[filterKey]

                          if (!willBeOpen) {
                            // Closing - just close it
                            setDropdownOpen(prev => ({ ...prev, [filterKey]: false }))
                            return
                          }

                          // Opening - reload options
                          setSearchTerms(prev => ({ ...prev, [filterKey]: '' }))
                          setDropdownOpen(prev => ({ ...prev, [filterKey]: true }))

                          // Force reload by calling loadDropdownOptions
                          if (filter.type === 'dropdown' || filter.type === 'multiselect') {
                            await loadDropdownOptions(query, filter, filters, 1, '', false)
                          }
                        }}
                        className={`w-full px-1.5 py-0.5 pr-9 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-[10px] bg-white text-left flex items-center justify-between ${
                          'hover:bg-gray-50'
                        }`}
                      >
                        <span className={`truncate ${selectedValue ? 'text-gray-900' : 'text-gray-500'}`}>
                          {selectedValue ? selectedLabel : 'Seçin'}
                        </span>
                      </button>
                      {selectedValue && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            handleFilterChange(query.id, filter.fieldName, '')

                            // Clear search and reload all options
                            setSearchTerms(prev => ({ ...prev, [filterKey]: '' }))
                            await loadDropdownOptions(query, filter, filters, 1, '', false)

                            // Clear and reload dependent filters
                            const newFilters = {
                              ...filters,
                              [`${query.id}_${filter.fieldName}`]: ''
                            }

                            query.filters.forEach(f => {
                              if (f.dependsOn === filter.fieldName) {
                                // Clear dependent filter value and options
                                handleFilterChange(query.id, f.fieldName, f.type === 'multiselect' ? [] : '')
                                setDropdownOptions(prev => ({
                                  ...prev,
                                  [`${query.id}_${f.fieldName}`]: { options: [], page: 1, hasMore: false, total: 0, loading: false }
                                }))
                              }
                            })
                          }}
                          className="absolute right-5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      <ChevronDown className="h-2.5 w-2.5 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {isOpen && (
                        <div className="dropdown-menu absolute z-50 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg">
                          <div className="p-1 border-b border-gray-200">
                            <div className="relative">
                              <Search className="absolute left-1.5 top-1 h-2.5 w-2.5 text-gray-400" />
                              <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                  const newSearch = e.target.value
                                  setSearchTerms(prev => ({ ...prev, [filterKey]: newSearch }))
                                  handleSearchOptions(filterKey, newSearch)
                                }}
                                placeholder="Ara..."
                                className="dropdown-search-input w-full pl-5 pr-1.5 py-0.5 border border-gray-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-orange-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {options.length === 0 ? (
                              <div className="px-2 py-1 text-[10px] text-gray-500">Sonuç bulunamadı</div>
                            ) : (
                              options.map((option, index) => (
                                <div
                                  key={`${filterKey}_${option.value}_${index}`}
                                  onClick={() => {
                                    const newValue = option.value
                                    handleFilterChange(query.id, filter.fieldName, newValue)
                                    setDropdownOpen(prev => ({ ...prev, [filterKey]: false }))
                                    setSearchTerms(prev => ({ ...prev, [filterKey]: '' }))

                                    // Reload dependent filters
                                    const newFilters = {
                                      ...filters,
                                      [`${query.id}_${filter.fieldName}`]: newValue
                                    }

                                    query.filters.forEach(f => {
                                      if (f.dependsOn === filter.fieldName) {
                                        // Clear dependent filter value and reload its options
                                        handleFilterChange(query.id, f.fieldName, f.type === 'multiselect' ? [] : '')
                                        loadDropdownOptions(query, f, newFilters)
                                      }
                                    })
                                  }}
                                  className={`px-2 py-1 text-[10px] cursor-pointer hover:bg-orange-50 ${
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
                  const filterKey = `${query.id}_${filter.fieldName}`
                  const searchTerm = searchTerms[filterKey] || ''
                  const dropdownData = dropdownOptions[filterKey] || { options: [], page: 1, hasMore: false, total: 0, loading: false }
                  const options = dropdownData.options
                  const currentValues = Array.isArray(filters[filterKey]) ? filters[filterKey] : []
                  const isOpen = dropdownOpen[filterKey] || false
                  const selectedCount = currentValues.length

                  // Check if this filter is disabled due to missing parent value
                  const isParentMissing = filter.dependsOn && !filters[`${query.id}_${filter.dependsOn}`]

                  return (
                    <div className="relative filter-dropdown-container">
                      {isParentMissing && (
                        <div className="absolute -top-4 left-0 text-[9px] text-amber-600">
                          Üst filtre seçilmedi
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setOperatorMenuOpen({})

                          // Check if opening or closing
                          const willBeOpen = !dropdownOpen[filterKey]

                          if (!willBeOpen) {
                            // Closing - just close it
                            setDropdownOpen(prev => ({ ...prev, [filterKey]: false }))
                            return
                          }

                          // Opening - reload options
                          setSearchTerms(prev => ({ ...prev, [filterKey]: '' }))
                          setDropdownOpen(prev => ({ ...prev, [filterKey]: true }))

                          // Force reload by calling loadDropdownOptions
                          if (filter.type === 'dropdown' || filter.type === 'multiselect') {
                            await loadDropdownOptions(query, filter, filters, 1, '', false)
                          }
                        }}
                        className={`w-full px-1.5 py-0.5 pr-9 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent text-[10px] bg-white text-left flex items-center justify-between ${
                          'hover:bg-gray-50'
                        }`}
                      >
                        <span className={`truncate ${selectedCount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                          {selectedCount > 0 ? `${selectedCount} seçildi` : 'Seçin'}
                        </span>
                      </button>
                      {selectedCount > 0 && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            handleFilterChange(query.id, filter.fieldName, [])

                            // Clear search and reload all options
                            setSearchTerms(prev => ({ ...prev, [filterKey]: '' }))
                            await loadDropdownOptions(query, filter, filters, 1, '', false)

                            // Clear and reload dependent filters
                            const newFilters = {
                              ...filters,
                              [`${query.id}_${filter.fieldName}`]: []
                            }

                            query.filters.forEach(f => {
                              if (f.dependsOn === filter.fieldName) {
                                // Clear dependent filter value and options
                                handleFilterChange(query.id, f.fieldName, f.type === 'multiselect' ? [] : '')
                                setDropdownOptions(prev => ({
                                  ...prev,
                                  [`${query.id}_${f.fieldName}`]: { options: [], page: 1, hasMore: false, total: 0, loading: false }
                                }))
                              }
                            })
                          }}
                          className="absolute right-5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                      <ChevronDown className="h-2.5 w-2.5 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {isOpen && (
                        <div className="dropdown-menu absolute z-50 w-full mt-0.5 bg-white border border-gray-300 rounded shadow-lg">
                          <div className="p-1 border-b border-gray-200">
                            <div className="relative">
                              <Search className="absolute left-1.5 top-1 h-2.5 w-2.5 text-gray-400" />
                              <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                  const newSearch = e.target.value
                                  setSearchTerms(prev => ({ ...prev, [filterKey]: newSearch }))
                                  handleSearchOptions(filterKey, newSearch)
                                }}
                                placeholder="Ara..."
                                className="dropdown-search-input w-full pl-5 pr-1.5 py-0.5 border border-gray-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-orange-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {options.length === 0 ? (
                              <div className="px-2 py-1 text-[10px] text-gray-500">Sonuç bulunamadı</div>
                            ) : (
                              options.map((option, index) => {
                                const isChecked = currentValues.includes(option.value)
                                return (
                                  <div
                                    key={`${filterKey}_${option.value}_${index}`}
                                    onClick={() => {
                                      let newValues
                                      if (isChecked) {
                                        newValues = currentValues.filter((v: any) => v !== option.value)
                                      } else {
                                        newValues = [...currentValues, option.value]
                                      }
                                      handleFilterChange(query.id, filter.fieldName, newValues)

                                      // Reload dependent filters
                                      const newFilters = {
                                        ...filters,
                                        [`${query.id}_${filter.fieldName}`]: newValues
                                      }

                                      query.filters.forEach(f => {
                                        if (f.dependsOn === filter.fieldName) {
                                          // Clear dependent filter value and reload its options
                                          handleFilterChange(query.id, f.fieldName, f.type === 'multiselect' ? [] : '')
                                          loadDropdownOptions(query, f, newFilters)
                                        }
                                      })
                                    }}
                                    className="px-2 py-1 text-[10px] cursor-pointer hover:bg-orange-50 flex items-center space-x-1"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      className="h-2.5 w-2.5 text-orange-600 focus:ring-orange-500 border-gray-300 rounded pointer-events-none"
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
                  const filterKey = `${query.id}_${filter.fieldName}`
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
                            const newValue = e.target.value
                            handleFilterChange(query.id, filter.fieldName, newValue)
                          }}
                          className="w-full h-[20px] px-7 py-1 pr-6 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent text-xs"
                          placeholder="Filtrele"
                        />
                        {/* Operator Icon Button on Input */}
                        <button
                          type="button"
                          onClick={() => setOperatorMenuOpen(prev => ({ ...prev, [operatorMenuKey]: !prev[operatorMenuKey] }))}
                          className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded"
                          title="Filtre koşulu"
                        >
                          <span className="text-sm font-semibold">{currentOperatorIcon}</span>
                        </button>
                        {/* Clear Button */}
                        {filters[filterKey] && (
                          <button
                            onClick={() => handleFilterChange(query.id, filter.fieldName, '')}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Operator Menu Dropdown */}
                      {isMenuOpen && (
                        <div className="absolute z-50 mt-1 bg-white border border-gray-300 rounded shadow-lg left-0 min-w-[180px]">
                          <div className="py-1">
                            {availableOperators.map((op) => (
                              <div
                                key={op.value}
                                onClick={() => {
                                  handleFilterChange(query.id, `${filter.fieldName}_operator`, op.value)
                                  setOperatorMenuOpen(prev => ({ ...prev, [operatorMenuKey]: false }))
                                }}
                                className={`px-3 py-2 text-xs cursor-pointer hover:bg-gray-100 flex items-center gap-2 ${
                                  op.value === currentOperator ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'
                                }`}
                              >
                                <span className="text-sm font-semibold w-5">{op.icon}</span>
                                <span>{op.label}</span>
                              </div>
                            ))}
                            <div className="border-t border-gray-200 mt-1 pt-1">
                              <div
                                onClick={() => {
                                  handleFilterChange(query.id, `${filter.fieldName}_operator`, defaultOperator)
                                  handleFilterChange(query.id, filter.fieldName, '')
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
                onClick={() => {
                  const queryState = queryResults[query.id]
                  const pageSize = queryState?.pageSize || 50
                  executeQueryWithFilters(query, report!.id, filters, 1, pageSize)
                }}
                className="h-[20px] px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap"
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


  // Handle expandable row click and nested query execution (recursive for multiple levels)
  const handleRowExpand = async (
    query: QueryData, 
    rowIndex: number, 
    rowData: any[], 
    nestedQueries: any[], 
    level: number = 0,
    parentRowKey: string = ''
  ) => {
    const rowKey = parentRowKey ? `${parentRowKey}_${rowIndex}` : `${query.id}_${rowIndex}`
    
    // Toggle expansion
    const isExpanding = !expandedRows[rowKey]
    setExpandedRows(prev => ({ ...prev, [rowKey]: isExpanding }))
    
    // If collapsing, just return
    if (!isExpanding) return
    
    // If already loaded and not being forced to refetch, don't re-fetch
    if (nestedData[rowKey] && !nestedData[rowKey].loading) return
    
    // Check if nested queries are configured
    if (!nestedQueries || nestedQueries.length === 0) {
      console.error('No nested queries configured')
      return
    }
    
    // Get filters from the nested query configs
    const nestedQueryFilters = nestedQueries.flatMap((nq: any) => nq.filters || [])
    
    // Set loading state
    setNestedData(prev => ({ 
      ...prev, 
      [rowKey]: { 
        columns: [], 
        data: [], 
        loading: true, 
        nestedQueries: nestedQueries,
        filters: nestedQueryFilters
      } 
    }))
    
    try {
      // Get columns from parent query or nested result
      let parentColumns: string[]
      if (level === 0) {
        const queryState = queryResults[query.id]
        if (!queryState?.result) return
        parentColumns = queryState.result.columns
      } else {
        const parentKey = rowKey.substring(0, rowKey.lastIndexOf('_'))
        const parentNestedData = nestedData[parentKey]
        if (!parentNestedData) return
        parentColumns = parentNestedData.columns
      }
      
      // Execute all nested queries at this level
      const results = await Promise.all(
        nestedQueries.map(async (nestedQueryConfig: any) => {
          const expandableFields = nestedQueryConfig.expandableFields || []
          const nestedQueryFilters = nestedQueryConfig.filters || []
          let processedQuery = nestedQueryConfig.sql
          
          // Replace parent field placeholders with actual values
          expandableFields.forEach((field: string) => {
            const columnIndex = parentColumns.indexOf(field)
            if (columnIndex !== -1) {
              const value = rowData[columnIndex]
              const placeholder = `{{${field}}}`
              // Escape single quotes in the value to prevent SQL injection and syntax errors
              const escapedValue = String(value).replace(/'/g, "''")
              processedQuery = processedQuery.replace(new RegExp(placeholder, 'g'), `'${escapedValue}'`)
            }
          })
          // Do not apply filters server-side; we will filter on client
          
          console.log('Executing nested query (level', level, ') with filters:', processedQuery)
          
          // Execute the nested query
          const response = await reportsService.previewQuery({
            sql_query: processedQuery,
            limit: 100
          })
          
          return {
            ...response,
            nestedQueries: nestedQueryConfig.nestedQueries || []
          }
        })
      )
      
      // Combine all results
      const allColumns = results.flatMap(r => r.columns)
      const allData = results.flatMap(r => r.data)
      const combinedNestedQueries = results[0]?.nestedQueries || []
      
      if (results.every(r => r.success)) {
        // Check if there's any data
        if (allData.length === 0) {
          // No data - collapse the row and don't set nested data
          setExpandedRows(prev => ({ ...prev, [rowKey]: false }))
          setNestedData(prev => {
            const newData = { ...prev }
            delete newData[rowKey]
            return newData
          })
          return
        }

        setNestedData(prev => ({
          ...prev,
          [rowKey]: {
            columns: [...new Set(allColumns)],
            data: allData,
            loading: false,
            nestedQueries: combinedNestedQueries,
            filters: nestedQueryFilters
          }
        }))
      } else {
        // Query failed - collapse the row
        setExpandedRows(prev => ({ ...prev, [rowKey]: false }))
        setNestedData(prev => {
          const newData = { ...prev }
          delete newData[rowKey]
          return newData
        })
        console.error('Some nested queries failed')
      }
    } catch (error) {
      console.error('Error executing nested query:', error)
      // Error - collapse the row
      setExpandedRows(prev => ({ ...prev, [rowKey]: false }))
      setNestedData(prev => {
        const newData = { ...prev }
        delete newData[rowKey]
        return newData
      })
    }
  }

  const renderVisualization = (query: QueryData, result: QueryResult, scale: number = 1) => {
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
        const queryState = queryResults[query.id]
        if (!queryState) return null

        return (
          <TableVisualization
            query={query}
            result={result}
            sorting={sorting[query.id] || null}
            onColumnSort={(column) => handleColumnSort(query, column)}
            filters={filters}
            openPopovers={openPopovers}
            dropdownOptions={dropdownOptions}
            onFilterChange={(fieldName, value) => {
              handleFilterChange(query.id, fieldName, value)
              // Don't execute query for operator changes - only for actual filter values
              if (fieldName.includes('_operator')) {
                return
              }
              // Execute query after filter change with delay
              setTimeout(() => {
                // Use callback form to get the latest filter state
                setFilters(currentFilters => {
                  executeQueryWithFilters(query, report!.id, currentFilters, 1, queryState.pageSize)
                  return currentFilters
                })
              }, fieldName.includes('_start') || fieldName.includes('_end') ? 500 : 100)
            }}
            onDebouncedFilterChange={(fieldName, value) => {
              handleDebouncedFilterChange(query.id, fieldName, value, query)
            }}
            setOpenPopovers={setOpenPopovers}
            onLoadMoreOptions={handleLoadMoreOptions}
            onSearchOptions={handleSearchOptions}
            currentPage={queryState.currentPage}
            pageSize={queryState.pageSize}
            totalPages={queryState.totalPages}
            totalRows={result.total_rows}
            onPageChange={(page) => handlePageChange(query, page)}
            onPageSizeChange={(pageSize) => handlePageSizeChange(query, pageSize)}
          />
        )



      case 'expandable':
        const expandableQueryState = queryResults[query.id]
        if (!expandableQueryState) return null

        return (
          <ExpandableTableVisualization
            query={query}
            result={result}
            sorting={sorting[query.id] || null}
            onColumnSort={(column) => handleColumnSort(query, column)}
            filters={filters}
            openPopovers={openPopovers}
            dropdownOptions={dropdownOptions}
            onFilterChange={(fieldName, value) => {
              handleFilterChange(query.id, fieldName, value)
              // Don't execute query for operator changes - only for actual filter values
              if (fieldName.includes('_operator')) {
                return
              }
              // Execute query after filter change with delay
              setTimeout(() => {
                clearNestedStatesForQuery(query.id)
                // Use callback form to get the latest filter state
                setFilters(currentFilters => {
                  executeQueryWithFilters(query, report!.id, currentFilters, 1, expandableQueryState.pageSize)
                  return currentFilters
                })
              }, fieldName.includes('_start') || fieldName.includes('_end') ? 500 : 100)
            }}
            onDebouncedFilterChange={(fieldName, value) => {
              handleDebouncedFilterChange(query.id, fieldName, value, query)
            }}
            setOpenPopovers={setOpenPopovers}
            onLoadMoreOptions={handleLoadMoreOptions}
            onSearchOptions={handleSearchOptions}
            currentPage={expandableQueryState.currentPage}
            pageSize={expandableQueryState.pageSize}
            totalPages={expandableQueryState.totalPages}
            totalRows={result.total_rows}
            onPageChange={(page) => handlePageChange(query, page)}
            onPageSizeChange={(pageSize) => handlePageSizeChange(query, pageSize)}
            expandedRows={expandedRows}
            nestedData={nestedData}
            nestedFilters={nestedFilters}
            nestedFilterPopovers={nestedFilterPopovers}
            nestedFilterPositions={nestedFilterPositions}
            nestedSorting={nestedSorting}
            nestedPagination={nestedPagination}
            setNestedFilters={setNestedFilters}
            setNestedFilterPopovers={setNestedFilterPopovers}
            setNestedFilterPositions={setNestedFilterPositions}
            setNestedSorting={setNestedSorting}
            setNestedPagination={setNestedPagination}
            onRowExpand={(query, rowIndex, rowData, nestedQueries, level, parentRowKey) => handleRowExpand(query, rowIndex, rowData, nestedQueries, level, parentRowKey)}
            scale={scale}
          />
        )

      case 'bar':
        return <BarVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'line':
        return <LineVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'pie':
        return <PieVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'area':
        return <AreaVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'scatter':
        return <ScatterVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'boxplot':
        return <BoxPlotVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'pareto':
        return <ParetoVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'histogram':
        return <HistogramVisualization query={query} result={result} colors={colors} scale={scale} />

      case 'card':
        return <CardVisualization query={query} result={result} colors={colors} scale={scale} />

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative flex items-end justify-center h-20 space-x-2">
            <div className="w-3 bg-blue-600 rounded-t animate-bounce" style={{ height: '40%', animationDelay: '0ms', animationDuration: '0.8s' }} />
            <div className="w-3 bg-blue-500 rounded-t animate-bounce" style={{ height: '60%', animationDelay: '150ms', animationDuration: '0.8s' }} />
            <div className="w-3 bg-blue-600 rounded-t animate-bounce" style={{ height: '80%', animationDelay: '300ms', animationDuration: '0.8s' }} />
            <div className="w-3 bg-blue-500 rounded-t animate-bounce" style={{ height: '50%', animationDelay: '450ms', animationDuration: '0.8s' }} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-gray-800">Rapor Yükleniyor</h3>
            <p className="text-gray-600">Veriler getiriliyor ve görselleştirmeler hazırlanıyor...</p>
          </div>
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
    <div className="container min-w-full space-y-3">
      {/* Report Header */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 px-4 py-2 space-y-1.5 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{report.name}</h1>
                <div className="relative" ref={dropdownRef}>
                  <button
                    className="h-6 w-6 p-0 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-700"
                    onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                  
                  {/* Settings Dropdown */}
                  {isSettingsDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setIsSettingsDropdownOpen(false);
                            if (subplatform) {
                              router.push(`/${platformCode}/reports/${reportId}/edit?subplatform=${subplatform}`);
                            } else {
                              router.push(`/${platformCode}/reports/${reportId}/edit`);
                            }
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
              <p className="text-gray-600 text-xs mt-0.5">{report.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isLayoutEditMode ? (
              <>
                <button
                  onClick={() => setIsLayoutEditMode(true)}
                  className="flex items-center gap-1.5 bg-purple-600 text-white px-2.5 py-1 text-xs rounded-md hover:bg-purple-700 transition-colors"
                >
                  <Layout className="h-3 w-3" />
                  Düzen
                </button>
                <button
                  onClick={() => report && executeAllQueries(report, filters)}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 py-1 text-xs rounded-md hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Yenile
                </button>
                <button
                  onClick={exportToExcel}
                  disabled={isExporting || Object.keys(queryResults).length === 0 || Object.values(queryResults).every(q => !q.result)}
                  className="flex items-center gap-1.5 bg-green-600 text-white px-2.5 py-1 text-xs rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Aktarılıyor...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-3 w-3" />
                      Excel
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSaveLayout}
                  disabled={isSavingLayout}
                  className="flex items-center gap-1.5 bg-green-600 text-white px-2.5 py-1 text-xs rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSavingLayout ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="h-3 w-3" />
                      Kaydet
                    </>
                  )}
                </button>
                <button
                  onClick={handleCancelLayoutEdit}
                  disabled={isSavingLayout}
                  className="flex items-center gap-1.5 bg-gray-600 text-white px-2.5 py-1 text-xs rounded-md hover:bg-gray-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <XCircle className="h-3 w-3" />
                  İptal
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <div className="flex items-center gap-1">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(report.created_at).toLocaleDateString()}
          </div>
          {report.owner_name && (
            <div className="flex items-center gap-1">
              <User className="h-2.5 w-2.5" />
              {report.owner_name}
            </div>
          )}
          {report.is_public && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-800">
              Public
            </span>
          )}
          {report.tags && report.tags.length > 0 && report.tags.map((tag, index) => (
            <span key={index} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-white border border-gray-300 text-gray-700">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Global Filters */}
      {report.globalFilters && report.globalFilters.length > 0 && (
        <GlobalFilters
          globalFilters={report.globalFilters}
          filters={filters}
          dropdownOptions={dropdownOptions}
          searchTerms={searchTerms}
          dropdownOpen={dropdownOpen}
          operatorMenuOpen={operatorMenuOpen}
          onFilterChange={handleFilterChange}
          setSearchTerms={setSearchTerms}
          setDropdownOpen={setDropdownOpen}
          setOperatorMenuOpen={setOperatorMenuOpen}
          onApplyFilters={() => report && executeAllQueries(report, filters)}
        />
      )}

      {/* Queries */}
      {isLayoutEditMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold">Düzen Düzenleme Modu</p>
              <p className="mt-1">Widget'ları sürükleyerek taşıyabilir ve kenarlarından çekerek boyutlandırabilirsiniz. Sayfa 4 sütunlu bir ızgaraya sahiptir.</p>
            </div>
          </div>
        </div>
      )}

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: gridLayout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 4, md: 4, sm: 2, xs: 1, xxs: 1 }}
        rowHeight={120}
        isDraggable={isLayoutEditMode}
        isResizable={isLayoutEditMode}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        compactType="vertical"
        preventCollision={false}
      >
        {report.queries.map((query) => {
          const Icon = VISUALIZATION_ICONS[query.visualization.type] || Table
          const queryState = queryResults[query.id]

          // Calculate scale based on grid layout height
          const layoutItem = gridLayout.find((item: any) => item.i === query.id.toString())
          const gridItemHeight = layoutItem ? layoutItem.h * 120 : 480 // h * rowHeight
          const scale = isLayoutEditMode ? Math.min(gridItemHeight / 500, 1) : 1

          return (
            <div key={query.id.toString()} className={`bg-white rounded-lg shadow-md border ${isLayoutEditMode ? 'border-blue-400 border-2' : 'border-gray-200'} h-full flex flex-col`} data-query-id={query.id}>
              <div className={`pb-2 px-4 pt-4 flex-shrink-0 ${isLayoutEditMode ? 'drag-handle cursor-move bg-blue-50' : ''}`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-blue-600" />
                  <span className="text-base font-semibold">{query.name}</span>
                  {isLayoutEditMode && (
                    <span className="ml-auto text-xs text-blue-600 font-medium">Sürükle</span>
                  )}
                </div>
              </div>

              <div className="space-y-3 px-4 pb-4 relative flex-1 overflow-hidden">
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
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Show filters above charts (but not for tables) */}
                    {query.visualization.type !== 'table' && query.visualization.type !== 'expandable' && renderQueryFilters(query)}
                    {renderVisualization(query, queryState.result, scale)}
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
      </ResponsiveGridLayout>

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

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />
      
      {/* Feedback Button */}
      <Feedback />
    </div>
  )
}