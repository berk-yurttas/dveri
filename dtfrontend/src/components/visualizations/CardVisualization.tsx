import React from 'react'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const CardVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS }) => {
  const { visualization } = query
  const { data, columns } = result

  // Convert data to format suitable for display
  const chartData = data.map(row => {
    const item: any = {}
    columns.forEach((col, index) => {
      const value = row[index]
      // Convert numeric strings to numbers for proper rendering
      item[col] = typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== ''
        ? Number(value)
        : value
    })
    return item
  })

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
        <p className="text-slate-500">Veri bulunamadı</p>
      </div>
    )
  }

  // Get the first row of data for the card
  const cardData = chartData[0]

  // Determine which fields to use
  const primaryField = visualization.valueField || columns[0]
  const secondaryField = visualization.labelField || columns[1]

  const primaryValue = cardData[primaryField]
  const secondaryValue = secondaryField ? cardData[secondaryField] : null

  // Format large numbers with separators
  const formatNumber = (value: any): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'number') {
      return value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
    }
    return String(value)
  }

  // Get background color from colors array or use default
  const bgColor = visualization.chartOptions?.backgroundColor || colors[0]

  return (
    <div className="flex items-center justify-center w-full h-full min-h-[300px]">
      <div
        className="relative rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center min-w-[300px] min-h-[200px] transition-all duration-300 hover:shadow-xl"
        style={{
          backgroundColor: bgColor,
          background: `linear-gradient(135deg, ${bgColor} 0%, ${bgColor}dd 100%)`
        }}
      >
        {/* Main Value */}
        <div className="text-center mb-4">
          <div
            className="font-bold text-white drop-shadow-lg"
            style={{ fontSize: visualization.chartOptions?.primaryFontSize || '3.5rem' }}
          >
            {formatNumber(primaryValue)}
          </div>
        </div>

        {/* Secondary Text */}
        {secondaryValue !== null && (
          <div className="text-center">
            <div
              className="text-white/90 font-medium"
              style={{ fontSize: visualization.chartOptions?.secondaryFontSize || '1.25rem' }}
            >
              {formatNumber(secondaryValue)}
            </div>
          </div>
        )}

        {/* Optional Title Overlay */}
        {visualization.title && (
          <div className="absolute top-4 left-4 right-4">
            <div className="text-white/70 text-sm font-semibold uppercase tracking-wider">
              {visualization.title}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
