import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import { QueryData, QueryResult, QueryResultState } from '@/hooks/useReportData'
import { NestedQueryConfig } from '@/types/reports'
import { reportsService } from '@/services/reports'

type NestedTable = { columns: string[]; data: any[][] }
type NestedQueryPreviewCache = Map<string, Promise<NestedTable>>

const NESTED_EXPORT_CONCURRENCY = 8

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

function combineNestedTables(tables: NestedTable[]): NestedTable {
  const columns: string[] = []
  tables.forEach((table) => {
    table.columns.forEach((col) => {
      if (!columns.includes(col)) columns.push(col)
    })
  })
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
    limit: 1000000,
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

  const originalChildColumns: string[] = []
  childTables.forEach((table) => {
    table.columns.forEach((col) => {
      if (!originalChildColumns.includes(col)) originalChildColumns.push(col)
    })
  })

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
    // Create a new workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'DT Report System'
    workbook.created = new Date()

    // Process each query
    for (const query of queries) {
      const queryState = queryResults[query.id]
      if (!queryState?.result) continue

      const { result } = queryState
      const { columns, data } = result

      // Create worksheet
      const worksheet = workbook.addWorksheet(query.name.substring(0, 31))

      if (query.visualization.type === 'table' || query.visualization.type === 'expandable') {
        // For table visualizations, export raw data
        worksheet.addRow(columns)
        data.forEach(row => {
          worksheet.addRow(row)
        })

        // Style the header row
        const headerRow = worksheet.getRow(1)
        headerRow.font = { bold: true }
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F3FF' }
        }

        // Auto-size columns
        columns.forEach((col, index) => {
          const column = worksheet.getColumn(index + 1)
          const maxLength = Math.max(
            col.length,
            ...data.map(row => String(row[index] || '').length)
          )
          column.width = Math.min(maxLength + 2, 50)
        })

      } else {
        // For chart visualizations, add data and chart image

        // Add title
        worksheet.addRow([query.visualization.title || query.name])
        worksheet.getRow(1).font = { bold: true, size: 16 }
        worksheet.addRow([]) // Empty row

        // Add data
        worksheet.addRow(columns)
        data.forEach(row => {
          worksheet.addRow(row)
        })

        // Style the header row
        const headerRow = worksheet.getRow(3)
        headerRow.font = { bold: true }
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F3FF' }
        }

        // Auto-size columns
        columns.forEach((col, index) => {
          const column = worksheet.getColumn(index + 1)
          const maxLength = Math.max(
            col.length,
            ...data.map(row => String(row[index] || '').length)
          )
          column.width = Math.min(maxLength + 2, 30)
        })

        // Capture and add chart image
        const chartImageBase64 = await captureChartAsImage(query.id)
        if (chartImageBase64) {
          try {
            const imageId = workbook.addImage({
              base64: chartImageBase64,
              extension: 'png',
            })

            // Position the image to the right of the data or below it
            const dataEndRow = data.length + 3
            const imageStartCol = Math.max(columns.length + 2, 5) // Start after data columns

            worksheet.addImage(imageId, {
              tl: { col: imageStartCol, row: 3 }, // Top-left position
              ext: { width: 1200, height: 400 }, // Size
            })
          } catch (imageError) {
            console.error('Error adding image to worksheet:', imageError)
          }
        }
      }
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
    const filename = `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.xlsx`

    // Export to file
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), filename)

    return { success: true }
  } catch (error) {
    console.error('Excel export error:', error)
    return { success: false, error: 'Excel dosyası oluşturulurken hata oluştu.' }
  }
}

