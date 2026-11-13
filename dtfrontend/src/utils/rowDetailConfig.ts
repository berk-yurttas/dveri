// Pure helpers for the row detail card / trace panel config editors.
// Type-only imports (erased at runtime) so this file stays loadable by `node --test`.
import type { RowDetailCardConfig, TracePanelConfig, TraceDocumentLink } from '@/types/reports'

export function toggleParamField(current: string[] | undefined, field: string, checked: boolean): string[] {
  const list = current ?? []
  if (checked) return list.includes(field) ? list : [...list, field]
  return list.filter(f => f !== field)
}

// Selected fields whose {{field}} placeholder does not appear in the SQL.
export function missingPlaceholders(sql: string | undefined, paramFields: string[]): string[] {
  const text = sql ?? ''
  return paramFields.filter(field => {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return !new RegExp('\\{\\{\\s*' + escaped + '\\s*\\}\\}').test(text)
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

// Only http(s) and relative URLs are allowed; protocol-relative (//host) is rejected.
export function isSafeLinkTemplate(url: string): boolean {
  const trimmed = url.trim()
  if (trimmed === '') return true
  if (trimmed.startsWith('//')) return false
  if (/^https?:\/\//i.test(trimmed)) return true
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
}
