'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { RowDetailCardConfig, TracePanelConfig } from '@/types/reports'
import {
  buildOperationSteps,
  computeDurationBars,
  fillRowPlaceholders,
  fillUrlTemplate,
  isSafeHref,
  rowToDetailItems,
  type DetailItem,
  type DurationBar,
  type OperationStep,
} from '@/utils/rowDetail'
import { createRequestTracker, isSameOrDescendantRowKey } from '@/utils/rowDetailState'

type Status = 'loading' | 'error' | 'ready'

export type RunQuery = (sql: string) => Promise<{ success: boolean; columns: string[]; data: any[][] }>

export interface DetailPanelState {
  queryId: number
  rowKey: string
  queryName: string
  title: string
  status: Status
  items: DetailItem[]
}

interface TraceSection<T> {
  status: Status
  items: T[]
}

export interface TraceLink {
  id: string
  title: string
  linkText: string
  href: string
}

export interface TracePanelState {
  queryId: number
  rowKey: string
  queryName: string
  title: string
  operations: TraceSection<OperationStep> | null
  durations: TraceSection<DurationBar> | null
  links: TraceLink[]
}

interface OpenArgs<C> {
  queryId: number
  queryName: string
  rowKey: string
  config: C
  columns: string[]
  row: any[]
  /** Clicking the already open row closes its panel instead of reloading it. */
  toggle?: boolean
}

const DEFAULT_DETAIL_TITLE = 'Seçili Satır Detay Kartı'
const DEFAULT_TRACE_TITLE = 'Operasyon, CMM ve Test İzleri'

const hasSql = (sql?: string) => !!sql && sql.trim() !== ''

/**
 * State + data loading for the detail card and the trace panel. Each panel has its own request
 * counter, so a late response for a previously clicked row never overwrites the newer selection.
 */
export function useRowDetailPanels(runQuery: RunQuery) {
  const runQueryRef = useRef(runQuery)
  runQueryRef.current = runQuery

  const [detailTracker] = useState(createRequestTracker)
  const [traceTracker] = useState(createRequestTracker)
  const [detail, setDetail] = useState<DetailPanelState | null>(null)
  const [trace, setTrace] = useState<TracePanelState | null>(null)
  const detailRef = useRef<DetailPanelState | null>(null)
  const traceRef = useRef<TracePanelState | null>(null)

  const commitDetail = useCallback((next: DetailPanelState | null) => {
    detailRef.current = next
    setDetail(next)
  }, [])
  const commitTrace = useCallback((next: TracePanelState | null) => {
    traceRef.current = next
    setTrace(next)
  }, [])

  const closeDetail = useCallback(
    (rowKey?: string) => {
      if (rowKey !== undefined && detailRef.current?.rowKey !== rowKey) return
      detailTracker.invalidate()
      commitDetail(null)
    },
    [commitDetail, detailTracker]
  )

  /** Closes the trace panel when it belongs to `rowKey` or to one of its nested rows. */
  const closeTrace = useCallback(
    (rowKey?: string) => {
      if (rowKey !== undefined && !isSameOrDescendantRowKey(traceRef.current?.rowKey, rowKey)) return
      traceTracker.invalidate()
      commitTrace(null)
    },
    [commitTrace, traceTracker]
  )

  const openDetail = useCallback(
    ({ queryId, queryName, rowKey, config, columns, row, toggle }: OpenArgs<RowDetailCardConfig>) => {
      if (toggle && detailRef.current?.rowKey === rowKey) {
        closeDetail()
        return
      }
      const requestId = detailTracker.begin()
      const base = { queryId, rowKey, queryName, title: config.title?.trim() || DEFAULT_DETAIL_TITLE }
      commitDetail({ ...base, status: 'loading', items: [] })
      const sql = fillRowPlaceholders(config.sql, config.paramFields, columns, row)
      runQueryRef
        .current(sql)
        .then((res) => {
          if (!detailTracker.isCurrent(requestId)) return
          if (!res.success) throw new Error('query failed')
          commitDetail({ ...base, status: 'ready', items: rowToDetailItems(res.columns, res.data) })
        })
        .catch(() => {
          if (!detailTracker.isCurrent(requestId)) return
          commitDetail({ ...base, status: 'error', items: [] })
        })
    },
    [closeDetail, commitDetail, detailTracker]
  )

  const openTrace = useCallback(
    ({ queryId, queryName, rowKey, config, columns, row, toggle }: OpenArgs<TracePanelConfig>) => {
      if (toggle && traceRef.current?.rowKey === rowKey) {
        closeTrace()
        return
      }
      const requestId = traceTracker.begin()
      const links: TraceLink[] = (config.links || [])
        .map((link) => ({
          id: link.id,
          title: link.title,
          linkText: link.linkText?.trim() || 'Aç',
          href: fillUrlTemplate(link.url, columns, row),
        }))
        .filter((link) => isSafeHref(link.href))

      const hasOperations = hasSql(config.operationSql)
      const hasDurations = hasSql(config.durationSql)
      commitTrace({
        queryId,
        rowKey,
        queryName,
        title: config.title?.trim() || DEFAULT_TRACE_TITLE,
        operations: hasOperations ? { status: 'loading', items: [] } : null,
        durations: hasDurations ? { status: 'loading', items: [] } : null,
        links,
      })

      const load = (
        sql: string,
        build: (cols: string[], data: any[][]) => any[],
        key: 'operations' | 'durations'
      ) => {
        const apply = (section: TraceSection<any>) => {
          const current = traceRef.current
          if (!traceTracker.isCurrent(requestId) || !current) return
          commitTrace({ ...current, [key]: section })
        }
        runQueryRef
          .current(fillRowPlaceholders(sql, config.paramFields, columns, row))
          .then((res) => {
            if (!res.success) throw new Error('query failed')
            apply({ status: 'ready', items: build(res.columns, res.data) })
          })
          .catch(() => apply({ status: 'error', items: [] }))
      }
      if (hasOperations) load(config.operationSql as string, buildOperationSteps, 'operations')
      if (hasDurations) load(config.durationSql as string, computeDurationBars, 'durations')
    },
    [closeTrace, commitTrace, traceTracker]
  )

  /** Drop both panels when they belong to the given query (its data was re-executed). */
  const clearForQuery = useCallback(
    (queryId: number) => {
      if (detailRef.current?.queryId === queryId) closeDetail()
      if (traceRef.current?.queryId === queryId) closeTrace()
    },
    [closeDetail, closeTrace]
  )

  const clearAll = useCallback(() => {
    closeDetail()
    closeTrace()
  }, [closeDetail, closeTrace])

  return { detail, trace, openDetail, openTrace, closeDetail, closeTrace, clearForQuery, clearAll }
}

