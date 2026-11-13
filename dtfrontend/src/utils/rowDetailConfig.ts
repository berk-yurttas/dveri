// Pure helpers for the row detail card / trace panel config editors.
// Type-only imports (erased at runtime) so this file stays loadable by `node --test`.
import type { RowDetailCardConfig, TracePanelConfig, TraceDocumentLink } from '@/types/reports'

export function toggleParamField(current: string[] | undefined, field: string, checked: boolean): string[] {
  const list = current ?? []
  if (checked) return list.includes(field) ? list : [...list, field]
  return list.filter(f => f !== field)
}

// Selected fields whose {{field}} placeholder does not appear in the SQL. Exact match, no inner
// spaces: the runtime replaces only `{{field}}`.
export function missingPlaceholders(sql: string | undefined, paramFields: string[]): string[] {
  const text = sql ?? ''
  return paramFields.filter(field => {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp('\\{\\{' + escaped + '\\}\\}').test(text)
  })
}

export function parseFieldList(input: string): string[] {
  const result: string[] = []
  for (const part of input.split(',')) {
    const field = part.trim()
    if (field && !result.includes(field)) result.push(field)
  }
  return result
}

// Toggling off keeps the configured values (enabled: false) so toggling on again restores them.
export function setDetailCardEnabled(value: RowDetailCardConfig | undefined, enabled: boolean): RowDetailCardConfig | undefined {
  if (!value) return enabled ? { enabled: true, sql: '', paramFields: [] } : undefined
  return { ...value, enabled }
}

export function setTracePanelEnabled(value: TracePanelConfig | undefined, enabled: boolean): TracePanelConfig | undefined {
  if (!value) return enabled ? { enabled: true, paramFields: [] } : undefined
  return { ...value, enabled }
}

export function addLink(links: TraceDocumentLink[] | undefined, id: string): TraceDocumentLink[] {
  return [...(links ?? []), { id, title: '', linkText: '', url: '' }]
}

export function updateLink(links: TraceDocumentLink[] | undefined, id: string, updates: Partial<TraceDocumentLink>): TraceDocumentLink[] {
  return (links ?? []).map(link => (link.id === id ? { ...link, ...updates } : link))
}

export function removeLink(links: TraceDocumentLink[] | undefined, id: string): TraceDocumentLink[] {
  return (links ?? []).filter(link => link.id !== id)
}

// Only http(s) and relative URLs are allowed. Mirrors the runtime isSafeHref in rowDetail.ts
// (same normalisation and rules; duplicated on purpose to stay import-free) except that an
// empty template is accepted while editing. Keep both test files' HREF_CASES table identical.
export function isSafeLinkTemplate(url: string): boolean {
  const trimmed = (url || '').replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '').trim()
  if (trimmed === '') return true
  if (/^[\\/]{2}/.test(trimmed)) return false
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)
  if (!scheme) return true
  return ['http', 'https'].includes(scheme[1].toLowerCase())
}

export function sameFieldList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((field, i) => field === b[i])
}

// Selected fields that are no longer among the available columns (e.g. the SQL was edited).
export function staleSelectedFields(selected: string[], available: string[]): string[] {
  return selected.filter(field => !available.includes(field))
}

// True when the free-text field input no longer reflects `selected`. Both sides are
// normalized with parseFieldList so resyncing to selected.join(', ') always converges
// (a raw comparison would loop forever on duplicate/padded/comma-containing names).
export function needsTextResync(text: string, selected: string[]): boolean {
  return !sameFieldList(parseFieldList(text), parseFieldList(selected.join(', ')))
}
