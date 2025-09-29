"use client"

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/appShell/ui/card"
import { Button } from "@/components/appShell/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/appShell/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/appShell/ui/dialog"
import { Plus, Trash2, Database, BarChart3, PieChart, LineChart, Table, Calendar, Filter, Hash, Type, List, Play, Loader2, ArrowLeft } from "lucide-react"
import { reportsService } from '@/services/reports'
import { ReportPreviewResponse, SavedReport } from '@/types/reports'
import { BarChart, Bar, LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// Import types from the types file
import { QueryConfig, FilterConfig, ReportConfig, VisualizationConfig } from '@/types/reports'

const VISUALIZATION_OPTIONS = [
  { value: 'table', label: 'Tablo', icon: Table },
  { value: 'bar', label: 'Sütun Grafik', icon: BarChart3 },
  { value: 'line', label: 'Çizgi Grafik', icon: LineChart },
  { value: 'pie', label: 'Pasta Grafik', icon: PieChart },
  { value: 'area', label: 'Alan Grafik', icon: BarChart3 },
  { value: 'scatter', label: 'Scatter Plot', icon: BarChart3 },
  { value: 'pareto', label: 'Pareto Grafiği', icon: BarChart3 },
  { value: 'boxplot', label: 'Box Plot', icon: BarChart3 },
  { value: 'histogram', label: 'Histogram', icon: BarChart3 },
] as const

const FILTER_TYPES = [
  { value: 'date', label: 'Tarih', icon: Calendar },
  { value: 'dropdown', label: 'Tekli Seçim', icon: List },
  { value: 'multiselect', label: 'Çoklu Seçim', icon: List },
  { value: 'number', label: 'Sayı', icon: Hash },
  { value: 'text', label: 'Metin', icon: Type },
] as const

// Custom Input component
const Input = ({ className = '', ...props }: React.ComponentProps<"input">) => (
  <input
    className={`w-full h-10 px-4 py-2 text-sm border-2 border-slate-200 rounded-lg bg-white/50 backdrop-blur-sm
                focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:bg-white
                transition-all duration-200 outline-none disabled:opacity-50 disabled:bg-slate-50
                hover:border-slate-300 ${className}`}
    {...props}
  />
)

// Custom Textarea component
const Textarea = ({ className = '', ...props }: React.ComponentProps<"textarea">) => (
  <textarea
    className={`w-full min-h-16 px-4 py-3 text-sm border-2 border-slate-200 rounded-lg bg-white/50 backdrop-blur-sm
                focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:bg-white
                transition-all duration-200 outline-none disabled:opacity-50 disabled:bg-slate-50
                hover:border-slate-300 resize-vertical ${className}`}
    {...props}
  />
)

// Custom Label component
const Label = ({ className = '', ...props }: React.ComponentProps<"label">) => (
  <label className={`text-sm font-semibold text-slate-700 ${className}`} {...props} />
)

// Custom Select component
const Select = ({
  value,
  onValueChange,
  children,
  className = '',
  placeholder = "Seçin...",
  ...props
}: {
  value?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  className?: string
  placeholder?: string
} & React.ComponentProps<"select">) => {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={`w-full h-10 px-4 py-2 text-sm border-2 border-slate-200 rounded-lg bg-white/50 backdrop-blur-sm
                  focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 focus:bg-white
                  transition-all duration-200 outline-none disabled:opacity-50 disabled:bg-slate-50
                  hover:border-slate-300 ${className}`}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {children}
    </select>
  )
}

// Custom Badge component
const Badge = ({
  children,
  variant = 'secondary',
  className = ''
}: {
  children: React.ReactNode
  variant?: 'secondary'
  className?: string
}) => (
  <span className={`inline-flex items-center px-3 py-1 text-xs font-medium rounded-full
                   bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800
                   border border-blue-200/50 shadow-sm ${className}`}>
    {children}
  </span>
)

// Custom Separator component
const Separator = ({ className = '' }: { className?: string }) => (
  <div className={`w-full h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent my-6 ${className}`} />
)

// Custom Checkbox component
const Checkbox = ({
  checked,
  onCheckedChange,
  id,
  className = '',
  ...props
}: {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  id?: string
  className?: string
}) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
    id={id}
    className={`w-4 h-4 text-blue-600 bg-white border-2 border-slate-300 rounded
                focus:ring-blue-500 focus:ring-2 hover:border-blue-400
                transition-colors duration-200 ${className}`}
    {...props}
  />
)