// Scoped (rdp- prefixed) styles; translated 1:1 from the reference design.
const PANEL_STYLES = `
.rdp-wrap{display:grid;grid-template-columns:1fr;gap:18px;margin-top:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media (min-width:1100px),print{.rdp-wrap[data-two="true"]{grid-template-columns:1.1fr .9fr}}
.rdp-panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;box-shadow:0 5px 18px rgba(15,23,42,.04);break-inside:avoid;page-break-inside:avoid;min-width:0}
.rdp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 4px}
.rdp-head h2{font-size:15px;margin:0;display:flex;gap:8px;align-items:center;font-weight:700;color:#0f172a}
.rdp-muted{margin:0 0 12px;font-size:11px;color:#64748b}
.rdp-close{border:0;background:transparent;color:#64748b;font-size:20px;line-height:1;padding:2px 8px;border-radius:8px;cursor:pointer}
.rdp-close:hover{background:#f1f5f9;color:#0f172a}
.rdp-close:focus-visible{outline:2px solid #0b63c7;outline-offset:1px}
.rdp-detail{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.rdp-info{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;min-width:0}
.rdp-info b{display:block;font-size:11px;color:#64748b;margin-bottom:6px;font-weight:700}
.rdp-info span{font-weight:800;color:#0f172a;overflow-wrap:anywhere}
.rdp-subhead{margin:16px 0 8px;font-size:14px;color:#004b93;font-weight:700}
.rdp-timeline{display:flex;gap:8px;align-items:center;overflow:auto;padding:5px 0}
.rdp-step{min-width:118px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;text-align:center}
.rdp-step strong{display:block;font-size:12px;color:#0f172a}
.rdp-step small{color:#64748b}
.rdp-dur p{margin:0 0 4px;font-size:12px;color:#475569}
.rdp-bar{height:8px;background:#dbeafe;border-radius:999px;overflow:hidden;margin-bottom:10px}
.rdp-bar span{display:block;height:100%;background:#0b63c7}
.rdp-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.rdp-mini{border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc}
.rdp-mini h4{margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a}
.rdp-mini p{margin:3px 0;color:#475569;font-size:12px}
.rdp-mini a{color:#0b63c7;font-weight:800;text-decoration:none}
.rdp-mini a:hover{text-decoration:underline}
.rdp-state{margin:0;font-size:12px;color:#64748b}
.rdp-state[data-error="true"]{color:#b91c1c}
@media screen and (max-width:1100px){.rdp-cards{grid-template-columns:1fr}}
@media print{.rdp-close{display:none}}
`

