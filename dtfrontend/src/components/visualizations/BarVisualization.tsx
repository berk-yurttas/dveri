import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, AreaChart, Area } from 'recharts'
import { VisualizationProps } from './types'
import { Button } from '@/components/appShell/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { reportsService } from '@/services/reports'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const BarVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS }) => {
  const { visualization } = query
  const { data, columns } = result

  const [selectedBar, setSelectedBar] = useState<any>(null)
  const [nestedData, setNestedData] = useState<any>(null)
  const [loadingNested, setLoadingNested] = useState(false)
  const [showNested, setShowNested] = useState(false)

  // Convert data to format suitable for charts
  const chartData = data.map(row => {
    const item: any = {}
    columns.forEach((col, index) => {
      const value = row[index]
      // Convert numeric strings to numbers for proper chart rendering
      item[col] = typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== ''
        ? Number(value)
        : value
    })
    return item
  })

  const isClickable = visualization.chartOptions?.clickable &&
                      visualization.chartOptions?.nestedQueries &&
                      visualization.chartOptions.nestedQueries.length > 0

  // Handle bar click
  const handleBarClick = async (data: any) => {
    if (!isClickable || !visualization.chartOptions?.nestedQueries || visualization.chartOptions.nestedQueries.length === 0) return

    setSelectedBar(data)
    setShowNested(true)
    setLoadingNested(true)
    setNestedData(null)

    try {
      // Use the first nested query for clickable charts
      const nestedQuery = visualization.chartOptions.nestedQueries[0]
      let sql = nestedQuery.sql

      // Replace placeholders with values from clicked bar
      nestedQuery.expandableFields?.forEach((field: string) => {
        const value = data[field]
        if (value !== undefined && value !== null) {
          const placeholder = `{{${field}}}`
          sql = sql.replace(new RegExp(placeholder, 'g'), `'${value}'`)
        }
      })

      // Execute the nested query
      const result = await reportsService.previewQuery({
        sql_query: sql
      })

      setNestedData(result)
    } catch (error) {
      console.error('Error loading nested data:', error)
      setNestedData({
        success: false,
        message: 'Failed to load nested data',
        columns: [],
        data: [],
        total_rows: 0,
        execution_time_ms: 0
      })
    } finally {
      setLoadingNested(false)
    }
  }

  const handleBack = () => {
    setShowNested(false)
    setSelectedBar(null)
    setNestedData(null)
  }

  // Render nested visualization based on configuration
  const renderNestedVisualization = () => {
    if (!nestedData || !visualization.chartOptions?.nestedQueries?.[0]) {
      return null
    }

    const nestedQuery = visualization.chartOptions.nestedQueries[0]
    const vizType = nestedQuery.visualizationType || 'table'

    // Convert nested data to chart format
    const nestedChartData = nestedData.data.map((row: any[]) => {
      const item: any = {}
      nestedData.columns.forEach((col: string, index: number) => {
        const value = row[index]
        // Convert numeric strings to numbers for proper chart rendering
        item[col] = typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== ''
          ? Number(value)
          : value
      })
      return item
    })

    // Render as table if no visualization type specified
    if (vizType === 'table') {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {nestedData.columns.map((col: string, index: number) => (
                  <th key={index} className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nestedData.data.map((row: any[], rowIndex: number) => (
                <tr key={rowIndex} className="hover:bg-slate-50">
                  {row.map((cell: any, cellIndex: number) => (
                    <td key={cellIndex} className="px-4 py-2 text-xs text-slate-700">
                      {cell !== null ? String(cell) : <span className="text-slate-400 italic">null</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-slate-500 text-center">
            {nestedData.total_rows} satır • {nestedData.execution_time_ms}ms
          </div>
        </div>
      )
    }

    // Render as chart
    const xAxisField = nestedQuery.xAxis || nestedData.columns[0]
    const yAxisField = nestedQuery.yAxis || nestedData.columns[1]

    // Render chart based on visualization type
    const renderChart = () => {
      if (vizType === 'bar') {
        return (
          <BarChart data={nestedChartData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
            <defs>
              {colors.map((color, i) => {
                const darkColor = color.replace(/[0-9A-Fa-f]{2}/, (match) =>
                  Math.max(0, parseInt(match, 16) - 40).toString(16).padStart(2, '0')
                )
                return (
                  <linearGradient key={i} id={`nestedGradient${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
                    <stop offset="100%" stopColor={darkColor} stopOpacity={0.9}/>
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xAxisField}
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
            />
            <YAxis
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
              label={{ value: yAxisField, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
            <Bar dataKey={yAxisField} fill={colors[0]} radius={[8, 8, 0, 0]} maxBarSize={60}>
              {nestedChartData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={`url(#nestedGradient${index % colors.length})`} />
              ))}
            </Bar>
          </BarChart>
        )
      } else if (vizType === 'line') {
        return (
          <LineChart data={nestedChartData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xAxisField}
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
            />
            <YAxis
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
              label={{ value: yAxisField, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
            <Line type="monotone" dataKey={yAxisField} stroke={colors[0]} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        )
      } else if (vizType === 'area') {
        return (
          <AreaChart data={nestedChartData} margin={{ top: 20, right: 0, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[0]} stopOpacity={0.8}/>
                <stop offset="95%" stopColor={colors[0]} stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey={xAxisField}
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
            />
            <YAxis
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
              label={{ value: yAxisField, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
            <Area type="monotone" dataKey={yAxisField} fill="url(#areaGradient)" stroke={colors[0]} strokeWidth={2} />
          </AreaChart>
        )
      } else if (vizType === 'pie') {
        return (
          <PieChart>
            <defs>
              {colors.map((color, i) => {
                const darkColor = color.replace(/[0-9A-Fa-f]{2}/, (match) =>
                  Math.max(0, parseInt(match, 16) - 40).toString(16).padStart(2, '0')
                )
                return (
                  <linearGradient key={i} id={`pieGradient${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
                    <stop offset="100%" stopColor={darkColor} stopOpacity={0.9}/>
                  </linearGradient>
                )
              })}
            </defs>
            <Pie
              data={nestedChartData}
              dataKey={nestedQuery.valueField || yAxisField}
              nameKey={nestedQuery.labelField || xAxisField}
              cx="50%"
              cy="50%"
              outerRadius={120}
              label
            >
              {nestedChartData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={`url(#pieGradient${index % colors.length})`} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
          </PieChart>
        )
      }
      return null
    }

    const chartElement = renderChart()

    return (
      <div>
        {chartElement && (
          <ResponsiveContainer width="100%" height={400}>
            {chartElement}
          </ResponsiveContainer>
        )}
      </div>
    )
  }

  // Show nested visualization if clicked
  if (showNested) {
    return (
      <div className="space-y-3">
        {/* Back button */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
          <div className="text-sm text-slate-600">
            {selectedBar?.[visualization.xAxis || columns[0]]} - Detay
          </div>
        </div>

        {/* Loading state */}
        {loadingNested ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : nestedData ? (
          nestedData.success ? (
            renderNestedVisualization()
          ) : (
            <div className="text-center py-8">
              <p className="text-red-500 text-sm">{nestedData.message}</p>
            </div>
          )
        ) : null}
      </div>
    )
  }

  // Show main bar chart
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
        <defs>
          {colors.map((color, i) => {
            // Create gradient for each color
            const darkColor = color.replace(/[0-9A-Fa-f]{2}/, (match) =>
              Math.max(0, parseInt(match, 16) - 40).toString(16).padStart(2, '0')
            )
            return (
              <linearGradient key={i} id={`colorGradient${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.9}/>
                <stop offset="100%" stopColor={darkColor} stopOpacity={0.9}/>
              </linearGradient>
            )
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={visualization.xAxis || columns[0]}
          stroke="#6b7280"
          style={{ fontSize: '13px', fontWeight: 500 }}
          tickLine={false}
          padding={{ left: 30, right: 30 }}
          angle={-45}
          textAnchor="end"
          height={70}
        />
        <YAxis
          stroke="#6b7280"
          style={{ fontSize: '13px', fontWeight: 500 }}
          tickLine={false}
          label={{ value: visualization.yAxis || columns[1], angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
            padding: '12px'
          }}
          cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
        />
        {visualization.showLegend && <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />}
        <Bar
          dataKey={visualization.yAxis || columns[1]}
          fill={colors[0]}
          name={visualization.yAxis || columns[1]}
          onClick={isClickable ? handleBarClick : undefined}
          cursor={isClickable ? 'pointer' : 'default'}
          radius={[8, 8, 0, 0]}
          maxBarSize={60}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={`url(#colorGradient${index % colors.length})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

