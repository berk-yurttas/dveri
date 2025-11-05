import { useState, useEffect, useRef } from 'react'
import { reportsService } from '@/services/reports'

export interface ReportData {
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

export interface QueryData {
  id: number
  name: string
  sql: string
  visualization: {
    type: 'table' | 'expandable' | 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'pareto' | 'boxplot' | 'histogram'
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

export interface FilterData {
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

export interface QueryResult {
  query_id: number
  query_name: string
  columns: string[]
  data: any[][]
  total_rows: number
  execution_time_ms: number
  success: boolean
  message?: string
}

export interface FilterState {
  [key: string]: any
}

export interface QueryResultState {
  [queryId: number]: {
    result: QueryResult | null
    loading: boolean
    error: string | null
    currentPage: number
    pageSize: number
    totalPages: number
  }
}

export function useReportData(reportId: string) {
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({})
  const [queryResults, setQueryResults] = useState<QueryResultState>({})
  const [dropdownOptions, setDropdownOptions] = useState<{[key: string]: Array<{value: any, label: string}>}>({})

  const currentReportIdRef = useRef<string | null>(null)
  const isLoadingRef = useRef(false)

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

  // Execute all queries with initial empty filters
  const executeAllQueries = async (reportData: ReportData, initialFilters: FilterState) => {
    for (const query of reportData.queries) {
      await executeQueryWithFilters(query, reportData.id, initialFilters)
    }
  }

  // Execute a single query with custom filters
  const executeQueryWithFilters = async (
    query: QueryData,
    reportId: number,
    customFilters: FilterState,
    page: number = 1,
    pageSize: number = 10
  ) => {
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
            const key = `${query.id}_${filter.fieldName}`
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
        limit: (query.visualization.type === 'table' || query.visualization.type === 'expandable') ? pageSize : 1000,
        ...((query.visualization.type === 'table' || query.visualization.type === 'expandable') && {
          page_size: pageSize,
          page_limit: page
        })
      }

      const response = await reportsService.executeReport(request)

      if (response.success && response.results.length > 0) {
        const result = response.results[0]
        const totalPages = (query.visualization.type === 'table' || query.visualization.type === 'expandable')
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

  // Load report and execute queries automatically
  useEffect(() => {
    const loadReport = async () => {
      // Prevent multiple loads for the same reportId
      if (isLoadingRef.current || currentReportIdRef.current === reportId) {
        return
      }

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
              initialFilters[`${query.id}_${filter.fieldName}_start`] = ''
              initialFilters[`${query.id}_${filter.fieldName}_end`] = ''
            } else if (filter.type === 'multiselect') {
              initialFilters[`${query.id}_${filter.fieldName}`] = []
            } else {
              initialFilters[`${query.id}_${filter.fieldName}`] = ''
            }

            if (filter.type === 'dropdown' || filter.type === 'multiselect') {
              dropdownPromises.push(loadDropdownOptions(query, filter))
            }
          }
        }

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

    return () => {
      if (currentReportIdRef.current !== reportId) {
        currentReportIdRef.current = null
        isLoadingRef.current = false
      }
    }
  }, [reportId])

  return {
    report,
    loading,
    error,
    filters,
    setFilters,
    queryResults,
    setQueryResults,
    dropdownOptions,
    setDropdownOptions,
    executeQueryWithFilters,
    executeAllQueries,
    loadDropdownOptions,
  }
}

