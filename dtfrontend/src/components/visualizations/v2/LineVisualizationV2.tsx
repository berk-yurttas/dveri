import React from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { VisualizationProps } from '../types'
import { rowsToRecords } from './format'
import { paletteOf, CHART_COLORS } from './theme'
import { axisTick, ChartTooltip, EmptyChart, TruncatedTick } from './ChartTooltip'

export const LineVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  if (!records.length) return <EmptyChart />

  const xKey = visualization.xAxis || result.columns[0]
  const yKey = visualization.yAxis || result.columns[1]
  const stroke = palette[0] || CHART_COLORS.blue
  const referenceField = visualization.chartOptions?.referenceLineField as string | undefined
  const referenceValue = referenceField && records.length > 0 ? records[0][referenceField] : null
  const tickInterval = records.length > 16 ? Math.ceil(records.length / 8) - 1 : 0

  return (
    <div className="h-full min-h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={records} margin={{ top: 12, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={<TruncatedTick />}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
            height={36}
          />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(0,82,165,0.18)' }} />
          <Line
            type="monotone"
            dataKey={yKey}
            name={yKey}
            stroke={stroke}
            strokeWidth={2.2}
            dot={{ r: 3, strokeWidth: 0, fill: stroke }}
            activeDot={{ r: 5 }}
          />
          {referenceValue !== null && referenceValue !== undefined && (
            <ReferenceLine
              y={Number(referenceValue)}
              stroke={visualization.chartOptions?.referenceLineColor || CHART_COLORS.red}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${visualization.chartOptions?.referenceLineLabel || referenceField}: ${referenceValue}`,
                fill: visualization.chartOptions?.referenceLineColor || CHART_COLORS.red,
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
