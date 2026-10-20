import React from 'react'
import { VisualizationProps } from '../types'
import { asNumber, formatNumber, rowsToRecords } from './format'
import { CHART_COLORS } from './theme'
import { EmptyChart } from './ChartTooltip'

export const BoxPlotVisualizationV2: React.FC<VisualizationProps> = ({ query, result }) => {
  const { visualization } = query
  const records = rowsToRecords(result.columns, result.data)
  const xKey = visualization.xAxis || result.columns[0]
  const yKey = visualization.yAxis || result.columns[1]

  const groups = new Map<string, number[]>()
  records.forEach((row) => {
    const category = String(row[xKey] ?? '—')
    const values = groups.get(category) ?? []
    values.push(asNumber(row[yKey]))
    groups.set(category, values)
  })

  const stats = Array.from(groups.entries()).map(([category, values]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const pick = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]
    return {
      category,
      min: sorted[0],
      q1: pick(0.25),
      median: pick(0.5),
      q3: pick(0.75),
      max: sorted[sorted.length - 1],
      count: sorted.length,
    }
  })

  if (!stats.length) return <EmptyChart />

  const globalMin = Math.min(...stats.map((item) => item.min))
  const globalMax = Math.max(...stats.map((item) => item.max))
  const span = globalMax - globalMin || 1
  const left = (value: number) => `${((value - globalMin) / span) * 100}%`

  return (
    <div className="flex h-full min-h-[160px] flex-col gap-2 overflow-auto pr-1">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>Min {formatNumber(globalMin)}</span>
        <span>Medyan</span>
        <span>Max {formatNumber(globalMax)}</span>
      </div>
      {stats.map((item) => (
        <div key={item.category} className="grid grid-cols-[minmax(72px,28%)_1fr] items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-slate-700" title={item.category}>
              {item.category}
            </p>
            <p className="text-[10px] text-slate-400">{item.count} kayıt</p>
          </div>
          <div className="group relative h-8">
            <div
              className="absolute top-1/2 h-px -translate-y-1/2 bg-slate-300"
              style={{ left: left(item.min), right: `${100 - ((item.max - globalMin) / span) * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-4 -translate-y-1/2 rounded-md border border-[#0052A5]/20"
              style={{
                left: left(item.q1),
                width: `${Math.max(((item.q3 - item.q1) / span) * 100, 1.5)}%`,
                backgroundColor: '#EAF3FF',
              }}
            />
            <div
              className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
              style={{ left: left(item.median), backgroundColor: CHART_COLORS.blue }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 shadow-md group-hover:block">
              Min {formatNumber(item.min)} · Q1 {formatNumber(item.q1)} · Medyan {formatNumber(item.median)} · Q3 {formatNumber(item.q3)} · Max {formatNumber(item.max)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
