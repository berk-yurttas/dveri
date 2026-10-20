import React from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { VisualizationProps } from '../types'
import { rowsToRecords } from './format'
import { CHART_COLORS, paletteOf } from './theme'
import { axisTick, ChartTooltip, EmptyChart, TruncatedTick } from './ChartTooltip'

export const AreaVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  if (!records.length) return <EmptyChart />

  const xKey = visualization.xAxis || result.columns[0]
  const yKey = visualization.yAxis || result.columns[1]
  const stroke = palette[0] || CHART_COLORS.blue
  const gradientId = `v2-area-${query.id}`
  const tickInterval = records.length > 16 ? Math.ceil(records.length / 8) - 1 : 0

  return (
    <div className="h-full min-h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={records} margin={{ top: 12, right: 12, left: -8, bottom: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={<TruncatedTick />} axisLine={false} tickLine={false} interval={tickInterval} height={36} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey={yKey}
            name={yKey}
            stroke={stroke}
            strokeWidth={2.2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: stroke }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
