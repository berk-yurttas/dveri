import React, { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { VisualizationProps } from '../types'
import { reportsService } from '@/services/reports'
import { asNumber, formatNumber, rowsToRecords } from './format'
import { CHART_COLORS, paletteOf } from './theme'
import { axisTick, ChartTooltip, EmptyChart, TruncatedTick } from './ChartTooltip'
import { Button } from '@/components/appShell/ui/button'

type RecordRow = Record<string, unknown>

function FieldTooltip({
  active,
  payload,
  label,
  fields,
  names,
  yKey,
}: {
  active?: boolean
  payload?: Array<{ payload?: RecordRow; dataKey?: string }>
  label?: unknown
  fields: string[]
  names: Record<string, string>
  yKey: string
}) {
  if (!active || !payload?.length) return null
  const point = payload.find((item) => String(item.dataKey ?? '').startsWith(`${yKey}_`)) || payload[0]
  const dataKey = String(point?.dataKey ?? '')
  const match = dataKey.match(/_(\d+)$/)
  const barIndex = match ? Number(match[1]) - 1 : 0
  const items = (point?.payload?._items as RecordRow[] | undefined) || []
  const source = items[barIndex] || point?.payload || {}

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-md">
      <p className="mb-1 font-semibold text-slate-700">{String(label ?? '')}</p>
      <ul className="space-y-0.5">
        {fields.map((field) => (
          <li key={field} className="flex gap-2 text-slate-600">
            <span>{names[field] || field}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-800">
              {formatNumber(source[field])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const BarVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  const xKey = visualization.xAxis || result.columns[0]
  const yKey = visualization.yAxis || result.columns[1]
  const legendFields: string[] = visualization.chartOptions?.legendFields || []
  const useLegendValues = Boolean(visualization.chartOptions?.useLegendFieldValues)
  const tooltipFields: string[] = visualization.chartOptions?.tooltipFields || []
  const fieldNames: Record<string, string> = visualization.chartOptions?.fieldDisplayNames || {}
  const showLine = Boolean(visualization.chartOptions?.showLineOverlay && visualization.chartOptions?.lineYAxis)
  const lineKey = visualization.chartOptions?.lineYAxis as string | undefined
  const referenceField = visualization.chartOptions?.referenceLineField as string | undefined

  const [selectedBar, setSelectedBar] = useState<RecordRow | null>(null)
  const [nestedData, setNestedData] = useState<any>(null)
  const [loadingNested, setLoadingNested] = useState(false)
  const [showNested, setShowNested] = useState(false)

  if (!records.length) return <EmptyChart />

  const legendValues = useLegendValues && legendFields[0]
    ? [...new Set(records.map((row) => row[legendFields[0]]).filter((value) => value != null))]
        .sort((a, b) => String(a).localeCompare(String(b), 'tr'))
    : []
  const colorByValue = new Map<unknown, number>(legendValues.map((value, index) => [value, index]))

  const grouped = new Map<string, RecordRow[]>()
  records.forEach((row) => {
    const key = String(row[xKey] ?? '—')
    const bucket = grouped.get(key) ?? []
    bucket.push(row)
    grouped.set(key, bucket)
  })

  const chartData = Array.from(grouped.entries()).map(([xValue, items]) => {
    const sorted = useLegendValues && legendFields[0]
      ? [...items].sort((a, b) => String(a[legendFields[0]] ?? '').localeCompare(String(b[legendFields[0]] ?? ''), 'tr'))
      : items
    const point: RecordRow = { [xKey]: xValue, _items: sorted }
    sorted.forEach((item, index) => {
      const barKey = `${yKey}_${index + 1}`
      point[barKey] = item[yKey]
      if (useLegendValues && legendFields[0]) point[`${barKey}_legendValue`] = item[legendFields[0]]
      if (lineKey) point[`${lineKey}_${index + 1}`] = item[lineKey]
    })
    if (sorted[0]) {
      Object.entries(sorted[0]).forEach(([key, value]) => {
        if (!(key in point)) point[key] = value
      })
    }
    return point
  })

  const maxBars = Math.max(...Array.from(grouped.values()).map((items) => items.length))
  const barKeys = Array.from({ length: maxBars }, (_, index) => `${yKey}_${index + 1}`)
  const singleSeries = maxBars <= 1
  const maxLabel = Math.max(...chartData.map((item) => String(item[xKey] ?? '').length), 0)
  const categoriesOnY = !showLine && (chartData.length > 7 || maxLabel > 18)
  const chartHeight = categoriesOnY ? Math.max(220, chartData.length * 32) : undefined

  const referenceValue = referenceField && chartData.length > 0 ? chartData[0][referenceField] : null
  const clickable = Boolean(
    visualization.chartOptions?.clickable && visualization.chartOptions?.nestedQueries?.length
  )

  const colorFor = (entry: RecordRow, barKey: string, barIndex: number, categoryIndex: number) => {
    if (useLegendValues) {
      const legendValue = entry[`${barKey}_legendValue`]
      if (colorByValue.has(legendValue)) return palette[colorByValue.get(legendValue)! % palette.length]
    }
    if (singleSeries) return palette[categoryIndex % palette.length]
    return palette[barIndex % palette.length]
  }

  const seriesName = (barIndex: number) => {
    if (useLegendValues && legendValues[barIndex] != null) return String(legendValues[barIndex])
    if (legendFields[barIndex]) return legendFields[barIndex]
    return singleSeries ? yKey : `${yKey} ${barIndex + 1}`
  }

  const handleBarClick = async (row: RecordRow) => {
    const nestedQuery = visualization.chartOptions?.nestedQueries?.[0]
    if (!clickable || !nestedQuery) return
    setSelectedBar(row)
    setShowNested(true)
    setLoadingNested(true)
    setNestedData(null)
    try {
      let sql = nestedQuery.sql as string
      nestedQuery.expandableFields?.forEach((field: string) => {
        const items = row._items as RecordRow[] | undefined
        const value = row[field] ?? items?.[0]?.[field]
        if (value !== undefined && value !== null) {
          sql = sql.replace(new RegExp(`\\{\\{${field}\\}\\}`, 'g'), `'${value}'`)
        }
      })
      setNestedData(await reportsService.previewQuery({ sql_query: sql }))
    } catch {
      setNestedData({ success: false, message: 'Detay yüklenemedi', columns: [], data: [] })
    } finally {
      setLoadingNested(false)
    }
  }

  if (showNested) {
    const nestedRecords = nestedData?.success ? rowsToRecords(nestedData.columns, nestedData.data) : []
    const nestedQuery = visualization.chartOptions?.nestedQueries?.[0]
    const nestedType = nestedQuery?.visualizationType || 'table'
    const nestedX = nestedQuery?.xAxis || nestedData?.columns?.[0]
    const nestedY = nestedQuery?.yAxis || nestedData?.columns?.[1]

    return (
      <div className="flex h-full min-h-[180px] flex-col gap-2">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setShowNested(false)} className="h-7 gap-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            Geri
          </Button>
          <span className="truncate text-xs text-slate-500">{String(selectedBar?.[xKey] ?? '')}</span>
        </div>
        {loadingNested ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#0052A5]" />
          </div>
        ) : nestedData?.success ? (
          nestedType === 'table' || !nestedX ? (
            <div className="report-viz-v2 min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b-2 border-slate-200 bg-slate-50 text-slate-600">
                    {nestedData.columns.map((column: string) => (
                      <th key={column} className="whitespace-nowrap px-2.5 py-2 font-semibold">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nestedData.data.map((row: unknown[], rowIndex: number) => (
                    <tr key={rowIndex} className="border-b border-slate-100 hover:bg-slate-50">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="whitespace-nowrap px-2.5 py-2 text-slate-700">
                          {formatNumber(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nestedRecords} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey={nestedX} tick={<TruncatedTick />} axisLine={false} tickLine={false} interval={0} height={36} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey={nestedY} name={nestedY} fill={palette[0]} radius={[6, 6, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        ) : (
          <p className="text-sm text-red-500">{nestedData?.message || 'Detay yüklenemedi'}</p>
        )}
      </div>
    )
  }

  const tooltip = tooltipFields.length
    ? <FieldTooltip fields={tooltipFields} names={fieldNames} yKey={yKey} />
    : <ChartTooltip />

  const bars = barKeys.map((barKey, barIndex) => (
    <Bar
      key={barKey}
      dataKey={barKey}
      name={seriesName(barIndex)}
      radius={categoriesOnY ? [0, 6, 6, 0] : [6, 6, 0, 0]}
      maxBarSize={22}
      cursor={clickable ? 'pointer' : 'default'}
      onClick={clickable ? (barData: any) => {
        const point = (barData?.payload ?? {}) as RecordRow
        const dataKey = String(barData?.tooltipPayload?.[0]?.dataKey ?? '')
        const match = dataKey.match(/_(\d+)$/)
        const items = (point._items as RecordRow[] | undefined) || []
        const item = match ? items[Number(match[1]) - 1] : items[0]
        handleBarClick({ ...point, ...(item || {}) })
      } : undefined}
      yAxisId={showLine ? 'left' : undefined}
    >
      {chartData.map((entry, index) => (
        <Cell
          key={`${barKey}-${index}`}
          fill={entry[barKey] == null ? 'transparent' : colorFor(entry, barKey, barIndex, index)}
        />
      ))}
    </Bar>
  ))

  const axes = categoriesOnY ? (
    <>
      <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
      <YAxis type="category" dataKey={xKey} tick={<TruncatedTick anchor="end" />} axisLine={false} tickLine={false} width={Math.min(168, Math.max(84, maxLabel * 6.4))} />
    </>
  ) : (
    <>
      <XAxis dataKey={xKey} tick={<TruncatedTick />} axisLine={false} tickLine={false} interval={0} height={40} />
      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} yAxisId={showLine ? 'left' : undefined} />
    </>
  )

  const reference = referenceValue !== null && referenceValue !== undefined ? (
    <ReferenceLine
      {...(categoriesOnY ? { x: asNumber(referenceValue) } : { y: asNumber(referenceValue) })}
      yAxisId={showLine ? 'left' : undefined}
      stroke={visualization.chartOptions?.referenceLineColor || CHART_COLORS.red}
      strokeDasharray="4 4"
      label={{
        value: String(visualization.chartOptions?.referenceLineLabel || referenceField),
        fill: visualization.chartOptions?.referenceLineColor || CHART_COLORS.red,
        fontSize: 10,
        position: 'insideTopRight',
      }}
    />
  ) : null

  const legend = (!singleSeries || useLegendValues) && visualization.showLegend !== false ? (
    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
  ) : null

  const chart = showLine && lineKey ? (
    <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: -4, bottom: 4 }} barCategoryGap={14}>
      <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
      {axes}
      <YAxis yAxisId="right" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={36} />
      <Tooltip content={tooltip} cursor={{ fill: 'rgba(0,82,165,0.06)' }} />
      {legend}
      {bars}
      {Array.from({ length: maxBars }, (_, index) => (
        <Line
          key={`${lineKey}-${index}`}
          yAxisId="right"
          type="monotone"
          dataKey={`${lineKey}_${index + 1}`}
          name={index === 0 ? lineKey : `${lineKey} ${index + 1}`}
          stroke={palette[(barKeys.length + index) % palette.length]}
          strokeWidth={2.2}
          dot={{ r: 3, strokeWidth: 0 }}
          legendType={index === 0 ? 'line' : 'none'}
        />
      ))}
      {reference}
    </ComposedChart>
  ) : (
    <BarChart
      data={chartData}
      layout={categoriesOnY ? 'vertical' : 'horizontal'}
      margin={{ top: 8, right: 12, left: categoriesOnY ? 4 : -8, bottom: 0 }}
      barCategoryGap={categoriesOnY ? 10 : 18}
    >
      <CartesianGrid stroke={CHART_COLORS.grid} horizontal={!categoriesOnY} vertical={categoriesOnY} />
      {axes}
      <Tooltip content={tooltip} cursor={{ fill: 'rgba(0,82,165,0.06)' }} />
      {legend}
      {bars}
      {reference}
    </BarChart>
  )

  return (
    <div className={`h-full min-h-[180px] w-full ${categoriesOnY ? 'overflow-y-auto' : ''}`}>
      {clickable && (
        <p className="mb-1 text-[10px] text-slate-400">Detay için bir çubuğa tıklayın</p>
      )}
      <div style={{ height: chartHeight ?? '100%', minHeight: 180 }}>
        <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
      </div>
    </div>
  )
}
