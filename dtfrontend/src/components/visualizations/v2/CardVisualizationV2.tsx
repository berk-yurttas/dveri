import React from 'react'
import { Hash } from 'lucide-react'
import { VisualizationProps } from '../types'
import { asNumber, formatNumber, rowsToRecords } from './format'
import { TONE_ACCENT, TONE_SOFT } from './theme'
import { EmptyChart } from './ChartTooltip'

function looksLikeRate(field: string, value: number) {
  return value >= 0 && value <= 100 && /(oran|y[uü]zde|percent|%|oee|verim)/i.test(field)
}

export const CardVisualizationV2: React.FC<VisualizationProps> = ({ query, result }) => {
  const { visualization } = query
  const { data, columns } = result
  const records = rowsToRecords(columns, data)

  if (!records.length) return <EmptyChart />

  const primaryField = visualization.valueField || columns[0]
  const secondaryField = visualization.labelField || columns[1]

  const cards = records.map((row, index) => {
    const primaryValue = row[primaryField]
    const secondaryValue = secondaryField ? row[secondaryField] : null
    const numeric = asNumber(primaryValue)
    const showProgress = typeof primaryValue === 'number' && looksLikeRate(primaryField, numeric)
    const label =
      records.length > 1
        ? formatNumber(secondaryValue ?? row[columns[0]])
        : visualization.title || (secondaryValue != null ? formatNumber(secondaryValue) : primaryField)
    const subtitle =
      records.length > 1
        ? primaryField
        : visualization.title && secondaryValue != null
          ? formatNumber(secondaryValue)
          : primaryField

    return { label, value: formatNumber(primaryValue), subtitle, showProgress, numeric, index }
  })

  return (
    <div className={`grid h-full content-start gap-3 overflow-auto ${cards.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {cards.map((card) => {
        const accent = TONE_ACCENT[card.index % TONE_ACCENT.length]
        const soft = TONE_SOFT[card.index % TONE_SOFT.length]
        return (
          <article
            key={`${card.label}-${card.index}`}
            className={`relative overflow-hidden rounded-[10px] border border-[#0052A5]/10 bg-white px-4 py-3.5 shadow-[0_2px_12px_rgba(0,82,165,0.08)] ${cards.length === 1 ? 'h-full' : ''}`}
            style={cards.length > 1 ? { backgroundColor: soft } : undefined}
          >
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: accent }} />
            <div
              className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: cards.length > 1 ? '#ffffffcc' : soft, color: accent }}
            >
              <Hash className="h-4 w-4" />
            </div>
            <p className="truncate text-[11px] font-medium text-slate-500" title={card.label}>
              {card.label}
            </p>
            <p className="mt-0.5 font-mono text-[26px] font-bold leading-none tracking-tight text-[#003B7A]">
              {card.value}
            </p>
            {card.showProgress && (
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span>ORAN</span>
                  <span style={{ color: accent }}>%{Math.round(card.numeric)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/80">
                  <div className="h-full rounded-full" style={{ width: `${card.numeric}%`, backgroundColor: accent }} />
                </div>
              </div>
            )}
            {card.subtitle && card.subtitle !== card.label && (
              <p className="mt-1.5 truncate text-[10px] text-slate-400" title={card.subtitle}>
                {card.subtitle}
              </p>
            )}
          </article>
        )
      })}
    </div>
  )
}
