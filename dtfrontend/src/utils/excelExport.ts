import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import { QueryData, QueryResultState } from '@/hooks/useReportData'
import { NestedQueryConfig } from '@/types/reports'
import { reportsService } from '@/services/reports'

type NestedTable = { columns: string[]; data: any[][] }
type NestedQueryPreviewCache = Map<string, Promise<NestedTable>>

const NESTED_EXPORT_CONCURRENCY = 8
const EXCEL_MAX_ROWS = 1_048_575
const EXCEL_MAX_COLS = 16_384
const WRITE_CHUNK_SIZE = 2500
const LARGE_SHEET_THRESHOLD = 8000

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function applyExpandablePlaceholders(
  sql: string,
  expandableFields: string[],
  parentColumns: string[],
  rowData: any[]
): string {
  let processedQuery = sql
  expandableFields.forEach((field: string) => {
    const columnIndex = parentColumns.indexOf(field)
    if (columnIndex === -1) return
    const value = rowData[columnIndex]
    const escapedValue = String(value ?? '').replace(/'/g, "''")
    const placeholder = new RegExp(escapeRegExp(`{{${field}}}`), 'g')
    processedQuery = processedQuery.replace(placeholder, `'${escapedValue}'`)
  })
  return processedQuery
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await mapper(items[current], current)
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function uniquifyChildColumns(parentColumns: string[], childColumns: string[], level: number): string[] {
  const used = new Set(parentColumns)
  return childColumns.map((col) => {
    let name = col
    if (used.has(name)) {
      name = `${col} (L${level})`
    }
    let suffix = 2
    while (used.has(name)) {
      name = `${col} (L${level}_${suffix})`
      suffix += 1
    }
    used.add(name)
    return name
  })
}

function alignRow(row: any[], sourceColumns: string[], targetColumns: string[]): any[] {
  const indexByColumn = new Map(sourceColumns.map((col, index) => [col, index]))
  return targetColumns.map((col) => {
    const index = indexByColumn.get(col)
    return index === undefined ? '' : (row[index] ?? '')
  })
}

function collectUniqueColumns(tables: NestedTable[]): string[] {
  const columns: string[] = []
  const seen = new Set<string>()
  for (const table of tables) {
    for (const col of table.columns) {
      if (seen.has(col)) continue
      seen.add(col)
      columns.push(col)
    }
  }
  return columns
}

function combineNestedTables(tables: NestedTable[]): NestedTable {
  const columns = collectUniqueColumns(tables)
  const data = tables.flatMap((table) =>
    table.data.map((row) => alignRow(row, table.columns, columns))
  )
  return { columns, data }
}

async function previewNestedSql(
  sql: string,
  dbConfig: Record<string, any> | null | undefined,
  cache: NestedQueryPreviewCache
): Promise<NestedTable> {
  const cacheKey = `${sql}::${JSON.stringify(dbConfig ?? null)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const pending = reportsService.previewQuery({
    sql_query: sql,
    limit: 100000000,
    db_config: dbConfig || null
  }).then((response) => {
    if (!response.success) {
      console.error('Nested query failed during Excel export:', response.message)
      return { columns: [] as string[], data: [] as any[][] }
    }
    return { columns: response.columns || [], data: response.data || [] }
  })

  cache.set(cacheKey, pending)
  return pending
}

async function flattenRowsWithNestedQueries(
  parentColumns: string[],
  parentData: any[][],
  nestedQueries: NestedQueryConfig[],
  dbConfig: Record<string, any> | null | undefined,
  cache: NestedQueryPreviewCache,
  level: number
): Promise<NestedTable> {
  if (!nestedQueries.length || parentData.length === 0) {
    return { columns: parentColumns, data: parentData }
  }

  const childTables = await mapWithConcurrency(parentData, NESTED_EXPORT_CONCURRENCY, async (parentRow) => {
    const nestedResults = await Promise.all(
      nestedQueries.map(async (nestedQuery) => {
        const processedSql = applyExpandablePlaceholders(
          nestedQuery.sql,
          nestedQuery.expandableFields || [],
          parentColumns,
          parentRow
        )
        const preview = await previewNestedSql(processedSql, dbConfig, cache)
        if (!nestedQuery.nestedQueries || nestedQuery.nestedQueries.length === 0) {
          return preview
        }
        return flattenRowsWithNestedQueries(
          preview.columns,
          preview.data,
          nestedQuery.nestedQueries,
          dbConfig,
          cache,
          level + 1
        )
      })
    )
    return combineNestedTables(nestedResults)
  })

  const originalChildColumns = collectUniqueColumns(childTables)

  if (originalChildColumns.length === 0) {
    return { columns: parentColumns, data: parentData }
  }

  const exportChildColumns = uniquifyChildColumns(parentColumns, originalChildColumns, level)
  const exportColumns = [...parentColumns, ...exportChildColumns]
  const exportData: any[][] = []

  parentData.forEach((parentRow, rowIndex) => {
    const childTable = childTables[rowIndex]
    const alignedChildren = childTable.data.map((childRow) =>
      alignRow(childRow, childTable.columns, originalChildColumns)
    )

    if (alignedChildren.length === 0) {
      exportData.push([...parentRow, ...originalChildColumns.map(() => '')])
      return
    }

    alignedChildren.forEach((childRow) => {
      exportData.push([...parentRow, ...childRow])
    })
  })

  return { columns: exportColumns, data: exportData }
}

/**
 * Fetch nested/expandable query results for every parent row and flatten them
 * into a denormalized table (parent columns + nested columns).
 */
export async function expandNestedQueryResults(
  parentColumns: string[],
  parentData: any[][],
  nestedQueries: NestedQueryConfig[] | undefined,
  dbConfig?: Record<string, any> | null
): Promise<NestedTable> {
  if (!nestedQueries || nestedQueries.length === 0) {
    return { columns: parentColumns, data: parentData }
  }

  return flattenRowsWithNestedQueries(
    parentColumns,
    parentData,
    nestedQueries,
    dbConfig,
    new Map(),
    1
  )
}

export type ExcelSheetPayload = {
  name: string
  columns: string[]
  data: any[][]
  title?: string
  chartImageBase64?: string | null
  maxColWidth?: number
}

function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = (name || 'Sheet').replace(/[\\/?*[\]:]/g, '_').substring(0, 31).trim()
  if (!base) base = 'Sheet'

  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const extra = `_${suffix}`
    candidate = `${base.substring(0, Math.max(1, 31 - extra.length))}${extra}`
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function estimateColumnWidths(
  columns: string[],
  data: any[][],
  maxWidth: number,
  samples = 200
): { wch: number }[] {
  const widths = columns.map((col) => String(col ?? '').length)
  if (data.length === 0) {
    return widths.map((width) => ({ wch: Math.min(width + 2, maxWidth) }))
  }

  const step = Math.max(1, Math.floor(data.length / samples))
  for (let i = 0; i < data.length; i += step) {
    const row = data[i]
    if (!row) continue
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const length = String(row[colIndex] ?? '').length
      if (length > widths[colIndex]) widths[colIndex] = length
    }
  }

  return widths.map((width) => ({ wch: Math.min(width + 2, maxWidth) }))
}

function clipSheetData(columns: string[], data: any[][]): { columns: string[]; data: any[][] } {
  const clippedColumns = columns.length > EXCEL_MAX_COLS ? columns.slice(0, EXCEL_MAX_COLS) : columns
  const clippedData = data.length > EXCEL_MAX_ROWS ? data.slice(0, EXCEL_MAX_ROWS) : data
  if (clippedColumns.length === columns.length) {
    return { columns: clippedColumns, data: clippedData }
  }
  return {
    columns: clippedColumns,
    data: clippedData.map((row) => row.slice(0, clippedColumns.length))
  }
}

async function writeSheetsWithSheetJS(
  sheets: ExcelSheetPayload[],
  filename: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const workbook = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.data.length, 0) || 1
  let writtenRows = 0

  for (const sheet of sheets) {
    const { columns, data } = clipSheetData(sheet.columns, sheet.data)
    const prelude: any[][] = sheet.title ? [[sheet.title], []] : []
    const worksheet = XLSX.utils.aoa_to_sheet([...prelude, columns], { cellDates: false })
    let nextRow = prelude.length + 1

    for (let i = 0; i < data.length; i += WRITE_CHUNK_SIZE) {
      const chunk = data.slice(i, i + WRITE_CHUNK_SIZE)
      XLSX.utils.sheet_add_aoa(worksheet, chunk, { origin: nextRow, cellDates: false })
      nextRow += chunk.length
      writtenRows += chunk.length
      onProgress?.(Math.min(0.95, writtenRows / totalRows))
      if (i + WRITE_CHUNK_SIZE < data.length) {
        await yieldToMain()
      }
    }

    worksheet['!cols'] = estimateColumnWidths(columns, data, sheet.maxColWidth ?? (sheet.title ? 30 : 50))
    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheet.name, usedNames))
  }

  onProgress?.(0.96)
  await yieldToMain()
  XLSX.writeFile(workbook, filename, { compression: true })
  onProgress?.(1)
}

async function writeSheetsWithExcelJS(
  sheets: ExcelSheetPayload[],
  filename: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'DT Report System'
  workbook.created = new Date()
  const usedNames = new Set<string>()
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.data.length, 0) || 1
  let writtenRows = 0

  for (const sheet of sheets) {
    const { columns, data } = clipSheetData(sheet.columns, sheet.data)
    const worksheet = workbook.addWorksheet(sanitizeSheetName(sheet.name, usedNames))
    const isChart = Boolean(sheet.title)

    if (isChart) {
      worksheet.addRow([sheet.title])
      worksheet.getRow(1).font = { bold: true, size: 16 }
      worksheet.addRow([])
    }

    worksheet.addRow(columns)
    for (let i = 0; i < data.length; i += WRITE_CHUNK_SIZE) {
      const chunk = data.slice(i, i + WRITE_CHUNK_SIZE)
      worksheet.addRows(chunk)
      writtenRows += chunk.length
      onProgress?.(Math.min(0.95, writtenRows / totalRows))
      if (i + WRITE_CHUNK_SIZE < data.length) {
        await yieldToMain()
      }
    }

    const headerRow = worksheet.getRow(isChart ? 3 : 1)
    headerRow.font = { bold: true }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F3FF' }
    }

    const colWidths = estimateColumnWidths(columns, data, sheet.maxColWidth ?? (isChart ? 30 : 50))
    colWidths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width.wch
    })

    if (sheet.chartImageBase64) {
      try {
        const imageId = workbook.addImage({
          base64: sheet.chartImageBase64,
          extension: 'png',
        })
        worksheet.addImage(imageId, {
          tl: { col: Math.max(columns.length + 2, 5), row: 3 },
          ext: { width: 1200, height: 400 },
        })
      } catch (imageError) {
        console.error('Error adding image to worksheet:', imageError)
      }
    }
  }

  onProgress?.(0.96)
  await yieldToMain()
  const buffer = await workbook.xlsx.writeBuffer({ useStyles: true, useSharedStrings: false } as any)
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename
  )
  onProgress?.(1)
}

/**
 * Build and download an .xlsx workbook. Large table dumps use SheetJS (much faster
 * than ExcelJS cell models). ExcelJS is only used when a chart image can be embedded
 * and every sheet is small enough that the UI will stay responsive.
 */
export async function downloadExcelWorkbook(
  sheets: ExcelSheetPayload[],
  filename: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (sheets.length === 0) {
    throw new Error('No data to export')
  }

  const hasChartImage = sheets.some((sheet) => Boolean(sheet.chartImageBase64))
  const hasLargeSheet = sheets.some((sheet) => sheet.data.length > LARGE_SHEET_THRESHOLD)

  if (hasChartImage && !hasLargeSheet) {
    await writeSheetsWithExcelJS(sheets, filename, onProgress)
    return
  }

  await writeSheetsWithSheetJS(sheets, filename, onProgress)
}

// Capture chart as base64 image
export async function captureChartAsImage(queryId: number): Promise<string | null> {
  try {
    // Find the chart container for this query
    const chartContainer = document.querySelector(`[data-query-id="${queryId}"] .recharts-wrapper`)
    if (!chartContainer) {
      console.warn(`Chart container not found for query ${queryId}`)
      return null
    }

    // Capture the chart as canvas
    const canvas = await html2canvas(chartContainer as HTMLElement, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality
      logging: false,
      useCORS: true
    })

    // Convert to base64
    return canvas.toDataURL('image/png').split(',')[1] // Remove data:image/png;base64, prefix
  } catch (error) {
    console.error(`Error capturing chart for query ${queryId}:`, error)
    return null
  }
}

// Excel export functionality with chart images
export async function exportReportToExcel(
  reportName: string,
  queries: QueryData[],
  queryResults: QueryResultState
) {
  try {
    const sheets: ExcelSheetPayload[] = []

    for (const query of queries) {
      const queryState = queryResults[query.id]
      if (!queryState?.result) continue

      const { columns, data } = queryState.result
      const isTable = query.visualization.type === 'table' || query.visualization.type === 'expandable'
      sheets.push({
        name: query.name || `Query_${query.id}`,
        columns,
        data,
        ...(isTable
          ? {}
          : {
              title: query.visualization.title || query.name,
              chartImageBase64: await captureChartAsImage(query.id)
            })
      })
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    const filename = `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`
    await downloadExcelWorkbook(sheets, filename)

    return { success: true }
  } catch (error) {
    console.error('Excel export error:', error)
    return { success: false, error: 'Excel dosyası oluşturulurken hata oluştu.' }
  }
}

