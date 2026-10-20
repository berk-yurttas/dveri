import React from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { VisualizationProps } from '../types'
import { asNumber, formatNumber, rowsToRecords } from './format'
import { paletteOf } from './theme'
import { ChartTooltip, EmptyChart } from './ChartTooltip'

export const PieVisualizationV2: React.FC<VisualizationProps> = ({ query, result, colors }) => {
  const { visualization } = query
  const palette = paletteOf(colors)
  const records = rowsToRecords(result.columns, result.data)
  const labelKey = visualization.labelField || result.columns[0]
  const valueKey = visualization.valueField || result.columns[1]

  const slices = records
    .map((row, index) => ({
      name: String(row[labelKey] ?? '—'),
      value: asNumber(row[valueKey]),
      fill: palette[index % palette.length],
    }))
    .filter((slice) => slice.value !== 0 || records.length <= 8)

  if (!slices.length) return <EmptyChart />

  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="flex h-full min-h-[220px] flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="86%"
              paddingAngle={2}
              cornerRadius={4}
              stroke="#fff"
              strokeWidth={2}
            >
              {slices.map((slice, index) => (
                <Cell key={`${slice.name}-${index}`} fill={slice.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-[#003B7A]">{formatNumber(total)}</span>
          <span className="text-[10px] text-slate-400">toplam</span>
        </div>
      </div>
      <ul className="flex max-h-24 flex-wrap justify-center gap-x-3 gap-y-1 overflow-auto pt-1">
        {slices.map((slice, index) => {
          const percent = total ? Math.round((slice.value / total) * 100) : 0
          return (
            <li key={`${slice.name}-${index}`} className="flex items-center gap-1.5 text-[11px] text-slate-500" title={slice.name}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: slice.fill }} />
              <span className="max-w-[120px] truncate">{slice.name}</span>
              <span className="font-semibold tabular-nums text-slate-700">{formatNumber(slice.value)}</span>
              <span className="text-slate-400">%{percent}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
