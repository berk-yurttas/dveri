import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie, AreaChart, Area, ComposedChart } from 'recharts'
import { VisualizationProps } from './types'
import { Button } from '@/components/appShell/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { reportsService } from '@/services/reports'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const BarVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS, scale = 1 }) => {
  const { visualization } = query
  const { data, columns } = result

  const [selectedBar, setSelectedBar] = useState<any>(null)
  const [nestedData, setNestedData] = useState<any>(null)
  const [loadingNested, setLoadingNested] = useState(false)
  const [showNested, setShowNested] = useState(false)
  const [hoveredBarKey, setHoveredBarKey] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload, coordinate }: any) => {
    if (!active || !payload || !payload.length) return null

    const tooltipFields = visualization.chartOptions?.tooltipFields || []
    const fieldDisplayNames = visualization.chartOptions?.fieldDisplayNames || {}

    if (tooltipFields.length === 0) {
      // Default behavior - show default tooltip
      return null
    }

    // Use hoveredBarKey if available, otherwise fall back to payload detection
    let dataKey: string
    let dataPoint: any

    if (hoveredBarKey) {
      // Use the tracked hovered bar key
      dataKey = hoveredBarKey
      dataPoint = payload[0].payload
    } else {
      // Fallback: Find the bar that's actually being hovered (not line overlay)
      const yAxisField = visualization.yAxis || columns[1]
      const hoveredBar = payload.find((p: any) => {
        const key = p.dataKey as string
        return key.startsWith(yAxisField + '_')
      }) || payload[0]

      dataKey = hoveredBar.dataKey as string
      dataPoint = hoveredBar.payload
    }

    // Extract the bar index from the dataKey (e.g., "age_1" -> index 0)
    const barIndexMatch = dataKey.match(/_(\d+)$/)
    const barIndex = barIndexMatch ? parseInt(barIndexMatch[1]) - 1 : 0

    // Get the original item data for this specific bar
    const originalItems = dataPoint._items || []
    const originalItem = originalItems[barIndex] || dataPoint

    return (
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
          padding: '12px'
        }}
      >
        {tooltipFields.map((field: string) => {
          const displayName = fieldDisplayNames[field] || field
          const value = originalItem[field]

          return (
            <div key={field} style={{ marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>{displayName}: </span>
              <span style={{ color: '#6B7280' }}>{value !== null && value !== undefined ? String(value) : 'N/A'}</span>
            </div>
          )
        })}
      </div>
    )
  }

  // Convert data to format suitable for grouped bar charts
  const xAxisField = visualization.xAxis || columns[0]
  const yAxisField = visualization.yAxis || columns[1]

  // Group data by x-axis value - each group will have multiple bars
  const groupedData = new Map<string, any[]>()

  data.forEach(row => {
    const item: any = {}
    columns.forEach((col, index) => {
      const value = row[index]
      // Convert numeric strings to numbers for proper chart rendering
      item[col] = typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== ''
        ? Number(value)
        : value
    })

    const xValue = String(item[xAxisField])
    if (!groupedData.has(xValue)) {
      groupedData.set(xValue, [])
    }
    groupedData.get(xValue)!.push(item)
  })

  // Transform grouped data into format for grouped bar chart
  // Each x-axis label becomes one data point with multiple y-values
  const chartData = Array.from(groupedData.entries()).map(([xValue, items]) => {
    const dataPoint: any = { [xAxisField]: xValue }

    // Store all original items for tooltip access (using _items to avoid conflicts)
    dataPoint._items = items

    // Add each item as a separate bar in the group
    items.forEach((item, index) => {
      const barKey = `${yAxisField}_${index + 1}`
      dataPoint[barKey] = item[yAxisField]

      // Also store line overlay data if present
      if (visualization.chartOptions?.lineYAxis) {
        const lineKey = `${visualization.chartOptions.lineYAxis}_${index + 1}`
        dataPoint[lineKey] = item[visualization.chartOptions.lineYAxis]
      }
    })

    // Preserve common fields from the first item for backward compatibility
    if (items.length > 0) {
      columns.forEach(col => {
        // Don't overwrite already set keys
        if (!(col in dataPoint)) {
          dataPoint[col] = items[0][col]
        }
      })
    }

    return dataPoint
  })

  // Get all unique bar keys for rendering
  const maxBarsPerGroup = Math.max(...Array.from(groupedData.values()).map(items => items.length))
  const barKeys = Array.from({ length: maxBarsPerGroup }, (_, i) => `${yAxisField}_${i + 1}`)

  // Calculate dynamic bar gap based on grouping
  // If all groups have only 1 bar, use larger gap (single bars)
  // If groups have multiple bars, use smaller gap (grouped bars)
  const allSingleBars = Array.from(groupedData.values()).every(items => items.length === 1)
  const barCategoryGap = allSingleBars ? '40%' : '20%'
  const barGap = allSingleBars ? 8 : 4

  // Calculate dynamic XAxis height based on longest label
  const calculateXAxisHeight = () => {
    const xAxisField = visualization.xAxis || columns[0]
    const xAxisValue = chartData.map(item => item[xAxisField])
    const maxLabelLength = Math.max(...xAxisValue.map(item => String(item).length), 0)

    // Calculate number of lines needed for longest label (20 chars per line)
    const charsPerLine = 20
    const maxLines = Math.ceil(maxLabelLength / charsPerLine)

    // Base height + extra per line (with -45° angle, each line needs ~15px vertical space)
    const calculatedHeight = Math.max(70, Math.min(250, 50 + (maxLines - 1) * 15))
    return calculatedHeight
  }

  // Custom tick to render multiline labels
  const CustomXAxisTick = ({ x, y, payload }: any) => {
    const str = String(payload.value)
    const charsPerLine = 30
    const lines: string[] = []

    // Split into multiple lines
    for (let i = 0; i < str.length; i += charsPerLine) {
      lines.push(str.substring(i, i + charsPerLine))
    }

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={0}
          textAnchor="end"
          fill="#6b7280"
          fontSize="10px"
          fontWeight={400}
          transform="rotate(-45)"
        >
          {lines.map((line, index) => (
            <tspan key={index} x={0} dy={index === 0 ? 0 : 12}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    )
  }

  const xAxisHeight = calculateXAxisHeight()
  const bottomMargin = Math.max(5, xAxisHeight - 60) // Adjust bottom margin based on height

  const isClickable = visualization.chartOptions?.clickable &&
                      visualization.chartOptions?.nestedQueries &&
                      visualization.chartOptions.nestedQueries.length > 0

  const showLineOverlay = visualization.chartOptions?.showLineOverlay && visualization.chartOptions?.lineYAxis

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
        const showNestedLineOverlay = nestedQuery.showLineOverlay && nestedQuery.lineYAxis

        if (showNestedLineOverlay) {
          // Render bar chart with line overlay using ComposedChart
          return (
            <ComposedChart data={nestedChartData} margin={{ top: 20, right: 50, left: 0, bottom: 5 }}>
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
                yAxisId="left"
                stroke="#6b7280"
                style={{ fontSize: '13px', fontWeight: 500 }}
                tickLine={false}
                label={{ value: yAxisField, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                style={{ fontSize: '13px', fontWeight: 500 }}
                tickLine={false}
                label={{ value: nestedQuery.lineYAxis, angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}
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
                <Bar
                yAxisId="left"
                dataKey={yAxisField}
                fill={colors[0]}
                name={yAxisField}
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              >
                {nestedChartData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={`url(#nestedGradient${index % colors.length})`} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={nestedQuery.lineYAxis}
                stroke={colors[1] || '#10B981'}
                strokeWidth={3}
                dot={{ r: 4, fill: colors[1] || '#10B981' }}
                activeDot={{ r: 6 }}
                name={nestedQuery.lineYAxis}
              />
            </ComposedChart>
          )
        }

        // Regular bar chart without line overlay
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
              content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
              contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              } : undefined}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ pointerEvents: 'none' }}
              isAnimationActive={false}
              offset={10}
            />
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
              content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
              contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              } : undefined}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ pointerEvents: 'none' }}
              isAnimationActive={false}
              offset={10}
            />
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
              content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
              contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              } : undefined}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ pointerEvents: 'none' }}
              isAnimationActive={false}
              offset={10}
            />
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
  if (showLineOverlay) {
    return (
      <div style={{ width: '100%', height: '100%', minHeight: '200px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 50, left: 0, bottom: bottomMargin }} barCategoryGap={barCategoryGap} barGap={barGap}>
            <defs>
              {colors.map((color, i) => {
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
              tickLine={false}
              padding={{ left: 30, right: 30 }}
              height={xAxisHeight}
              interval={0}
              tick={<CustomXAxisTick />}
            />
            <YAxis
              yAxisId="left"
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
              label={{ value: visualization.yAxis || columns[1], angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#6b7280"
              style={{ fontSize: '13px', fontWeight: 500 }}
              tickLine={false}
              label={{ value: visualization.chartOptions.lineYAxis, angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}
            />
            <Tooltip
              content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
              contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              } : undefined}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              allowEscapeViewBox={{ x: true, y: true }}
              wrapperStyle={{ pointerEvents: 'none' }}
              isAnimationActive={false}
              offset={10}
            />
            {barKeys.map((barKey, barIndex) => (
              <Bar
                key={barKey}
                yAxisId="left"
                dataKey={barKey}
                fill={colors[barIndex % colors.length]}
                name={`${visualization.yAxis || columns[1]} ${barIndex + 1}`}
                onClick={isClickable ? handleBarClick : undefined}
                cursor={isClickable ? 'pointer' : 'default'}
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
                onMouseEnter={() => setHoveredBarKey(barKey)}
                onMouseLeave={() => setHoveredBarKey(null)}
              >
                {chartData.map((entry, index) => {
                  // For single bars, use different color for each x-axis category
                  // For grouped bars, use the same color for all items in the same bar group
                  const colorIndex = allSingleBars ? index % colors.length : barIndex % colors.length
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#colorGradient${colorIndex})`}
                    />
                  )
                })}
              </Bar>
            ))}
            {Array.from({ length: maxBarsPerGroup }, (_, i) => i + 1).map((lineIndex, idx) => {
              const lineKey = `${visualization.chartOptions.lineYAxis}_${lineIndex}`
              return (
                <Line
                  key={lineKey}
                  yAxisId="right"
                  type="monotone"
                  dataKey={lineKey}
                  stroke={colors[(barKeys.length + idx) % colors.length] || '#10B981'}
                  strokeWidth={3}
                  dot={{ r: 4, fill: colors[(barKeys.length + idx) % colors.length] || '#10B981' }}
                  activeDot={{ r: 6 }}
                  name={`${visualization.chartOptions.lineYAxis} ${lineIndex}`}
                />
              )
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '200px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: bottomMargin }} barCategoryGap={barCategoryGap} barGap={barGap}>
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
            tickLine={false}
            padding={{ left: 30, right: 30 }}
            height={xAxisHeight}
            interval={0}
            tick={<CustomXAxisTick />}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '13px', fontWeight: 500 }}
            tickLine={false}
            label={{ value: visualization.yAxis || columns[1], angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
          />
          <Tooltip
            content={(visualization.chartOptions?.tooltipFields?.length ?? 0) > 0 ? <CustomTooltip /> : undefined}
            contentStyle={(visualization.chartOptions?.tooltipFields?.length ?? 0) === 0 ? {
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              padding: '12px'
            } : undefined}
            cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ pointerEvents: 'none' }}
            isAnimationActive={false}
            offset={10}
          />
          {barKeys.map((barKey, barIndex) => (
            <Bar
              key={barKey}
              dataKey={barKey}
              fill={colors[barIndex % colors.length]}
              name={`${visualization.yAxis || columns[1]} ${barIndex + 1}`}
              onClick={isClickable ? handleBarClick : undefined}
              cursor={isClickable ? 'pointer' : 'default'}
              radius={[8, 8, 0, 0]}
              maxBarSize={60}
              onMouseEnter={() => setHoveredBarKey(barKey)}
              onMouseLeave={() => setHoveredBarKey(null)}
            >
              {chartData.map((entry, index) => {
                // For single bars, use different color for each x-axis category
                // For grouped bars, use the same color for all items in the same bar group
                const colorIndex = allSingleBars ? index % colors.length : barIndex % colors.length
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={`url(#colorGradient${colorIndex})`}
                  />
                )
              })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

