import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import html2canvas from 'html2canvas'
import { QueryData, QueryResult, QueryResultState } from '@/hooks/useReportData'

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

