import React from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { VisualizationProps } from '../types'
import { asNumber, rowsToRecords } from './format'
import { CHART_COLORS, paletteOf } from './theme'
import { axisTick, ChartTooltip, EmptyChart, TruncatedTick } from './ChartTooltip'

export const ParetoVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  const xKey = visualization.xAxis || result.columns[0]
  const yKey = visualization.yAxis || result.columns[1]

  const ranked = records
    .map((row) => ({ category: String(row[xKey] ?? '—'), value: asNumber(row[yKey]) }))
    .sort((a, b) => b.value - a.value)

  const total = ranked.reduce((sum, item) => sum + item.value, 0)
  if (!ranked.length || total === 0) return <EmptyChart />

  let cumulative = 0
  const chartData = ranked.map((item) => {
    cumulative += item.value
    return { ...item, cumulative: (cumulative / total) * 100 }
  })
  const fill = palette[0] || CHART_COLORS.blue
  const lineColor = palette[1] || CHART_COLORS.orange

  return (
    <div className="h-full min-h-[180px] w-full overflow-x-auto">
      <div className="h-full" style={{ minWidth: Math.max(320, chartData.length * 52) }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: -8, bottom: 4 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="category" tick={<TruncatedTick />} axisLine={false} tickLine={false} interval={0} height={40} />
            <YAxis yAxisId="left" tick={axisTick} axisLine={false} tickLine={false} width={36} />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar yAxisId="left" dataKey="value" name="Değer" radius={[6, 6, 0, 0]} maxBarSize={22}>
              {chartData.map((item, index) => (
                <Cell key={`${item.category}-${index}`} fill={item.cumulative <= 80 ? fill : `${fill}99`} />
              ))}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative"
              name="Kümülatif %"
              stroke={lineColor}
              strokeWidth={2.2}
              dot={{ r: 3, strokeWidth: 0, fill: lineColor }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
