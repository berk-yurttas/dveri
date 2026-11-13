// Pure helpers for the row detail card and the child-row trace panel
// ("Operasyon, CMM ve Test İzleri"). Keep this file import-free: it is
// unit-tested by src/utils/rowDetail.test.mjs via a plain TS transpile.

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const placeholderRegExp = (field: string) => new RegExp(`{{${escapeRegExp(field)}}}`, 'g')

/**
 * Inject the clicked row's values into {{field}} placeholders of a SQL query.
 * Only `paramFields` that exist in `columns` are replaced. Values are single-quoted
 * with quotes escaped (same convention as expandable nested queries); null -> NULL.
 */
export function fillRowPlaceholders(sql: string, paramFields: string[], columns: string[], row: any[]): string {
  let processed = sql || ''
  for (const field of paramFields || []) {
    const index = columns.indexOf(field)
    if (index === -1) continue
    const value = row[index]
    const literal = value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`
    processed = processed.replace(placeholderRegExp(field), () => literal)
  }
  return processed
}

/** Replace {{column}} tokens in a URL template with URL-encoded values from the row. */
export function fillUrlTemplate(url: string, columns: string[], row: any[]): string {
  return (url || '').replace(/{{([^{}]+)}}/g, (match, field: string) => {
    const index = columns.indexOf(field)
    if (index === -1) return match
    const value = row[index]
    return encodeURIComponent(value === null || value === undefined ? '' : String(value))
  })
}

/** Allow only http(s) and relative links; blocks javascript:, data:, etc. */
export function isSafeHref(url: string): boolean {
  // Browsers drop ASCII tab/newline anywhere and leading C0 controls/space before
  // resolving the scheme, so normalize the same way before inspecting it.
  const trimmed = (url || '').replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '').trim()
  if (!trimmed) return false
  // Protocol-relative and backslash host forms (//host, \\host, /\host, \/host) leave the origin.
  if (/^[\\/]{2}/.test(trimmed)) return false
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)
  if (!scheme) return true
  return ['http', 'https'].includes(scheme[1].toLowerCase())
}

const displayValue = (value: any): string => (value === null || value === undefined || value === '' ? '-' : String(value))

export interface DetailItem {
  label: string
  value: string
}

/** Detail card fields: every selected column of the first result row. */
export function rowToDetailItems(columns: string[], data: any[][]): DetailItem[] {
  const first = data?.[0]
  if (!first) return []
  return columns.map((label, index) => ({ label, value: displayValue(first[index]) }))
}

export interface OperationStep {
  title: string
  subtitle: string
}

/** Operasyon Akışı: one step per row; 1st column = title, 2nd column = subtitle. */
export function buildOperationSteps(columns: string[], data: any[][]): OperationStep[] {
  return (data || []).map((row) => ({
    title: row[0] === null || row[0] === undefined ? '' : String(row[0]),
    subtitle: columns.length > 1 && row[1] !== null && row[1] !== undefined ? String(row[1]) : '',
  }))
}

export interface DurationBar {
  label: string
  value: number
  total: number
  percent: number
}

const toNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Süre Dağılımı: one bar per row.
 * - [value, total]           -> label "valueCol / totalCol"
 * - [label, value, total]    -> label from the text column
 * - [percent] (single number) -> treated as a 0-100 percentage
 */
export function computeDurationBars(columns: string[], data: any[][]): DurationBar[] {
  const bars: DurationBar[] = []
  for (const row of data || []) {
    const numeric: Array<{ index: number; value: number }> = []
    let textLabel: string | null = null
    row.forEach((cell, index) => {
      const num = toNumber(cell)
      if (num !== null) numeric.push({ index, value: num })
      else if (textLabel === null && cell !== null && cell !== undefined && cell !== '') textLabel = String(cell)
    })
    if (numeric.length === 0) continue

    let value: number
    let total: number
    let defaultLabel: string
    if (numeric.length === 1) {
      value = numeric[0].value
      total = 100
      defaultLabel = columns[numeric[0].index]
    } else {
      value = numeric[0].value
      total = numeric[1].value
      defaultLabel = `${columns[numeric[0].index]} / ${columns[numeric[1].index]}`
    }
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0
    bars.push({ label: textLabel ?? defaultLabel, value, total, percent })
  }
  return bars
}
