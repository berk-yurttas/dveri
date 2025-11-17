"use client"

import React, { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/appShell/ui/card"
import { Button } from "@/components/appShell/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/appShell/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/appShell/ui/dialog"
import { Plus, Trash2, Database, BarChart3, PieChart, LineChart, Table, Calendar, Filter, Hash, Type, List, Play, Loader2, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react"
import { reportsService } from '@/services/reports'
import { ReportPreviewResponse, SavedReport } from '@/types/reports'
import { api } from '@/lib/api'
import { BarChart, Bar, LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// Import types from the types file
import { QueryConfig, FilterConfig, ReportConfig, VisualizationConfig, NestedQueryConfig } from '@/types/reports'
import { buildDropdownQuery } from '@/utils/sqlPlaceholders'

const VISUALIZATION_OPTIONS = [
  { value: 'table', label: 'Tablo', icon: Table },
  { value: 'expandable', label: 'Genişletilebilir Tablo', icon: Table },
  { value: 'bar', label: 'Sütun Grafik', icon: BarChart3 },
  { value: 'line', label: 'Çizgi Grafik', icon: LineChart },
  { value: 'pie', label: 'Pasta Grafik', icon: PieChart },
  { value: 'area', label: 'Alan Grafik', icon: BarChart3 },
  { value: 'scatter', label: 'Scatter Plot', icon: BarChart3 },
  { value: 'pareto', label: 'Pareto Grafiği', icon: BarChart3 },
  { value: 'boxplot', label: 'Box Plot', icon: BarChart3 },
  { value: 'histogram', label: 'Histogram', icon: BarChart3 },
  { value: 'card', label: 'Kart Görünümü', icon: Database },
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
        const showLineOverlay = visualization.chartOptions?.showLineOverlay && visualization.chartOptions?.lineYAxis

        if (showLineOverlay) {
          return (
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey={visualization.xAxis || columns[0]}
                  tick={{ fontSize: 12 }}
                  stroke="#64748b"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  stroke="#64748b"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
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
                  yAxisId="left"
                  dataKey={visualization.yAxis || columns[1]}
                  fill={colors[0]}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey={visualization.chartOptions?.lineYAxis}
                  stroke={colors[1] || '#10B981'}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )
        }

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

      case 'expandable':
        // For preview, show as a regular table with a note
        const renderNestedQueryInfo = (queries: NestedQueryConfig[], level = 0): any => {
          if (!queries || queries.length === 0) return null
          
          return queries.map((nq, idx) => (
            <div key={nq.id} className={`ml-${level * 4} mt-2 p-2 bg-white/50 border border-purple-300 rounded text-xs`}>
              <div className="font-semibold text-purple-900 mb-1">Seviye {level + 1}{idx > 0 ? ` (${idx + 1})` : ''}:</div>
              <code className="text-purple-700 break-all block mb-1">{nq.sql || 'SQL sorgusu girilmedi'}</code>
              {nq.expandableFields && nq.expandableFields.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-purple-600 text-xs">Alanlar:</span>
                  {nq.expandableFields.map((field: string) => (
                    <span key={field} className="px-1 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                      {'{{' + field + '}}'}
                    </span>
                  ))}
                </div>
              )}
              {nq.nestedQueries && nq.nestedQueries.length > 0 && renderNestedQueryInfo(nq.nestedQueries, level + 1)}
            </div>
          ))
        }
        
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <ChevronDown className="h-4 w-4" />
              <span>Önizleme: Genişletilebilir tablo kayıt edildikten sonra aktif olacak</span>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 w-10">
                      {/* Expand column */}
                    </th>
                    {columns.map((col, index) => (
                      <th key={index} className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rawData.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-xs text-slate-600">
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </td>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-2 text-xs text-slate-700">
                          {cell !== null ? String(cell) : <span className="text-slate-400 italic">null</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visualization.chartOptions?.nestedQueries && visualization.chartOptions.nestedQueries.length > 0 && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs">
                <div className="font-semibold text-purple-900 mb-2">Alt Tablo Hiyerarşisi:</div>
                {renderNestedQueryInfo(visualization.chartOptions.nestedQueries)}
              </div>
            )}
          </div>
        )

      case 'card':
        // Card visualization preview
        const cardData = chartData[0] || {}
        const primaryField = visualization.valueField || columns[0]
        const secondaryField = visualization.labelField || columns[1]
        const primaryValue = cardData[primaryField]
        const secondaryValue = secondaryField ? cardData[secondaryField] : null

        const formatNumber = (value: any): string => {
          if (value === null || value === undefined) return '-'
          if (typeof value === 'number') {
            return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
          }
          return String(value)
        }

        const bgColor = visualization.chartOptions?.backgroundColor || colors[0]

        return (
          <div className="flex items-center justify-center w-full h-full min-h-[300px]">
            <div
              className="relative rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center min-w-[300px] min-h-[200px]"
              style={{
                backgroundColor: bgColor,
                background: `linear-gradient(135deg, ${bgColor} 0%, ${bgColor}dd 100%)`
              }}
            >
              <div className="text-center mb-4">
                <div
                  className="font-bold text-white drop-shadow-lg"
                  style={{ fontSize: '3.5rem' }}
                >
                  {formatNumber(primaryValue)}
                </div>
              </div>
              {secondaryValue !== null && (
                <div className="text-center">
                  <div
                    className="text-white/90 font-medium"
                    style={{ fontSize: '1.25rem' }}
                  >
                    {formatNumber(secondaryValue)}
                  </div>
                </div>
              )}
              {visualization.title && (
                <div className="absolute top-4 left-4 right-4">
                  <div className="text-white/70 text-sm font-semibold uppercase tracking-wider">
                    {visualization.title}
                  </div>
                </div>
              )}
            </div>
          </div>
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

// Nested Query Builder Component (Recursive)
const NestedQueryBuilder = ({
  queryIndex,
  nestedQueries,
  parentFields,
  onUpdate,
  level = 0,
  parentPath = []
}: {
  queryIndex: number
  nestedQueries: NestedQueryConfig[]
  parentFields: string[]
  onUpdate: (nestedQueries: NestedQueryConfig[]) => void
  level?: number
  parentPath?: number[]
}) => {
  const generateId = () => Math.random().toString(36).substr(2, 9)
  
  const addNestedQuery = () => {
    const newNestedQuery: NestedQueryConfig = {
      id: generateId(),
      sql: '',
      expandableFields: [],
      filters: [],
      nestedQueries: []
    }
    onUpdate([...nestedQueries, newNestedQuery])
  }
  
  const addFilter = (nestedQueryIndex: number) => {
    const nestedQuery = nestedQueries[nestedQueryIndex]
    const availableFields = extractFieldsFromSQL(nestedQuery.sql)
    
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
    
    updateNestedQuery(nestedQueryIndex, {
      filters: [...(nestedQuery.filters || []), newFilter]
    })
  }
  
  const updateFilter = (nestedQueryIndex: number, filterIndex: number, updates: Partial<FilterConfig>) => {
    const nestedQuery = nestedQueries[nestedQueryIndex]
    const updatedFilters = (nestedQuery.filters || []).map((filter, i) =>
      i === filterIndex ? { ...filter, ...updates } : filter
    )
    updateNestedQuery(nestedQueryIndex, { filters: updatedFilters })
  }
  
  const removeFilter = (nestedQueryIndex: number, filterIndex: number) => {
    const nestedQuery = nestedQueries[nestedQueryIndex]
    const updatedFilters = (nestedQuery.filters || []).filter((_, i) => i !== filterIndex)
    updateNestedQuery(nestedQueryIndex, { filters: updatedFilters })
  }
  
  const updateNestedQuery = (index: number, updates: Partial<NestedQueryConfig>) => {
    const updated = nestedQueries.map((nq, i) => 
      i === index ? { ...nq, ...updates } : nq
    )
    onUpdate(updated)
  }
  
  const removeNestedQuery = (index: number) => {
    onUpdate(nestedQueries.filter((_, i) => i !== index))
  }
  
  // Get fields from nested query SQL
  const extractFieldsFromSQL = (sql: string): string[] => {
    try {
      const normalizedSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
      const selectMatch = normalizedSql.match(/SELECT\s+(.*?)\s+FROM/i)
      if (!selectMatch) return []
      
      const fieldsStr = selectMatch[1]
      
      // Split by comma, but respect quoted strings
      const fields: string[] = []
      let currentField = ''
      let inQuotes = false
      let quoteChar = ''
      
      for (let i = 0; i < fieldsStr.length; i++) {
        const char = fieldsStr[i]
        
        if ((char === '"' || char === "'" || char === '`') && !inQuotes) {
          inQuotes = true
          quoteChar = char
          currentField += char
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false
          quoteChar = ''
          currentField += char
        } else if (char === ',' && !inQuotes) {
          fields.push(currentField.trim())
          currentField = ''
        } else {
          currentField += char
        }
      }
      
      if (currentField.trim()) {
        fields.push(currentField.trim())
      }
      
      // Now parse each field to extract the alias or field name
      const parsedFields = fields.map(field => {
        field = field.trim()
        
        // Handle aliases with AS keyword and quoted strings
        const quotedAliasMatch = field.match(/\s+as\s+['"`]([^'"`]+)['"`]\s*$/i)
        if (quotedAliasMatch) return quotedAliasMatch[1].trim()
        
        // Handle aliases with AS keyword (case insensitive) - support underscores
        const aliasMatch = field.match(/\s+as\s+([\w_]+)\s*$/i)
        if (aliasMatch) return aliasMatch[1].trim()
        
        // Handle quoted field at the end (without AS)
        const endQuotedMatch = field.match(/['"`]([^'"`]+)['"`]\s*$/i)
        if (endQuotedMatch) return endQuotedMatch[1].trim()
        
        // Handle simple aliases (last word that's not a function)
        const parts = field.trim().split(/\s+/)
        if (parts.length > 1 && !parts[parts.length - 1].match(/[().]/) && !parts[parts.length - 1].match(/^(SELECT|FROM|WHERE|JOIN|ON|AND|OR)$/i)) {
          return parts[parts.length - 1]
        }
        
        const dotMatch = field.match(/([\w_]+)\.([\w_]+)/)
        if (dotMatch) return dotMatch[2]
        const simpleMatch = field.match(/^([\w_]+)/)
        if (simpleMatch) return simpleMatch[1]
        return null
      }).filter((f): f is string => f !== null && !f.match(/^\*$|^(COUNT|SUM|AVG|MIN|MAX|DISTINCT)$/i))
      
      return [...new Set(parsedFields)]
    } catch (error) {
      return []
    }
  }
  
  const levelColors = [
    { bg: 'bg-purple-50/50', border: 'border-purple-200', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-700' },
    { bg: 'bg-indigo-50/50', border: 'border-indigo-200', text: 'text-indigo-900', badge: 'bg-indigo-100 text-indigo-700' },
    { bg: 'bg-blue-50/50', border: 'border-blue-200', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-700' },
    { bg: 'bg-cyan-50/50', border: 'border-cyan-200', text: 'text-cyan-900', badge: 'bg-cyan-100 text-cyan-700' },
  ]
  const colorScheme = levelColors[level % levelColors.length]
  
  return (
    <div className="space-y-4">
      {nestedQueries.map((nestedQuery, index) => {
        const nestedFields = extractFieldsFromSQL(nestedQuery.sql)
        
        return (
          <div key={nestedQuery.id} className={`space-y-3 p-4 ${colorScheme.bg} rounded-lg border ${colorScheme.border}`}>
            <div className="flex items-center justify-between">
              <h5 className={`font-semibold ${colorScheme.text} text-sm flex items-center gap-2`}>
                <Database className="w-4 h-4" />
                Alt Tablo Seviye {level + 1}{index > 0 ? ` - ${index + 1}` : ''}
              </h5>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeNestedQuery(index)}
                className="text-red-500 hover:bg-red-50 hover:text-red-600 h-6 px-2"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">SQL Sorgusu (Seviye {level + 1})</Label>
              <Textarea
                value={nestedQuery.sql}
                onChange={(e) => updateNestedQuery(index, { sql: e.target.value })}
                placeholder="SELECT * FROM child_table WHERE parent_id = {{parent_field}}"
                className="min-h-[100px] font-mono text-sm bg-white"
              />
              <p className="text-xs" style={{ color: colorScheme.text.replace('text-', '') }}>
                Üst tablodan alan enjekte etmek için {'{{field_name}}'} sözdizimini kullanın
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs">Üst Tablodan Enjekte Edilecek Alanlar</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto bg-white p-2 rounded border border-gray-200">
                {parentFields.length > 0 ? (
                  parentFields.map((field) => (
                    <div key={field} className="flex items-center space-x-2 bg-white p-2 rounded border border-gray-100">
                      <Checkbox
                        id={`nested-${level}-${index}-field-${field}`}
                        checked={nestedQuery.expandableFields?.includes(field) ?? false}
                        onCheckedChange={(checked) => {
                          const currentFields = nestedQuery.expandableFields || []
                          const newFields = checked
                            ? [...currentFields, field]
                            : currentFields.filter(f => f !== field)
                          updateNestedQuery(index, { expandableFields: newFields })
                        }}
                      />
                      <Label htmlFor={`nested-${level}-${index}-field-${field}`} className="text-xs flex-1">
                        {field}
                      </Label>
                      <Badge variant="secondary" className={`text-xs ${colorScheme.badge}`}>
                        {'{{' + field + '}}'}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500 text-center py-2">Üst sorguda alan bulunamadı</p>
                )}
              </div>
            </div>
            
            {/* Filters Section for Nested Query */}
            {nestedFields.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-2">
                    <Filter className="w-3 h-3" />
                    Alt Tablo Filtreleri
                    {(nestedQuery.filters || []).length > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                        {(nestedQuery.filters || []).length}
                      </span>
                    )}
                  </Label>
                  <Button
                    onClick={() => addFilter(index)}
                    size="sm"
                    disabled={nestedFields.length === 0}
                    className="h-6 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Filtre Ekle
                  </Button>
                </div>
                
                {(nestedQuery.filters || []).length > 0 && (
                  <div className="space-y-2">
                    {(nestedQuery.filters || []).map((filter, filterIndex) => (
                      <div key={filter.id} className="p-3 bg-white rounded border border-orange-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-700">Filtre {filterIndex + 1}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFilter(index, filterIndex)}
                            className="text-red-500 hover:bg-red-50 h-5 px-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Alan Adı</Label>
                            <Select
                              value={filter.fieldName}
                              onValueChange={(value) => updateFilter(index, filterIndex, {
                                fieldName: value,
                                displayName: filter.displayName === filter.fieldName ? value : filter.displayName
                              })}
                              placeholder="Alan seçin"
                            >
                              {nestedFields.map((field) => (
                                <option key={field} value={field}>{field}</option>
                              ))}
                            </Select>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Görünen Ad</Label>
                            <Input
                              value={filter.displayName}
                              onChange={(e) => updateFilter(index, filterIndex, { displayName: e.target.value })}
                              placeholder="Görünen ad"
                              className="h-8 text-xs"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Filtre Tipi</Label>
                            <Select
                              value={filter.type}
                              onValueChange={(value: any) => updateFilter(index, filterIndex, { type: value })}
                            >
                              <option value="text">Metin</option>
                              <option value="number">Sayı</option>
                              <option value="date">Tarih</option>
                              <option value="dropdown">Tekli Seçim</option>
                              <option value="multiselect">Çoklu Seçim</option>
                            </Select>
                          </div>
                          
                          <div className="space-y-1">
                            <Label className="text-xs">Zorunlu</Label>
                            <Checkbox
                              id={`nested-filter-required-${filter.id}`}
                              checked={filter.required}
                              onCheckedChange={(checked) => updateFilter(index, filterIndex, { required: !!checked })}
                            />
                          </div>
                        </div>
                        
                        {(filter.type === 'dropdown' || filter.type === 'multiselect') && (
                          <div className="mt-2 space-y-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Bağımlı Filtre (İsteğe Bağlı)</Label>
                              <Select
                                value={filter.dependsOn || ''}
                                onValueChange={(value) => updateFilter(index, filterIndex, { dependsOn: value || undefined })}
                                placeholder="Bağımlı filtre seçin"
                              >
                                <option value="">Bağımsız</option>
                                {(nestedQuery.filters || [])
                                  .filter((f, i) => i != filterIndex && (f.type === 'dropdown' || f.type === 'multiselect'))
                                  .map((f) => (
                                    <option key={f.id} value={f.fieldName}>
                                      {f.displayName}
                                    </option>
                                  ))}
                              </Select>
                              {filter.dependsOn && (
                                <p className="text-xs text-amber-600">
                                  Bu filtrenin seçenekleri "{(nestedQuery.filters || []).find(f => f.fieldName === filter.dependsOn)?.displayName}" filtresine bağlıdır
                                </p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Dropdown SQL</Label>
                              <Textarea
                                value={filter.dropdownQuery || ''}
                                onChange={(e) => updateFilter(index, filterIndex, { dropdownQuery: e.target.value })}
                                placeholder={filter.dependsOn
                                  ? `SELECT value, label FROM options WHERE parent_field = {{${filter.dependsOn}}}`
                                  : "SELECT value, label FROM options"}
                                className="min-h-[60px] font-mono text-xs"
                              />
                              {filter.dependsOn && (
                                <p className="text-xs text-purple-600">
                                  Bağımlı değeri kullanmak için {'{{' + filter.dependsOn + '}}'} kullanın
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Recursive Nested Queries */}
            <div className="pt-3 border-t border-gray-300">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold flex items-center gap-2">
                  <ChevronRight className="w-3 h-3" />
                  Seviye {level + 2} Alt Tablolar
                  {(nestedQuery.nestedQueries || []).length > 0 && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                      {(nestedQuery.nestedQueries || []).length}
                    </span>
                  )}
                </Label>
                <Button
                  onClick={() => {
                    const newSubQuery: NestedQueryConfig = {
                      id: generateId(),
                      sql: '',
                      expandableFields: [],
                      nestedQueries: []
                    }
                    updateNestedQuery(index, {
                      nestedQueries: [...(nestedQuery.nestedQueries || []), newSubQuery]
                    })
                  }}
                  size="sm"
                  disabled={nestedFields.length === 0}
                  className="h-6 text-xs disabled:opacity-50"
                  title={nestedFields.length === 0 ? "Önce SQL sorgusu girin ve alanları tanımlayın" : ""}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Seviye {level + 2} Ekle
                </Button>
              </div>
              
              {nestedFields.length === 0 && (
                <p className="text-xs text-gray-500 italic p-2 bg-gray-50 rounded">
                  Seviye {level + 2} eklemek için önce bu seviyenin SQL sorgusunu girin
                </p>
              )}
              
              {(nestedQuery.nestedQueries || []).length > 0 && (
                <div className="mt-2">
                  <NestedQueryBuilder
                    queryIndex={queryIndex}
                    nestedQueries={nestedQuery.nestedQueries || []}
                    parentFields={nestedFields}
                    onUpdate={(updatedNested) => updateNestedQuery(index, { nestedQueries: updatedNested })}
                    level={level + 1}
                    parentPath={[...parentPath, index]}
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}
      
      {/* Add First Nested Query Button */}
      {nestedQueries.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-purple-200 rounded-lg bg-purple-50/30">
          <Button
            onClick={addNestedQuery}
            size="sm"
            className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            İlk Alt Tablo Ekle
          </Button>
          <p className="text-xs text-purple-600 mt-2">
            Genişletilebilir satırlarda gösterilecek alt tablo sorgularını ekleyin
          </p>
        </div>
      )}
      
      {nestedQueries.length > 0 && (
        <Button
          onClick={addNestedQuery}
          size="sm"
          variant="outline"
          className="w-full border-purple-300 text-purple-600 hover:bg-purple-50"
        >
          <Plus className="w-4 h-4 mr-2" />
          Paralel Tablo Ekle (Aynı Seviye {level + 1})
        </Button>
      )}
      
      {/* Example and Help */}
      {level === 0 && nestedQueries.length > 0 && (
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>Örnek Kullanım:</strong><br/>
              <strong>Seviye 1:</strong> <code className="bg-amber-100 px-1 py-0.5 rounded">SELECT * FROM sub_users WHERE user_id = {'{{user_id}}'}</code><br/>
              <strong>Seviye 2:</strong> <code className="bg-amber-100 px-1 py-0.5 rounded">SELECT * FROM sub_sub_users WHERE sub_user_id = {'{{sub_user_id}}'}</code><br/>
              Her seviyede, üst seviyenin alanlarını {'{{field_name}}'} ile kullanabilirsiniz.
            </p>
          </div>
          
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs text-blue-900 font-semibold mb-2">Buton Açıklamaları:</div>
            <ul className="text-xs text-blue-800 space-y-1 ml-4 list-disc">
              <li><strong>"Paralel Tablo Ekle"</strong> - Aynı seviyede başka bir tablo ekler (kardeş)</li>
              <li><strong>"Seviye X Ekle"</strong> - Bir alt seviyede tablo ekler (çocuk)</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EditReportPage() {
  const router = useRouter()
  const params = useParams()
  const platformCode = params.platform as string
  const reportId = params.id as string
  const searchParams = useSearchParams()
  const subplatform = searchParams.get('subplatform')
  const [report, setReport] = useState<ReportConfig & { layoutConfig?: any[] }>({
    name: '',
    description: '',
    queries: [],
    tags: [],
    globalFilters: [],
    layoutConfig: []
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
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [dropdownOptions, setDropdownOptions] = useState<Record<string, Array<{value: any, label: string}>>>({})
  const [loadingDropdownOptions, setLoadingDropdownOptions] = useState<Record<string, boolean>>({})

  // Helper function to generate unique IDs
  const generateId = () => Math.random().toString(36).substr(2, 9)

  // Load dropdown options for a filter
  const loadDropdownOptions = async (filter: FilterConfig, currentFilterValues: Record<string, any> = {}) => {
    if (!filter.dropdownQuery) return

    const filterKey = filter.fieldName
    setLoadingDropdownOptions(prev => ({ ...prev, [filterKey]: true }))

    try {
      const dependentValue = filter.dependsOn ? currentFilterValues[filter.dependsOn] : undefined
      const modifiedSql = buildDropdownQuery(filter.dropdownQuery, filter.dependsOn || '', dependentValue)

      const result = await reportsService.previewQuery({
        sql_query: modifiedSql,
        limit: 1000
      })

      if (result.success && result.data.length > 0) {
        // Expecting two columns: value and label
        const options = result.data.map(row => ({
          value: row[0],
          label: row[1] || String(row[0])
        }))
        setDropdownOptions(prev => ({ ...prev, [filterKey]: options }))
      } else {
        setDropdownOptions(prev => ({ ...prev, [filterKey]: [] }))
      }
    } catch (error) {
      console.error('Error loading dropdown options:', error)
      setDropdownOptions(prev => ({ ...prev, [filterKey]: [] }))
    } finally {
      setLoadingDropdownOptions(prev => ({ ...prev, [filterKey]: false }))
    }
  }

  // Load dropdown options when filter dialog opens
  useEffect(() => {
    if (filterDialogOpen && activeQueryForFilters) {
      const query = report.queries.find(q => q.id === activeQueryForFilters)
      if (query) {
        // Load options for all dropdown/multiselect filters
        query.filters.forEach(filter => {
          if ((filter.type === 'dropdown' || filter.type === 'multiselect') && filter.dropdownQuery) {
            loadDropdownOptions(filter, filterValues)
          }
        })
      }
    }
  }, [filterDialogOpen, activeQueryForFilters])

  // Load existing report data
  useEffect(() => {
    const loadReport = async () => {
      try {
        setIsInitialLoading(true)
        const reportData = await reportsService.getReportById(reportId)
        setOriginalReport(reportData)
        
        // Convert SavedReport to ReportConfig format, preserving layoutConfig
        const convertedReport: ReportConfig & { layoutConfig?: any[] } = {
          name: reportData.name,
          description: reportData.description,
          tags: reportData.tags,
          globalFilters: (reportData as any).globalFilters || [],
          layoutConfig: reportData.layoutConfig || [],  // Preserve the layout configuration
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
              required: filter.required,
              sqlExpression: filter.sqlExpression || undefined,
              dependsOn: filter.dependsOn || undefined
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
      
      // Split by comma, but respect quoted strings
      const fields: string[] = []
      let currentField = ''
      let inQuotes = false
      let quoteChar = ''
      
      for (let i = 0; i < fieldsStr.length; i++) {
        const char = fieldsStr[i]
        
        if ((char === '"' || char === "'" || char === '`') && !inQuotes) {
          inQuotes = true
          quoteChar = char
          currentField += char
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false
          quoteChar = ''
          currentField += char
        } else if (char === ',' && !inQuotes) {
          fields.push(currentField.trim())
          currentField = ''
        } else {
          currentField += char
        }
      }
      
      if (currentField.trim()) {
        fields.push(currentField.trim())
      }
      
      // Now parse each field to extract the alias or field name
      const parsedFields = fields
        .map(field => {
          field = field.trim()

          // Skip empty fields
          if (!field) return null

          // Handle aliases with AS keyword and quoted strings (single, double, backtick)
          const quotedAliasMatch = field.match(/\s+as\s+['"`]([^'"`]+)['"`]\s*$/i)
          if (quotedAliasMatch) return quotedAliasMatch[1].trim()

          // Handle aliases with AS keyword (case insensitive) - support underscores
          const aliasMatch = field.match(/\s+as\s+([\w_]+)\s*$/i)
          if (aliasMatch) return aliasMatch[1].trim()

          // Handle quoted field at the end (without AS)
          const endQuotedMatch = field.match(/['"`]([^'"`]+)['"`]\s*$/i)
          if (endQuotedMatch) return endQuotedMatch[1].trim()

          // Handle simple aliases (last word that's not a function) - support underscores
          const parts = field.trim().split(/\s+/)
          if (parts.length > 1) {
            const lastPart = parts[parts.length - 1]
            // If last part doesn't contain parentheses or dots and is not a SQL keyword, it's likely an alias
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
      
      return [...new Set(parsedFields)] // Remove duplicates
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
          showDots: true,
          nestedQueries: [],
          clickable: false,
          backgroundColor: '#3B82F6'
        }
      },
      filters: []
    }

    setReport(prev => {
      const newQueries = [...prev.queries, newQuery]

      // Add a default layout entry for the new query
      const newLayoutEntry = {
        i: newQuery.id,
        x: (prev.queries.length % 2) * 2, // Alternate left/right (2 columns each)
        y: Math.floor(prev.queries.length / 2) * 4, // Stack vertically
        w: 2, // 2 columns width
        h: 4, // 4 rows height
        minW: 1,
        minH: 2
      }

      return {
        ...prev,
        queries: newQueries,
        layoutConfig: [...(prev.layoutConfig || []), newLayoutEntry]
      }
    })
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
    setReport(prev => {
      const queryToRemove = prev.queries[index]
      const newQueries = prev.queries.filter((_, i) => i !== index)

      // Also remove the layout entry for this query
      const newLayoutConfig = (prev.layoutConfig || []).filter(
        (layout: any) => layout.i !== queryToRemove.id
      )

      return {
        ...prev,
        queries: newQueries,
        layoutConfig: newLayoutConfig
      }
    })
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

  // Global Filter Management
  const addGlobalFilter = () => {
    const newFilter: FilterConfig = {
      id: generateId(),
      fieldName: 'field_name',
      displayName: 'Global Filter',
      type: 'text',
      required: false
    }

    setReport(prev => ({
      ...prev,
      globalFilters: [...(prev.globalFilters || []), newFilter]
    }))
  }

  const updateGlobalFilter = (filterIndex: number, updates: Partial<FilterConfig>) => {
    const updatedFilters = (report.globalFilters || []).map((filter, i) =>
      i === filterIndex ? { ...filter, ...updates } : filter
    )
    setReport(prev => ({ ...prev, globalFilters: updatedFilters }))
  }

  const removeGlobalFilter = (filterIndex: number) => {
    const updatedFilters = (report.globalFilters || []).filter((_, i) => i !== filterIndex)
    setReport(prev => ({ ...prev, globalFilters: updatedFilters }))
  }

  const replaceDynamicFilters = (sql: string, filters: FilterConfig[], values: Record<string, any>): string => {
    let modifiedSql = sql
    console.log('Original SQL:', sql)
    console.log('Filter values:', values)

    filters.forEach(filter => {
      console.log('Processing filter:', filter)
      let condition = ''
      
      // Use sqlExpression if provided, otherwise use fieldName
      const sqlField = filter.sqlExpression || filter.fieldName
      
      switch (filter.type) {
        case 'text':
          const textValue = values[filter.fieldName]
          if (textValue) {
            condition = `${sqlField} LIKE '%${textValue}%'`
          }
          break
        case 'number':
          const numValue = values[filter.fieldName]
          if (numValue) {
            condition = `${sqlField} = ${numValue}`
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
            condition = `${sqlField} BETWEEN '${utcStartDate}' AND '${utcEndDate}'`
          } else if (startDate) {
            const utcStartDate = formatStartDate(startDate)
            condition = `${sqlField} >= '${utcStartDate}'`
          } else if (endDate) {
            const utcEndDate = formatEndDate(endDate)
            condition = `${sqlField} <= '${utcEndDate}'`
          }
          break
        case 'dropdown':
        case 'multiselect':
          const dropdownValue = values[filter.fieldName]
          if (Array.isArray(dropdownValue)) {
            condition = `${sqlField} IN (${dropdownValue.map(v => `'${v}'`).join(',')})`
          } else if (dropdownValue) {
            condition = `${sqlField} = '${dropdownValue}'`
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

  const handleSuccessModalClose = () => {
    setSuccessModalOpen(false)
    if (subplatform) {
      router.push(`/${platformCode}/reports/${reportId}?subplatform=${subplatform}`);
    } else {
      router.push(`/${platformCode}/reports/${reportId}`);
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
      // Don't send layoutConfig to preserve it unchanged
      const { layoutConfig, ...reportWithoutLayout } = report

      // Clean query and filter IDs (remove non-integer IDs as they're client-side only)
      const cleanedReport = {
        ...reportWithoutLayout,
        queries: reportWithoutLayout.queries.map((query: any) => {
          const { id: queryId, ...queryWithoutId } = query
          const cleanedQuery: any = {
            ...queryWithoutId,
            filters: query.filters.map((filter: any) => {
              const { id, ...filterWithoutId } = filter
              // Only include id if it's a valid integer (existing filter from backend)
              const isValidFilterId = typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))
              if (isValidFilterId) {
                return { ...filterWithoutId, id: typeof id === 'number' ? id : parseInt(id, 10) }
              }
              return filterWithoutId
            })
          }
          // Only include query id if it's a valid integer (existing query from backend)
          const isValidQueryId = typeof queryId === 'number' || (typeof queryId === 'string' && /^\d+$/.test(queryId))
          if (isValidQueryId) {
            cleanedQuery.id = typeof queryId === 'number' ? queryId : parseInt(queryId, 10)
          }
          return cleanedQuery
        }),
        globalFilters: reportWithoutLayout.globalFilters?.map((filter: any) => {
          const { id, ...filterWithoutId } = filter
          // Only include id if it's a valid integer (existing filter from backend)
          const isValidFilterId = typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id))
          if (isValidFilterId) {
            return { ...filterWithoutId, id: typeof id === 'number' ? id : parseInt(id, 10) }
          }
          return filterWithoutId
        }) || []
      }

      // Send the updated report to the backend using the full update endpoint
      console.log('Updating report:', cleanedReport)
      const updatedReport = await reportsService.updateReportFull(reportId, cleanedReport)
      console.log('Report updated successfully:', updatedReport)

      // Clear the cache for this report to ensure fresh data on redirect
      api.clearCachePattern(new RegExp(`/reports/${reportId}`))

      setSuccessModalOpen(true)
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
      <div className="container mx-auto p-6 max-w-8xl">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => {
                if (subplatform) {
                  router.push(`/${platformCode}/reports/${reportId}?subplatform=${subplatform}`);
                } else {
                  router.push(`/${platformCode}/reports/${reportId}`);
                }
              }}
              className="p-1.5 rounded-md hover:bg-gray-100 flex items-center justify-center transition-colors"
              title="Rapor detayına geri dön"
            >
              <ArrowLeft className="h-4 w-4 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                Rapor Düzenle
              </h1>
              <p className="text-slate-600 text-sm">
                "{originalReport?.name}" raporunu düzenleyin
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Report Basic Info */}
          <Card className="bg-white/80 backdrop-blur-sm shadow-sm border border-slate-200/50 hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3 border-b border-slate-300/50">
              <CardTitle className="flex items-center gap-2 text-slate-800 text-base">
                <Database className="w-4 h-4 text-blue-600" />
                Rapor Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reportName" className="text-sm">
                    Rapor Adı *
                  </Label>
                  <Input
                    id="reportName"
                    value={report.name}
                    onChange={(e) => setReport(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Aylık Satış Raporu"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reportDescription" className="text-sm">Açıklama</Label>
                  <Input
                    id="reportDescription"
                    value={report.description}
                    onChange={(e) => setReport(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Bu raporun ne hakkında olduğunu açıklayın..."
                    className="h-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Global Filters Section */}
          <Card className="bg-white/80 backdrop-blur-sm shadow-sm border border-slate-200/50 hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3 pt-3 px-4 border-b border-slate-300/50">
              <CardTitle className="flex items-center gap-2 text-slate-800 text-base">
                <Filter className="w-4 h-4 text-orange-600" />
                Global Filtreler ({(report.globalFilters || []).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {(!report.globalFilters || report.globalFilters.length === 0) ? (
                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                  <Filter className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium mb-2">Henüz Global Filtre Yok</p>
                  <p className="text-slate-500 text-sm mb-4 max-w-md mx-auto">
                    Global filtreler, raporun tüm sorgularına otomatik olarak uygulanır
                  </p>
                  <Button onClick={addGlobalFilter} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    İlk Filtreyi Ekle
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {report.globalFilters.map((filter, filterIndex) => (
                    <div key={filter.id || `edit_global_filter_${filterIndex}`} className="p-4 bg-orange-50/50 border border-orange-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Filter className="w-4 h-4 text-orange-600" />
                          <span className="text-sm font-semibold text-slate-700">Global Filtre {filterIndex + 1}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeGlobalFilter(filterIndex)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-600 h-7 px-2"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Alan Adı</Label>
                          <Input
                            value={filter.fieldName}
                            onChange={(e) => updateGlobalFilter(filterIndex, { fieldName: e.target.value })}
                            placeholder="field_name"
                            className="h-9 text-xs"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Görünen Ad</Label>
                          <Input
                            value={filter.displayName}
                            onChange={(e) => updateGlobalFilter(filterIndex, { displayName: e.target.value })}
                            placeholder="Görünen ad"
                            className="h-9 text-xs"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Filtre Tipi</Label>
                          <Select
                            value={filter.type}
                            onValueChange={(value: any) => updateGlobalFilter(filterIndex, { type: value })}
                          >
                            <option value="text">Metin</option>
                            <option value="number">Sayı</option>
                            <option value="date">Tarih</option>
                            <option value="dropdown">Tekli Seçim</option>
                            <option value="multiselect">Çoklu Seçim</option>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Zorunlu</Label>
                          <Checkbox
                            id={`global-filter-required-${filter.id}`}
                            checked={filter.required}
                            onCheckedChange={(checked) => updateGlobalFilter(filterIndex, { required: !!checked })}
                          />
                        </div>
                      </div>

                      {(filter.type === 'dropdown' || filter.type === 'multiselect') && (
                        <div className="mt-3 space-y-2">
                          <Label className="text-xs">Dropdown SQL</Label>
                          <Textarea
                            value={filter.dropdownQuery || ''}
                            onChange={(e) => updateGlobalFilter(filterIndex, { dropdownQuery: e.target.value })}
                            placeholder="SELECT value, label FROM options"
                            className="min-h-[60px] font-mono text-xs"
                          />
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        <Label className="text-xs">SQL İfadesi (İsteğe Bağlı)</Label>
                        <Input
                          value={filter.sqlExpression || ''}
                          onChange={(e) => updateGlobalFilter(filterIndex, { sqlExpression: e.target.value })}
                          placeholder="DATE(field_name) veya LOWER(field_name)"
                          className="h-9 text-xs font-mono"
                        />
                        <p className="text-xs text-slate-500">
                          Alan adı yerine özel bir SQL ifadesi kullanmak için
                        </p>
                      </div>
                    </div>
                  ))}
                  <Button onClick={addGlobalFilter} size="sm" className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white">
                    <Plus className="w-3 h-3 mr-1" />
                    Filtre Ekle
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Queries Section */}
          <Card className="bg-white/80 backdrop-blur-sm shadow-sm border border-slate-200/50 hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3 pt-3 px-4 border-b border-slate-300/50">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-slate-800 text-base">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Sorgu ve Görselleştirme ({report.queries.length})
                </CardTitle>
                <Button onClick={addNewQuery} size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="w-3 h-3 mr-1" />
                  Yeni Sorgu
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
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
                <TabsList className="grid w-full bg-slate-100 p-1 rounded-lg" style={{ gridTemplateColumns: `repeat(${report.queries.length}, minmax(0, 1fr))` }}>
                  {report.queries.map((query, index) => (
                    <div key={query.id} className="relative">
                      <TabsTrigger value={index.toString()} className="w-full data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-700 data-[state=active]:font-semibold data-[state=inactive]:text-gray-600 data-[state=inactive]:hover:text-gray-900 transition-all">
                        {query.name}
                      </TabsTrigger>
                      {report.queries.length > 1 && (
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 text-red-500 hover:bg-red-100 bg-white border border-red-200 shadow-sm z-10 flex items-center justify-center transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeQuery(index)
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </TabsList>

                {/* Query Content */}
                {report.queries.map((query, queryIndex) => (
                  <TabsContent key={query.id} value={queryIndex.toString()} className="space-y-6">
                    {/* Three Column Layout: Query | Visualization | Filters */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* COLUMN 1: Query Name & SQL */}
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <Label className="flex items-center gap-2 text-sm">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            Sorgu Adı
                          </Label>
                          <Input
                            value={query.name}
                            onChange={(e) => updateQuery(queryIndex, { name: e.target.value })}
                            placeholder="Sorgu adını girin"
                            className="h-9"
                          />
                        </div>

                        <div className="space-y-3">
                          <Label className="flex items-center gap-2 text-sm">
                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                            SQL Sorgusu *
                          </Label>
                          <Textarea
                            value={query.sql}
                            onChange={(e) => updateQuery(queryIndex, { sql: e.target.value })}
                            placeholder="SELECT column1, column2 FROM table_name WHERE condition"
                            className="min-h-[400px] font-mono text-xs bg-slate-50/50"
                          />
                          <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50/50 px-2 py-1.5 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                            Filtre alanları SELECT kısmından alınır
                          </div>
                        </div>

                        {/* Available Fields */}
                        <div className="space-y-2">
                          <Label className="text-sm">Kullanılabilir Alanlar</Label>
                          <div className="border border-slate-200 rounded-lg p-3 min-h-[80px] bg-slate-50/50">
                            {availableFields.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {availableFields.map((field, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {field}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <p className="text-xs text-slate-500">SQL sorgusu girin</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* COLUMN 2: Visualization Configuration */}
                      <div className="space-y-4">
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
                                <>
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

                                  {/* Line Overlay for Bar Charts */}
                                  {query.visualization.type === 'bar' && (
                                    <div className="mt-3 space-y-3 p-3 bg-cyan-50/50 rounded-lg border border-cyan-200">
                                      <div className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`line-overlay-${query.id}`}
                                          checked={query.visualization.chartOptions?.showLineOverlay ?? false}
                                          onCheckedChange={(checked) => {
                                            updateVisualization(queryIndex, {
                                              chartOptions: {
                                                ...query.visualization.chartOptions,
                                                showLineOverlay: checked,
                                                lineYAxis: checked ? query.visualization.chartOptions?.lineYAxis : undefined
                                              }
                                            })
                                          }}
                                        />
                                        <Label htmlFor={`line-overlay-${query.id}`} className="text-sm font-semibold text-cyan-900">
                                          Çizgi Grafik Ekle (Sağ Y Ekseni)
                                        </Label>
                                      </div>

                                      {query.visualization.chartOptions?.showLineOverlay && (
                                        <div className="space-y-2">
                                          <Label className="text-sm">Çizgi Y Ekseni Alanı</Label>
                                          <Select
                                            value={query.visualization.chartOptions?.lineYAxis || ''}
                                            onValueChange={(value) => updateVisualization(queryIndex, {
                                              chartOptions: {
                                                ...query.visualization.chartOptions,
                                                lineYAxis: value
                                              }
                                            })}
                                            placeholder="Çizgi için Y ekseni seçin"
                                          >
                                            {availableFields.map((field) => (
                                              <option key={field} value={field}>{field}</option>
                                            ))}
                                          </Select>
                                          <p className="text-xs text-cyan-700">
                                            Çizgi grafik sağ Y ekseninde gösterilecek
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Clickable Bar Configuration */}
                                  {query.visualization.type === 'bar' && (
                                    <div className="mt-3 space-y-3 p-3 bg-purple-50/50 rounded-lg border border-purple-200">
                                      <div className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`clickable-${query.id}`}
                                          checked={query.visualization.chartOptions?.clickable ?? false}
                                          onCheckedChange={(checked) => {
                                            if (!checked) {
                                              // Clear nested queries when disabling
                                              updateVisualization(queryIndex, {
                                                chartOptions: {
                                                  ...query.visualization.chartOptions,
                                                  clickable: false,
                                                  nestedQueries: []
                                                }
                                              })
                                            } else {
                                              updateVisualization(queryIndex, {
                                                chartOptions: {
                                                  ...query.visualization.chartOptions,
                                                  clickable: true
                                                }
                                              })
                                            }
                                          }}
                                        />
                                        <Label htmlFor={`clickable-${query.id}`} className="text-sm font-semibold text-purple-900">
                                          Tıklanabilir Barlar (Detay Sorgusu)
                                        </Label>
                                      </div>

                                      {query.visualization.chartOptions?.clickable && (
                                        <div className="space-y-3">
                                          {!query.visualization.chartOptions?.nestedQueries || query.visualization.chartOptions.nestedQueries.length === 0 ? (
                                            <div className="text-center py-4 border-2 border-dashed border-purple-300 rounded-lg">
                                              <Button
                                                onClick={() => {
                                                  const newNestedQuery: NestedQueryConfig = {
                                                    id: generateId(),
                                                    sql: '',
                                                    expandableFields: []
                                                  }
                                                  updateVisualization(queryIndex, {
                                                    chartOptions: {
                                                      ...query.visualization.chartOptions,
                                                      nestedQueries: [newNestedQuery]
                                                    }
                                                  })
                                                }}
                                                size="sm"
                                                className="bg-purple-500 hover:bg-purple-600 text-white"
                                              >
                                                <Plus className="w-3 h-3 mr-1" />
                                                Detay Sorgusu Ekle
                                              </Button>
                                            </div>
                                          ) : (
                                            <div className="space-y-2 p-3 bg-white rounded border border-purple-300">
                                              <div className="flex items-center justify-between">
                                                <Label className="text-xs font-semibold text-purple-900">Detay Sorgusu</Label>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => {
                                                    updateVisualization(queryIndex, {
                                                      chartOptions: {
                                                        ...query.visualization.chartOptions,
                                                        nestedQueries: []
                                                      }
                                                    })
                                                  }}
                                                  className="h-5 text-red-500 hover:bg-red-50"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </Button>
                                              </div>

                                              <div className="space-y-2">
                                                <Label className="text-xs">SQL Sorgusu</Label>
                                                <Textarea
                                                  value={query.visualization.chartOptions.nestedQueries[0]?.sql || ''}
                                                  onChange={(e) => {
                                                    const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                    if (currentQueries.length > 0) {
                                                      const updated = [...currentQueries]
                                                      updated[0] = { ...updated[0], sql: e.target.value }
                                                      updateVisualization(queryIndex, {
                                                        chartOptions: {
                                                          ...query.visualization.chartOptions,
                                                          nestedQueries: updated
                                                        }
                                                      })
                                                    }
                                                  }}
                                                  placeholder="SELECT * FROM details WHERE id = {{field_name}}"
                                                  className="min-h-[80px] font-mono text-xs bg-white"
                                                />
                                                <p className="text-xs text-purple-700">
                                                  Tıklanan bardan alan enjekte etmek için {'{{field_name}}'} kullanın
                                                </p>
                                              </div>

                                              <div className="space-y-2">
                                                <Label className="text-xs">Enjekte Edilecek Alanlar</Label>
                                                <div className="space-y-1 max-h-24 overflow-y-auto bg-slate-50 p-2 rounded border border-gray-200">
                                                  {availableFields.length > 0 ? (
                                                    availableFields.map((field) => (
                                                      <div key={field} className="flex items-center space-x-2">
                                                        <Checkbox
                                                          id={`clickable-field-${query.id}-${field}`}
                                                          checked={query.visualization.chartOptions?.nestedQueries?.[0]?.expandableFields?.includes(field) ?? false}
                                                          onCheckedChange={(checked) => {
                                                            const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                            if (currentQueries.length > 0) {
                                                              const currentFields = currentQueries[0].expandableFields || []
                                                              const newFields = checked
                                                                ? [...currentFields, field]
                                                                : currentFields.filter(f => f !== field)
                                                              const updated = [...currentQueries]
                                                              updated[0] = { ...updated[0], expandableFields: newFields }
                                                              updateVisualization(queryIndex, {
                                                                chartOptions: {
                                                                  ...query.visualization.chartOptions,
                                                                  nestedQueries: updated
                                                                }
                                                              })
                                                            }
                                                          }}
                                                        />
                                                        <Label htmlFor={`clickable-field-${query.id}-${field}`} className="text-xs">
                                                          {field}
                                                        </Label>
                                                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                                                          {'{{' + field + '}}'}
                                                        </Badge>
                                                      </div>
                                                    ))
                                                  ) : (
                                                    <p className="text-xs text-gray-500 text-center py-1">Alan bulunamadı</p>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Visualization Type for Nested Query */}
                                              <div className="space-y-2">
                                                <Label className="text-xs">Gösterim Tipi</Label>
                                                <Select
                                                  value={query.visualization.chartOptions?.nestedQueries?.[0]?.visualizationType || 'table'}
                                                  onValueChange={(value) => {
                                                    const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                    if (currentQueries.length > 0) {
                                                      const updated = [...currentQueries]
                                                      updated[0] = { ...updated[0], visualizationType: value as 'table' | 'bar' | 'line' | 'pie' | 'area' }
                                                      updateVisualization(queryIndex, {
                                                        chartOptions: {
                                                          ...query.visualization.chartOptions,
                                                          nestedQueries: updated
                                                        }
                                                      })
                                                    }
                                                  }}
                                                  className="text-xs"
                                                  placeholder="Gösterim tipi seçin"
                                                >
                                                  <option value="table">Tablo</option>
                                                  <option value="bar">Bar Grafik</option>
                                                  <option value="line">Çizgi Grafik</option>
                                                  <option value="area">Alan Grafik</option>
                                                  <option value="pie">Pasta Grafik</option>
                                                </Select>
                                              </div>

                                              {/* Chart Axes Configuration (only show for chart types) */}
                                              {query.visualization.chartOptions?.nestedQueries?.[0]?.visualizationType &&
                                               query.visualization.chartOptions.nestedQueries[0].visualizationType !== 'table' && (
                                                <div className="grid grid-cols-2 gap-2">
                                                  {/* X Axis */}
                                                  <div className="space-y-2">
                                                    <Label className="text-xs">X Ekseni</Label>
                                                    <Input
                                                      value={query.visualization.chartOptions?.nestedQueries?.[0]?.xAxis || ''}
                                                      onChange={(e) => {
                                                        const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                        if (currentQueries.length > 0) {
                                                          const updated = [...currentQueries]
                                                          updated[0] = { ...updated[0], xAxis: e.target.value }
                                                          updateVisualization(queryIndex, {
                                                            chartOptions: {
                                                              ...query.visualization.chartOptions,
                                                              nestedQueries: updated
                                                            }
                                                          })
                                                        }
                                                      }}
                                                      placeholder="Alan adı"
                                                      className="text-xs h-8"
                                                    />
                                                  </div>

                                                  {/* Y Axis or Value Field */}
                                                  {query.visualization.chartOptions.nestedQueries[0].visualizationType !== 'pie' ? (
                                                    <div className="space-y-2">
                                                      <Label className="text-xs">Y Ekseni</Label>
                                                      <Input
                                                        value={query.visualization.chartOptions?.nestedQueries?.[0]?.yAxis || ''}
                                                        onChange={(e) => {
                                                          const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                          if (currentQueries.length > 0) {
                                                            const updated = [...currentQueries]
                                                            updated[0] = { ...updated[0], yAxis: e.target.value }
                                                            updateVisualization(queryIndex, {
                                                              chartOptions: {
                                                                ...query.visualization.chartOptions,
                                                                nestedQueries: updated
                                                              }
                                                            })
                                                          }
                                                        }}
                                                        placeholder="Alan adı"
                                                        className="text-xs h-8"
                                                      />
                                                    </div>
                                                  ) : (
                                                    <>
                                                      <div className="space-y-2">
                                                        <Label className="text-xs">Etiket Alanı</Label>
                                                        <Input
                                                          value={query.visualization.chartOptions?.nestedQueries?.[0]?.labelField || ''}
                                                          onChange={(e) => {
                                                            const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                            if (currentQueries.length > 0) {
                                                              const updated = [...currentQueries]
                                                              updated[0] = { ...updated[0], labelField: e.target.value }
                                                              updateVisualization(queryIndex, {
                                                                chartOptions: {
                                                                  ...query.visualization.chartOptions,
                                                                  nestedQueries: updated
                                                                }
                                                              })
                                                            }
                                                          }}
                                                          placeholder="Alan adı"
                                                          className="text-xs h-8"
                                                        />
                                                      </div>
                                                      <div className="space-y-2">
                                                        <Label className="text-xs">Değer Alanı</Label>
                                                        <Input
                                                          value={query.visualization.chartOptions?.nestedQueries?.[0]?.valueField || ''}
                                                          onChange={(e) => {
                                                            const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                            if (currentQueries.length > 0) {
                                                              const updated = [...currentQueries]
                                                              updated[0] = { ...updated[0], valueField: e.target.value }
                                                              updateVisualization(queryIndex, {
                                                                chartOptions: {
                                                                  ...query.visualization.chartOptions,
                                                                  nestedQueries: updated
                                                                }
                                                              })
                                                            }
                                                          }}
                                                          placeholder="Alan adı"
                                                          className="text-xs h-8"
                                                        />
                                                      </div>
                                                    </>
                                                  )}
                                                </div>
                                              )}

                                              {/* Line Overlay for Nested Bar Chart */}
                                              {query.visualization.chartOptions?.nestedQueries?.[0]?.visualizationType === 'bar' && (
                                                <div className="mt-2 space-y-2 p-3 bg-cyan-50/50 rounded-lg border border-cyan-200">
                                                  <div className="flex items-center space-x-2">
                                                    <Checkbox
                                                      id={`nested-line-overlay-${query.id}`}
                                                      checked={query.visualization.chartOptions?.nestedQueries?.[0]?.showLineOverlay ?? false}
                                                      onCheckedChange={(checked) => {
                                                        const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                        if (currentQueries.length > 0) {
                                                          const updated = [...currentQueries]
                                                          updated[0] = {
                                                            ...updated[0],
                                                            showLineOverlay: checked,
                                                            lineYAxis: checked ? updated[0].lineYAxis : undefined
                                                          }
                                                          updateVisualization(queryIndex, {
                                                            chartOptions: {
                                                              ...query.visualization.chartOptions,
                                                              nestedQueries: updated
                                                            }
                                                          })
                                                        }
                                                      }}
                                                    />
                                                    <Label htmlFor={`nested-line-overlay-${query.id}`} className="text-xs font-semibold text-cyan-900">
                                                      Çizgi Grafik Ekle (Sağ Y Ekseni)
                                                    </Label>
                                                  </div>

                                                  {query.visualization.chartOptions?.nestedQueries?.[0]?.showLineOverlay && (
                                                    <div className="space-y-2">
                                                      <Label className="text-xs">Çizgi Y Ekseni Alanı</Label>
                                                      <Input
                                                        value={query.visualization.chartOptions?.nestedQueries?.[0]?.lineYAxis || ''}
                                                        onChange={(e) => {
                                                          const currentQueries = query.visualization.chartOptions?.nestedQueries || []
                                                          if (currentQueries.length > 0) {
                                                            const updated = [...currentQueries]
                                                            updated[0] = { ...updated[0], lineYAxis: e.target.value }
                                                            updateVisualization(queryIndex, {
                                                              chartOptions: {
                                                                ...query.visualization.chartOptions,
                                                                nestedQueries: updated
                                                              }
                                                            })
                                                          }
                                                        }}
                                                        placeholder="Çizgi için Y ekseni alanı"
                                                        className="text-xs h-8"
                                                      />
                                                      <p className="text-xs text-cyan-700">
                                                        Çizgi grafik sağ Y ekseninde gösterilecek
                                                      </p>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
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

                              {query.visualization.type === 'card' && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2">
                                    <Label className="text-sm">Ana Değer Alanı (Büyük)</Label>
                                    <Select
                                      value={query.visualization.valueField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { valueField: value })}
                                      placeholder="Ana değer alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Alt Metin Alanı (Küçük)</Label>
                                    <Select
                                      value={query.visualization.labelField || ''}
                                      onValueChange={(value) => updateVisualization(queryIndex, { labelField: value })}
                                      placeholder="Alt metin alanı seçin"
                                    >
                                      {availableFields.map((field) => (
                                        <option key={field} value={field}>{field}</option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div className="space-y-2 col-span-2">
                                    <Label className="text-sm">Kart Arkaplan Rengi</Label>
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="color"
                                        value={query.visualization.chartOptions?.backgroundColor || query.visualization.colors?.[0] || '#3B82F6'}
                                        onChange={(e) => {
                                          const color = e.target.value
                                          updateVisualization(queryIndex, {
                                            colors: [
                                              color,
                                              ...(query.visualization.colors?.slice(1) || [])
                                            ],
                                            chartOptions: {
                                              ...query.visualization.chartOptions,
                                              backgroundColor: color
                                            }
                                          })
                                        }}
                                        className="h-10 w-16 border-2 border-slate-200 rounded-lg bg-white/50 cursor-pointer"
                                      />
                                      <Input
                                        value={query.visualization.chartOptions?.backgroundColor || query.visualization.colors?.[0] || '#3B82F6'}
                                        onChange={(e) => {
                                          const color = e.target.value
                                          updateVisualization(queryIndex, {
                                            colors: [
                                              color,
                                              ...(query.visualization.colors?.slice(1) || [])
                                            ],
                                            chartOptions: {
                                              ...query.visualization.chartOptions,
                                              backgroundColor: color
                                            }
                                          })
                                        }}
                                        placeholder="#3B82F6"
                                        className="text-xs h-10"
                                      />
                                    </div>
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

                              {query.visualization.type === 'expandable' && (
                                <NestedQueryBuilder
                                  queryIndex={queryIndex}
                                  nestedQueries={query.visualization.chartOptions?.nestedQueries || []}
                                  parentFields={availableFields}
                                  onUpdate={(nestedQueries) => updateVisualization(queryIndex, {
                                    chartOptions: {
                                      ...query.visualization.chartOptions,
                                      nestedQueries
                                    }
                                  })}
                                  level={0}
                                />
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
                      </div>

                      {/* COLUMN 3: Filters Section */}
                      <div className="space-y-2">
                        {/* Filters Section */}
                        <div className="space-y-2">
                      <div className="flex items-center gap-1.5 bg-orange-50 px-2 py-1.5 rounded border border-orange-200/50">
                        <Filter className="w-3 h-3 text-orange-600" />
                        <h3 className="text-xs font-semibold text-slate-800">Filtreler</h3>
                        {query.filters.length > 0 && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0">
                            {query.filters.length}
                          </Badge>
                        )}
                      </div>

                      {query.filters.length === 0 ? (
                        <div className="text-center py-4 border border-dashed border-slate-200 rounded bg-slate-50/50">
                          <Filter className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                          <p className="text-[10px] text-slate-500">SQL sorgusu girin</p>
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded overflow-hidden bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-1.5 py-1 text-left text-[10px] font-semibold text-slate-700 w-6">#</th>
                                <th className="px-1.5 py-1 text-left text-[10px] font-semibold text-slate-700">Alan</th>
                                <th className="px-1.5 py-1 text-left text-[10px] font-semibold text-slate-700">Görünen</th>
                                <th className="px-1.5 py-1 text-left text-[10px] font-semibold text-slate-700">Tip</th>
                                <th className="px-1.5 py-1 text-center text-[10px] font-semibold text-slate-700 w-12">Zorunlu</th>
                                <th className="px-1.5 py-1 text-center text-[10px] font-semibold text-slate-700 w-10">Sil</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {query.filters.map((filter, filterIndex) => (
                                <React.Fragment key={filter.id}>
                                  <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-1.5 py-1">
                                      <div className="w-4 h-4 bg-gradient-to-r from-violet-400 to-purple-400 rounded flex items-center justify-center">
                                        <span className="text-white font-semibold text-[9px]">{filterIndex + 1}</span>
                                      </div>
                                    </td>
                                    <td className="px-1.5 py-1">
                                      <Select
                                        value={filter.fieldName}
                                        onValueChange={(value) => updateFilter(queryIndex, filterIndex, {
                                          fieldName: value,
                                          displayName: filter.displayName === filter.fieldName ? value : filter.displayName
                                        })}
                                        className="h-6 text-[10px]"
                                      >
                                        {availableFields.map((field) => (
                                          <option key={field} value={field}>{field}</option>
                                        ))}
                                      </Select>
                                    </td>
                                    <td className="px-1.5 py-1">
                                      <Input
                                        value={filter.displayName}
                                        onChange={(e) => updateFilter(queryIndex, filterIndex, { displayName: e.target.value })}
                                        placeholder="Ad"
                                        className="h-6 text-[10px]"
                                      />
                                    </td>
                                    <td className="px-1.5 py-1">
                                      <Select
                                        value={filter.type}
                                        onValueChange={(value: any) => updateFilter(queryIndex, filterIndex, { type: value })}
                                        className="h-6 text-[10px]"
                                      >
                                        {FILTER_TYPES.map((type) => (
                                          <option key={type.value} value={type.value}>{type.label}</option>
                                        ))}
                                      </Select>
                                    </td>
                                    <td className="px-1.5 py-1 text-center">
                                      <Checkbox
                                        id={`required-${filter.id}`}
                                        checked={filter.required}
                                        onCheckedChange={(checked) => updateFilter(queryIndex, filterIndex, { required: !!checked })}
                                        className="mx-auto w-3 h-3"
                                      />
                                    </td>
                                    <td className="px-1.5 py-1 text-center">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeFilter(queryIndex, filterIndex)}
                                        className="h-5 w-5 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                  {/* Advanced Options Row */}
                                  <tr className="bg-slate-50/30">
                                    <td className="px-1.5 py-1.5" colSpan={6}>
                                      <div className="space-y-1.5 text-xs">
                                        {/* SQL Expression */}
                                        <div className="space-y-0.5">
                                          <Label className="text-[10px] text-slate-600">SQL İfadesi</Label>
                                          <Input
                                            value={filter.sqlExpression || ''}
                                            onChange={(e) => updateFilter(queryIndex, filterIndex, { sqlExpression: e.target.value })}
                                            placeholder={`DATE(${filter.fieldName})`}
                                            className="h-6 text-[10px] font-mono"
                                          />
                                        </div>
                                        
                                        {/* Dropdown Query */}
                                        {(filter.type === 'dropdown' || filter.type === 'multiselect') && (
                                          <>
                                            <div className="space-y-0.5">
                                              <Label className="text-[10px] text-slate-600">Dropdown SQL</Label>
                                              <Textarea
                                                value={filter.dropdownQuery || ''}
                                                onChange={(e) => updateFilter(queryIndex, filterIndex, { dropdownQuery: e.target.value })}
                                                placeholder="SELECT value, label FROM table WHERE parent = {{parent_filter}}"
                                                className="min-h-[50px] text-[10px] font-mono"
                                              />
                                              <p className="text-[9px] text-slate-500 mt-0.5">
                                                Bağımlı filtre değeri için {'{{field_name}}'} kullanın
                                              </p>
                                            </div>
                                            <div className="space-y-0.5">
                                              <Label className="text-[10px] text-slate-600">Bağımlı Filtre (İsteğe Bağlı)</Label>
                                              <Select
                                                value={filter.dependsOn || ''}
                                                onValueChange={(value) => updateFilter(queryIndex, filterIndex, { dependsOn: value || undefined })}
                                                className="h-6 text-[10px]"
                                                placeholder="Seçin..."
                                              >
                                                <option value="">Bağımsız</option>
                                                {query.filters
                                                  .filter((f, idx) => idx != filterIndex && (f.type === 'dropdown' || f.type === 'multiselect'))
                                                  .map((f) => (
                                                    <option key={f.id} value={f.fieldName}>
                                                      {f.displayName}
                                                    </option>
                                                  ))}
                                              </Select>
                                              <p className="text-[9px] text-slate-500 mt-0.5">
                                                Bu filtrenin seçeneklerini başka bir filtreye bağlayın
                                              </p>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="p-2">
                        <Button
                          onClick={() => addFilter(queryIndex)}
                          size="sm"
                          disabled={availableFields.length === 0}
                          className="w-full h-7 text-[10px] bg-orange-500 hover:bg-orange-600 text-white disabled:bg-slate-300"
                        >
                          <Plus className="w-2.5 h-2.5 mr-0.5" />
                          Filtre Ekle
                        </Button>
                      </div>
                        </div>
                      </div>
                    </div>

                    {/* Query Preview Section - Full Width */}
                    <div className="space-y-4">
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
                                  {(query.visualization.type as string !== 'table' && query.visualization.type as string !== 'expandable') && (
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
              onClick={() => router.push(`/${platformCode}/reports`)}
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
                  <>
                    {filter.dependsOn && !filterValues[filter.dependsOn] && (
                      <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                        Üst filtre seçilmedi; tüm seçenekler listeleniyor
                      </div>
                    )}
                    <Select
                      value={filterValues[filter.fieldName] || ''}
                      onValueChange={(value) => setFilterValues(prev => ({ ...prev, [filter.fieldName]: value }))}
                      placeholder={`${filter.displayName} seçin`}
                      disabled={filter.dependsOn && !!filterValues[filter.dependsOn] || false}
                    >
                      <option value="">Seçin...</option>
                      {loadingDropdownOptions[filter.fieldName] ? (
                        <option disabled>Yükleniyor...</option>
                      ) : (
                        dropdownOptions[filter.fieldName]?.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      )}
                    </Select>
                  </>
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

      {/* Success Modal */}
      <Dialog open={successModalOpen} onOpenChange={handleSuccessModalClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <DialogTitle className="text-xl font-bold text-emerald-600">
                  🐟 Fener balığınız size yol gösteriyor!
                </DialogTitle>
                <p className="text-slate-600">
                  Rapor başarıyla güncellendi
                </p>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="flex justify-center pt-4">
            <Button
              onClick={handleSuccessModalClose}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-8"
            >
              Tamam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
