import React from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { VisualizationProps } from '../types'
import { rowsToRecords } from './format'
import { CHART_COLORS, paletteOf } from './theme'
import { axisTick, ChartTooltip, EmptyChart } from './ChartTooltip'

export const ScatterVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  if (!records.length) return <EmptyChart />

  const xKey = visualization.xAxis || result.columns[0]
  const yKey = visualization.yAxis || result.columns[1]
  const fill = palette[0] || CHART_COLORS.blue

  return (
    <div className="h-full min-h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 12, left: -4, bottom: 8 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} />
          <XAxis dataKey={xKey} name={xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis dataKey={yKey} name={yKey} tick={axisTick} axisLine={false} tickLine={false} width={40} />
          <ZAxis range={[60, 60]} />
          <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name={query.name} data={records} fill={fill} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
