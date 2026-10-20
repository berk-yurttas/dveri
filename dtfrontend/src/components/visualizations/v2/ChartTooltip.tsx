import React from 'react'
import { CHART_COLORS } from './theme'
import { formatNumber } from './format'

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string
    value?: unknown
    color?: string
    dataKey?: string | number
    payload?: Record<string, unknown>
  }>
  label?: unknown
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const rows = payload.filter((item) => {
    const key = String(item.dataKey ?? '')
    return item.value !== undefined && item.value !== null && !key.startsWith('_')
  })
  if (!rows.length) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-md">
      {label != null && label !== '' && (
        <p className="mb-1 max-w-[240px] font-semibold text-slate-700">{String(label)}</p>
      )}
      <ul className="space-y-0.5">
        {rows.map((item) => (
          <li key={String(item.dataKey ?? item.name)} className="flex items-center gap-2 text-slate-600">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: String(item.color ?? CHART_COLORS.blue) }}
            />
            <span className="max-w-[140px] truncate">{item.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-800">{formatNumber(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const axisTick = { fontSize: 11, fill: CHART_COLORS.text }
export const gridProps = { stroke: CHART_COLORS.grid, vertical: false as const }

export function TruncatedTick({
  x = 0,
  y = 0,
  payload,
  anchor = 'middle',
}: {
  x?: number
  y?: number
  payload?: { value?: unknown }
  anchor?: 'middle' | 'end'
}) {
  const full = String(payload?.value ?? '')
  const text = full.length > 20 ? `${full.slice(0, 19)}…` : full
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dy={anchor === 'end' ? 4 : 12}
        textAnchor={anchor}
        fill={CHART_COLORS.text}
        fontSize={11}
      >
        <title>{full}</title>
        {text}
      </text>
    </g>
  )
}

export function EmptyChart({ message = 'Veri bulunamadı' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
      {message}
    </div>
  )
}
