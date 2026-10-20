export function rowsToRecords(columns: string[], data: unknown[][]) {
  return data.map((row) => {
    const item: Record<string, unknown> = {}
    columns.forEach((col, index) => {
      const value = row[index]
      item[col] =
        typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
          ? Number(value)
          : value
    })
    return item
  })
}

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  }
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  }
  return String(value)
}

export function truncateLabel(value: unknown, max = 22) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function asNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