function SectionState({ status }: { status: Status }) {
  if (status === 'loading') return <p className="rdp-state" role="status">Yükleniyor...</p>
  if (status === 'error') return <p className="rdp-state" data-error="true" role="alert">Sorgu çalıştırılamadı</p>
  return <p className="rdp-state">Kayıt bulunamadı</p>
}

interface RowDetailPanelsProps {
  detail: DetailPanelState | null
  trace: TracePanelState | null
  onCloseDetail: () => void
  onCloseTrace: () => void
}

/** Full-width area below the widget grid that hosts the detail card and the trace panel. */
export function RowDetailPanels({ detail, trace, onCloseDetail, onCloseTrace }: RowDetailPanelsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seenKeys = useRef<{ detail: string | null; trace: string | null }>({ detail: null, trace: null })
  const detailKey = detail?.rowKey ?? null
  const traceKey = trace?.rowKey ?? null

  useEffect(() => {
    const opened =
      (detailKey !== null && detailKey !== seenKeys.current.detail) ||
      (traceKey !== null && traceKey !== seenKeys.current.trace)
    seenKeys.current = { detail: detailKey, trace: traceKey }
    if (opened && containerRef.current) {
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      containerRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
    }
  }, [detailKey, traceKey])

  if (!detail && !trace) return null

  return (
    <div ref={containerRef} className="rdp-wrap" data-two={detail && trace ? 'true' : 'false'} data-testid="row-detail-panels">
      <style>{PANEL_STYLES}</style>
      {detail && (
        <section className="rdp-panel" aria-label={detail.title} data-testid="row-detail-card">
          <div className="rdp-head">
            <h2><span aria-hidden="true">◉</span> {detail.title}</h2>
            <button type="button" className="rdp-close" aria-label={`${detail.title} panelini kapat`} onClick={onCloseDetail}>×</button>
          </div>
          <p className="rdp-muted">{detail.queryName}</p>
          {detail.status === 'ready' && detail.items.length > 0 ? (
            <div className="rdp-detail">
              {detail.items.map((item) => (
                <div className="rdp-info" key={item.label}>
                  <b>{item.label}</b>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <SectionState status={detail.status} />
          )}
        </section>
      )}
      {trace && (
        <section className="rdp-panel" aria-label={trace.title} data-testid="row-trace-panel">
          <div className="rdp-head">
            <h2><span aria-hidden="true">▣</span> {trace.title}</h2>
            <button type="button" className="rdp-close" aria-label={`${trace.title} panelini kapat`} onClick={onCloseTrace}>×</button>
          </div>
          <p className="rdp-muted">{trace.queryName}</p>
          {trace.operations && (
            <>
              <h3 className="rdp-subhead">Operasyon Akışı</h3>
              {trace.operations.status === 'ready' && trace.operations.items.length > 0 ? (
                <div className="rdp-timeline">
                  {trace.operations.items.map((step, index) => (
                    <div className="rdp-step" key={index}>
                      <strong>{step.title}</strong>
                      <small>{step.subtitle}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <SectionState status={trace.operations.status} />
              )}
            </>
          )}
          {trace.durations && (
            <>
              <h3 className="rdp-subhead">Süre Dağılımı</h3>
              {trace.durations.status === 'ready' && trace.durations.items.length > 0 ? (
                <div className="rdp-dur">
                  {trace.durations.items.map((bar, index) => (
                    <div key={index}>
                      <p>{bar.label}</p>
                      <div className="rdp-bar" role="progressbar" aria-label={bar.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar.percent}>
                        <span style={{ width: `${bar.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <SectionState status={trace.durations.status} />
              )}
            </>
          )}
          {trace.links.length > 0 && (
            <>
              <h3 className="rdp-subhead">Doküman Linkleri</h3>
              <div className="rdp-cards">
                {trace.links.map((link) => (
                  <div className="rdp-mini" key={link.id}>
                    <h4>{link.title}</h4>
                    <p><a href={link.href} target="_blank" rel="noopener noreferrer">{link.linkText}</a></p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