// Chart Preview Component (same as add page)
const ChartPreview = ({
  data,
  visualization
}: {
  data: ReportPreviewResponse
  visualization: VisualizationConfig
}) => {
  const { columns, data: rawData } = data

  // Transform data for charts
  const transformDataForChart = () => {
    if (!rawData || rawData.length === 0) return []

    return rawData.map((row, index) => {
      const item: any = { index }
      columns.forEach((column, colIndex) => {
        item[column] = row[colIndex]
      })
      return item
    })
  }

  const chartData = transformDataForChart()
  const colors = visualization.colors || ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#413ea0', '#ff6b6b', '#4ecdc4', '#45b7d1']

  // Generic custom tooltip component for all chart types
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const tooltipFields = visualization.chartOptions?.tooltipFields || []

      // If no custom tooltip fields are set, use default behavior
      if (tooltipFields.length === 0) {
        return null // Let Recharts handle default tooltip
      }

      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg text-sm">
          {tooltipFields.map((field: string) => (
            <div key={field} className="flex justify-between gap-4 mb-1">
              <span className="font-medium text-slate-600">
                {visualization.chartOptions?.fieldDisplayNames?.[field] || field}:
              </span>
              <span className="text-slate-800">
                {data[field] !== null ? String(data[field]) : 'null'}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-500">Grafik verisi bulunamadı</p>
        </div>
      </div>
    )
  }

  const renderChart = () => {
    switch (visualization.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey={visualization.xAxis || columns[0]}
                tick={{ fontSize: 12 }}
                stroke="#64748b"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#64748b"
              />
              <Tooltip
                content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
                contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px'
                } : undefined}
              />
              {visualization.showLegend && <Legend />}
              <Bar
                dataKey={visualization.yAxis || columns[1]}
                fill={colors[0]}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsLineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey={visualization.xAxis || columns[0]}
                tick={{ fontSize: 12 }}
                stroke="#64748b"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#64748b"
              />
              <Tooltip
                content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
                contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px'
                } : undefined}
              />
              {visualization.showLegend && <Legend />}
              <Line
                type={visualization.chartOptions?.smooth ? "monotone" : "linear"}
                dataKey={visualization.yAxis || columns[1]}
                stroke={colors[0]}
                strokeWidth={3}
                dot={visualization.chartOptions?.showDots !== false}
                activeDot={{ r: 6, fill: colors[0] }}
              />
            </RechartsLineChart>
          </ResponsiveContainer>
        )

      case 'pie':
        const pieData = chartData.slice(0, 10).map((item, index) => ({
          name: item[visualization.labelField || columns[0]],
          value: Number(item[visualization.valueField || columns[1]]) || 0,
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
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
                label={visualization.chartOptions?.showPercentage ?
                  ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%` :
                  ({ name }) => name
                }
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
                contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '12px'
                } : undefined}
              />
              {visualization.showLegend && <Legend />}
            </RechartsPieChart>
          </ResponsiveContainer>
        )

      default:
        return <div className="text-center py-8 text-slate-500">Bu grafik tipi henüz desteklenmiyor</div>
    }
  }

  return (
    <div className="space-y-4">
      {visualization.title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">
          {visualization.title}
        </h3>
      )}
      <div className="bg-white rounded-lg">
        {renderChart()}
      </div>
      <div className="text-xs text-slate-500 text-center space-y-1">
        <p>X Ekseni: {visualization.xAxis || columns[0]} | Y Ekseni: {visualization.yAxis || columns[1]}</p>
        <p>{chartData.length} veri noktası gösteriliyor</p>
      </div>
    </div>
  )
}

export default function EditReportPage() {
  const router = useRouter()
  const params = useParams()
  const reportId = params.id as string

  const [report, setReport] = useState<ReportConfig>({
    name: '',
    description: '',
    queries: []
  })

  const [originalReport, setOriginalReport] = useState<SavedReport | null>(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [activeQueryIndex, setActiveQueryIndex] = useState<number>(0)
  const [previewResults, setPreviewResults] = useState<Record<string, ReportPreviewResponse>>({})
  const [loadingPreview, setLoadingPreview] = useState<Record<string, boolean>>({})
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [filterValues, setFilterValues] = useState<Record<string, any>>({})
  const [activeQueryForFilters, setActiveQueryForFilters] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Helper function to generate unique IDs
  const generateId = () => Math.random().toString(36).substr(2, 9)

  // Load existing report data
  useEffect(() => {
    const loadReport = async () => {
      try {
        setIsInitialLoading(true)
        const reportData = await reportsService.getReportById(reportId)
        setOriginalReport(reportData)
        
        // Convert SavedReport to ReportConfig format
        const convertedReport: ReportConfig = {
          name: reportData.name,
          description: reportData.description,
          queries: reportData.queries.map((query, index) => ({
            id: query.id?.toString() || generateId(),
            name: query.name,
            sql: query.sql,
            visualization: query.visualization,
            filters: query.filters.map((filter, filterIndex) => ({
              id: filter.id?.toString() || generateId(),
              fieldName: filter.fieldName,
              displayName: filter.displayName,
              type: filter.type,
              dropdownQuery: filter.dropdownQuery || undefined,
              required: filter.required
            }))
          }))
        }
        
        setReport(convertedReport)
      } catch (err: any) {
        console.error("Error loading report:", err)
        setError("Rapor yüklenemedi")
      } finally {
        setIsInitialLoading(false)
      }
    }

    if (reportId) {
      loadReport()
    }
  }, [reportId])

  // Extract fields from SQL SELECT clause
  const extractFieldsFromSQL = (sql: string): string[] => {
    try {
      // Remove comments and normalize whitespace for multi-line SQL
      const normalizedSql = sql
        .replace(/--.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .replace(/\s+/g, ' ') // Replace multiple whitespaces with single space
        .trim()

      // Handle CTEs (Common Table Expressions) - find the main/outer SELECT
      let mainSelectSql = normalizedSql
      
      // Check if this is a CTE query (starts with WITH)
      if (normalizedSql.match(/^\s*WITH\s+/i)) {
        // Find the main SELECT after all CTEs
        // Look for SELECT that's not inside parentheses and comes after the last CTE
        const ctePattern = /WITH\s+[\s\S]*?\)\s*SELECT\s+(.*?)\s+FROM/i
        const cteMatch = normalizedSql.match(ctePattern)
        
        if (cteMatch) {
          // Extract just the main SELECT part
          const mainSelectStart = normalizedSql.lastIndexOf('SELECT')
          if (mainSelectStart > 0) {
            mainSelectSql = normalizedSql.substring(mainSelectStart)
          }
        }
      }

      // Extract SELECT clause (from SELECT to FROM, case insensitive)
      const selectMatch = mainSelectSql.match(/SELECT\s+(.*?)\s+FROM/i)
      if (!selectMatch) return []

      const fieldsStr = selectMatch[1]
      const fields = fieldsStr
        .split(',')
        .map(field => {
          field = field.trim()

          // Skip empty fields
          if (!field) return null

          // Handle aliases with AS keyword and quoted strings (single, double, backtick)
          const quotedAliasMatch = field.match(/\s+as\s+['"`]([^'"`]+)['"`]/i)
          if (quotedAliasMatch) return quotedAliasMatch[1].trim()

          // Handle aliases with AS keyword (case insensitive) - support underscores
          const aliasMatch = field.match(/\s+as\s+([\w_]+)/i)
          if (aliasMatch) return aliasMatch[1].trim()

          // Handle quoted aliases without AS keyword
          const directQuotedMatch = field.match(/[\w_().]+\s+['"`]([^'"`]+)['"`]$/i)
          if (directQuotedMatch) return directQuotedMatch[1].trim()

          // Handle simple aliases (last word that's not a function) - support underscores
          const parts = field.trim().split(/\s+/)
          if (parts.length > 1) {
            const lastPart = parts[parts.length - 1]
            // If last part doesn't contain parentheses or dots, it's likely an alias - support underscores
            if (!lastPart.match(/[().]/) && !lastPart.match(/^(SELECT|FROM|WHERE|JOIN|ON|AND|OR)$/i)) {
              return lastPart
            }
          }

          // Handle table.field notation - support underscores
          const dotMatch = field.match(/([\w_]+)\.([\w_]+)/)
          if (dotMatch) return dotMatch[2]

          // Handle simple field names - support underscores
          const simpleMatch = field.match(/^([\w_]+)/)
          if (simpleMatch) return simpleMatch[1]

          return null
        })
        .filter((field): field is string => field !== null && !field.match(/^\*$|^(COUNT|SUM|AVG|MIN|MAX|DISTINCT)$/i))
      return [...new Set(fields)] // Remove duplicates
    } catch (error) {
      console.error('Error parsing SQL:', error)
      return []
    }
  }

  const addNewQuery = () => {
    const newQuery: QueryConfig = {
      id: generateId(),
      name: `Sorgu ${report.queries.length + 1}`,
      sql: '',
      visualization: {
        type: 'table',
        title: `Sorgu ${report.queries.length + 1} Grafiği`,
        showLegend: true,
        colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
        chartOptions: {
          showGrid: true,
          showDataLabels: false,
          stacked: false,
          showPercentage: true,
          innerRadius: 0,
          smooth: false,
          showDots: true
        }
      },
      filters: []
    }
    setReport(prev => ({
      ...prev,
      queries: [...prev.queries, newQuery]
    }))
    setActiveQueryIndex(report.queries.length)
  }

  const updateQuery = (index: number, updates: Partial<QueryConfig>) => {
    setReport(prev => ({
      ...prev,
      queries: prev.queries.map((query, i) =>
        i === index ? { ...query, ...updates } : query
      )
    }))
  }

  const updateVisualization = (queryIndex: number, updates: Partial<VisualizationConfig>) => {
    setReport(prev => ({
      ...prev,
      queries: prev.queries.map((query, i) =>
        i === queryIndex
          ? { ...query, visualization: { ...query.visualization, ...updates } }
          : query
      )
    }))
  }

  const removeQuery = (index: number) => {
    setReport(prev => ({
      ...prev,
      queries: prev.queries.filter((_, i) => i !== index)
    }))
    if (activeQueryIndex >= index && activeQueryIndex > 0) {
      setActiveQueryIndex(activeQueryIndex - 1)
    }
  }

  const addFilter = (queryIndex: number) => {
    const query = report.queries[queryIndex]
    const availableFields = extractFieldsFromSQL(query.sql)

    if (availableFields.length === 0) {
      alert('Önce bir SQL sorgusu girin ve alan adlarını tanımlayın.')
      return
    }

    const newFilter: FilterConfig = {
      id: generateId(),
      fieldName: availableFields[0],
      displayName: availableFields[0],
      type: 'text',
      required: false
    }

    updateQuery(queryIndex, {
      filters: [...query.filters, newFilter]
    })
  }

  const updateFilter = (queryIndex: number, filterIndex: number, updates: Partial<FilterConfig>) => {
    const query = report.queries[queryIndex]
    const updatedFilters = query.filters.map((filter, i) =>
      i === filterIndex ? { ...filter, ...updates } : filter
    )
    updateQuery(queryIndex, { filters: updatedFilters })
  }

  const removeFilter = (queryIndex: number, filterIndex: number) => {
    const query = report.queries[queryIndex]
    const updatedFilters = query.filters.filter((_, i) => i !== filterIndex)
    updateQuery(queryIndex, { filters: updatedFilters })
  }

  const replaceDynamicFilters = (sql: string, filters: FilterConfig[], values: Record<string, any>): string => {
    let modifiedSql = sql
    console.log('Original SQL:', sql)
    console.log('Filter values:', values)

    filters.forEach(filter => {
      console.log('Processing filter:', filter)
      let condition = ''
      
      switch (filter.type) {
        case 'text':
          const textValue = values[filter.fieldName]
          if (textValue) {
            condition = `${filter.fieldName} LIKE '%${textValue}%'`
          }
          break
        case 'number':
          const numValue = values[filter.fieldName]
          if (numValue) {
            condition = `${filter.fieldName} = ${numValue}`
          }
          break
          case 'date':
          const startDate = values[`${filter.fieldName}_start`]
          const endDate = values[`${filter.fieldName}_end`]
          console.log('Date filter values:', { startDate, endDate })
          
          // Format date for Clickhouse DateTime64
          const formatDateForClickhouse = (date: Date) => {
            const pad = (num: number) => String(num).padStart(2, '0')
            const padMs = (num: number) => String(num).padStart(3, '0')
            
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
                   `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${padMs(date.getMilliseconds())}`
          }

          // Add time components for start and end of day
          const formatStartDate = (date: string) => {
            const d = new Date(date)
            d.setHours(0, 0, 0, 0)
            return formatDateForClickhouse(d)
          }

          const formatEndDate = (date: string) => {
            const d = new Date(date)
            d.setHours(23, 59, 59, 999)
            return formatDateForClickhouse(d)
          }
          
          if (startDate && endDate) {
            const utcStartDate = formatStartDate(startDate)
            const utcEndDate = formatEndDate(endDate)
            condition = `${filter.fieldName} BETWEEN '${utcStartDate}' AND '${utcEndDate}'`
          } else if (startDate) {
            const utcStartDate = formatStartDate(startDate)
            condition = `${filter.fieldName} >= '${utcStartDate}'`
          } else if (endDate) {
            const utcEndDate = formatEndDate(endDate)
            condition = `${filter.fieldName} <= '${utcEndDate}'`
          }
          break
        case 'dropdown':
        case 'multiselect':
          const dropdownValue = values[filter.fieldName]
          if (Array.isArray(dropdownValue)) {
            condition = `${filter.fieldName} IN (${dropdownValue.map(v => `'${v}'`).join(',')})`
          } else if (dropdownValue) {
            condition = `${filter.fieldName} = '${dropdownValue}'`
          }
          break
      }

      if (condition) {
        console.log('Adding condition:', condition)
        modifiedSql = modifiedSql.replace('{{dynamic_filters}}', `AND ${condition} {{dynamic_filters}}`)
      }
    })

    // Remove the remaining placeholder
    modifiedSql = modifiedSql.replace('{{dynamic_filters}}', '')
    console.log('Final SQL:', modifiedSql)
    return modifiedSql
  }

  const runQueryPreview = async (queryId: string, sqlQuery: string, skipFilterDialog = false) => {
    console.log('runQueryPreview called with:', { queryId, sqlQuery, skipFilterDialog })
    
    if (!sqlQuery.trim()) {
      alert('Önce bir SQL sorgusu girin.')
      return
    }

    const query = report.queries.find(q => q.id === queryId)
    if (!query) {
      console.error('Query not found:', queryId)
      return
    }

    if (query.filters.length > 0 && !skipFilterDialog) {
      console.log('Opening filter dialog for query:', queryId)
      setActiveQueryForFilters(queryId)
      setFilterDialogOpen(true)
      return
    }

    console.log('Running query with current filter values:', filterValues)
    setLoadingPreview(prev => ({ ...prev, [queryId]: true }))

    try {
      const finalSql = replaceDynamicFilters(sqlQuery, query.filters, filterValues)
      console.log('Executing query:', finalSql)
      
      const result = await reportsService.previewQuery({
        sql_query: finalSql,
        limit: 100
      })

      console.log('Query result:', result)
      setPreviewResults(prev => ({ ...prev, [queryId]: result }))

      if (!result.success && result.message) {
        alert(`Sorgu hatası: ${result.message}`)
      }
    } catch (error) {
      console.error('Preview error:', error)
      // Create a failed result object
      const failedResult: ReportPreviewResponse = {
        columns: [],
        data: [],
        total_rows: 0,
        execution_time_ms: 0,
        success: false,
        message: error instanceof Error ? error.message : 'Sorgu önizleme sırasında hata oluştu.'
      }
      setPreviewResults(prev => ({ ...prev, [queryId]: failedResult }))
      alert('Sorgu önizleme sırasında hata oluştu.')
    } finally {
      setLoadingPreview(prev => ({ ...prev, [queryId]: false }))
    }
  }

  const updateReport = async () => {
    if (!report.name.trim()) {
      alert('Lütfen rapor adını girin.')
      return
    }

    if (report.queries.length === 0) {
      alert('En az bir sorgu ekleyin.')
      return
    }

    for (const query of report.queries) {
      if (!query.sql.trim()) {
        alert(`"${query.name}" sorgusu için SQL yazın.`)
        return
      }
    }

    try {
      // Send the updated report to the backend using the full update endpoint
      console.log('Updating report:', report)
      const updatedReport = await reportsService.updateReportFull(reportId, report)
      console.log('Report updated successfully:', updatedReport)
      alert('Rapor başarıyla güncellendi!')

      // Redirect back to the report detail page
      router.push(`/reports/${reportId}`)
    } catch (error) {
      console.error('Error updating report:', error)
      alert('Rapor güncellenirken hata oluştu.')
    }
  }

  const currentQuery = report.queries[activeQueryIndex]
  const availableFields = currentQuery ? extractFieldsFromSQL(currentQuery.sql) : []

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Rapor yükleniyor...</div>
        </div>
      </div>
    )
  }

  if (error && !originalReport) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/reports')}
                className="p-2 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors"
                title="Raporlara geri dön"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div className="text-center">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3">
                  Rapor Düzenle
                </h1>
                <p className="text-slate-600 text-lg">
                  "{originalReport?.name}" raporunu düzenleyin
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-8">
          {/* Report Basic Info */}
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-slate-200/50 hover:shadow-xl transition-all duration-300 py-0">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-slate-200/50 py-6 px-4 pb-0">
              <CardTitle className="flex items-center gap-3 text-slate-800 py-0">
                <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500">
                  <Database className="w-5 h-5 text-white" />
                </div>
                Rapor Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="reportName" className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Rapor Adı *
                  </Label>
                  <Input
                    id="reportName"
                    value={report.name}
                    onChange={(e) => setReport(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Aylık Satış Raporu"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label htmlFor="reportDescription">Açıklama</Label>
                <Textarea
                  id="reportDescription"
                  value={report.description}
                  onChange={(e) => setReport(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Bu raporun ne hakkında olduğunu açıklayın..."
                  className="min-h-[100px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Queries Section */}
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-slate-200/50 hover:shadow-xl transition-all duration-300 py-0">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-slate-200/50 py-6 px-4 pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3 text-slate-800">
                  <div className="p-2 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  Sorgu ve Görselleştirme ({report.queries.length})
                </CardTitle>
                <Button onClick={addNewQuery} size="sm" className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-md">
                  <Plus className="w-4 h-4 mr-2" />
                  Yeni Sorgu
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {report.queries.length === 0 ? (
                <div className="text-center py-12">
                  <div className="mx-auto w-24 h-24 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-6">
                    <Database className="w-12 h-12 text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">Henüz Sorgu Yok</h3>
                  <p className="text-slate-500 mb-6 max-w-md mx-auto">
                    Raporunuz için ilk SQL sorgusunu ekleyin ve görselleştirme seçeneklerini yapılandırın.
                  </p>
                  <Button onClick={addNewQuery} className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    İlk Sorguyu Ekle
                  </Button>
                </div>
            ) : (
              <Tabs value={activeQueryIndex.toString()} onValueChange={(value) => setActiveQueryIndex(parseInt(value))}>
                {/* Query Tabs */}
                <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${report.queries.length}, minmax(0, 1fr))` }}>
                  {report.queries.map((query, index) => (
                    <TabsTrigger key={query.id} value={index.toString()} className="relative">
                      {query.name}
                      {report.queries.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 text-red-500 hover:bg-red-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeQuery(index)
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Query Content */}
                {report.queries.map((query, queryIndex) => (
                  <TabsContent key={query.id} value={queryIndex.toString()} className="space-y-6">
                    {/* Query Configuration */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            Sorgu Adı
                          </Label>
                          <Input
                            value={query.name}
                            onChange={(e) => updateQuery(queryIndex, { name: e.target.value })}
                            placeholder="Sorgu adını girin"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                            SQL Sorgusu *
                          </Label>
                          <Textarea
                            value={query.sql}
                            onChange={(e) => updateQuery(queryIndex, { sql: e.target.value })}
                            placeholder="SELECT column1, column2 FROM table_name WHERE condition"
                            className="min-h-[200px] font-mono text-sm bg-slate-50/50"
                          />
                          <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50/50 px-3 py-2 rounded-lg">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                            Filtre alanları SELECT kısmındaki alanlardan otomatik olarak alınacak
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-4">
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-400"></span>
                              Görselleştirme Tipi
                            </Label>
                            <Select
                              value={query.visualization.type}
                              onValueChange={(value: any) => updateVisualization(queryIndex, { type: value })}
                              placeholder="Görselleştirme seçin"
                            >
                              {VISUALIZATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          </div>

                          {/* Chart Title */}
                          <div className="space-y-2">
                            <Label>Grafik Başlığı</Label>
                            <Input
                              value={query.visualization.title || ''}
                              onChange={(e) => updateVisualization(queryIndex, { title: e.target.value })}
                              placeholder="Grafik başlığını girin"
                            />
                          </div>

                          {/* Chart Configuration based on type */}
                          {query.visualization.type !== 'table' && (
                            <div className="space-y-3 p-4 bg-slate-50/50 rounded-lg border border-slate-200">
                              <h4 className="font-semibold text-slate-700 text-sm">Grafik Yapılandırması</h4>

                              {(query.visualization.type === 'bar' || query.visualization.type === 'line' || query.visualization.type === 'area') && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-sm">X Ekseni</Label>
                                    <Select
                                      value={query.visualization.xAxis || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { xAxis: value })}
                                      placeholder="X ekseni seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Y Ekseni</Label>
                                    <Select
                                      value={query.visualization.yAxis || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { yAxis: value })}
                                      placeholder="Y ekseni seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                </div>
                              )}

                              {query.visualization.type === 'pie' && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-sm">Etiket Alanı</Label>
                                    <Select
                                      value={query.visualization.labelField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { labelField: value })}
                                      placeholder="Etiket alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Değer Alanı</Label>
                                    <Select
                                      value={query.visualization.valueField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { valueField: value })}
                                      placeholder="Değer alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                </div>
                              )}

                              {query.visualization.type === 'scatter' && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-2">
                                      <Label className="text-sm">X Ekseni</Label>
                                      <Select
                                        value={query.visualization.xAxis || ''}
                                        onValueChange={(value) => updateVisualization(queryIndex, { xAxis: value })}
                                        placeholder="X ekseni seçin"
                                      >
                                        {availableFields.map((field) => (
                                          <option key={field} value={field}>{field}</option>
                                        ))}
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-sm">Y Ekseni</Label>
                                      <Select
                                        value={query.visualization.yAxis || ''}
                                        onValueChange={(value) => updateVisualization(queryIndex, { yAxis: value })}
                                        placeholder="Y ekseni seçin"
                                      >
                                        {availableFields.map((field) => (
                                          <option key={field} value={field}>{field}</option>
                                        ))}
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-sm">Boyut Alanı (İsteğe Bağlı)</Label>
                                      <Select
                                        value={query.visualization.chartOptions?.sizeField || ''}
                                        onValueChange={(value) => updateVisualization(queryIndex, {
                                          chartOptions: { ...query.visualization.chartOptions, sizeField: value }
                                        })}
                                        placeholder="Boyut alanı seçin"
                                      >
                                        <option value="">Sabit boyut</option>
                                        {availableFields.map((field) => (
                                          <option key={field} value={field}>{field}</option>
                                        ))}
                                      </Select>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {query.visualization.type === 'pareto' && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-sm">Kategori Alanı</Label>
                                    <Select
                                      value={query.visualization.labelField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { labelField: value })}
                                      placeholder="Kategori alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Değer Alanı</Label>
                                    <Select
                                      value={query.visualization.valueField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { valueField: value })}
                                      placeholder="Değer alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                </div>
                              )}

                              {query.visualization.type === 'boxplot' && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-sm">Grup Alanı</Label>
                                    <Select
                                      value={query.visualization.labelField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { labelField: value })}
                                      placeholder="Grup alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Değer Alanı</Label>
                                    <Select
                                      value={query.visualization.valueField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { valueField: value })}
                                      placeholder="Değer alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                </div>
                              )}

                              {query.visualization.type === 'histogram' && (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <Label className="text-sm">Değer Alanı</Label>
                                    <Select
                                      value={query.visualization.valueField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { valueField: value })}
                                      placeholder="Sayısal alan seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Bin Sayısı</Label>
                                    <Input
                                      type="number"
                                      value={query.visualization.chartOptions?.binCount || 10}
                                      onChange={(e) => updateVisualization(queryIndex, {
                                        chartOptions: {
                                          ...query.visualization.chartOptions,
                                          binCount: parseInt(e.target.value) || 10
                                        }
                                      })}
                                      placeholder="10"
                                      min="3"
                                      max="50"
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Common Options */}
                              <div className="flex items-center space-x-4 pt-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`legend-${query.id}`}
                                    checked={query.visualization.showLegend ?? true}
                                    onCheckedChange={(checked) => updateVisualization(queryIndex, { showLegend: !!checked })}
                                  />
                                  <Label htmlFor={`legend-${query.id}`} className="text-sm">
                                    Lejand Göster
                                  </Label>
                                </div>

                                {query.visualization.type === 'pie' && (
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`percentage-${query.id}`}
                                      checked={query.visualization.chartOptions?.showPercentage ?? true}
                                      onCheckedChange={(checked) => updateVisualization(queryIndex, {
                                        chartOptions: { ...query.visualization.chartOptions, showPercentage: !!checked }
                                      })}
                                    />
                                    <Label htmlFor={`percentage-${query.id}`} className="text-sm">
                                      Yüzde Göster
                                    </Label>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <Label className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                            Kullanılabilir Alanlar
                          </Label>
                          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[120px] bg-gradient-to-br from-slate-50 to-blue-50/30">
                            {availableFields.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {availableFields.map((field, index) => (
                                  <Badge key={index} variant="secondary">
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                  <div className="w-8 h-8 mx-auto mb-2 bg-slate-200 rounded-full flex items-center justify-center">
                                    <Database className="w-4 h-4 text-slate-400" />
                                  </div>
                                  <p className="text-sm text-slate-500">
                                    SQL sorgusu girdikten sonra alanlar burada görünecek
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Filters Section */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between bg-gradient-to-r from-orange-50 to-pink-50 p-4 rounded-xl border border-orange-200/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500">
                            <Filter className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-slate-800">Filtreler</h3>
                            <p className="text-sm text-slate-600">{query.filters.length} adet filtre tanımlı</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => addFilter(queryIndex)}
                          size="sm"
                          disabled={availableFields.length === 0}
                          className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-md disabled:from-slate-300 disabled:to-slate-400"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Filtre Ekle
                        </Button>
                      </div>

                      {query.filters.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl bg-gradient-to-br from-slate-50 to-orange-50/30">
                          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-orange-100 to-pink-100 rounded-full flex items-center justify-center mb-4">
                            <Filter className="w-8 h-8 text-orange-500" />
                          </div>
                          <h4 className="font-semibold text-slate-700 mb-2">Henüz Filtre Yok</h4>
                          <p className="text-slate-500 text-sm max-w-sm mx-auto">
                            Bu sorgu için filtreleme seçenekleri ekleyin. Önce SQL sorgusu girmeniz gerekiyor.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {query.filters.map((filter, filterIndex) => (
                            <Card key={filter.id} className="p-6 bg-white/70 backdrop-blur-sm border border-slate-200/50 shadow-sm hover:shadow-md transition-all duration-200">
                              <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-gradient-to-r from-violet-400 to-purple-400 rounded-lg flex items-center justify-center">
                                    <span className="text-white font-bold text-sm">{filterIndex + 1}</span>
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-slate-800">Filtre {filterIndex + 1}</h4>
                                    <p className="text-sm text-slate-500">{filter.displayName}</p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFilter(queryIndex, filterIndex)}
                                  className="text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                  <Label>Alan Adı</Label>
                                  <Select
                                    value={filter.fieldName}
                                    onValueChange={(value) => updateFilter(queryIndex, filterIndex, {
                                      fieldName: value,
                                      displayName: filter.displayName === filter.fieldName ? value : filter.displayName
                                    })}
                                    placeholder="Alan seçin"
                                  >
                                    {availableFields.map((field) => (
                                      <option key={field} value={field}>{field}</option>
                                    ))}
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Görünen Ad</Label>
                                  <Input
                                    value={filter.displayName}
                                    onChange={(e) => updateFilter(queryIndex, filterIndex, { displayName: e.target.value })}
                                    placeholder="Kullanıcıya gösterilecek ad"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label>Filtre Tipi</Label>
                                  <Select
                                    value={filter.type}
                                    onValueChange={(value: any) => updateFilter(queryIndex, filterIndex, { type: value })}
                                  >
                                    {FILTER_TYPES.map((type) => (
                                      <option key={type.value} value={type.value}>
                                        {type.label}
                                      </option>
                                    ))}
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label>Seçenekler</Label>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`required-${filter.id}`}
                                      checked={filter.required}
                                      onCheckedChange={(checked) =>
                                        updateFilter(queryIndex, filterIndex, { required: !!checked })
                                      }
                                    />
                                    <Label htmlFor={`required-${filter.id}`} className="text-sm">
                                      Zorunlu
                                    </Label>
                                  </div>
                                </div>
                              </div>

                              {(filter.type === 'dropdown' || filter.type === 'multiselect') && (
                                <div className="mt-4 space-y-2">
                                  <Label>Dropdown SQL Sorgusu</Label>
                                  <Textarea
                                    value={filter.dropdownQuery || ''}
                                    onChange={(e) => updateFilter(queryIndex, filterIndex, { dropdownQuery: e.target.value })}
                                    placeholder="SELECT value, label FROM options_table"
                                    className="min-h-[80px] font-mono text-sm"
                                  />
                                  <p className="text-xs text-gray-500">
                                    İlk sütun değer, ikinci sütun gösterilecek metin olmalı
                                  </p>
                                </div>
                              )}
                            </Card>
                          ))}
                        </div>
                      )}

                      {/* Query Preview Section */}
                      <div className="mt-8 space-y-4">
                        <div className="flex items-center justify-between bg-gradient-to-r from-cyan-50 to-blue-50 p-4 rounded-xl border border-cyan-200/50">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500">
                              <Play className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-slate-800">Sorgu Önizleme</h3>
                              <p className="text-sm text-slate-600">SQL sorgusunu test edin ve sonuçları görün</p>
                            </div>
                          </div>
                          <Button
                            onClick={() => runQueryPreview(query.id, query.sql)}
                            disabled={!query.sql.trim() || loadingPreview[query.id]}
                            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-md disabled:from-slate-300 disabled:to-slate-400"
                          >
                            {loadingPreview[query.id] ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Çalışıyor...
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-2" />
                                Sorguyu Çalıştır
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Preview Results */}
                        {previewResults[query.id] && (
                          <Card className="bg-white/70 backdrop-blur-sm border border-slate-200/50 shadow-sm">
                            <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-200/50">
                              <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Database className="w-5 h-5 text-slate-600" />
                                  Sorgu Sonuçları
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                  <span>{previewResults[query.id].total_rows} satır</span>
                                  <span>{previewResults[query.id].execution_time_ms}ms</span>
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    previewResults[query.id].success
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {previewResults[query.id].success ? 'Başarılı' : 'Hata'}
                                  </span>
                                </div>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                              {previewResults[query.id].success ? (
                                <div>
                                  {/* Chart Preview */}
                                  {(query.visualization.type as string !== 'table') && (
                                    <div className="p-6 border-b border-slate-200">
                                      <div className="bg-white rounded-lg border border-slate-200 p-4">
                                        <ChartPreview
                                          data={previewResults[query.id]}
                                          visualization={query.visualization}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Data Table */}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                          {previewResults[query.id].columns.map((column, index) => (
                                            <th key={index} className="px-4 py-3 text-left font-semibold text-slate-700">
                                              {column}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewResults[query.id].data.slice(0, 10).map((row, rowIndex) => (
                                          <tr key={rowIndex} className={`border-b border-slate-100 ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                            {row.map((cell, cellIndex) => (
                                              <td key={cellIndex} className="px-4 py-3 text-slate-600">
                                                {cell !== null ? String(cell) : <span className="text-slate-400 italic">null</span>}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    {previewResults[query.id].data.length > 10 && (
                                      <div className="p-4 bg-slate-50/50 border-t border-slate-200 text-center text-sm text-slate-500">
                                        İlk 10 satır gösteriliyor. Toplam {previewResults[query.id].total_rows} satır var.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-6 text-center">
                                  <div className="text-red-500 mb-2">
                                    <Database className="w-8 h-8 mx-auto mb-2" />
                                    <p className="font-semibold">Sorgu Hatası</p>
                                  </div>
                                  <p className="text-sm text-slate-600 bg-red-50 p-3 rounded-lg border border-red-200">
                                    {previewResults[query.id].message}
                                  </p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-4 pt-8">
            <Button
              variant="outline"
              onClick={() => router.push('/reports')}
              className="px-8 py-3 border-2 border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-all duration-200"
            >
              İptal
            </Button>
            <Button
              onClick={updateReport}
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              <Database className="w-4 h-4 mr-2" />
              Raporu Güncelle
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Dialog */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Filtre Değerlerini Girin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {activeQueryForFilters && report.queries.find(q => q.id === activeQueryForFilters)?.filters.map((filter, index) => (
              <div key={filter.id} className="space-y-2">
                <Label htmlFor={`filter-${filter.id}`}>{filter.displayName}</Label>
                {filter.type === 'text' && (
                  <Input
                    id={`filter-${filter.id}`}
                    value={filterValues[filter.fieldName] || ''}
                    onChange={(e) => setFilterValues(prev => ({ ...prev, [filter.fieldName]: e.target.value }))}
                    placeholder={`${filter.displayName} girin`}
                  />
                )}
                {filter.type === 'number' && (
                  <Input
                    id={`filter-${filter.id}`}
                    type="number"
                    value={filterValues[filter.fieldName] || ''}
                    onChange={(e) => setFilterValues(prev => ({ ...prev, [filter.fieldName]: e.target.value }))}
                    placeholder={`${filter.displayName} girin`}
                  />
                )}
                {filter.type === 'date' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Başlangıç Tarihi</Label>
                      <Input
                        id={`filter-start-${filter.id}`}
                        type="date"
                        value={filterValues[`${filter.fieldName}_start`] || ''}
                        onChange={(e) => setFilterValues(prev => ({ 
                          ...prev, 
                          [`${filter.fieldName}_start`]: e.target.value 
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bitiş Tarihi</Label>
                      <Input
                        id={`filter-end-${filter.id}`}
                        type="date"
                        value={filterValues[`${filter.fieldName}_end`] || ''}
                        onChange={(e) => setFilterValues(prev => ({ 
                          ...prev, 
                          [`${filter.fieldName}_end`]: e.target.value 
                        }))}
                      />
                    </div>
                  </div>
                )}
                {(filter.type === 'dropdown' || filter.type === 'multiselect') && (
                  <Select
                    value={filterValues[filter.fieldName] || ''}
                    onValueChange={(value) => setFilterValues(prev => ({ ...prev, [filter.fieldName]: value }))}
                    placeholder={`${filter.displayName} seçin`}
                  >
                    <option value="">Seçin...</option>
                    <option value="option1">Seçenek 1</option>
                    <option value="option2">Seçenek 2</option>
                  </Select>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFilterDialogOpen(false)
                setActiveQueryForFilters(null)
              }}
            >
              İptal
            </Button>
            <Button
              onClick={async () => {
                try {
                  if (activeQueryForFilters) {
                    const query = report.queries.find(q => q.id === activeQueryForFilters)
                    if (query) {
                      console.log('Running query with filters:', {
                        queryId: activeQueryForFilters,
                        sql: query.sql,
                        filters: query.filters,
                        filterValues
                      })
                      await runQueryPreview(activeQueryForFilters, query.sql, true)
                    }
                  }
                } catch (error) {
                  console.error('Error running query:', error)
                  alert('Sorgu çalıştırılırken bir hata oluştu.')
                } finally {
                  setFilterDialogOpen(false)
                  setActiveQueryForFilters(null)
                }
              }}
              disabled={loadingPreview[activeQueryForFilters || '']}
            >
              {loadingPreview[activeQueryForFilters || ''] ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Çalıştırılıyor...
                </>
              ) : (
                'Sorguyu Çalıştır'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
