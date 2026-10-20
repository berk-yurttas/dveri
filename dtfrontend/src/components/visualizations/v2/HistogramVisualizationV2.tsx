import React from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { VisualizationProps } from '../types'
import { asNumber, rowsToRecords } from './format'
import { CHART_COLORS, paletteOf } from './theme'
import { axisTick, ChartTooltip, EmptyChart, TruncatedTick } from './ChartTooltip'

export const HistogramVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  const yKey = visualization.yAxis || result.columns[1]
  const values = records.map((row) => asNumber(row[yKey])).filter((value) => Number.isFinite(value))

  if (!values.length) return <EmptyChart message="Histogram için sayısal veri yok" />

  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const bins =
    minVal === maxVal
      ? [{ binLabel: String(minVal), count: values.length }]
      : (() => {
          const binCount = Math.min(16, Math.max(5, Math.ceil(Math.sqrt(values.length))))
          const binWidth = (maxVal - minVal) / binCount
          const next = Array.from({ length: binCount }, (_, index) => ({
            binLabel: `${(minVal + index * binWidth).toFixed(1)}–${(minVal + (index + 1) * binWidth).toFixed(1)}`,
            count: 0,
          }))
          values.forEach((value) => {
            const index = Math.min(binCount - 1, Math.floor((value - minVal) / binWidth))
            if (index >= 0) next[index].count += 1
          })
          return next
        })()

  const fill = palette[0] || CHART_COLORS.blue

  return (
    <div className="h-full min-h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 12, right: 8, left: -8, bottom: 8 }} barCategoryGap={4}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="binLabel" tick={<TruncatedTick />} axisLine={false} tickLine={false} interval={0} height={42} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,82,165,0.06)' }} />
          <Bar dataKey="count" name="Adet" radius={[6, 6, 0, 0]} maxBarSize={36}>
            {bins.map((bin, index) => (
              <Cell key={bin.binLabel} fill={index === bins.length - 1 ? fill : `${fill}cc`} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
